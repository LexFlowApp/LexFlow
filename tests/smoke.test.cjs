const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const root = path.join(__dirname, '..')

test('LexFlow package identity is independent', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  assert.equal(packageJson.name, 'lexflow-legal')
  assert.equal(packageJson.productName, 'LexFlow')
  assert.equal(packageJson.version, '0.6.3')
  assert.equal(packageJson.build, undefined)
  const forgeConfig = fs.readFileSync(path.join(root, 'forge.config.cjs'), 'utf8')
  assert.match(forgeConfig, /appBundleId: 'com\.lexflow\.desktop'/)
  assert.equal(packageJson.main, 'out/main/index.js')
  assert.equal(packageJson.dependencies['@deepseek-ai/dsh'], '0.2.0-rc.2')
  assert.equal(packageJson.dependencies['@earendil-works/pi-ai'], '0.85.1')
  assert.equal(packageJson.dependencies['dsh-codex-connect'], undefined)
})

test('LexFlow-owned paths and package identities use the LexFlow name', () => {
  const main = fs.readFileSync(path.join(root, 'src', 'main', 'index.ts'), 'utf8')
  const paths = fs.readFileSync(path.join(root, 'src', 'main', 'paths.ts'), 'utf8')
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'dsh-plugins', 'manifest.json'), 'utf8'))
  assert.match(paths, /Documents', 'LexFlow'/)
  assert.match(main, /name: 'lexflow-dsh-profile-web'/)
  assert.match(main, /name: '@lexflow\/ui-shell'/)
  assert.match(main, /name: '@lexflow\/archive'/)
  assert.match(main, /workflowSettingsPath/)
  assert.deepEqual(manifest.packages.filter((plugin) => plugin.kind === 'lexflow-owned').map((plugin) => plugin.source), [
    'lexflow-dsh-adapter',
    'lexflow-kimi-connect',
    'lexflow-ui-shell',
    'lexflow-ui-pages',
    'lexflow-archive',
    'lexflow-presets',
    'lexflow-workbench',
    'lexflow-workflow',
  ])
  assert.ok(fs.existsSync(path.join(root, 'assets', 'lexflow.svg')))
  assert.ok(fs.existsSync(path.join(root, 'resources', 'lexflow.icns')))
  assert.equal(fs.existsSync(path.join(root, 'assets', 'flow.svg')), false)
  assert.equal(fs.existsSync(path.join(root, 'resources', 'flow.icns')), false)
})

test('LexFlow keeps its own app identity assets', () => {
  assert.ok(fs.existsSync(path.join(root, 'assets', 'lexflow.svg')))
  assert.ok(fs.existsSync(path.join(root, 'resources', 'lexflow.icns')))
  assert.ok(fs.statSync(path.join(root, 'resources', 'fonts', 'SourceHanSerifSC-Regular.otf')).size > 20_000_000)
  assert.ok(fs.statSync(path.join(root, 'resources', 'fonts', 'SourceHanSerifSC-SemiBold.otf')).size > 20_000_000)
  assert.ok(fs.existsSync(path.join(root, 'resources', 'fonts', 'LICENSE.txt')))
})

test('成品图标母版不会被烘焙流程二次加工', () => {
  // 母版有两种来源：满幅主图需 bake 抠白套圆角，美术交付的成品母版自带石板与圆角。
  // 对成品再 bake 一次会按亮度阈值把石板抠掉约四分之一的不透明像素，图标损坏
  //（2026-10-07 实测：995707 → 744872）。generate-icon.sh 以 ready 标记区分两者。
  const script = fs.readFileSync(path.join(root, 'scripts', 'generate-icon.sh'), 'utf8')
  assert.match(script, /checkpoint="\$root\/assets\/lexflow-icon-ready\.json"/u)
  assert.match(script, /if \[ -f "\$checkpoint" \]; then/u)
  assert.match(script, /母版为成品图标，跳过烘焙/u)
  // 标记存在时母版必须存在，且确为带透明角的成品（四角 alpha 全 0）。
  const checkpoint = path.join(root, 'assets', 'lexflow-icon-ready.json')
  assert.ok(fs.existsSync(checkpoint), '成品母版标记缺失，打包会退回烘焙流程并损坏图标')
  assert.ok(fs.existsSync(path.join(root, 'assets', 'lexflow-icon-1024.png')))
  const icns = fs.readFileSync(path.join(root, 'assets', 'lexflow.icns'))
  assert.equal(icns.toString('latin1', 0, 4), 'icns')
  const kinds = []
  for (let offset = 8; offset < Math.min(icns.readUInt32BE(4), icns.length);) {
    const kind = icns.toString('latin1', offset, offset + 4)
    kinds.push(kind)
    assert.notEqual(['ic04', 'ic05', 'info'].includes(kind), true, `图标含旧式条目 ${kind}`)
    offset += icns.readUInt32BE(offset + 4)
  }
  assert.equal(kinds.includes('ic10'), true, '图标缺少 1024 条目')
})

