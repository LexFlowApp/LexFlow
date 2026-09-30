import { app, BrowserWindow, dialog, ipcMain, Menu, session, shell } from 'electron'
import { randomUUID } from 'node:crypto'
import { appendFileSync, existsSync, promises as fs, readdirSync, renameSync, rmdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { spawn, type ChildProcess } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { getPaths, type LexFlowPaths } from './paths'
import { isPluginReleaseFile } from '../../scripts/plugin-release-files.cjs'

const currentDirectory = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
interface LexFlowPluginSpec {
  source: string
  target: string
  kind: 'lexflow-owned' | 'upstream-override'
  sourceDir?: string
  compatibleWith: string
  entrypoints: string[]
}

interface LexFlowPluginManifest {
  schemaVersion: 1
  packages: LexFlowPluginSpec[]
}

let paths: LexFlowPaths
let mainWindow: BrowserWindow | undefined
let dshProcess: ChildProcess | undefined
let dshUrl: string | undefined
let dshError: string | undefined
let dshStartPromise: Promise<string | undefined> | undefined
let windowCreationPromise: Promise<BrowserWindow> | undefined
let isQuitting = false
const DSH_STARTUP_TIMEOUT_MS = 180_000

function lexflowPluginSourceRoot(): string {
  return path.join(app.getAppPath(), 'dsh-plugins')
}

async function readLexFlowPluginManifest(): Promise<LexFlowPluginManifest> {
  const filename = path.join(lexflowPluginSourceRoot(), 'manifest.json')
  const manifest = JSON.parse(await fs.readFile(filename, 'utf8')) as LexFlowPluginManifest
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.packages) || manifest.packages.length === 0) throw new Error('LexFlow 内置扩展清单无效。')
  for (const plugin of manifest.packages) {
    const targetSegments = String(plugin.target).split('/')
    if (!/^[A-Za-z0-9_-]+$/u.test(plugin.source) || targetSegments.some((segment) => !segment || segment === '.' || segment === '..')) throw new Error('LexFlow 内置扩展清单包含不安全路径。')
  }
  return manifest
}

/**
 * 摘出 profile 补丁文件中由设置界面写入的条目。
 *
 * DeepSeek Harness 0.1.7 把插件的 volatile 配置持久化到本 profile 的补丁文件
 * （config-editor 的 documentPath 即此文件），与 LexFlow 固定的装配条目共存。
 * 装配模板每次启动都会重写，若不先摘出这些条目，用户在设置界面作出的选择
 * 每次启动都会被清空。此函数按顶层序列块切分文本：保留含 id、且不含 insert
 * 与 disabled 的块，即设置写入的行；文件不存在或无法读取时返回空串。
 * @param patchPath - profile 补丁文件路径。
 * @returns 用户设置行的原样文本，可直接追加到重写后的模板之后。
 */
async function readUserSettingsEntries(patchPath: string): Promise<string> {
  let document: string
  try { document = await fs.readFile(patchPath, 'utf8') } catch { return '' }
  const blocks: string[] = []
  let current: string[] | undefined
  for (const line of document.split('\n')) {
    if (line.startsWith('- ')) {
      if (current) blocks.push(current.join('\n'))
      current = [line]
    } else if (current) {
      current.push(line)
    }
  }
  if (current) blocks.push(current.join('\n'))
  const kept = blocks
    .filter((block) => /(^|\n)\s*-?\s*id\s*:/u.test(block)
      && !/(^|\n)\s*disabled\s*:/u.test(block)
      && !/(^|\n)\s*-?\s*insert\s*:/u.test(block))
    .map((block) => block.replace(/\n+$/u, ''))
  return kept.length === 0 ? '' : `${kept.join('\n')}\n`
}

