const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const vm = require('node:vm')
const { pathToFileURL } = require('node:url')
const React = require('react')
const Renderer = require('react-test-renderer')
const root = path.resolve(__dirname, '..')
const pluginPath = (plugin, file = 'index.js') => path.join(root, 'dsh-plugins', plugin, 'src', file)

function pages() {
  let exported
  const listeners = new Map()
  const window = {
    __ModuleLoader__: { load: ({ factory }) => { exported = factory((id) => id === '@lexflow/workbench-editor' ? { createWorkbenchEditor: () => { throw new Error('Use real editor DOM tests') } } : require(id)) } },
    addEventListener: (name, listener) => listeners.set(name, listener), removeEventListener: (name) => listeners.delete(name),
    requestAnimationFrame: (callback) => { callback(); return 0 }, setTimeout, clearTimeout,
    innerWidth: 1000, innerHeight: 800,
  }
  const document = { querySelector: () => true, addEventListener() {}, removeEventListener() {} }
  vm.runInNewContext(fs.readFileSync(pluginPath('lexflow-ui-pages', 'client.js'), 'utf8'), { window, document, console, setTimeout, clearTimeout, CustomEvent: class {} })
  return { ...exported, listeners }
}
const flush = () => new Promise((resolve) => setImmediate(resolve))

test('archive and workflow pages mount, browse independently, and create inline without render errors', async () => {
  const ui = pages()
  const calls = []
  const navigate = []
  const node = (name, relativePath, children) => ({ name, relativePath, kind: children ? 'folder' : 'file', children, updatedAt: new Date().toISOString() })
  ui.configure({ navigate: (...args) => navigate.push(args), request: async (action, payload) => {
    calls.push([action, payload])
    if (action === 'workflow.status') return { configured: true, rootName: '测试库', knowledgeBases: [] }
    if (action === 'archive.list') return { nodes: [node('资料', '资料', [node('档案.md', '资料/档案.md')])] }
    if (action === 'workflow.list') return { nodes: [node('研究.md', '工作流/研究.md')] }
    if (action === 'archive.read') return { title: '档案', content: '正文', revision: '1' }
    return {}
  } })
  let view
  await Renderer.act(async () => { view = Renderer.create(React.createElement(ui.pages.Archive)); await flush() })
  assert.ok(JSON.stringify(view.toJSON()).includes('资料'))
  assert.ok(!JSON.stringify(view.toJSON()).includes('研究.md'))
  const folderRow = view.root.findAll((node) => node.props.className === 'lexflowWorkflowRow lexflowWorkflowFolderRow')[0]
  await Renderer.act(async () => folderRow.props.onClick())
  await Renderer.act(async () => folderRow.props.onDoubleClick({ preventDefault() {} }))
  assert.ok(JSON.stringify(view.toJSON()).includes('档案'))
  await Renderer.act(async () => view.root.findAll((node) => node.props.className === 'lexflowWorkflowRow')[0].props.onDoubleClick({ preventDefault() {} }))
  assert.equal(navigate[0][1].kind, 'archive')
  await Renderer.act(async () => view.root.findByProps({ 'aria-label': '新建' }).props.onClick())
  await Renderer.act(async () => view.root.findAllByType('button').find((node) => node.children.join('') === '新建文件夹').props.onClick())
  assert.equal(calls.some(([action]) => action === 'archive.createFolder'), false)
  await Renderer.act(async () => view.root.findByProps({ 'aria-label': '新文件夹名称' }).props.onKeyDown({ key: 'Escape' }))
  assert.equal(calls.some(([action]) => action === 'archive.createFolder'), false)
  await Renderer.act(async () => view.unmount())
  await Renderer.act(async () => { view = Renderer.create(React.createElement(ui.pages.Workflow)); await flush() })
  assert.ok(JSON.stringify(view.toJSON()).includes('研究'))
  assert.ok(!JSON.stringify(view.toJSON()).includes('档案.md'))
  await Renderer.act(async () => view.unmount())
})