test('LexFlow opens the isolated DeepSeek Harness surface directly', () => {
  const main = fs.readFileSync(path.join(root, 'src', 'main', 'index.ts'), 'utf8')
  assert.match(main, /const serviceUrl = await startDsh\(\)/)
  assert.match(main, /win\.loadURL\(serviceUrl\)/)
  assert.match(main, /PWD: paths\.workspaceRoot/)
  assert.doesNotMatch(main, /mainWindow\.loadFile\(/)
  assert.doesNotMatch(main, /ELECTRON_RENDERER_URL/)
})

test('LexFlow isolates stale projection caches before Alpha 4 starts', () => {
  const main = fs.readFileSync(path.join(root, 'src', 'main', 'index.ts'), 'utf8')
  assert.match(main, /function ensureProjectionCacheCompatibility\(\)/)
  assert.match(main, /session_projcache\.json/)
  assert.match(main, /session_projcache/)
  assert.match(main, /isSeeded/)
  assert.match(main, /inheritedEventCount/)
  assert.match(main, /archiveProjectionCache\(/)
  assert.match(main, /backups', 'projection-cache'/)
  assert.match(main, /archiveProjectionCacheSiblings\(/)
  assert.match(main, /await ensureProjectionCacheCompatibility\(\)/)
})

test('the LexFlow main process has one workspace backend and only window IPC', () => {
  const main = fs.readFileSync(path.join(root, 'src', 'main', 'index.ts'), 'utf8')
  assert.match(main, /function installWindowIpc\(\)/)
  assert.doesNotMatch(main, /ipcMain\.handle\('(standards|archive|workbench|app):/)
  assert.doesNotMatch(main, /function listStandards\(/)
  assert.doesNotMatch(main, /function openWorkbench\(/)
})

test('every plugin source and built artifact parses, so a typo cannot ship as a silent load failure', () => {
  // 提示词等长文本里误用反引号会截断模板字符串：源码"看起来正常"，产物却语法错误，
  // 表现为 dsh 启动后某个插件 failed to import（功能静默消失，界面无任何提示）。
  // 用 node --check 逐文件解析（本仓库为 type: module，能正确处理 ESM 语法）；
  // 真实导入依赖 dsh 运行时与插件相互引用，不在此处模拟。
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'dsh-plugins', 'manifest.json'), 'utf8'))
  let checked = 0
  for (const plugin of manifest.packages) {
    for (const entrypoint of plugin.entrypoints) {
      for (const candidate of [entrypoint.replace(/^lib\//u, 'src/'), entrypoint]) {
        const filename = path.join(root, 'dsh-plugins', plugin.source, candidate)
        if (!fs.existsSync(filename)) continue
        try {
          execFileSync(process.execPath, ['--check', filename], { stdio: 'pipe' })
        } catch (error) {
          assert.fail(`${plugin.target} ${candidate} must parse: ${String(error.stderr ?? error.message)}`)
        }
        checked += 1
      }
    }
  }
  assert.ok(checked > 0)
})

test('the bundled plugin manifest matches every runtime package', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'dsh-plugins', 'manifest.json'), 'utf8'))
  const productVersion = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version
  const dshVersion = JSON.parse(fs.readFileSync(path.join(root, 'node_modules/@deepseek-ai/dsh/package.json'), 'utf8')).version
  assert.equal(manifest.schemaVersion, 1)
  for (const plugin of manifest.packages) {
    const packageRoot = path.join(root, 'dsh-plugins', plugin.source)
    const packageJson = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'))
    assert.equal(packageJson.name, plugin.target)
    for (const entrypoint of plugin.entrypoints) {
      assert.ok(fs.existsSync(path.join(packageRoot, entrypoint)))
      if (plugin.kind === 'lexflow-owned') {
        const sourcePath = path.join(packageRoot, entrypoint.replace(/^lib\//u, 'src/'))
        if (plugin.source === 'lexflow-ui-pages' && entrypoint === 'lib/client.js') {
          const fingerprint = require('node:crypto').createHash('sha256').update(fs.readFileSync(sourcePath)).update(fs.readFileSync(path.join(packageRoot, 'src/workbench-editor.js'))).update(fs.readFileSync(path.join(root, 'pnpm-lock.yaml'))).digest('hex')
          assert.ok(fs.readFileSync(path.join(packageRoot, entrypoint), 'utf8').includes('lexflow-editor-source:' + fingerprint))
          assert.ok(fs.readFileSync(path.join(packageRoot, 'lib/EDITOR-LICENSES.txt'), 'utf8').includes('@atomic-editor/editor'))
        } else {
          // The build injects real product/substrate versions over the single-quoted
          // __LEXFLOW_*_VERSION__ placeholders; everything else must match byte for byte.
          const normalized = fs.readFileSync(sourcePath, 'utf8').replace(/'__LEXFLOW_PRODUCT_VERSION__'/gu, JSON.stringify(productVersion)).replace(/'__LEXFLOW_DSH_VERSION__'/gu, JSON.stringify(dshVersion))
          const builtText = fs.readFileSync(path.join(packageRoot, entrypoint), 'utf8')
          assert.equal(normalized, builtText)
          assert.doesNotMatch(builtText, /'__LEXFLOW_(?:PRODUCT|DSH)_VERSION__'/u)
        }
      }
    }
  }
})

test('LexFlow has one adapter, one Codex bridge, and the expected product plugin entry points', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'dsh-plugins', 'manifest.json'), 'utf8'))
  assert.deepEqual(manifest.packages.map((plugin) => plugin.target), [
    '@lexflow/dsh-adapter',
    '@lexflow/kimi-connect',
    '@lexflow/ui-shell',
    '@lexflow/ui-pages',
    '@lexflow/archive',
    '@lexflow/presets',
    '@lexflow/workbench',
    '@lexflow/workflow',
  ])
  assert.ok(manifest.packages.every((plugin) => plugin.kind === 'lexflow-owned'))
  const main = fs.readFileSync(path.join(root, 'src', 'main', 'index.ts'), 'utf8')
  // LexFlow 自有壳层继续停用官方布局、侧栏与模型选择入口；
  // 官方「模型」设置页自 0.6.0 起启用（自研模型页已移除），因此不再停用它。
  for (const id of ['ui-layout', 'ui-sidebar', 'ui-model-selection']) {
    assert.ok(main.includes(`- id: ${id}\\n  disabled: true`))
  }
  // GPT 套餐接入自 0.6.0 起从运行期装配中移除：模型选择器不应再出现未接入的 GPT 套餐。
  assert.doesNotMatch(main, /id: llm-openai-codex/)
  assert.doesNotMatch(main, /name: '@lexflow\/codex-connect'/)
  assert.ok(!manifest.packages.some((plugin) => plugin.target === '@lexflow/codex-connect'))
  assert.doesNotMatch(main, /- id: ui-settings-models\\n  disabled: true/)
  assert.doesNotMatch(main, /- id: ui-settings\\n  disabled: true/)
  assert.doesNotMatch(main, /- id: ui-conversation\\n  disabled: true/)
  const adapter = fs.readFileSync(path.join(root, 'dsh-plugins', 'lexflow-dsh-adapter', 'src', 'index.js'), 'utf8')
  const archive = fs.readFileSync(path.join(root, 'dsh-plugins', 'lexflow-archive', 'src', 'index.js'), 'utf8')
  assert.match(adapter, /registerSettings/)
  assert.match(adapter, /registerPrompt/)
  assert.match(adapter, /defineTool/)
  assert.doesNotMatch(archive, /@deepseek-ai\/dsh-tools/)
})

test('the hand-written pi-ai provider profile carries every DSH contract field', () => {
  // 底座 dsh-llm-pi-ai 的 modelOf() 读取 profile.modelErrors，底座自建 profile 为
  // `catalog?.modelErrors ?? new Map()`。手写 profile 漏字段会让 resolveModelInfo 抛
  // TypeError，使整个 OpenAI Codex 分组在模型目录中加载失败（0.3.0 已实际发生过一次）。
  for (const entry of ['src/src-ByKP_wn9.js', 'lib/src-ByKP_wn9.js']) {
    const source = fs.readFileSync(path.join(root, 'dsh-plugins', 'lexflow-codex-connect', entry), 'utf8')
    const start = source.indexOf('function createOpenAICodexProfile')
    assert.notEqual(start, -1, `${entry} 应包含 createOpenAICodexProfile`)
    const end = source.indexOf('\n}', start)
    assert.notEqual(end, -1, `${entry} 的 createOpenAICodexProfile 应有闭合括号`)
    const profile = source.slice(start, end)
    for (const field of ['provider:', 'displayName:', 'retryPolicy:', 'configuredMaxTokens:', 'modelErrors:', 'piProvider:']) {
      assert.ok(profile.includes(field), `${entry} 的手写 pi-ai profile 缺少底座契约字段 ${field}`)
    }
  }
  // 底座契约若改名（不再读取 profile.modelErrors），这里失败以提示重新对齐适配层与插件。
  const piAi = path.join(root, 'node_modules', '@deepseek-ai', 'dsh-llm-pi-ai', 'lib', 'index.js')
  if (fs.existsSync(piAi)) assert.match(fs.readFileSync(piAi, 'utf8'), /profile\.modelErrors\.get\(/)
})

test('native client patches supply a single LexFlow sidebar and routed center pages', () => {
  const shell = fs.readFileSync(path.join(root, 'dsh-plugins', 'lexflow-ui-shell', 'lib', 'client.js'), 'utf8')
  const adapter = fs.readFileSync(path.join(root, 'dsh-plugins', 'lexflow-dsh-adapter', 'lib', 'client.js'), 'utf8')
  const pages = fs.readFileSync(path.join(root, 'dsh-plugins', 'lexflow-ui-pages', 'lib', 'client.js'), 'utf8')
  const archive = fs.readFileSync(path.join(root, 'dsh-plugins', 'lexflow-archive', 'lib', 'client.js'), 'utf8')
  const workbench = fs.readFileSync(path.join(root, 'dsh-plugins', 'lexflow-workbench', 'lib', 'client.js'), 'utf8')
  assert.match(adapter, /LexFlowPlaceholder/)
  assert.match(shell, /lexflow:navigate/)
  assert.match(adapter, /const currentSessionId = useSessions/)
  assert.doesNotMatch(shell, /currentSessionId, lexflowPage/)
  assert.match(adapter, /const s = sidebar === 0 \? 0 : clampWidth/)
  assert.match(shell, /sidebar\.lexflow\.nav/)
  assert.match(shell, /LexFlow 一级导航/)
  assert.match(shell, /startNew: true/)
  assert.match(shell, /cancelable: true/)
  assert.match(adapter, /lastSessionId/)
  assert.match(adapter, /sessionRow/)
  assert.match(adapter, /source: ['"]session-row['"]|source: ['"]session-change['"]|lexflow:navigate/)
  // 弹窗层级：高于 LexFlow 自有浮层（1000）、低于底座菜单浮层（1100），
  // 设置页下拉不再被弹窗盖住（2026-09-30 修复；此前为 2147483000）。
  assert.match(adapter, /z-index: 1050 !important/)
  assert.doesNotMatch(adapter, /z-index: 2147483000/)
  assert.match(pages, /工作流/)
  assert.doesNotMatch(pages, /标准规范/)
  assert.match(pages, /function Workflow\(/)
  assert.match(pages, /workflow\.status/)
  assert.match(pages, /workflow\.oldData\.list/)
  assert.match(pages, /lexflowWorkflowTopBack/)
  assert.doesNotMatch(pages, /lexflowWorkflowFooterBack/)
  assert.match(pages, /height: 15/)
  assert.doesNotMatch(pages, /jsx\((?:SearchIcon|FilterIcon|PlusIcon)\)/)
  assert.match(adapter, /sidebar\.lexflow\.nav", \{ wide, startSession, useSidebarPanels, selectPanel, panelInfo, renderPanelIcon: \(id, ownerProps\) => renderPanelIconImpl\(id, ownerProps, renderSlot\) \}/)
  // 面板入口唯一性：面板行区（SidebarPanelList／SidebarPanelRow 组件）已删除，
  // 面板入口只由一级导航渲染，避免侧栏出现两个"插件"。
  assert.doesNotMatch(adapter, /function SidebarPanelList|function SidebarPanelRow/)
  // 面板选中态：导航行订阅适配层面板观察面（同一份状态，非事件自记）。
  assert.match(shell, /panelInfo\.subscribe/)
  // 中心列：选中面板时按面板键渲染 main 键控条目，缺失时回落对话。
  assert.match(adapter, /entryKey: lexflowPage, fallback: renderSlot\("main", \{\}, \{ entryKey: "conversation" \}\)/)
  // 样式归属标记：运行期注入的每个样式块必须打 data-plugin 归属标记，
  // 否则会被底座模块系统认领给无关插件、随其重载误删，导致界面坍缩
  //（2026-09-30 修复；已在调试实例中复现"删样式 → 崩坏、补回 → 恢复"）。
  assert.match(shell, /style\.dataset\.plugin = '@lexflow\/ui-shell'/)
  assert.match(adapter, /style\.dataset\.plugin = '@lexflow\/dsh-adapter'/)
  const pagesTags = (pages.match(/\.dataset\.plugin = '@lexflow\/ui-pages'/g) ?? []).length
  assert.equal(pagesTags, 3, 'ui-pages 的三个样式块都应带归属标记')
  assert.match(archive, /pages\.pages\.Workflow/)
  assert.match(workbench, /pages\.pages\.Workbench/)
})

test('LexFlow workflow storage uses typed Markdown files and recoverable old data', async () => {
  const archive = fs.readFileSync(path.join(root, 'dsh-plugins', 'lexflow-archive', 'lib', 'index.js'), 'utf8')
  const main = fs.readFileSync(path.join(root, 'src', 'main', 'index.ts'), 'utf8')
  assert.match(archive, /type: workflow/)
  assert.match(archive, /FILE_TYPES = new Set\(\['workflow', 'memory'\]\)/)
  assert.match(archive, /workflow\.import/)
  assert.match(archive, /workflow\.copy/)
  assert.match(archive, /oldDataBucket/)
  assert.match(archive, /workflow\.oldData\.restore/)
  assert.match(main, /moveLegacyStandardsToOldData/)
  assert.match(main, /ensureDshHomeAgentAbsent/)
  assert.match(main, /path\.join\(payload, candidate\.label\)/)
  assert.doesNotMatch(main, /importOfficialStandards/)

  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'lexflow-workflow-storage-'))
  const workspaceRoot = path.join(temporary, 'workspace')
  const knowledgeRoot = path.join(temporary, 'knowledge')
  const secondKnowledgeRoot = path.join(temporary, 'knowledge-second')
  const statePath = path.join(temporary, 'state.json')
  const archiveRoot = path.join(workspaceRoot, '档案室')
  const draftsRoot = path.join(temporary, 'drafts')
  const historyRoot = path.join(temporary, 'history')
  const oldDataRoot = path.join(temporary, 'old-data')
  const indexRoot = path.join(temporary, 'knowledge-index')
  fs.mkdirSync(archiveRoot, { recursive: true })
  fs.mkdirSync(knowledgeRoot, { recursive: true })
  fs.mkdirSync(secondKnowledgeRoot, { recursive: true })
  fs.writeFileSync(path.join(knowledgeRoot, 'existing.md'), '---\ntype: workflow\n---\n\n未主动导入的文件。\n')
  fs.writeFileSync(statePath, JSON.stringify({ version: 1, rootPath: knowledgeRoot }) + '\n')
  let apiHandler
  let archiveService
  const registeredTools = []
  const { defineTool } = await import('@deepseek-ai/dsh-tools')
  const ctx = {
    get(name) {
      assert.equal(name, 'lexflow')
      return { host: {
        registerRoute(route) { if (route.path === '/lexflow-api') apiHandler = route.handler; return () => {} },
        registerTool(tool) { registeredTools.push(tool); return () => {} },
        defineTool,
      } }
    },
    effect(effect) { return effect() },
    provide(name, value) { if (name === 'lexflowArchive') archiveService = value; return () => {} },
  }
  try {
    const plugin = await import(path.join(root, 'dsh-plugins', 'lexflow-archive', 'lib', 'index.js'))
    plugin.apply(ctx, { workspaceRoot, archiveRoot, draftsRoot, historyRoot, oldDataRoot, indexRoot, defaultKnowledgeBaseRoot: path.join(temporary, 'default'), knowledgeBaseStatePath: statePath, knowledgeBaseIndexRoot: indexRoot, userAgentPath: path.join(workspaceRoot, 'AGENTS.md') })
    async function request(value) {
      let body
      let status
      const req = { async *[Symbol.asyncIterator]() { yield JSON.stringify(value) } }
      const res = { writeHead(code) { status = code }, end(payload) { body = payload } }
      await apiHandler(req, res)
      const result = JSON.parse(body)
      assert.equal(status, 200, result.error)
      assert.equal(result.ok, true, result.error)
      return result.value
    }
    const migrated = await request({ action: 'workflow.status' })
    assert.equal(migrated.knowledgeBases.length, 1)
    assert.equal(migrated.knowledgeBases[0].name, path.basename(knowledgeRoot))
    assert.equal(Object.hasOwn(migrated.knowledgeBases[0], 'rootPath'), false)
    assert.equal(JSON.parse(fs.readFileSync(statePath, 'utf8')).version, 2)
    const initialList = await request({ action: 'workflow.list' })
    assert.equal(initialList.nodes.some((node) => node.name === 'existing.md'), false)
    // 老文件（索引里有编号、文件头没有）在索引加载时回填身份，且沿用原编号——
    // 这样升级前已应用的对话不会因为这次改动而失配。
    const legacyPath = path.join(knowledgeRoot, '工作流', '既有文件.md')
    fs.writeFileSync(legacyPath, '---\ntype: workflow\n---\n\n旧文件。\n')
    // 直接按索引的定位规则写入种子索引：知识库路径的 sha256 前 24 位为文件名。
    // 插件按真实路径（macOS 上 /var 会解析为 /private/var）计算索引文件名，这里必须一致。
    const legacyIndexPath = path.join(indexRoot, require('node:crypto').createHash('sha256').update(fs.realpathSync(knowledgeRoot)).digest('hex').slice(0, 24) + '.json')
    fs.writeFileSync(legacyIndexPath, JSON.stringify({ version: 1, files: { '工作流/既有文件.md': { fileId: 'legacy-id-0001', name: '既有文件.md', type: 'workflow', relativePath: '工作流/既有文件.md', revision: '', searchTerms: [], description: '旧文件。', updatedAt: '', size: 0 } } }))
    const backfilled = await request({ action: 'workflow.list' })
    const legacyNode = backfilled.nodes.find((node) => node.name === '既有文件.md')
    assert.equal(legacyNode.fileId, 'legacy-id-0001')
    assert.match(fs.readFileSync(legacyPath, 'utf8'), /lexflow-id: legacy-id-0001/u)
    // 该文件只为验证回填，清掉以免影响后续按原始文件集计算的断言。
    fs.rmSync(legacyPath)
    await request({ action: 'workflow.refresh' })
    // 声明即收录：工作流目录中带类型声明的 Markdown 自动进入索引，无需导入。
    fs.mkdirSync(path.join(knowledgeRoot, '工作流'), { recursive: true })
    fs.writeFileSync(path.join(knowledgeRoot, '工作流', '声明工作流.md'), '---\ntype: workflow\n---\n\n由外部写入并声明类型的文件。\n')
    fs.writeFileSync(path.join(knowledgeRoot, '工作流', '无声明.md'), '# 没有类型声明\n\n不应被收录。\n')
    fs.writeFileSync(path.join(knowledgeRoot, '工作流', '声明记忆.md'), '---\ntype: memory\n---\n\n长期记忆。\n')
    const declaredList = await request({ action: 'workflow.list' })
    assert.ok(declaredList.nodes.some((node) => node.name === '声明工作流.md' && node.type === 'workflow'))
    assert.ok(declaredList.nodes.some((node) => node.name === '声明记忆.md' && node.type === 'memory'))
    assert.equal(declaredList.nodes.some((node) => node.name === '无声明.md'), false)
    assert.deepEqual(declaredList.unclassified, ['工作流/无声明.md'])
    const classified = await request({ action: 'workflow.classify', relativePath: '工作流/无声明.md', type: 'memory' })
    assert.equal(classified.type, 'memory')
    assert.match(fs.readFileSync(path.join(knowledgeRoot, '工作流', '无声明.md'), 'utf8'), /^---\ntype: memory\nlexflow-id: [0-9a-f-]{36}\n---/u)
    const reclassified = await request({ action: 'workflow.list' })
    assert.deepEqual(reclassified.unclassified, [])
    assert.ok(reclassified.nodes.some((node) => node.name === '无声明.md' && node.type === 'memory'))
    await assert.rejects(() => request({ action: 'workflow.classify', relativePath: '工作流/声明工作流.md', type: 'memory' }), /已有类型声明/u)
    await assert.rejects(() => request({ action: 'workflow.classify', relativePath: '../outside.md', type: 'workflow' }), /路径不在 LexFlow 工作空间内/u)
    // 身份随文件走：在应用之外改名（访达改名、命令行 mv）后编号不变，
    // 因此已应用该文件的对话不会因改名而失配。
    const beforeRename = (await request({ action: 'workflow.list' })).nodes.find((node) => node.name === '声明工作流.md')
    assert.equal(typeof beforeRename.fileId, 'string')
    fs.renameSync(path.join(knowledgeRoot, '工作流', '声明工作流.md'), path.join(knowledgeRoot, '工作流', '声明工作流-改名.md'))
    const afterRename = (await request({ action: 'workflow.refresh' })).nodes.find((node) => node.name === '声明工作流-改名.md')
    assert.equal(afterRename.fileId, beforeRename.fileId)
    assert.match(fs.readFileSync(path.join(knowledgeRoot, '工作流', '声明工作流-改名.md'), 'utf8'), new RegExp('lexflow-id: ' + beforeRename.fileId))
    // 在访达里整份复制会带出同一个 lexflow-id：必须改发新号，避免两个文件互相顶替。
    fs.copyFileSync(path.join(knowledgeRoot, '工作流', '声明工作流-改名.md'), path.join(knowledgeRoot, '工作流', '声明工作流-副本.md'))
    const withCopy = await request({ action: 'workflow.refresh' })
    const copy = withCopy.nodes.find((node) => node.name === '声明工作流-副本.md')
    assert.notEqual(copy.fileId, beforeRename.fileId)
    assert.match(fs.readFileSync(path.join(knowledgeRoot, '工作流', '声明工作流-副本.md'), 'utf8'), new RegExp('lexflow-id: ' + copy.fileId))
    // 已应用清单落盘：换一个插件实例（模拟应用重启）仍能读回并可停止，
    // 且停止不需要文件存在——先删掉文件再停止。
    await request({ action: 'workflow.settings.set', relativePath: '工作流/声明工作流-改名.md', fileId: beforeRename.fileId, useMode: 'relevant' })
    apiHandler = undefined
    const restarted = await import(path.join(root, 'dsh-plugins', 'lexflow-archive', 'lib', 'index.js') + '?restart=1')
    restarted.apply(ctx, { workspaceRoot, archiveRoot, draftsRoot, historyRoot, oldDataRoot, indexRoot, defaultKnowledgeBaseRoot: path.join(temporary, 'default'), knowledgeBaseStatePath: statePath, knowledgeBaseIndexRoot: indexRoot, userAgentPath: path.join(workspaceRoot, 'AGENTS.md') })
    await archiveService.workflow.recordApplications('session-restart', [{ fileId: beforeRename.fileId, revision: 'rev-1', relativePath: '工作流/声明工作流-改名.md', reason: '已提供给当前会话' }])
    // 副本先清掉，只留改名件；文件删除后停止仍应可用。
    fs.rmSync(path.join(knowledgeRoot, '工作流', '声明工作流-副本.md'))
    const restored = await archiveService.workflow.sessionState('session-restart')
    assert.deepEqual(restored.applied.map((item) => item.fileId), [beforeRename.fileId])
    fs.rmSync(path.join(knowledgeRoot, '工作流', '声明工作流-改名.md'))
    const stoppedMissing = await archiveService.workflow.stop('session-restart', beforeRename.fileId)
    assert.deepEqual(stoppedMissing.applied, [])
    assert.ok(stoppedMissing.suppressed.includes(beforeRename.fileId))
    // 复原现场，后续断言仍按原始文件集计算。
    fs.writeFileSync(path.join(knowledgeRoot, '工作流', '声明工作流.md'), '---\ntype: workflow\nlexflow-id: ' + beforeRename.fileId + '\n---\n\n由外部写入并声明类型的文件。\n')
    await request({ action: 'workflow.refresh' })
    assert.deepEqual([...new Set(registeredTools.map((tool) => tool.name))].sort(), ['lexflow_document_ocr', 'lexflow_document_read', 'lexflow_document_write', 'lexflow_knowledge_read', 'lexflow_knowledge_search'])
    await request({ action: 'workflow.selectRoot', rootPath: knowledgeRoot })
    assert.equal(JSON.parse(fs.readFileSync(statePath, 'utf8')).version, 2)
    await request({ action: 'workflow.selectRoot', rootPath: secondKnowledgeRoot })
    const multiRoot = await request({ action: 'workflow.status' })
    assert.equal(multiRoot.knowledgeBases.length, 2)
    assert.deepEqual(multiRoot.knowledgeBases.map((item) => item.name).sort(), [path.basename(knowledgeRoot), path.basename(secondKnowledgeRoot)].sort())
    assert.ok(multiRoot.knowledgeBases.every((item) => !Object.hasOwn(item, 'rootPath')))
    const invalidRootFile = path.join(temporary, 'knowledge-file')
    fs.writeFileSync(invalidRootFile, 'not a directory')
    fs.writeFileSync(statePath, JSON.stringify({ version: 2, roots: [knowledgeRoot, secondKnowledgeRoot, invalidRootFile], activeRootPath: invalidRootFile }) + '\n')
    const invalidActive = await request({ action: 'workflow.status' })
    assert.equal(invalidActive.configured, false)
    assert.ok(invalidActive.knowledgeBases.some((item) => item.name === path.basename(knowledgeRoot) && item.valid))
    const firstId = invalidActive.knowledgeBases.find((item) => item.name === path.basename(knowledgeRoot)).id
    await request({ action: 'workflow.knowledgeBases.select', id: firstId })
    assert.equal((await request({ action: 'workflow.status' })).rootName, path.basename(knowledgeRoot))
    const workflow = await request({ action: 'workflow.create', parent: '.', name: '研究', type: 'workflow', content: '# 研究' })
    const duplicate = await request({ action: 'workflow.create', parent: '.', name: '研究', type: 'memory', content: '记忆' })
    assert.equal(workflow.relativePath, '工作流/研究.md')
    assert.equal(workflow.useMode, 'relevant')
    assert.equal(typeof workflow.fileId, 'string')
    assert.equal(duplicate.relativePath, '工作流/研究 1.md')
    const copied = await request({ action: 'workflow.copy', from: workflow.relativePath, to: workflow.relativePath })
    assert.equal(copied.relativePath, '工作流/研究 2.md')
    assert.match(fs.readFileSync(path.join(knowledgeRoot, workflow.relativePath), 'utf8'), /^---\ntype: workflow\nlexflow-id: [0-9a-f-]{36}\n---/u)
    const indexFile = fs.readdirSync(indexRoot).find((name) => name.endsWith('.json'))
    const indexed = JSON.parse(fs.readFileSync(path.join(indexRoot, indexFile), 'utf8'))
    assert.deepEqual(Object.keys(indexed.files).sort(), ['工作流/声明工作流.md', '工作流/声明记忆.md', '工作流/无声明.md', '工作流/研究 1.md', '工作流/研究 2.md', '工作流/研究.md'])
    assert.ok(indexed.files['工作流/研究.md'].searchTerms.includes('研究'))
    const searchTool = registeredTools.find((tool) => tool.name === 'lexflow_knowledge_search')
    const readTool = registeredTools.find((tool) => tool.name === 'lexflow_knowledge_read')
    const execution = { signal: new AbortController().signal }
    assert.equal((await searchTool.execute({ query: '研究' }, execution)).total, 3)
    assert.equal((await readTool.execute({ relativePath: '工作流/研究.md' }, execution)).type, 'workflow')
    await request({ action: 'workflow.settings.set', relativePath: workflow.relativePath, fileId: workflow.fileId, useMode: 'session_start' })
    assert.equal((await request({ action: 'workflow.settings.list' })).find((entry) => entry.fileId === workflow.fileId).useMode, 'session_start')
    await request({ action: 'workflow.settings.set', relativePath: workflow.relativePath, fileId: workflow.fileId, useMode: 'relevant' })
    assert.ok((await archiveService.workflow.discover('研究任务', { sessionId: 'session-1' })).candidates.some((entry) => entry.fileId === workflow.fileId))
    assert.equal((await request({ action: 'workflow.activate', sessionId: 'session-1', relativePath: workflow.relativePath })).status, 'pending')
    assert.ok((await request({ action: 'workflow.session.stop', sessionId: 'session-1', fileId: workflow.fileId })).suppressed.includes(workflow.fileId))
    assert.ok(!(await request({ action: 'workflow.session.resume', sessionId: 'session-1', fileId: workflow.fileId })).suppressed.includes(workflow.fileId))
    await assert.rejects(() => readTool.execute({ relativePath: path.join(temporary, 'outside.md') }, execution), /路径不在 LexFlow 工作空间内/u)
    const deleted = await request({ action: 'workflow.trash', relativePath: workflow.relativePath })
    assert.ok((await request({ action: 'workflow.oldData.list' })).some((entry) => entry.id === deleted.id))
    await request({ action: 'workflow.oldData.restore', id: deleted.id })
    assert.ok(fs.existsSync(path.join(knowledgeRoot, workflow.relativePath)))
    await request({ action: 'archive.createFolder', parent: '.', name: '资料' })
    const archiveMarkdown = await request({ action: 'archive.createMarkdown', parent: '资料', name: '说明', content: '# 说明\n\n档案资料。\n' })
    assert.ok(fs.existsSync(path.join(knowledgeRoot, '档案室', archiveMarkdown.relativePath)))
    const plainText = path.join(temporary, 'word-source.txt')
    const docx = path.join(temporary, 'word-source.docx')
    fs.writeFileSync(plainText, 'Word 标题\n\nWord 正文。\n')
    execFileSync('textutil', ['-convert', 'docx', '-output', docx, plainText])
    const importedArchive = await request({ action: 'archive.import', targetFolder: '资料', files: [{ name: 'word-source.docx', contentBase64: fs.readFileSync(docx).toString('base64') }] })
    assert.ok(importedArchive[0].relativePath.endsWith('.md'))
    assert.ok(fs.existsSync(path.join(knowledgeRoot, '档案室', '资料', 'word-source.docx')))
    assert.ok(fs.existsSync(path.join(knowledgeRoot, '档案室', '资料', importedArchive[0].relativePath.split('/').pop())))
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true })
  }
})

test('GPT subscription integration is unwired but its source is retained', () => {
  // 2026-09-30 决定：GPT 套餐接入从运行期装配中移除——它会让模型选择器出现
  // 实际未接入的 GPT 套餐条目。源码包整体保留，供将来恢复时按原方案重新登记。
  const main = fs.readFileSync(path.join(root, 'src', 'main', 'index.ts'), 'utf8')
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'dsh-plugins', 'manifest.json'), 'utf8'))
  assert.doesNotMatch(main, /id: llm-openai-codex/)
  assert.doesNotMatch(main, /name: '@lexflow\/codex-connect'/)
  assert.ok(!manifest.packages.some((plugin) => plugin.target === '@lexflow/codex-connect'))
  // 恢复所需的三样东西仍在：插件包、清单里未登记、以及它自己的兼容声明。
  assert.ok(fs.existsSync(path.join(root, 'dsh-plugins', 'lexflow-codex-connect', 'package.json')))
  assert.ok(fs.existsSync(path.join(root, 'dsh-plugins', 'lexflow-codex-connect', 'cordis.patch.yml')))
  const compat = JSON.parse(fs.readFileSync(path.join(root, 'dsh-plugins', 'lexflow-codex-connect', 'compatibility.json'), 'utf8'))
  assert.equal(compat.dshPluginApi.version, '0.2.0-rc.2')
})