async function ensureLexFlowDshProfile(): Promise<void> {
  const profileRoot = path.join(paths.runtimeRoot, 'profiles', 'web')
  const profileNodeModules = path.join(profileRoot, 'node_modules')
  const profilePatchPath = path.join(profileRoot, 'cordis.patch.yml')
  const backupRoot = path.join(paths.appDataRoot, 'backups', '0.1.0-rejected-profile')
  const sourceRoot = lexflowPluginSourceRoot()
  if (!existsSync(sourceRoot)) throw new Error('LexFlow 内置的 DeepSeek Harness 扩展缺失，无法启动。')
  await fs.mkdir(profileRoot, { recursive: true })
  if (!existsSync(backupRoot)) {
    await fs.mkdir(backupRoot, { recursive: true })
    for (const filename of ['package.json', 'cordis.patch.yml', 'cordis.yml', 'pnpm-workspace.yaml']) {
      const source = path.join(profileRoot, filename)
      if (existsSync(source)) await fs.copyFile(source, path.join(backupRoot, filename))
    }
  }
  // DeepSeek Harness 0.1.7 把「设置」改由各插件自身的 volatile 配置承载，写入本
  // profile 的 cordis.patch.yml（config-editor 的 documentPath 即此文件）。该文件
  // 因此同时承载两类内容：LexFlow 固定的装配条目，以及用户在设置界面里作出的选择。
  // 启动时若整份重写，用户设置每次都会被清空，故这里改为：
  //   1. 读出既有文件，摘出不属于 LexFlow 固定装配的条目（即用户设置行）；
  //   2. 写入固定装配模板；
  //   3. 把用户设置行以「覆盖式 config」追加回去，使其在补丁序列中位于装配条目之后，
  //      从而在底座按顺序合并时生效（后应用的补丁层优先级更高）。
  // 这样每次启动既刷新了 LexFlow 的装配与路径，又保留了用户的选择。
  const settingsEntries = await readUserSettingsEntries(profilePatchPath)
  await atomicWrite(path.join(profileRoot, 'package.json'), JSON.stringify({
    name: 'lexflow-dsh-profile-web',
    private: true,
    dependencies: {},
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] } },
  }, null, 2) + '\n')
  await atomicWrite(path.join(profileRoot, 'cordis.yml'), '[]\n')
  await atomicWrite(path.join(profileRoot, 'pnpm-workspace.yaml'), 'packages:\n  - .\n\nnodeLinker: hoisted\nautoInstallPeers: false\n')
  await atomicWrite(profilePatchPath, `# LexFlow owns the product shell and business surfaces.\n# DeepSeek Harness remains the execution substrate; only its unstable seams are\n# consumed by @lexflow/dsh-adapter and the pinned workflow compatibility bundle.\n- id: ui-brand-official\n  disabled: true\n- id: ui-agent-preset\n  disabled: true\n- id: ui-layout\n  disabled: true\n- id: ui-sidebar\n  disabled: true\n- id: ui-model-selection\n  disabled: true\n- insert:\n    - id: lexflow-adapter\n      name: '@lexflow/dsh-adapter'\n    - id: lexflow-ui-pages\n      name: '@lexflow/ui-pages'\n    - id: lexflow-ui-shell\n      name: '@lexflow/ui-shell'\n    - id: lexflow-archive\n      name: '@lexflow/archive'\n      config:\n        workspaceRoot: ${JSON.stringify(paths.workspaceRoot)}\n        archiveRoot: ${JSON.stringify(paths.archiveRoot)}\n        draftsRoot: ${JSON.stringify(paths.draftsRoot)}\n        historyRoot: ${JSON.stringify(paths.historyRoot)}\n        trashRoot: ${JSON.stringify(paths.trashRoot)}\n        oldDataRoot: ${JSON.stringify(paths.oldDataRoot)}\n        defaultKnowledgeBaseRoot: ${JSON.stringify(paths.defaultKnowledgeBaseRoot)}\n        knowledgeBaseStatePath: ${JSON.stringify(paths.knowledgeBaseStatePath)}\n        userAgentPath: ${JSON.stringify(paths.userAgentPath)}\n    - id: lexflow-presets\n      name: '@lexflow/presets'\n    - id: lexflow-workbench\n      name: '@lexflow/workbench'\n    - id: lexflow-workflow\n      name: '@lexflow/workflow'\n`)
  // 0.1.5 新增的“在应用中打开”控件不属于 LexFlow 产品界面（用户核验时确认为多余），
  // 只停用其客户端半边，保留宿主半边供文件链接等既有能力使用。
  await atomicWrite(
    path.join(profileRoot, 'cordis.patch.yml'),
    (await fs.readFile(path.join(profileRoot, 'cordis.patch.yml'), 'utf8')) + '- id: ui-open-in-app\n  disabled: true\n',
  )
  const baseProfilePatch = await fs.readFile(path.join(profileRoot, 'cordis.patch.yml'), 'utf8')
  const baseProfilePatchWithIndex = baseProfilePatch.replace(
    `        knowledgeBaseStatePath: ${JSON.stringify(paths.knowledgeBaseStatePath)}\n`,
    `        knowledgeBaseStatePath: ${JSON.stringify(paths.knowledgeBaseStatePath)}\n        knowledgeBaseIndexRoot: ${JSON.stringify(paths.knowledgeBaseIndexRoot)}\n        workflowSettingsPath: ${JSON.stringify(paths.workflowSettingsPath)}\n`,
  )
  const baseProfilePatchWithAgent = baseProfilePatchWithIndex.replace(
    `      name: '@lexflow/presets'\n`,
    `      name: '@lexflow/presets'\n      config:\n        userAgentPath: ${JSON.stringify(paths.userAgentPath)}\n`,
  )
  await atomicWrite(path.join(profileRoot, 'cordis.patch.yml'), `${baseProfilePatchWithAgent}
- insert:
    # Kimi 套餐登录入口：驱动模型层自带的 kimi-coding 授权流程，登录后套餐模型自动进入选择器。
    - id: lexflow-kimi-connect
      name: '@lexflow/kimi-connect'
${settingsEntries}`)
  const pluginManifest = await readLexFlowPluginManifest()
  for (const plugin of pluginManifest.packages) {
    const source = path.join(sourceRoot, plugin.source)
    const destination = path.join(profileNodeModules, ...plugin.target.split('/'))
    if (!existsSync(source)) throw new Error(`LexFlow 内置扩展缺失：${plugin.source}`)
    await fs.mkdir(path.dirname(destination), { recursive: true })
    await fs.rm(destination, { recursive: true, force: true })
    await fs.mkdir(destination, { recursive: true })
    // 只复制白名单文件。白名单与打包忽略规则、打包后校验共用
    // scripts/plugin-release-files.cjs 的同一份定义，避免三处各自维护而静默漂移。
    for (const entry of await fs.readdir(source, { withFileTypes: true })) {
      if (!entry.isDirectory() && isPluginReleaseFile(`${plugin.source}/${entry.name}`)) {
        await fs.copyFile(path.join(source, entry.name), path.join(destination, entry.name))
      }
    }
    const libSource = path.join(source, 'lib')
    if (existsSync(libSource)) {
      await fs.cp(libSource, path.join(destination, 'lib'), {
        recursive: true,
        // 白名单按文件粒度定义，而 fs.cp 的过滤函数也会收到目录：目录一律放行，
        // 由其中每个文件各自接受白名单判定。否则整个 lib/ 目录会被当作非白名单条目剔除。
        filter: filename => statSync(filename).isDirectory()
          || isPluginReleaseFile(path.relative(sourceRoot, filename).split(path.sep).join('/')),
      })
    }
  }
  // 仅用于清理升级前的旧运行时目录；当前插件一律使用 @lexflow/*。
  for (const legacyTarget of [
    '@lexflow/dsh-ui',
    '@lexflow/dsh-standards',
    '@deepseek-ai/dsh-client-ui-layout',
    '@deepseek-ai/dsh-client-ui-sidebar',
    '@deepseek-ai/dsh-client-ui-conversation',
    '@deepseek-ai/dsh-client-ui-model-selection',
    '@deepseek-ai/dsh-client-ui-settings-models',
    '@deepseek-ai/dsh-client-runtime',
    '@deepseek-ai/dsh-client-ui-primitives',
    '@deepseek-ai/dsh-client-ui-slots',
    '@flowlegal/flow-client-ui-layout',
    '@flowlegal/flow-client-ui-sidebar',
    '@flowlegal/flow-ui',
    '@flowlegal/flow-standards',
    '@flowlegal/dsh-flow-ui',
    '@flowlegal/dsh-flow-standards',
  ]) {
    await fs.rm(path.join(profileNodeModules, ...legacyTarget.split('/')), { recursive: true, force: true })
  }
  // LexFlow 档案室插件注册智能体工具时依赖 DeepSeek Harness 的工具定义包。
  // 通过链接回应用内固定依赖，避免在用户运行目录重复安装或联网下载。
  for (const dependency of ['mammoth', 'turndown', 'turndown-plugin-gfm', 'xlsx', 'docx', 'pptxgenjs', 'jszip']) {
    const source = path.join(app.getAppPath(), 'node_modules', dependency)
    if (!existsSync(source)) throw new Error(`LexFlow 缺少文档转换组件：${dependency}`)
    const target = path.join(profileNodeModules, dependency)
    await fs.rm(target, { recursive: true, force: true })
    await fs.symlink(source, target, 'dir')
  }
  const toolsSource = path.join(app.getAppPath(), 'node_modules', '@deepseek-ai', 'dsh-tools')
  const toolsDestination = path.join(profileNodeModules, '@deepseek-ai', 'dsh-tools')
  if (!existsSync(toolsSource)) throw new Error('LexFlow 缺少智能体工具运行依赖，无法启动。')
  await fs.mkdir(path.dirname(toolsDestination), { recursive: true })
  await fs.rm(toolsDestination, { recursive: true, force: true })
  await fs.symlink(toolsSource, toolsDestination, 'dir')

  const fontsSource = path.join(app.getAppPath(), 'resources', 'fonts')
  const fontsDestination = path.join(profileRoot, 'fonts')
  if (!existsSync(fontsSource)) throw new Error('LexFlow 缺少界面字体资源，无法启动。')
  await fs.rm(fontsDestination, { recursive: true, force: true })
  await fs.symlink(fontsSource, fontsDestination, 'dir')

}