test('real session surface replaces old revisions, stops and restores after compression without changing history', async () => {
  const adapter = await import(pathToFileURL(pluginPath('lexflow-dsh-adapter')))
  const { Session, SessionId } = await import('@deepseek-ai/dsh-session')
  const { createUserMessage } = await import('@deepseek-ai/dsh-llm')
  const source = fs.readFileSync(pluginPath('lexflow-workflow'), 'utf8').replace("'@lexflow/dsh-adapter'", JSON.stringify(pathToFileURL(pluginPath('lexflow-dsh-adapter')).href))
  const plugin = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))
  let preStep, revision = 'v1', body = 'FIRST_RULE', suppressed = []
  let reads = 0
  const service = { consumeActivations: () => [], bindSession: async () => {}, sessionState: async () => ({ suppressed }), listSettings: async () => [{ fileId: 'f1', relativePath: '工作流/研究.md', revision, useMode: 'session_start' }], discover: async () => ({ candidates: [], ambiguous: false }), read: async () => { reads++; return { item: { fileId: 'f1', relativePath: '工作流/研究.md' }, revision, content: body } }, recordApplications: async () => {} }
  plugin.apply({ get: (name) => name === 'lexflowArchive' ? { workflow: service } : { host: { defineSettingsSchema: (v) => v, defineEnumSchema: (_v, d) => d, registerSettings() {} } }, inject: (_names, callback) => callback(), effect: (fn) => fn(), on: (_name, callback) => { preStep = callback; return () => {} } })
  const session = Session.create(SessionId('repair-session'))
  const agent = { session }
  const user = createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '研究任务' }] })
  // 模拟引擎的真实顺序：agent/pre-step 返回后，引擎先提交系统消息（表面首节点），
  // 再把 decision.messages 追加到表面。插件新增的工作流上下文正是经这条通道写入的，
  // 它不能自己抢在系统消息之前，否则日志在下次读取时会被判为损坏。
  const step = async (messages = [user]) => {
    const decision = await preStep({ agent, messages, turn: 1, signal: new AbortController().signal }, async () => ({ kind: 'enter', messages }))
    if (!session.snapshotEvents().some((event) => event.type === 'system/message')) {
      session.append('system/message', { turn: 1, step: 1, message: { role: 'system', content: [{ type: 'text', text: '系统提示' }] } }, { surfaceOp: 'append' })
    }
    for (const message of Array.isArray(decision.messages) ? decision.messages : []) {
      if (!messages.includes(message)) session.append('user/message', message, { surfaceOp: 'append' })
    }
    return decision
  }
  await step()
  const firstSeq = session.seq
  assert.match(JSON.stringify(session.deriveMessages()), /FIRST_RULE/)
  await step(); assert.equal(reads, 1); assert.equal(session.seq, firstSeq)
  revision = 'v2'; body = 'SECOND_RULE'
  await step()
  assert.doesNotMatch(JSON.stringify(session.deriveMessages()), /FIRST_RULE/)
  assert.match(JSON.stringify(session.deriveMessages()), /SECOND_RULE/)
  assert.match(JSON.stringify(session.snapshotEvents()), /FIRST_RULE/)
  const surface = adapter.workflowSessionContext(session)
  const event = surface.visible().find((event) => /SECOND_RULE/.test(JSON.stringify(event.data)))
  session.append('user/message', createUserMessage({ source: { kind: 'plugin', plugin: 'test-compaction', form: 'instructions' }, content: [{ type: 'text', text: '摘要' }] }), { surfaceOp: { op: 'replace', startSeq: event.seq, endSeq: event.seq }, sourceEventSeqs: [event.seq] })
  await step([])
  assert.match(JSON.stringify(session.deriveMessages()), /SECOND_RULE/)
  suppressed = ['f1']; await step()
  assert.doesNotMatch(JSON.stringify(session.deriveMessages()), /SECOND_RULE/)
})