test('LexFlow keeps Codex context-window controls in the bridge', () => {
  const bridge = fs.readFileSync(path.join(root, 'dsh-plugins', 'lexflow-codex-connect', 'src', 'src-ByKP_wn9.js'), 'utf8')
  const client = fs.readFileSync(path.join(root, 'dsh-plugins', 'lexflow-codex-connect', 'src', 'client.js'), 'utf8')
  assert.match(bridge, /withOpenAICodexContextWindowOverrides/)
  assert.match(bridge, /contextWindowOverrides/)
  assert.match(bridge, /CONFIGURATION_LIMITS/)
  assert.match(client, /@lexflow\/dsh-adapter/)
})

test('LexFlow business plugins stop at LexFlow adapter contracts', () => {
  const shell = fs.readFileSync(path.join(root, 'dsh-plugins', 'lexflow-ui-shell', 'src', 'client.js'), 'utf8')
  const workflow = fs.readFileSync(path.join(root, 'dsh-plugins', 'lexflow-workflow', 'src', 'client.js'), 'utf8')
  const adapter = fs.readFileSync(path.join(root, 'dsh-plugins', 'lexflow-dsh-adapter', 'src', 'client.js'), 'utf8')
  assert.doesNotMatch(shell, /require\(["']@deepseek-ai\/dsh-client-(runtime|ui-primitives|ui-slots)["']\)/)
  assert.doesNotMatch(workflow, /require\(["']@deepseek-ai\/dsh-client-(runtime|ui-primitives|ui-slots)["']\)/)
  assert.match(shell, /adapter\.ui\.mountShell/)
  assert.match(workflow, /require\("@lexflow\/dsh-adapter"\)/)
  for (const symbol of ['createSnapshotStore', 'defineStore', 'toAssistantBlocks', 'isTokenDelta', 'Modal', 'writeClipboard']) assert.match(adapter, new RegExp(symbol))
  // 弹窗打开时，所有覆盖层浮点元素都必须处置：返回箭头／侧栏开关、拖拽手柄、
  // 以及运行态 Flowing 条。漏一个就会出现"浮层压着弹窗遮罩"的观感问题。
  assert.match(adapter, /\[data-lexflow-modal-open="true"\][^\n]*data-chat-running[^\n]*display: none/u)
  // 运行态 Flowing 条留在对话流内（不再 position: fixed）：它本身就是流里的节点，
  // 定位一旦依赖输入区的几何，输入区改版就会错位（本次即因此重做）。
  assert.match(adapter, /\[data-chat-flow-kind="turn-process"\]\[data-lexflow-flowing-order="true"\] \{ order: 99/u)
  const flowingRule = adapter.match(/\[data-chat-running\]\[data-lexflow-flowing="true"\] \{[^}]*\}/u)
  assert.ok(flowingRule, '运行态 Flowing 条必须有样式规则')
  assert.doesNotMatch(flowingRule[0], /position: fixed/u)
  assert.doesNotMatch(adapter, /--lexflow-flowing-(left|bottom)/u)
  // 输入区改版：卡片只承载纯输入框（外观下移到输入框本身），设置行落到卡片外；
  // 纯输入框高度降低；对话框高度上限为界面高度的三分之一。
  assert.match(adapter, /:not\(\[class\*="uV2eYG_hero"\]\) \[class\*="uV2eYG_card"\] \{ background: transparent/u)
  assert.match(adapter, /max-height: min\(var\(--dsh-composer-text-max-height, 336px\), 33vh\)/u)
  assert.match(adapter, /uV2eYG_input"\] \{ min-height: 30px/u)
  // 统计行并入信息带（dock 提到 card 之前），发送键与停止键都在输入框内右侧。
  assert.match(adapter, /uV2eYG_dock"\] \{[^}]*z-index: 2/u)
  assert.match(adapter, /uV2eYG_card"\] \{[^}]*order: 2/u)
  // 信息带合并为一行、全部左起（权限 → 上下文 → 统计 → 用量），模型仍在最右。
  // 加号（底座的"添加文件或调用指令"冗余入口）删除；dock 抽出文档流按输入框对齐并归零高度，
  // 两个子元素绝对定位到 row 那条线上。
  // 权限占最左：上下文计量器在新对话中不渲染，若把权限推到其右侧，新对话的最左会空出一截。
  assert.match(adapter, /uV2eYG_add"\] \{ display: none/u)
  assert.doesNotMatch(adapter, /uV2eYG_tools"\] \{ padding-left/u)
  assert.match(adapter, /uV2eYG_dock"\] \{ height: 0/u)
  assert.match(adapter, /uV2eYG_dock"\] \[class\*="JObwrW_root"\] \{ left: 48px/u)
  assert.match(adapter, /uV2eYG_dock"\] \[data-composer-stats\] \{ left: 82px/u)
  // 没有上下文计量器时（新对话），统计胶囊左移补位。
  assert.match(adapter, /:not\(:has\(\[class~="JObwrW_root"\]\)\) \[data-composer-stats\] \{ left: 48px/u)
  // 信息带四个控件加六成底色；backdrop-filter 在本应用不生效，遮蔽靠底色完成。
  assert.match(adapter, /\[class~="bOPqQW_pill"\] \{ -webkit-backdrop-filter: blur\(6px\) !important; backdrop-filter: blur\(6px\) !important; border-radius: 999px !important; background-color: color-mix\(in srgb, var\(--dsw-alias-bg-base\) 60%/u)
  // 底色选择器必须用精确词匹配，否则子串会命中按钮内部的分段元素，各段各长出一层底色。
  assert.doesNotMatch(adapter, /\[class\*="_7KE1Ra_trigger"\] \{[^}]*background-color/u)
  // 注意：控件上的 backdrop-filter 在本应用里不生效（底座给 wSkVaW_scrollBody 加了 mask，
  // 遮断了下层正文进入其背景采样范围的通路，实测 blur 0px 与 20px 像素零差异）。
  // 该属性保留仅为底座将来放开时能自动接手，真正起遮蔽作用的是底色，勿据此认为有模糊效果。
  assert.doesNotMatch(adapter, /data-lexflow-composer-frost/u)
  // 正文与信息带的重叠，靠把底座 composerSeat 的渐隐上移到信息带上方解决。
  assert.match(adapter, /wSkVaW_composerSeat"\] \{ background: var\(--dsw-alias-bg-base\) !important/u)
  assert.match(adapter, /wSkVaW_composerSeat"\]::before \{[^}]*top: -36px/u)
  assert.doesNotMatch(adapter, /uV2eYG_hero"\]\)::before/u)
  // 朗读用隐藏元素必须钉住：它们的静态位置会落到内容末尾之外，撑出幽灵滚动区。
  assert.match(adapter, /EvIC1a_column"\] \[class\*="visuallyHidden"\] \{ top: 0 !important; left: 0 !important; \}/u)
  // 发送键与停止键都定位到输入框内右侧，按类名而非文案；两者同屏时停止键左移让位。
  assert.match(adapter, /uV2eYG_primary"\] \{ bottom: 7px !important; height: 26px !important; margin: 0 !important; position: absolute/u)
  assert.match(adapter, /uV2eYG_trailing"\] button\[class\*="uV2eYG_primary"\]:not\(:last-child\) \{ right: 42px/u)
  assert.doesNotMatch(adapter, /aria-label="发送消息"\] \{/u)
  // "性能与用量"显示策略（定稿）：简洁档彻底隐藏（非按钮的胶囊组），详细档仅图标；
  // 不再另设"关闭"开关行（同 id 接管会让 chat 激活失败，实测 2026-09-27；独立开关行已废弃）。
  assert.match(adapter, /data-composer-stats\]:not\(:has\(button\)\) \{ display: none/u)
  assert.match(adapter, /bOPqQW_label"\] \{ display: none/u)
  assert.doesNotMatch(shell, /lexflow\.showStats/u)
  assert.doesNotMatch(shell, /id: 'performance-usage'/u)
  // 权限触发器仅图标；上下文计量器仅图标。
  assert.match(adapter, /iWlSmW_triggerLabel"\], \[class\*="uV2eYG_root"\]:not\(\[class\*="uV2eYG_hero"\]\) \[class\*="iWlSmW_trigger"\] \[class\*="iWlSmW_chevron"\] \{ display: none/u)
  assert.match(adapter, /JObwrW_trigger"\] > svg \+ span \{ display: none/u)
})

test('LexFlow Codex bridge retains the complete capability surface', () => {
  const bridge = fs.readFileSync(path.join(root, 'dsh-plugins', 'lexflow-codex-connect', 'src', 'src-ByKP_wn9.js'), 'utf8')
  const cli = fs.readFileSync(path.join(root, 'dsh-plugins', 'lexflow-codex-connect', 'src', 'bin.js'), 'utf8')
  const client = fs.readFileSync(path.join(root, 'dsh-plugins', 'lexflow-codex-connect', 'src', 'client.js'), 'utf8')
  const adapter = fs.readFileSync(path.join(root, 'dsh-plugins', 'lexflow-dsh-adapter', 'src', 'index.js'), 'utf8')
  for (const symbol of ['loginOpenAICodex', 'logoutOpenAICodex', 'OpenAICodexTransport', 'OpenAICodexSearchProvider', 'viewImageTool', 'imageGenerateTool', 'OpenAICodexProxyManager', 'FastModeRegistry', 'migrateOpenAICodexSearchHistory']) assert.match(bridge, new RegExp(symbol))
  for (const symbol of ['doctor', 'capabilities', 'migrate-history', 'login', 'logout']) assert.match(cli, new RegExp(symbol))
  for (const symbol of ['OpenAICodexPluginCard', 'OpenAICodexModelsCard', 'OpenAICodexFastModeToggle', 'OpenAICodexQuotaIndicator', 'CodexImageToolView']) assert.match(client, new RegExp(symbol))
  assert.doesNotMatch(client, /OpenAICodexUpdateStore|OpenAICodexUpdateSettings|OpenAICodexUpdateOverlay|更新与兼容性|Updates and compatibility/)
  assert.doesNotMatch(bridge, /from "@deepseek-ai\/dsh-(util-values|llm|llm-pi-ai|atomic-write|home-paths|session|attachment|tools|web)"/)
  assert.doesNotMatch(bridge, /from "@deepseek-ai\/cordis"/)
  assert.doesNotMatch(bridge, /ctx\.(webServer|llm|attachments|fs|inject|logger|reflect)/)
  assert.doesNotMatch(client, /ctx\.(effect|locale|settingsScope|slots|sessions|inject)/)
  assert.doesNotMatch(client, /settings\.plugin\.item/)
  // Codex 订阅的登录入口自 0.6.0 起注册到官方「模型」设置页的提供方卡片扩展席位，
  // 键为 Codex 自己的设置命名空间；界面能力仍由同一批组件承载。
  assert.match(client, /settings\.models\.provider-card/)
  assert.match(client, /key: OPENAI_CODEX_SETTINGS_NAMESPACE/)
  // Footer 作为兜底席位：Codex 走自有路由，官方提供商目录未必列出它。
  assert.match(client, /settings\.models\.footer/)
  assert.doesNotMatch(client, /runtime\.ui\.contributions/)
  for (const symbol of ['OpenAICodexSettings']) assert.match(client, new RegExp(symbol))
  assert.match(bridge, /from "@lexflow\/dsh-adapter"/)
  for (const symbol of ['registerWebRoutes', 'registerSearchProvider', 'registerTools', 'registerSettings']) assert.match(adapter, new RegExp(symbol))
})

test('LexFlow presents the domestic ZAI route before the international route', () => {
  const modelSelection = fs.readFileSync(path.join(root, 'dsh-plugins', 'lexflow-workflow', 'lib', 'client.js'), 'utf8')
  assert.match(modelSelection, /MODEL_GROUP_ORDER = Object\.freeze\(\["zai-coding-cn", "zai"\]\)/)
  assert.match(modelSelection, /智谱国内 API/)
  assert.match(modelSelection, /智谱国际 API/)
  assert.match(modelSelection, /const arrangedGroups = presentModelGroups\(groups, result\.value\.routableProviders\)/)
})

test('LexFlow delegates provider configuration to the official Models page', () => {
  // 自 0.6.0 起模型页改用官方原版：自研分栏页（含 GLM 双编辑器）已移除，
  // 提供方配置由官方页的提供方行与编辑器承担；LexFlow 只保留 Codex 与 Kimi
  // 的登录入口，经官方提供方卡片席位注入。
  const workflow = fs.readFileSync(path.join(root, 'dsh-plugins', 'lexflow-workflow', 'lib', 'client.js'), 'utf8')
  assert.doesNotMatch(workflow, /LexFlowModelsSection/)
  assert.doesNotMatch(workflow, /lexflowModelProviderEditors/)
  assert.doesNotMatch(workflow, /settings\.section/)
  assert.match(workflow, /__LEXFLOW_MODEL_VISIBILITY__/)

  const kimi = fs.readFileSync(path.join(root, 'dsh-plugins', 'lexflow-kimi-connect', 'lib', 'client.js'), 'utf8')
  assert.match(kimi, /settings\.models\.provider-card/)
  assert.match(kimi, /SETTINGS_NAMESPACE = 'llm-pi-ai'/)
  assert.match(kimi, /KIMI_ROUTE = 'kimi-coding'/)
  assert.doesNotMatch(kimi, /runtime\.ui\.contributions/)

  const main = fs.readFileSync(path.join(root, 'src', 'main', 'index.ts'), 'utf8')
  assert.doesNotMatch(main, /- id: ui-settings-models\\n  disabled: true/)
})

test('LexFlow typography and sidebar safety treatments are locally packaged', () => {
  const main = fs.readFileSync(path.join(root, 'src', 'main', 'index.ts'), 'utf8')
  const preload = fs.readFileSync(path.join(root, 'src', 'preload', 'index.ts'), 'utf8')
  const lexflowUi = fs.readFileSync(path.join(root, 'dsh-plugins', 'lexflow-ui-shell', 'lib', 'client.js'), 'utf8')
  const adapter = fs.readFileSync(path.join(root, 'dsh-plugins', 'lexflow-dsh-adapter', 'lib', 'client.js'), 'utf8')
  const pages = fs.readFileSync(path.join(root, 'dsh-plugins', 'lexflow-ui-pages', 'lib', 'client.js'), 'utf8')
  const layout = adapter
  const workflow = fs.readFileSync(path.join(root, 'dsh-plugins', 'lexflow-workflow', 'lib', 'client.js'), 'utf8')
  const sidebar = lexflowUi + adapter
  const modelSettings = workflow
  const standards = fs.readFileSync(path.join(root, 'dsh-plugins', 'lexflow-archive', 'lib', 'index.js'), 'utf8')
  assert.match(main, /const pluginManifest = await readLexFlowPluginManifest\(\)/)
  assert.match(preload, /contextBridge\.exposeInMainWorld\('lexflowWindow'/)
  assert.match(main, /trafficLightPosition: \{ x: 18, y: 27 \}/)
  assert.match(main, /minWidth: 760/)
  assert.match(main, /lexflow:window-is-fullscreen/)
  assert.match(main, /lexflow:fullscreen-changed/)
  assert.match(main, /preload: path\.join\(currentDirectory, '..\/preload\/index\.mjs'\)/)
  assert.match(main, /LEXFLOW_FONT_ROOT/)
  assert.doesNotMatch(workflow, /Flowing\.\.\./)
  assert.doesNotMatch(workflow, /conversationEvents|conversationViews/)
  assert.match(workflow, /runtime\.ui\.withSessionSlots/)
  assert.match(sidebar, /lexflowSidebarRoot/)
  assert.match(sidebar, /lexflowSidebarCollapsed/)
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'dsh-plugins', 'manifest.json'), 'utf8'))
  assert.ok(manifest.packages.some((plugin) => plugin.source === 'lexflow-workflow'))
  const modelSettingsJs = workflow
  const modelSelectionJs = workflow
  assert.doesNotMatch(modelSettingsJs, /data-lexflow-show-codex/)
  assert.doesNotMatch(modelSettingsJs, /\}, label\)/)
  assert.doesNotMatch(modelSettingsJs, /lexflowCodexMask/)
  assert.doesNotMatch(modelSettingsJs, /setCodexDialogOpen\(true\)/)
  assert.doesNotMatch(modelSettingsJs, /打开 Codex Connect 配置/)
  assert.match(modelSelectionJs, /__LEXFLOW_MODEL_VISIBILITY__/)
  assert.match(modelSelectionJs, /allowed === null \|\| allowed\.size === 0 \? arrangedGroups/)
  assert.match(lexflowUi, /\.lexflowModelCard/)
  assert.match(lexflowUi, /lexflowModelStatusMark/)
  assert.match(lexflowUi, /lexflowGptSettings/)
  assert.doesNotMatch(lexflowUi, /更新与兼容性|Updates and compatibility/)
  assert.doesNotMatch(lexflowUi, /li:has\(button\[aria-label\*="Codex Connect"\]\).*display: none/)
  assert.match(adapter, /__LEXFLOW_MODEL_VISIBILITY__ = new Set\(\)/)
  assert.match(lexflowUi, /SourceHanSerifSC-Regular\.otf/)
  assert.match(lexflowUi, /SourceHanSerifSC-SemiBold\.otf/)
  assert.match(lexflowUi, /--lexflow-font-ui/)
  assert.match(lexflowUi, /--lexflow-font-code/)
  assert.match(adapter, /--dsw-font-family: var\(--lexflow-font-ui\)/)
  assert.match(adapter, /--ds-font-family-code: var\(--lexflow-font-code\)/)
  assert.doesNotMatch(lexflowUi, /font-size: 15px !important/)
  assert.doesNotMatch(lexflowUi, /font-size: 14\.5px !important/)
  assert.doesNotMatch(lexflowUi, /Sxvs8a_root|data-lexflow-title-overflow|sessionRow|wSkVaW_header/)
  assert.match(adapter, /data-input-mirror.*data-input-backdrop.*font-size: var\(--dsh-content-font-size, 14px\)/)
  assert.match(adapter, /\[data-chat-running\]\[data-lexflow-flowing="true"\]::after.*content: "Flowing\.\.\.\.\.\."|\[data-chat-running\]\[data-lexflow-flowing="true"\]::after.*content: "Flowing\.\.\."/)
  assert.match(adapter, /\[data-chat-running\] \[class\*="visuallyHidden"\].*background: none !important/)
  assert.match(adapter, /data-lexflow-title-overflow/)
  assert.match(adapter, /lexflowSessionTitleMarquee/)
  assert.match(adapter, /lexflowTaskDotPulse/)
  assert.match(adapter, /overscroll-behavior-y: contain/)
  assert.match(adapter, /installHostSurfaceCompatibility/)
  assert.match(adapter, /wSkVaW_header.*flex-direction: row !important/)
  assert.match(adapter, /wSkVaW_header.*padding: 18px 28px 0 !important/)
  assert.match(adapter, /writing-mode: horizontal-tb !important/)
  assert.match(adapter, /dsh-content-font-size/)
  assert.match(adapter, /contributionRegistry/)
  // 紧凑密度层（0.1.5 现行锚点）：行高 22px、流间距 12px、输入框圆角 14px、
  // 气泡圆角 14px。失效的 0.1.4 类名不得再出现在适配层。
  assert.match(adapter, /hWmORq_root.*line-height: calc\(22px/)
  assert.match(adapter, /uV2eYG_scroll"\] \{ background: var\(--dsw-specific-input-major\) !important; border-radius: 14px/)
  assert.match(adapter, /div\[class\*="bubble"\] \{ border-radius: 14px/)
  assert.match(adapter, /markdown_kcgor/)
  // 信息带（dock）与输入框卡片（card）的对齐回归：dock 不得再按
  // --dsh-composer-card-max-width 反推 left（该变量含 680px 下限，列宽更窄时
  // 算出负偏移，四个按钮重叠）；必须用 left:50% + translateX(-50%) 的等价几何。
  assert.match(adapter, /uV2eYG_dock"\] \{ height: 0 !important; left: 50% !important;[^']*max-width: var\(--dsh-composer-card-max-width\) !important/)
  assert.doesNotMatch(adapter, /uV2eYG_dock"\] \{ height: 0 !important; left: calc\(\(100% - var\(--dsh-composer-card-max-width\)\)/)
  // 右栏轨道回归：底座把 track 作为「是否为右栏保留一列」的布尔信号传入，
  // 窄视口（<768px，面板为全屏覆盖形态）时必须释放轨道，否则 360px 的列宽
  // 会挤掉半屏下的对话区。
  assert.match(adapter, /if \(track === false\) d\.rightbar = 0;/)
  // 右栏列不得裁切：底座全屏形态的面板按 100vw 绘制，列上的 overflow:hidden
  // 会把它剪成一条窄缝（用户 2026-09-28 反馈"横屏电影只看到右侧竖边"）。
  assert.match(lexflowUi, /data-lexflow-layout="rightbar"\] \{ min-height: 0; min-width: 0; overflow: visible !important/)
  assert.match(adapter, /data-lexflow-layout="rightbar"\] \{ min-width: 0; min-height: 0; overflow: visible !important/)
  // 铺满形态的右栏必须盖住左侧栏：面板虽按 100vw 绘制，却位于右栏列内，而列带 z-index
  // 会自建层叠上下文，面板自身层级越不过本列；左栏列 z-index: 3（ui-shell）高于右栏列 1，
  // 会使左栏画在面板之上、遮住面板左半边内容（用户 2026-10-07 反馈）。
  // 三条规则都以"铺满且已展开"为前提，并排形态与已收起状态不受影响。
  assert.match(adapter, /\[data-lexflow-layout="rightbar"\]:has\(\[data-sidebar-right-panel="fullscreen"\]\[data-sidebar-right-open\]\) \{ z-index: 4 !important; \}/)
  assert.match(adapter, /\[data-lexflow-layout="frame"\]:has\(\[data-sidebar-right-panel="fullscreen"\]\[data-sidebar-right-open\]\) \.lexflowTopSidebarToggle \{ display: none !important; \}/)
  assert.match(adapter, /\[data-lexflow-layout="frame"\]:has\(\[data-sidebar-right-panel="fullscreen"\]\[data-sidebar-right-open\]\) \[data-lexflow-layout="sidebar"\] \{ pointer-events: none !important; \}/)
  // 铺满面板必须自己画出底色：底座的面板本体背景是透明的，只有内部 dock 承载内容，
  // 于是未被 dock 覆盖的区域会透出下方界面——顶部那条 42px 让位安全区正是这样把对话
  // 头部（标题／智能体团队／项目／对话／轨迹）漏了出来（用户 2026-10-08 反馈）。
  // 底色必须画在 dock 上，不能画在面板容器上：容器收起时靠 dock 滑出隐藏，容器若带
  // 不透明底色，收起后底色仍留在原位（铺满时是整窗大小）把对话盖住（用户 2026-10-08 反馈）。
  assert.match(adapter, /\[data-sidebar-right-panel="fullscreen"\] \[data-dockkit-host="dock"\] \{ background: var\(--dsw-alias-bg-base\) !important; \}/)
  assert.doesNotMatch(adapter, /\[data-sidebar-right-panel="fullscreen"\] \{ background: var\(--dsw-alias-bg-base\) !important; \}/)
  assert.doesNotMatch(adapter, /data-sidebar-right-panel="fullscreen"\] \{ padding-top: 42px !important; \}/)
  // 交通灯与标签栏同一行、文件名在交通灯右侧（用户选定方案 A，即底座 darwin 原生排法）：
  // 底座靠 html[data-platform="darwin"] 下发 --dsh-dockkit-strip-inline-start: 88px，
  // 而它只读不写该属性，必须由桌面外壳设置。LexFlow 此前从未写入，底座的 macOS
  // 避让规则全部落空。
  assert.match(adapter, /documentElement\.dataset\.platform = navigator\.userAgent\.includes\('Macintosh'\) \? 'darwin' : 'web'/)
  assert.match(adapter, /if \(wrotePlatform\) delete documentElement\.dataset\.platform/)
  assert.match(adapter, /\[data-sidebar-right-panel="fullscreen"\] \[class\*="tabStrip"\] \{ padding-top: 14px !important; \}/)
  assert.match(adapter, /html\[data-fullscreen\] \[data-lexflow-layout="rightbar"\] \[data-sidebar-right-panel="fullscreen"\] \[class\*="tabStrip"\] \{ padding-top: 6px !important; \}/)
  // 左栏列的 z-index 必须低于铺满时抬升后的右栏列（4），否则遮挡会复发。
  assert.match(lexflowUi, /\[data-lexflow-layout="sidebar"\] \{ background:[^']*z-index: 3 !important; \}/)
  // 左栏展开即收起右侧边栏（2026-10-07 用户确认的策略）：两栏并存会把中央列压到
  // 放不下，右栏只剩一条窄缝。只在「收起 → 展开」方向触发，避免来回横跳。
  assert.match(adapter, /collapseRightbarPane: \(\) => \{ collapseSidebarRightImpl\(\) \}/)
  assert.match(adapter, /if \(!was \|\| sidebarCollapsed \|\| typeof collapseRightbarPane !== "function"\) return;/)
  // 该块的取值必须出现在 sidebarCollapsed 声明之后。放在声明之前会触发
  // "Cannot access 'sidebarCollapsed' before initialization"，root 席位整体崩溃、
  // 应用窗口打不开（2026-10-07 实际发生；node --check 只查语法，查不出这类 TDZ 错误）。
  {
    const body = fs.readFileSync(path.join(root, 'dsh-plugins', 'lexflow-dsh-adapter', 'src', 'client.js'), 'utf8')
    const declaration = body.indexOf('const sidebarCollapsed = narrow ?')
    const usage = body.indexOf('const leftbarWasCollapsed = (0, react.useRef)(sidebarCollapsed)')
    assert.notEqual(declaration, -1, 'sidebarCollapsed 声明缺失')
    assert.notEqual(usage, -1, '左栏展开收起右栏的记忆块缺失')
    assert.ok(declaration < usage, 'sidebarCollapsed 必须在左栏展开收起右栏的记忆块之前声明')
  }
  assert.match(adapter, /function collapseSidebarRightImpl\(\)/)
  assert.match(adapter, /typeof service\.toggleExpanded !== 'function'/)
  // 收起动作必须通过模块级 layoutCtx 取 ctx：root 席位的注册代码与 AppFrame 在另一个
  // 作用域里，那里没有 ctx，直接写 collapseSidebarRightImpl(ctx) 会抛 "ctx is not defined"，
  // root 席位崩溃、界面卡死（2026-10-07 实际发生两次）。
  assert.match(adapter, /let layoutCtx/)
  assert.match(adapter, /layoutCtx = ctx/)
  // 只在可执行代码里查这个写法：源码注释中以它作为反例引用，注释本身不算违规。
  {
    const code = adapter.replace(/\/\*[\s\S]*?\*\//gu, '').split('\n').map((line) => line.replace(/\/\/.*$/u, '')).join('\n')
    assert.doesNotMatch(code, /collapseSidebarRightImpl\(ctx\)/)
  }
  assert.doesNotMatch(adapter, /collapseRightbarPane: \(\) => \{ collapseSidebarRightImpl\(ctx\) \}/)
  // 调用必须延后到宏任务：底座收起右栏走 react-dom flushSync，在 effect 内直接调用
  // 会在 React 提交周期中再触发一次同步提交，且抛错会打掉整棵树。
  assert.match(adapter, /const timer = window\.setTimeout\(\(\) => \{ collapseRightbarPane\(\) \}, 0\)/)
  // 实现整体包在 try 内：本函数从 effect 调用，抛出会经 root 席位错误边界打掉界面树。
  assert.match(adapter, /function collapseSidebarRightImpl\(\) \{\n\t*\/\/ 整体包在 try 内/)
  // 顶部右段（「已应用 N」与「日志」）在列宽不足时自动收起：头部是 nowrap 单行 flex，
  // 不收起只能被裁切或与右栏重叠。容器查询挂在中央列（LexFlow 自有节点），
  // 不给底座渲染的 header 加 contain。
  assert.match(adapter, /\[data-lexflow-layout="center"\] \{ container-type: inline-size !important; container-name: lexflowCenter; \}/)
  assert.match(adapter, /@container lexflowCenter \(max-width: 560px\) \{ \[data-slot="conversation\.session\.header\.utilities"\] \{ display: none !important; \} \}/)
  // 信息带纵向基准改由 row 实际几何发布，不再写死 14px：贴图后附件缩略图区会插到
  // row 前面，写死的值会让上下文／统计与权限行脱开、浮到对话正文上。
  assert.match(adapter, /top: var\(--lexflow-composer-band-y, 14px\) !important/)
  assert.doesNotMatch(adapter, /JObwrW_root"\] \{ left: 48px !important; position: absolute !important; top: 14px/)
  assert.match(adapter, /root\.style\.setProperty\('--lexflow-composer-band-y', band\)/)
  // 列宽调整器回归：EvIC1a_column 的 max-width 由 --dsh-chat-content-width 驱动，
  // 是底座原生拖拽改宽的目标属性；适配层若对该元素施加 max-width／min-width 会让调整器失效。
  assert.doesNotMatch(adapter, /\[class\*="EvIC1a_column"\][^']*max-width/)
  assert.doesNotMatch(adapter, /\[class\*="EvIC1a_column"\][^']*min-width/)
  assert.doesNotMatch(adapter, /Sxvs8a|Md3f7G/)
  // 批量选择列回归：复选框仅在多选模式下存在，并占用独立网格列；
  // 普通模式保持三列，避免表头错位、类型标签换行。
  assert.doesNotMatch(pages, /grid-template-columns:auto minmax\(260px,1fr\) 168px 116px/)
  assert.match(pages, /data-select-mode="true"\] \.lexflowWorkflowListHeader,\.lexflowLibrary\[data-select-mode="true"\] \.lexflowWorkflowRow,\.lexflowLibrary\[data-select-mode="true"\] \.lexflowWorkflowFolderDetails>summary\{grid-template-columns:auto minmax\(0,1fr\) 140px 88px\}/)
  assert.match(pages, /children: \[selectMode && jsx\('span', \{ 'aria-hidden': true \}, 'select'\)/)
  assert.match(pages, /const \[selectMode, setSelectMode\] = React\.useState\(false\)/)
  assert.match(pages, /function SelectIcon\(\)/)
  // 多选按钮位于搜索按钮左侧，图标为方框内打勾。
  assert.match(pages, /iconButton\(selectMode \? '退出多选' : '多选', jsx\(SelectIcon, \{\}\)[\s\S]{0,220}iconButton\('搜索'/)
  assert.doesNotMatch(pages, /wSkVaW|Sxvs8a|Y0dWHa|sessionRow|projectRow|composerSeat|startLexFlowTextAdapter/)
  assert.match(lexflowUi, /lexflowModelCardHead:active/)
  assert.match(pages, /exports\.pages = \{ Workflow, Archive, Workbench \}/)
  assert.match(layout, /layout\.setPageRenderer\(Page\)/)
  assert.match(pages, /function Workbench\(\{ document: initial \}\)/)
  assert.match(lexflowUi, /lexflowSidebarRoot \{ position: relative; z-index: 2;/)
  assert.doesNotMatch(lexflowUi, /lexflowSidebarRoot::before/)
  assert.match(lexflowUi, /lexflowSidebarRoot\.lexflowSidebarCollapsed \{ padding-top: 6px !important;/)
  assert.match(layout, /function TopSidebarToggle/)
  assert.match(layout, /IconPanelLeftOutline16/)
  assert.match(layout, /onToggle: \(\) => actions\.toggleSidebar\(\)/)
  assert.doesNotMatch(lexflowUi, /lexflow-sidebar-toggle/)
  assert.match(lexflowUi, /lexflowTopSidebarToggle/)
  assert.match(lexflowUi, /padding-left: 12px !important/)
  assert.match(lexflowUi, /lexflowSidebar_logoRow .*margin-top: 44px !important/)
  assert.match(lexflowUi, /lexflowHeaderWorkspace/)
  assert.match(lexflowUi, /left: 86px/)
  assert.match(adapter, /fullScreen \? "18px" : "86px"/)
  assert.match(adapter, /wSkVaW_root.*backdrop-filter: blur\(12px\)/)
  assert.match(adapter, /data-conversation-scroll.*linear-gradient/)
  assert.match(adapter, /wSkVaW_tabs.*align-self: center !important/)
  assert.match(adapter, /wSkVaW_tabs.*height: 28px !important/)
  assert.match(adapter, /Flowing\.\.\./)
  assert.match(workflow, /conversation\.session\.header\.actions/)
  assert.match(workflow, /id: "workspace-title"/)
  assert.match(workflow, /runtime\.workspaces\.list/)
  assert.match(adapter, /wSkVaW_tabs.*display: flex !important/)
  assert.match(adapter, /wSkVaW_tabs.*flex-direction: row !important/)
  assert.match(sidebar, /lexflowSidebar_fading \.lexflowSidebar_footArea\{visibility:hidden\}/)
  assert.match(sidebar, /children: collapsed \? null : renderSlot\("sidebar\.settings", \{ wide \}\)/)
  assert.match(modelSettings, /cleanModelDisplayName/)
  assert.doesNotMatch(modelSettings, /card\("glm", "GLM"[^\n]+subscription/)
  assert.match(adapter, /wSkVaW_header.*wSkVaW_crumbCurrent \{ font-weight: 700/)
  assert.doesNotMatch(sidebar, /SidebarRoot_module_css_default\.toggle/)
  assert.match(lexflowUi, /data-lexflow-layout="sidebar".*::after/)
  assert.match(lexflowUi, /data-lexflow-layout="sidebar".*z-index: 3 !important/)
  assert.match(lexflowUi, /data-lexflow-layout="sidebar".*background: linear-gradient\(180deg, var\(--lexflow-dsw-alias-bg-base\) 0px, var\(--lexflow-dsw-specific-sidebar-fill\) 96px\)/)
  assert.match(lexflowUi, /linear-gradient\(180deg, transparent 0px, var\(--lexflow-dsw-alias-border-l1\) 96px\)/)
  assert.match(adapter, /sessionRow.*\[class\*="slot"\].*position: absolute !important.*right: 8px/)
  assert.match(adapter, /sessionRow.*\[class\*="slot"\]:empty.*display: none !important/)
  assert.match(adapter, /sessionRow.*\[class\*="time"\].*display: none !important/)
  assert.match(adapter, /sessionRow.*\[class\*="rowActions"\].*position: absolute !important.*visibility: hidden/)
  assert.match(adapter, /sessionRow.*:hover.*\[class\*="slot"\].*visibility: hidden/)
  assert.match(adapter, /sessionRow.*:hover.*rowActions.*visibility: visible/)
  assert.match(adapter, /sessionRow.*\[data-state="ongoing"\]/)
  assert.match(adapter, /data-lexflow-title-overflow="true"\]::after.*position: absolute/)
  assert.doesNotMatch(lexflowUi, /data-lexflow-show-codex/)
  assert.doesNotMatch(lexflowUi, /sidebarCol.*::after.*top: 56px/)
  assert.match(lexflowUi, /margin-top: 44px !important/)
  assert.match(lexflowUi, /font-weight: 600 !important/)
  assert.match(lexflowUi, /#cf8163/)
  assert.match(standards, /\/lexflow-assets\/fonts\//)
  assert.match(standards, /SourceHanSerifSC-Regular\.otf/)
})

test('LexFlow retired standard-status APIs are absent', () => {
  const archive = fs.readFileSync(path.join(root, 'dsh-plugins', 'lexflow-archive', 'lib', 'index.js'), 'utf8')
  assert.doesNotMatch(archive, /set_standard_status|standards\.list|standards\.read/)
})
test('LexFlow workspace UI uses a single preview/edit canvas and safe exit flow', () => {
  const lexflowUi = fs.readFileSync(path.join(root, 'dsh-plugins', 'lexflow-ui-pages', 'lib', 'client.js'), 'utf8')
  assert.match(lexflowUi, /function ConfirmDialog/)
  assert.match(lexflowUi, /function UnsavedDialog/)
  assert.doesNotMatch(lexflowUi, /window\.confirm|window\.prompt/)
  assert.match(lexflowUi, /function MarkdownPreview/)
  assert.match(lexflowUi, /MarkdownEditorSurface/)
  assert.match(lexflowUi, /createWorkbenchEditor/)
  assert.doesNotMatch(lexflowUi, /function LiveMarkdownDocument|function EditableMarkdownSource/)
  assert.match(lexflowUi, /lexflowWorkbenchCanvas/)
  assert.match(lexflowUi, /data-preview-only/)
  assert.match(lexflowUi, /previewOnly/)
  assert.match(lexflowUi, /lexflowWorkbenchTitleButton/)
  assert.match(lexflowUi, /if \(!previewOnly && titleEditing\)/)
  assert.match(lexflowUi, /仅预览/)
  assert.doesNotMatch(lexflowUi, /viewMode === 'split'/)
  assert.doesNotMatch(lexflowUi, /Command＋S 保存/)
  assert.match(lexflowUi, /有序列表/)
  assert.match(lexflowUi, /headingLevel/)
  assert.match(lexflowUi, /请先选择保存位置/)
  assert.match(lexflowUi, /lexflowWorkflowHeaderWorkflow/)
  assert.match(lexflowUi, /stopImmediatePropagation\(\)/)
  assert.match(lexflowUi, /function Archive\(\{ document: initial \}\) \{ installStyles\(\)/)
  assert.match(lexflowUi, /safeTitle/)
})

test('the runtime source contains no embedded conversation frame', () => {
  const sourceRoot = path.join(root, 'src')
  const files = []
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name)
      if (entry.isDirectory()) visit(filename)
      else if (/\.(?:ts|tsx|js|html|css)$/u.test(entry.name)) files.push(filename)
    }
  }
  visit(sourceRoot)
  for (const filename of files) assert.doesNotMatch(fs.readFileSync(filename, 'utf8'), /<iframe|className=.dsh-frame/u, filename)
})

test('workspace path boundaries reject symlink escapes', async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'lexflow-file-boundary-'))
  const workspace = path.join(temporary, 'workspace')
  const outside = path.join(temporary, 'outside')
  fs.mkdirSync(workspace, { recursive: true })
  fs.mkdirSync(outside, { recursive: true })
  fs.writeFileSync(path.join(outside, 'secret.md'), 'outside\n')
  fs.symlinkSync(outside, path.join(workspace, 'escape'), 'dir')
  try {
    const boundary = await import(path.join(root, 'dsh-plugins', 'lexflow-archive', 'lib', 'file-boundary.js'))
    assert.throws(() => boundary.inside(workspace, 'escape/secret.md'), /路径不在 LexFlow 工作空间内/u)
    assert.equal(boundary.inside(workspace, 'new/file.md'), path.join(workspace, 'new', 'file.md'))
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true })
  }
})

test('官方账号与 Agent 预设入口按 0.6.1 方案启用', () => {
  const preload = fs.readFileSync(path.join(root, 'src', 'preload', 'index.ts'), 'utf8')
  const main = fs.readFileSync(path.join(root, 'src', 'main', 'index.ts'), 'utf8')
  const adapter = fs.readFileSync(path.join(root, 'dsh-plugins', 'lexflow-dsh-adapter', 'src', 'client.js'), 'utf8')

  // 官方账号登录界面以 `("dshDesktop" in globalThis)` 为唯一启用判据；不注入即静默跳过。
  assert.match(preload, /exposeInMainWorld\('dshDesktop', \{\}\)/)
  // 只声明宿主身份、不声明 protocolVersion：官方更新通道与浏览器侧栏均以
  // protocolVersion === 1 为启用条件，不声明即保持关闭（产品基线要求不显示更新与兼容性）。
  // 只检查 dshDesktop 上是否真的挂了该字段；注释里说明它为何缺席不算违规。
  assert.doesNotMatch(preload, /exposeInMainWorld\('dshDesktop', \{[^}]*protocolVersion/u)
  // 充值／用量页面不再由 LexFlow 内嵌原生子窗口承载（2026-10-04 用户实测：
  // 子窗口跑到左上角、盖住官方返回按钮导致无法退出、且无法拖动）。
  // 不注入 dshPlatform 即让官方账号插件跳过 AccountPlatformHost 注册，
  // 充值入口自动降级为官方自带的外部浏览器跳转，LexFlow 不再维护任何窗口。
  assert.doesNotMatch(preload, /dshPlatform/u)
  for (const channel of ['lexflow:platform-open', 'lexflow:platform-set-bounds', 'lexflow:platform-close']) {
    assert.equal(main.includes(channel), false)
    assert.equal(preload.includes(channel), false)
  }
  assert.doesNotMatch(main, /installPlatformIpc/u)
  assert.doesNotMatch(main, /PLATFORM_ORIGIN/u)
  assert.doesNotMatch(main, /platformWindow/u)
  // 登录所需的 dshDesktop 仍然保留。
  assert.match(preload, /exposeInMainWorld\('dshDesktop', \{\}\)/)

  // Agent 预设恢复启用：装配模板里不再有 ui-agent-preset 的停用行，
  // 其余官方界面插件仍照常停用。模板写在转义字符串中，故按片段匹配。
  assert.doesNotMatch(main, /- id: ui-agent-preset\\n  disabled: true/u)
  assert.match(main, /- id: ui-brand-official\\n  disabled: true/u)
  assert.match(main, /- id: ui-sidebar\\n  disabled: true/u)

  // 顶部维持现状：只隐藏官方预设名标签，LexFlow 的项目名标签不受影响。
  assert.match(adapter, /span\[class\*="SVAs4q_label"\] \{ display: none !important; \}/u)
  assert.match(adapter, /lexflowHeaderWorkspace/)

  // 对话页顶部无返回箭头，安全区只保留 16px 可见间隙，不再多留 28px 箭头槽位。
  assert.match(adapter, /--lexflow-leading-clearance-compact/u)
  assert.match(adapter, /const compact = `\$\{Math\.round\(right \+ 16\)\}px`/u)
  assert.match(adapter, /setProperty\('--lexflow-leading-clearance-compact', compact\)/u)
  // 带返回箭头的一级页面仍用 44px 取值，返回箭头槽位不被削减。
  assert.match(adapter, /const clearance = `\$\{Math\.round\(right \+ 44\)\}px`/u)
})

test('插件页启用的官方组合包在重启后保留', () => {
  const main = fs.readFileSync(path.join(root, 'src', 'main', 'index.ts'), 'utf8')

  // 底座的 selectBundle() 只把启停写进 package.json 的 dsh.profile.bundles，
  // 那是它记录启用意图的唯一位置。启动时整份重写 manifest 会让用户在插件页
  // 开启的组合包每次启动都被清空——条目仍在列表中（组合包随安装附带），
  // 但开关从「开」跳回「关」。故写回前必须摘出已启用的组合包。
  assert.match(main, /readEnabledBundles/u)
  assert.match(
    main,
    /bundles: \['@deepseek-ai\/dsh-base', '@deepseek-ai\/dsh-web-app', \.\.\.enabledBundles\]/u,
    'package.json 写回时必须把已启用的组合包追加在必需组合包之后',
  )
  // 读出函数必须在写入前调用，否则读到的是即将被覆盖的内容。
  assert.match(
    main,
    /const enabledBundles = await readEnabledBundles\(profileManifestPath\)[\s\S]*?atomicWrite\(profileManifestPath/u,
    '必须先读出已启用的组合包，再写回 manifest',
  )

  // 白名单与底座 OPTIONAL_BUNDLES 一致，四个官方组合包全部覆盖。
  for (const bundle of [
    '@deepseek-ai/dsh-experimental-agent-team-profile',
    '@deepseek-ai/dsh-experimental-voice-input-bundle',
    '@deepseek-ai/dsh-experimental-auto-review',
    '@deepseek-ai/dsh-experimental-schedule-bundle',
  ]) {
    assert.ok(main.includes(bundle), `白名单缺少 ${bundle}`)
  }
  // 必需组合包由装配决定，不应出现在保留名单里（否则会在 bundles 中重复）。
  assert.equal(main.includes("'@deepseek-ai/dsh-base',\n  '@deepseek-ai/dsh-web-app',\n] as const"), false)
})