function logRuntime(message: string): void {
  try { appendFileSync(path.join(paths.appDataRoot, 'lexflow-runtime.log'), `[${new Date().toISOString()}] ${message}\n`) } catch {}
}

// 每次启动都会由底座写入一个新的 dsh-auth-* Cookie。长期累积后，浏览器请求头
// 超过底座服务的请求头上限，客户端插件 bundle 会以 431 失败，表现为
// “Failed to load plugins”。启动时清理陈旧 Cookie，仅让本次会话重新写入一个。
async function pruneStaleDshAuthCookies(): Promise<void> {
  try {
    const cookies = await session.defaultSession.cookies.get({})
    const stale = cookies.filter((cookie) => /^dsh-auth-/u.test(cookie.name) && (cookie.domain === '127.0.0.1' || cookie.domain === 'localhost'))
    let removed = 0
    for (const cookie of stale) {
      try {
        await session.defaultSession.cookies.remove(`http://${cookie.domain}${cookie.path || '/'}`, cookie.name)
        removed += 1
      } catch { /* 单个 Cookie 清理失败不影响启动 */ }
    }
    if (removed > 0) logRuntime(`已清理 ${removed} 个陈旧的 DSH 鉴权 Cookie，避免请求头过大导致插件加载失败。`)
  } catch (error) {
    logRuntime(`清理陈旧 DSH 鉴权 Cookie 失败：${error instanceof Error ? error.message : String(error)}`)
  }
}

