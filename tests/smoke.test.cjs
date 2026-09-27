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
  assert.equal(packageJson.version, '0.4.4')
  assert.equal(packageJson.build, undefined)
  const forgeConfig = fs.readFileSync(path.join(root, 'forge.config.cjs'), 'utf8')
  assert.match(forgeConfig, /appBundleId: 'com\.lexflow\.desktop'/)
  assert.equal(packageJson.main, 'out/main/index.js')
  assert.equal(packageJson.dependencies['@deepseek-ai/dsh'], '0.1.7-alpha.1')
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
    'lexflow-codex-connect',
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
    '@lexflow/codex-connect',
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
  for (const id of ['ui-layout', 'ui-sidebar', 'ui-model-selection', 'ui-settings-models']) {
    assert.ok(main.includes(`- id: ${id}\\n  disabled: true`))
  }
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
  assert.match(adapter, /2147483000/)
  assert.match(pages, /工作流/)
  assert.doesNotMatch(pages, /标准规范/)
  assert.match(pages, /function Workflow\(/)
  assert.match(pages, /workflow\.status/)
  assert.match(pages, /workflow\.oldData\.list/)
  assert.match(pages, /lexflowWorkflowTopBack/)
  assert.doesNotMatch(pages, /lexflowWorkflowFooterBack/)
  assert.match(pages, /height: 15/)
  assert.doesNotMatch(pages, /jsx\((?:SearchIcon|FilterIcon|PlusIcon)\)/)
  assert.match(adapter, /sidebar\.lexflow\.nav", \{ wide, startSession \}/)
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
    assert.match(fs.readFileSync(path.join(knowledgeRoot, '工作流', '无声明.md'), 'utf8'), /^---\ntype: memory\n---/u)
    const reclassified = await request({ action: 'workflow.list' })
    assert.deepEqual(reclassified.unclassified, [])
    assert.ok(reclassified.nodes.some((node) => node.name === '无声明.md' && node.type === 'memory'))
    await assert.rejects(() => request({ action: 'workflow.classify', relativePath: '工作流/声明工作流.md', type: 'memory' }), /已有类型声明/u)
    await assert.rejects(() => request({ action: 'workflow.classify', relativePath: '../outside.md', type: 'workflow' }), /路径不在 LexFlow 工作空间内/u)
    assert.deepEqual(registeredTools.map((tool) => tool.name).sort(), ['lexflow_document_ocr', 'lexflow_document_read', 'lexflow_document_write', 'lexflow_knowledge_read', 'lexflow_knowledge_search'])
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
    assert.match(fs.readFileSync(path.join(knowledgeRoot, workflow.relativePath), 'utf8'), /^---\ntype: workflow\n---/u)
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

test('LexFlow registers the optional GPT subscription provider without changing defaults', () => {
  const main = fs.readFileSync(path.join(root, 'src', 'main', 'index.ts'), 'utf8')
  assert.match(main, /id: llm-openai-codex/)
  assert.match(main, /name: '@lexflow\/codex-connect'/)
  assert.match(main, /enableProxy: false/)
  assert.match(main, /enableSearch: false/)
  assert.match(main, /enableImageTool: false/)
  assert.match(main, /enableImageGeneration: false/)
  assert.doesNotMatch(main, /name: dsh-codex-connect/)
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'dsh-plugins', 'manifest.json'), 'utf8'))
  assert.equal(manifest.packages.find((plugin) => plugin.target === '@lexflow\/codex-connect').compatibleWith, '@deepseek-ai/dsh@0.1.7-alpha.1')
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
  assert.doesNotMatch(client, /settings\.plugin\.item|settings\.models\.footer/)
  assert.match(client, /models\.gpt\.subscription/)
  assert.match(client, /models\.gpt\.settings/)
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

test('LexFlow separates the two GLM provider editors', () => {
  const modelSettings = fs.readFileSync(path.join(root, 'dsh-plugins', 'lexflow-workflow', 'lib', 'client.js'), 'utf8')
  assert.match(modelSettings, /className: "lexflowModelProviderEditors"/)
  assert.match(modelSettings, /gap: "12px"/)
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
  assert.match(workflow, /runtime\.ui\.settings\.schema/)
  assert.match(sidebar, /lexflowSidebarRoot/)
  assert.match(sidebar, /lexflowSidebarCollapsed/)
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'dsh-plugins', 'manifest.json'), 'utf8'))
  assert.ok(manifest.packages.some((plugin) => plugin.source === 'lexflow-workflow'))
  const modelSettingsJs = workflow
  const modelSelectionJs = workflow
  assert.match(modelSettingsJs, /LexFlowModelsSection/)
  assert.match(modelSettingsJs, /DeepSeek/)
  assert.match(modelSettingsJs, /Codex 订阅/)
  assert.match(modelSettingsJs, /GPT设置/)
  assert.match(modelSettingsJs, /models\.gpt\.subscription/)
  assert.match(modelSettingsJs, /models\.gpt\.settings/)
  assert.match(modelSettingsJs, /__LEXFLOW_MODEL_VISIBILITY__/)
  assert.match(modelSettingsJs, /let React = react/)
  assert.match(modelSettingsJs, /let jsx = \(\.\.\.args\) => react_jsx_runtime\.jsx\(\.\.\.args\)/)
  assert.doesNotMatch(modelSettingsJs, /data-lexflow-show-codex/)
  assert.match(modelSettingsJs, /children: label/)
  assert.doesNotMatch(modelSettingsJs, /\}, label\)/)
  assert.match(modelSettingsJs, /lexflowModelStatusMark/)
  assert.doesNotMatch(modelSettingsJs, /lexflowCodexMask/)
  assert.doesNotMatch(modelSettingsJs, /setCodexDialogOpen\(true\)/)
  assert.doesNotMatch(modelSettingsJs, /打开 Codex Connect 配置/)
  assert.match(modelSettingsJs, /const editorsFor = \(ids\) =>/)
  assert.match(modelSettingsJs, /editorsFor\(\["zai-coding-cn", "zai"\]\)/)
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
  assert.match(adapter, /_turnStatus.*background-clip: text !important/)
  assert.match(adapter, /_turnStatusClock.*background: none !important/)
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
  // 紧凑密度层（0.1.5 现行锚点）：行高 22px、流间距 12px、输入卡片圆角 14px、
  // 气泡圆角 14px。失效的 0.1.4 类名不得再出现在适配层。
  assert.match(adapter, /hWmORq_root.*line-height: calc\(22px/)
  assert.match(adapter, /uV2eYG_card.*border-radius: 14px/)
  assert.match(adapter, /div\[class\*="bubble"\] \{ border-radius: 14px/)
  assert.match(adapter, /markdown_kcgor/)
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
  assert.match(modelSettings, /this\.api\.llm\.models\(\{\}\)/)
  assert.match(modelSettings, /function routeRegistered\(state, row\)/)
  assert.match(modelSettings, /rows\.find\(\(row\) => routeRegistered\(state, row\) && providerUsable\(row\)\)/)
  assert.match(modelSettings, /value\?\.status === "signed-in"/)
  assert.match(modelSettings, /visibilitychange/)
  assert.match(modelSettings, /function apiRouteStatus\(state, ids\)/)
  assert.match(modelSettings, /ids\.filter\(\(id\) => id !== "openai-codex"\)/)
  assert.match(modelSettings, /modelCatalogStatus = modelGroupsResponse/)
  assert.match(modelSettings, /let modelGroups = \[\];\s*let modelCatalogStatus = "unavailable";/)
  assert.match(modelSettings, /cleanModelDisplayName/)
  assert.doesNotMatch(modelSettings, /智谱国内 API（支持 Coding Plan 与按量额度）/)
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