async function storageFixture(run) {
  const temporary = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lexflow-repair-storage-')))
  const knowledge = path.join(temporary, 'knowledge')
  const config = { workspaceRoot: path.join(temporary, 'workspace'), archiveRoot: path.join(temporary, 'legacy'), draftsRoot: path.join(temporary, 'drafts'), historyRoot: path.join(temporary, 'history'), oldDataRoot: path.join(temporary, 'old'), defaultKnowledgeBaseRoot: knowledge, knowledgeBaseStatePath: path.join(temporary, 'state.json'), knowledgeBaseIndexRoot: path.join(temporary, 'index'), userAgentPath: path.join(temporary, 'workspace', 'AGENT.md') }
  fs.mkdirSync(knowledge, { recursive: true })
  fs.mkdirSync(config.knowledgeBaseIndexRoot)
  fs.writeFileSync(config.knowledgeBaseStatePath, JSON.stringify({ rootPath: knowledge }))
  let handler, service
  const plugin = await import(pathToFileURL(pluginPath('lexflow-archive')))
  const effects = []
  const request = async (action, payload = {}, error = false) => {
    let response
    await handler({ async *[Symbol.asyncIterator]() { yield JSON.stringify({ action, ...payload }) } }, { writeHead() {}, end(value) { response = JSON.parse(value) } })
    if (error) { assert.equal(response.ok, false); return response.error }
    assert.equal(response.ok, true, response.error)
    return response.value
  }
  const start = () => plugin.apply({ get: () => ({ host: { registerRoute: (route) => { if (route.path === '/lexflow-api') handler = route.handler; return () => {} } } }), effect: (callback) => { const result = callback(); effects.push(result); return result }, provide: (_name, value) => { service = value } }, config)
  try { await run({ temporary, knowledge, config, start, request, service: () => service }) }
  finally { for (const dispose of effects.reverse()) if (typeof dispose === 'function') await dispose(); fs.rmSync(temporary, { recursive: true, force: true }) }
}

test('migration preserves identity, modes and source bytes; both storage APIs enforce their own directory', () => storageFixture(async ({ knowledge, config, start, request }) => {
  const { createHash } = require('node:crypto')
  const hash = (s) => createHash('sha256').update(s).digest('hex')
  const content = '---\ntype: workflow\n---\n\n# 研究\n仅供工作流。'
  fs.writeFileSync(path.join(knowledge, '研究.md'), content)
  fs.writeFileSync(path.join(knowledge, '未导入.md'), '不得纳入')
  const indexPath = path.join(config.knowledgeBaseIndexRoot, hash(knowledge).slice(0, 24) + '.json')
  fs.writeFileSync(indexPath, JSON.stringify({ version: 1, files: { '研究.md': { fileId: 'stable-id', name: '研究.md', type: 'workflow', relativePath: '研究.md' } } }))
  fs.writeFileSync(path.join(path.dirname(config.knowledgeBaseStatePath), 'workflow-settings.json'), JSON.stringify({ version: 1, roots: { [hash(knowledge).slice(0, 24)]: { rootPath: knowledge, files: { 'stable-id': { relativePath: '研究.md', useMode: 'session_start' } } } } }))
  start()
  const workflow = await request('workflow.list')
  assert.deepEqual(workflow.nodes.map((node) => node.name), ['AGENT.md', '研究.md'])
  // 迁移把既有编号写进文件头（身份随文件走，改名后不再失配）；正文其余部分原样保留。
  assert.equal(fs.readFileSync(path.join(knowledge, '工作流/研究.md'), 'utf8'), content.replace('---\ntype: workflow\n---', '---\ntype: workflow\nlexflow-id: stable-id\n---'))
  assert.equal(workflow.nodes[1].fileId, 'stable-id')
  assert.equal(workflow.nodes[1].useMode, 'session_start')
  assert.equal(fs.existsSync(path.join(knowledge, '未导入.md')), true)
  const archive = await request('archive.createMarkdown', { name: '档案', content: '档案资料' })
  assert.deepEqual((await request('archive.list')).nodes.map((node) => node.name), ['档案.md'])
  assert.deepEqual((await request('workflow.list')).nodes.map((node) => node.name), ['AGENT.md', '研究.md'])
  assert.match(await request('workflow.read', { relativePath: '档案室/档案.md' }, true), /工作流目录/)
  assert.ok(await request('archive.read', { relativePath: '../工作流/研究.md' }, true))
  fs.symlinkSync(path.join(knowledge, '档案室'), path.join(knowledge, '工作流', 'escape'))
  assert.ok(await request('workflow.create', { parent: '工作流/escape', name: 'bad', type: 'workflow', content: 'bad' }, true))
  fs.unlinkSync(path.join(knowledge, '工作流', 'escape'))
  const before = await request('workflow.read', { relativePath: '工作流/研究.md' })
  await request('workflow.save', { relativePath: before.item.relativePath, content: content + '\n更新', revision: before.revision })
  const after = await request('workflow.read', { relativePath: before.item.relativePath })
  assert.equal(after.item.fileId, 'stable-id')
  assert.equal(after.item.useMode, 'session_start')
  await request('workflow.createFolder', { name: '子目录' })
  await request('workflow.move', { from: before.item.relativePath, to: '工作流/子目录/改名.md' })
  assert.equal((await request('workflow.read', { relativePath: '工作流/子目录/改名.md' })).item.fileId, 'stable-id')
  assert.equal((await request('archive.read', { relativePath: archive.relativePath })).content, '档案资料')
}))