function resolveDshRuntimeExecutable(): string {
  const candidates: string[] = []
  if (process.env.LEXFLOW_NODE_PATH) candidates.push(process.env.LEXFLOW_NODE_PATH)
  try {
    const nodeRoot = path.join(app.getPath('home'), '.nvm', 'versions', 'node')
    candidates.push(...readdirSync(nodeRoot).sort().reverse().map((version) => path.join(nodeRoot, version, 'bin', 'node')))
  } catch {}
  candidates.push('/opt/homebrew/bin/node', '/usr/local/bin/node', '/usr/bin/node', process.execPath)
  return candidates.find((candidate) => existsSync(candidate)) ?? process.execPath
}

function notifyFullscreenState(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send('lexflow:fullscreen-changed', mainWindow.isFullScreen())
}

// 产品更名的兼容迁移：把旧 Flow 运行目录移入 LexFlow 的隔离目录，避免旧目录继续留在 Application Support 根部。
function migrateLegacyAppData(): void {
  // 迁移只在真实数据根上执行：覆盖目录下没有历史遗留需要搬迁。
  const current = paths === undefined ? app.getPath('userData') : paths.appDataRoot
  const legacy = path.join(path.dirname(current), 'Flow')
  if (legacy === current || !existsSync(legacy)) return
  try {
    if (!existsSync(current)) { renameSync(legacy, current); return }
    const destination = path.join(current, 'legacy-data')
    if (!existsSync(destination)) { renameSync(legacy, destination); return }
    for (const entry of readdirSync(legacy)) {
      const from = path.join(legacy, entry)
      const to = path.join(destination, entry)
      if (!existsSync(to)) renameSync(from, to)
    }
    if (readdirSync(legacy).length === 0) rmdirSync(legacy)
  } catch { /* 迁移失败不阻断启动；新目录由 ensureDirectories 兜底创建 */ }
}

// 将旧用户工作目录迁移到 LexFlow；若新目录已存在，则把旧目录整体隔离保存。
function migrateLegacyWorkspace(): void {
  const documents = path.join(app.getPath('home'), 'Documents')
  const current = path.join(documents, 'LexFlow')
  const legacy = path.join(documents, 'Flow')
  if (legacy === current || !existsSync(legacy)) return
  try {
    if (!existsSync(current)) { renameSync(legacy, current); return }
    const destination = path.join(current, 'legacy-workspace')
    if (!existsSync(destination)) renameSync(legacy, destination)
  } catch { /* 迁移失败不阻断启动；当前目录由 ensureDirectories 兜底创建 */ }
}

function migrateLegacyRuntimeLog(): void {
  const root = paths === undefined ? app.getPath('userData') : paths.appDataRoot
  const legacy = path.join(root, 'flow-runtime.log')
  const current = path.join(root, 'lexflow-runtime.log')
  if (existsSync(legacy) && !existsSync(current)) {
    try { renameSync(legacy, current) } catch {}
  }
}

async function ensureDirectories(): Promise<void> {
  await Promise.all([
    paths.workspaceRoot, paths.archiveRoot, paths.appDataRoot, paths.runtimeRoot,
    paths.settingsRoot, paths.draftsRoot, paths.historyRoot, paths.trashRoot, paths.oldDataRoot, paths.knowledgeBaseIndexRoot
  ].map((directory) => fs.mkdir(directory, { recursive: true })))
}

function isProjectionCacheRecord(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const record = (value as { record?: unknown }).record
  if (!record || typeof record !== 'object') return false
  const identity = (record as { identity?: unknown }).identity
  if (!identity || typeof identity !== 'object') return false
  const fields = identity as { createdAt?: unknown; isSeeded?: unknown; inheritedEventCount?: unknown }
  return typeof fields.createdAt === 'number' && typeof fields.isSeeded === 'boolean' && typeof fields.inheritedEventCount === 'number'
}

async function hasInvalidProjectionCacheTree(directory: string): Promise<boolean> {
  let entries: import('node:fs').Dirent[]
  try { entries = await fs.readdir(path.join(directory, 'sessions'), { withFileTypes: true }) } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ENOENT'
  }
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue
    try {
      const value = JSON.parse(await fs.readFile(path.join(directory, 'sessions', entry.name), 'utf8')) as unknown
      if (!isProjectionCacheRecord(value)) return true
    } catch { return true }
  }
  return false
}

async function archiveProjectionCache(source: string): Promise<string> {
  const archiveRoot = path.join(paths.appDataRoot, 'backups', 'projection-cache')
  await fs.mkdir(archiveRoot, { recursive: true })
  const destination = path.join(archiveRoot, `${path.basename(source)}.legacy-${Date.now()}-${randomUUID().slice(0, 8)}`)
  await fs.rename(source, destination)
  return destination
}

async function archiveProjectionCacheSiblings(storageRoot: string): Promise<string[]> {
  let entries: import('node:fs').Dirent[]
  try { entries = await fs.readdir(storageRoot, { withFileTypes: true }) } catch { return [] }
  const archived: string[] = []
  for (const entry of entries) {
    if (!entry.name.startsWith('session_projcache.')) continue
    archived.push(await archiveProjectionCache(path.join(storageRoot, entry.name)))
  }
  return archived
}

async function ensureProjectionCacheCompatibility(): Promise<void> {
  const storageRoot = path.join(paths.runtimeRoot, 'storages')
  const legacyFile = path.join(storageRoot, 'session_projcache.json')
  const cacheTree = path.join(storageRoot, 'session_projcache')
  const archived: string[] = []

  if (existsSync(legacyFile)) archived.push(await archiveProjectionCache(legacyFile))
  if (existsSync(cacheTree) && await hasInvalidProjectionCacheTree(cacheTree)) archived.push(await archiveProjectionCache(cacheTree))
  archived.push(...await archiveProjectionCacheSiblings(storageRoot))
  if (archived.length > 0) logRuntime(`已隔离旧会话投影缓存，等待 Alpha 4 从会话事件流重建：${archived.join(', ')}`)
}