test('DOCX conversion preserves heading, table and image and rejects corrupt input without partial originals', () => storageFixture(async ({ temporary, knowledge, start, request }) => {
  const { execFileSync } = require('node:child_process')
  // Minimal OOXML fixture; no Office installation or customer document required.
  const zipRoot = path.join(temporary, 'docx')
  fs.mkdirSync(path.join(zipRoot, 'word', '_rels'), { recursive: true })
  fs.mkdirSync(path.join(zipRoot, 'word', 'media'))
  fs.writeFileSync(path.join(zipRoot, '[Content_Types].xml'), '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/></Types>')
  fs.writeFileSync(path.join(zipRoot, 'word/styles.xml'), '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style></w:styles>')
  fs.writeFileSync(path.join(zipRoot, 'word/_rels/document.xml.rels'), '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/a.png"/></Relationships>')
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64')
  fs.writeFileSync(path.join(zipRoot, 'word/media/a.png'), png)
  fs.writeFileSync(path.join(zipRoot, 'word/document.xml'), '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>测试标题</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>表格内容</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:p><w:r><w:drawing><wp:inline><wp:docPr id="1" name="图片"/><a:graphic><a:graphicData><pic:pic><pic:nvPicPr><pic:cNvPr id="1" name="图片"/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rId1"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p></w:body></w:document>')
  const source = path.join(temporary, 'fixture.docx')
  execFileSync('zip', ['-qr', source, '.'], { cwd: zipRoot })
  start()
  const [item] = await request('archive.import', { files: [{ name: '结构.docx', contentBase64: fs.readFileSync(source).toString('base64') }] })
  const value = await request('archive.read', { relativePath: item.relativePath })
  assert.match(value.content, /# 测试标题/)
  assert.match(value.content, /表格内容/)
  const href = value.content.match(/!\[[^\]]*\]\(([^)]+)\)/)?.[1]
  assert.ok(href, 'image must be preserved as a real relative Markdown link')
  const image = await request('archive.asset', { documentPath: item.relativePath, href })
  assert.equal(image.src, 'data:image/png;base64,' + png.toString('base64'))
  await request('archive.createFolder', { name: '移动目标' })
  const moved = await request('archive.move', { from: item.relativePath, to: '移动目标/结构.md' })
  const movedText = (await request('archive.read', { relativePath: moved.relativePath })).content
  const movedHref = movedText.match(/!\[[^\]]*\]\(([^)]+)\)/)[1]
  assert.equal((await request('archive.asset', { documentPath: moved.relativePath, href: movedHref })).src, image.src)
  assert.ok(fs.existsSync(path.join(knowledge, '档案室', item.originalPath)))
  const before = fs.readdirSync(path.join(knowledge, '档案室'))
  await request('archive.import', { files: [{ name: '损坏.docx', contentBase64: Buffer.from('not a zip').toString('base64') }] }, true)
  assert.deepEqual(fs.readdirSync(path.join(knowledge, '档案室')), before)
}))

test('ambiguous workflow choice blocks until user selection and cancels cleanly', () => storageFixture(async ({ start, request, service }) => {
  start()
  const controller = new AbortController()
  let finished = false
  const candidates = [{ fileId: 'a', name: 'A', relativePath: '工作流/a.md' }, { fileId: 'b', name: 'B', relativePath: '工作流/b.md' }]
  const pending = service().workflow.choose('choice-session', candidates, controller.signal).then((value) => { finished = true; return value })
  await flush(); assert.equal(finished, false)
  const state = await request('workflow.session.state', { sessionId: 'choice-session' })
  assert.equal(state.choice.candidates.length, 2)
  await request('workflow.session.choose', { sessionId: 'choice-session', choiceId: state.choice.id, fileIds: ['b'] })
  assert.deepEqual((await pending).map((item) => item.fileId), ['b'])
  const next = service().workflow.choose('choice-session', candidates, controller.signal)
  const rejection = assert.rejects(next, /取消/)
  controller.abort(); await rejection
  assert.equal((await request('workflow.session.state', { sessionId: 'choice-session' })).choice, null)
}))