async function moveLegacyStandardsToOldData(): Promise<void> {
  const candidates = [
    { source: paths.legacyStandardsRoot, label: '标准规范' },
    { source: path.join(paths.appDataRoot, 'standards'), label: 'standards' },
  ]
  for (const candidate of candidates) {
    if (!existsSync(candidate.source)) continue
    await fs.mkdir(paths.oldDataRoot, { recursive: true })
    const bucket = path.join(paths.oldDataRoot, `legacy-standards-${Date.now()}-${randomUUID().slice(0, 8)}`)
    const payload = path.join(bucket, 'payload')
    await fs.mkdir(payload, { recursive: true })
    await fs.rename(candidate.source, path.join(payload, candidate.label))
    await atomicWrite(path.join(bucket, 'metadata.json'), JSON.stringify({
      version: 1,
      kind: 'legacy-standards',
      originalPath: candidate.source,
      originalName: candidate.label,
      movedAt: new Date().toISOString(),
    }, null, 2) + '\n')
  }
}

async function moveLegacyAgentFilesToOldData(): Promise<void> {
  const candidates = [
    { filename: path.join(path.dirname(paths.userAgentPath), 'AGENTS.md'), label: '旧工作区 AGENTS.md' },
    { filename: path.join(path.dirname(paths.userAgentPath), 'Agent.md'), label: '旧工作区 Agent.md' },
    { filename: path.join(paths.runtimeRoot, 'AGENTS.md'), label: '运行目录 AGENTS.md' },
  ]
  for (const candidate of candidates) {
    if (!existsSync(candidate.filename)) continue
    try {
      const info = await fs.stat(candidate.filename)
      if (!info.isFile() || info.size === 0) continue
    } catch { continue }
    const bucket = path.join(paths.oldDataRoot, `legacy-agent-${Date.now()}-${randomUUID().slice(0, 8)}`)
    const payload = path.join(bucket, 'payload')
    await fs.mkdir(payload, { recursive: true })
    await fs.rename(candidate.filename, path.join(payload, path.basename(candidate.filename)))
    await atomicWrite(path.join(bucket, 'metadata.json'), JSON.stringify({
      version: 1,
      kind: 'legacy-agent',
      originalPath: candidate.filename,
      originalName: candidate.label,
      movedAt: new Date().toISOString(),
    }, null, 2) + '\n')
  }
}

async function migrateAgentFileName(): Promise<void> {
  const current = paths.userAgentPath
  if (existsSync(current)) return
  for (const legacy of [path.join(path.dirname(current), 'AGENTS.md'), path.join(path.dirname(current), 'Agent.md')]) {
    if (!existsSync(legacy)) continue
    try {
      const info = await fs.lstat(legacy)
      if (!info.isFile() || info.isSymbolicLink()) continue
      await fs.rename(legacy, current)
      logRuntime(`已将全局规则改名为 ${current}`)
      return
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
}

async function migrateLegacyContent(): Promise<void> {
  if (existsSync(paths.legacyCleanupStatePath)) return
  await moveLegacyStandardsToOldData()
  await moveLegacyAgentFilesToOldData()
  await atomicWrite(paths.legacyCleanupStatePath, JSON.stringify({ version: 1, completedAt: new Date().toISOString() }, null, 2) + '\n')
}

async function ensureDshHomeAgentAbsent(): Promise<void> {
  const filename = path.join(paths.runtimeRoot, 'AGENTS.md')
  if (!existsSync(filename)) return
  try {
    const info = await fs.stat(filename)
    if (!info.isFile()) return
    await fs.rm(filename)
    logRuntime('已删除运行目录中的旧 AGENTS.md；用户规则只从工作区 AGENT.md 读取。')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}

async function ensureUserAgent(): Promise<void> {
  try { const handle = await fs.open(paths.userAgentPath, 'wx'); await handle.close() }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; const info = await fs.lstat(paths.userAgentPath); if (!info.isFile() || info.isSymbolicLink()) throw new Error('全局规则路径不是安全的普通文件。') }
}
async function atomicWrite(filename: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filename), { recursive: true })
  const temporary = `${filename}.${randomUUID()}.tmp`
  await fs.writeFile(temporary, content, 'utf8')
  await fs.rename(temporary, filename)
}

async function startDsh(): Promise<string | undefined> {
  if (dshUrl && dshProcess && !dshProcess.killed && dshProcess.exitCode === null && dshProcess.signalCode === null) return dshUrl
  if (dshStartPromise) return dshStartPromise
  if (isQuitting) return undefined
  const pending = (async () => {
    try { await ensureLexFlowDshProfile() } catch (error) {
      dshError = error instanceof Error ? error.message : String(error)
      logRuntime(dshError)
      return undefined
    }
    return await new Promise<string | undefined>((resolve) => {
    try {
      const dsh = require.resolve('@deepseek-ai/dsh/lib/bin.js')
      const childEnvironment = {
        HOME: app.getPath('home'),
        PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin',
        TMPDIR: process.env.TMPDIR ?? '/tmp',
        LANG: process.env.LANG ?? 'en_US.UTF-8',
        PWD: paths.workspaceRoot,
        DSH_HOME: paths.runtimeRoot,
        DSH_TELEMETRY_DISABLED: '1',
        ELECTRON_RUN_AS_NODE: '1',
        LEXFLOW_FONT_ROOT: path.join(paths.runtimeRoot, 'profiles', 'web', 'fonts'),
        LEXFLOW_OCR_DIR: path.join(app.getAppPath(), 'resources', 'ocr'),
      }
      const child = spawn(resolveDshRuntimeExecutable(), ['--expose-internals', dsh, 'web', '--host', '127.0.0.1', '--port', '0', '--no-open'], {
        cwd: paths.workspaceRoot,
        env: childEnvironment,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      dshProcess = child
      let output = ''
      const cleanup = (): void => {
        child.stdout?.removeAllListeners('data')
        child.stderr?.removeAllListeners('data')
      }
      const consumeOutput = (chunk: Buffer | string): void => {
        const text = String(chunk)
        output += text
        logRuntime(text.trimEnd().replace(/token=[^ \r\n]+/gu, 'token=[omitted]'))
        const match = output.match(/dsh web:\s*(http:\/\/127\.0\.0\.1:\d+(?:\/\?[^ \r\n]+)?)/u)
        if (match?.[1] && !dshUrl) { dshUrl = match[1]; cleanup(); clearTimeout(timeout); resolve(dshUrl) }
      }
      const timeout = setTimeout(() => { dshError = '对话引擎启动超时。'; logRuntime(dshError); child.kill(); cleanup(); resolve(undefined) }, DSH_STARTUP_TIMEOUT_MS)
      child.stdout?.setEncoding('utf8')
      child.stderr?.setEncoding('utf8')
      child.stdout?.on('data', consumeOutput)
      child.stderr?.on('data', consumeOutput)
      child.once('error', (error) => {
        clearTimeout(timeout)
        cleanup()
        if (dshProcess === child) { dshProcess = undefined; dshUrl = undefined }
        dshError = error.message
        resolve(undefined)
      })
      child.once('exit', (code) => {
        const hadUrl = dshUrl !== undefined
        if (dshProcess === child) { dshProcess = undefined; dshUrl = undefined }
        if (!hadUrl) { clearTimeout(timeout); cleanup(); dshError = `对话引擎退出（代码 ${code}）。${output.replace(/token=[^ \r\n]+/gu, 'token=[omitted]')}`; resolve(undefined) }
      })
    } catch (error) { dshError = error instanceof Error ? error.message : String(error); resolve(undefined) }
    })
  })()
  dshStartPromise = pending
  void pending.finally(() => { if (dshStartPromise === pending) dshStartPromise = undefined })
  return pending
}

function installWindowIpc(): void {
  ipcMain.on('lexflow:window-is-fullscreen', (event) => {
    event.returnValue = mainWindow?.isFullScreen() ?? false
  })
}

async function createWindow(): Promise<BrowserWindow> {
  if (isQuitting) throw new Error('LexFlow 正在退出。')
  const serviceUrl = await startDsh()
  if (isQuitting) throw new Error('LexFlow 正在退出。')
  const win = new BrowserWindow({ width: 1180, height: 760, minWidth: 760, minHeight: 640, show: false, title: 'LexFlow', titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 18, y: 27 }, backgroundColor: '#f8f9fb', webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: false, preload: path.join(currentDirectory, '../preload/index.mjs') } })
  mainWindow = win
  win.on('enter-full-screen', notifyFullscreenState)
  win.on('leave-full-screen', notifyFullscreenState)
  win.webContents.on('did-finish-load', notifyFullscreenState)
  // 渲染进程的错误与告警写入运行日志，便于诊断客户端插件加载与界面故障
  // （LexFlow 的业务插件都在渲染进程里，主进程日志此前看不到它们的问题）。
  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level < 2) return
    appendFileSync(
      path.join(paths.appDataRoot, 'lexflow-runtime.log'),
      `[${new Date().toISOString()}] [renderer:${level === 3 ? 'error' : 'warn'}] ${message} (${sourceId}:${line})\n`,
    )
  })
  win.webContents.on('render-process-gone', (_event, details) => {
    appendFileSync(
      path.join(paths.appDataRoot, 'lexflow-runtime.log'),
      `[${new Date().toISOString()}] [renderer] process gone: ${details.reason}\n`,
    )
  })
  win.center()
  // 阻止底层网页把窗口标题改回 DeepSeek Harness。
  win.on('page-title-updated', (event) => { event.preventDefault(); win.setTitle('LexFlow') })
  win.once('ready-to-show', () => { if (!isQuitting && !win.isDestroyed()) win.show() })
  win.on('close', (event) => {
    if (process.platform !== 'darwin' || isQuitting) return
    event.preventDefault()
    win.hide()
  })
  win.on('closed', () => { if (mainWindow === win) mainWindow = undefined })
  if (serviceUrl) await win.loadURL(serviceUrl)
  else await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`<main style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:48px"><h1>LexFlow 未能启动</h1><p>${dshError ?? '本地对话服务未返回地址。'}</p><p>请关闭后重试；现有 DeepSeek Harness 和其数据不会受到影响。</p></main>`)}`)
  return win
}

async function ensureMainWindow(): Promise<BrowserWindow> {
  if (isQuitting) throw new Error('LexFlow 正在退出。')
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow
  if (windowCreationPromise) return windowCreationPromise
  const pending = createWindow()
  windowCreationPromise = pending
  try { return await pending }
  finally { if (windowCreationPromise === pending) windowCreationPromise = undefined }
}

function installMenu(): void {
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: 'LexFlow', submenu: [{ role: 'about' }, { type: 'separator' }, { label: '打开 LexFlow 工作目录', click: () => void shell.openPath(paths.workspaceRoot) }, { label: '打开 LexFlow 数据目录', click: () => void shell.openPath(paths.appDataRoot) }, { type: 'separator' }, { role: 'quit' }] }, { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' }]))
}

app.whenReady().then(async () => {
  // 先解析路径：LEXFLOW_DATA_ROOT 覆盖必须在该点生效，后面的历史迁移、
  // 目录创建与运行日志都只作用于本次选定的数据根。
  paths = getPaths()
  migrateLegacyWorkspace()
  migrateLegacyAppData()
  migrateLegacyRuntimeLog()
  await ensureDirectories()
  await migrateAgentFileName()
  await migrateLegacyContent()
  await ensureDshHomeAgentAbsent()
  await ensureUserAgent()
  await ensureProjectionCacheCompatibility()
  await pruneStaleDshAuthCookies()
  installMenu()
  installWindowIpc()
  await ensureMainWindow()
}).catch((error) => { dialog.showErrorBox('LexFlow 启动失败', error instanceof Error ? error.message : String(error)); app.quit() })

app.on('activate', () => {
  if (isQuitting) return
  void ensureMainWindow().then((win) => {
    if (isQuitting || win.isDestroyed()) return
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  }).catch((error) => { dshError = error instanceof Error ? error.message : String(error); logRuntime(dshError) })
})
app.on('before-quit', () => {
  isQuitting = true
  dshUrl = undefined
  dshStartPromise = undefined
  if (dshProcess && !dshProcess.killed) dshProcess.kill()
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