test('commitDocument serializes new names, retries once and retains exact archive bytes', () => storageFixture(async ({ knowledge, start, request }) => {
 start(); await request('archive.list')
 const content='\uFEFF# 正文\r\n\r\n保留  空格\n'
 const values=await Promise.all(Array.from({length:8},(_,i)=>request('archive.commitDocument',{requestId:'concurrent-'+i,mode:'new',parent:'.',name:'未命名文件',content:content+i})))
 assert.equal(new Set(values.map(v=>v.relativePath)).size,8)
 for(let i=0;i<8;i++) assert.equal(fs.readFileSync(path.join(knowledge,'档案室',values[i].relativePath),'utf8'),content+i)
 const retry=await request('archive.commitDocument',{requestId:'concurrent-0',mode:'new',parent:'.',name:'未命名文件',content:content+0})
 assert.equal(retry.relativePath,values[0].relativePath)
 const saved=await request('archive.commitDocument',{requestId:'save-existing',mode:'existing',relativePath:retry.relativePath,name:'已改名',revision:retry.revision,content})
 assert.equal(saved.status,'saved');assert.equal(saved.content,content);assert.equal(saved.relativePath,'已改名.md')
 await request('archive.commitDocument',{requestId:'stale',mode:'existing',relativePath:saved.relativePath,name:'已改名',revision:'old',content:'不可写入'},true)
 assert.equal(fs.readFileSync(path.join(knowledge,'档案室','已改名.md'),'utf8'),content)
}))

test('builtin Agent is pinned, editable through its own API and rejects destructive identities', () => storageFixture(async ({ config,start,request }) => {
 start(); const listing=await request('workflow.list');assert.equal(listing.nodes[0].documentKey,'builtin:agent')
 const first=await request('workflow.agent.read');assert.equal(first.content,'')
 await request('workflow.agent.save',{revision:first.revision,content:'保留全局规则'})
  assert.equal((await request('workflow.list')).nodes[0].name,'AGENT.md')
 assert.equal(fs.readFileSync(config.userAgentPath,'utf8'),'保留全局规则')
 for(const action of ['workflow.move','workflow.trash','workflow.setType']) await request(action,{relativePath:'builtin:agent',from:'builtin:agent',to:'工作流/new.md',type:'workflow'},true)
 fs.unlinkSync(config.userAgentPath);assert.equal((await request('workflow.agent.read')).content,'')
}))

test('long-term memory exposes the same use modes and batch operations update indexed files', () => storageFixture(async ({ knowledge, start, request }) => {
  start()
  const memory = await request('workflow.create', { parent: '.', name: '长期记忆', type: 'memory', content: '---\ntype: memory\n---\n\n可复用记忆。' })
  const folder = await request('workflow.createFolder', { parent: '.', name: '批量目录' })
  const workflow = await request('workflow.create', { parent: folder.relativePath, name: '方法', type: 'workflow', content: '---\ntype: workflow\n---\n\n批量方法。' })
  const settings = await request('workflow.settings.list')
  assert.equal(settings.some((entry) => entry.fileId === memory.fileId && entry.type === 'memory'), true)
  const changed = await request('workflow.batch', { operation: 'setUseMode', items: [{ relativePath: memory.relativePath }], useMode: 'session_start' })
  assert.equal(changed.failed.length, 0)
  assert.equal((await request('workflow.settings.list')).find((entry) => entry.fileId === memory.fileId).useMode, 'session_start')
  const moved = await request('workflow.batch', { operation: 'move', items: [{ relativePath: workflow.relativePath }], targetFolder: '.' })
  assert.equal(moved.failed.length, 0, JSON.stringify(moved))
  const typed = await request('workflow.batch', { operation: 'setType', items: [{ relativePath: memory.relativePath }], type: 'workflow' })
  assert.equal(typed.failed.length, 0)
  const listing = await request('workflow.list')
  assert.equal(listing.nodes.some((node) => node.name === '长期记忆.md' && node.type === 'workflow'), true)
}))
