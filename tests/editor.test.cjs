const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const { JSDOM } = require('jsdom')
const root = path.resolve(__dirname, '..')
const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { pretendToBeVisual: true, url: 'http://localhost/' })
for (const name of ['window','document','navigator','MutationObserver','HTMLElement','Element','Node','Window','Document','DOMRect','Event','MouseEvent','KeyboardEvent','CompositionEvent','CustomEvent']) Object.defineProperty(global, name, { value: dom.window[name], configurable: true })
global.getComputedStyle = dom.window.getComputedStyle.bind(dom.window)
global.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window)
global.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window)
// JSDOM does not implement layout. These shims are ONLY for DOM/transaction
// tests; actual line geometry and single-click positioning are tested in-app.
dom.window.Range.prototype.getClientRects = () => []
dom.window.Range.prototype.getBoundingClientRect = () => ({ left:0,top:0,right:100,bottom:20,width:100,height:20 })
const built = require('esbuild').buildSync({ entryPoints: [path.join(root, 'dsh-plugins/lexflow-ui-pages/src/workbench-editor.js')], bundle: true, write: false, platform:'browser', format:'cjs', loader:{'.css':'text'}, external:['react','react-dom','react/jsx-runtime'] })
const compiled = new Module(path.join(root, 'tests', 'editor-runtime.cjs'), module)
compiled.filename = path.join(root,'tests','editor-runtime.cjs'); compiled.paths = module.paths
compiled._compile(built.outputFiles[0].text, compiled.filename)
const { createWorkbenchEditor } = compiled.exports
const fixture = '\uFEFF---\r\ntype: workflow\r\ncustom: keep\r\n---\r\n\r\n# 一、核心原则\r\n\r\n## 1.1 审议与执行分离原则\r\n\r\n- **审议阶段**：' + '这是一段需要自动换行的中文内容。'.repeat(70) + '\r\n\n- **执行阶段**：必须保留。\r\n\r\n[[双链]] 与 ==高亮==。'
function setup(content = fixture) {
 const parent = document.createElement('div'); document.body.appendChild(parent)
 const events = []
 const editor = createWorkbenchEditor(parent, { content, onChange: (s) => events.push(s) })
 return { editor, parent, events, dispose() { editor.destroy(); parent.remove() } }
}
test('opening and mode switching preserve every original byte and the same view', () => {
 const f = setup(); try {
  const view = f.editor.view, sel = view.state.selection.main.head
  for(let i=0;i<30;i++) { f.editor.setMode('source'); f.editor.setMode('reading'); f.editor.setMode('live') }
  assert.equal(f.editor.getValue(), fixture); assert.equal(f.editor.view, view); assert.equal(view.state.selection.main.head, sel); assert.equal(f.events.length,0)
  assert.equal(f.parent.querySelectorAll('.cm-editor').length,1)
  assert.equal(f.parent.querySelectorAll('textarea').length,0)
 } finally { f.dispose() }
})
test('Chinese edits, formatting, undo and redo preserve mixed line endings and surrounding text', () => {
 const f=setup(); try {
  const view=f.editor.view
  const position=view.state.doc.toString().indexOf('这是一段')
  view.dispatch({ selection:{anchor:position}, changes:{from:position,insert:'新增中文'} })
  assert.equal(f.editor.getValue(),fixture.replace('这是一段','新增中文这是一段'))
  f.editor.undo(); assert.equal(f.editor.getValue(),fixture)
  f.editor.redo(); assert.ok(f.editor.getValue().includes('新增中文'))
  const index=view.state.doc.toString().indexOf('新增中文')
  view.dispatch({selection:{anchor:index,head:index+4}})
  f.editor.inline('~~'); assert.ok(f.editor.getValue().includes('~~新增中文~~'))
  f.editor.inline('~~'); assert.ok(!f.editor.getValue().includes('~~新增中文~~'))
  const before=f.editor.getValue(); f.editor.setMode('source'); f.editor.setMode('live'); assert.equal(f.editor.getValue(),before)
 } finally { f.dispose() }
})
test('blank line insertion happens in the persistent editor without losing any neighboring text', () => {
 const f=setup('# 核心原则\n\n## 1.1\n\n审议阶段正文\n\n执行阶段正文'); try {
  const view=f.editor.view; const empty=view.state.doc.line(2)
  view.dispatch({selection:{anchor:empty.from}}); f.editor.focus()
  assert.equal(document.activeElement,view.contentDOM)
  view.dispatch({changes:{from:empty.from,insert:'一次点击后输入'}})
  assert.equal(f.editor.getValue(),'# 核心原则\n一次点击后输入\n## 1.1\n\n审议阶段正文\n\n执行阶段正文')
 } finally {f.dispose()}
})
test('reading mode blocks transactions, checkbox clicks and toolbar writes', () => {
 const f=setup('# 标题\n\n- [ ] 不得更改\n\n正文'); try {
  f.editor.setMode('reading'); const before=f.editor.getValue()
  f.editor.view.dispatch({changes:{from:f.editor.view.state.doc.length,insert:'bad'}})
  f.parent.querySelector('input[type=checkbox]')?.click()
  f.editor.inline('**'); f.editor.linePrefix('# '); f.editor.undo()
  assert.equal(f.editor.getValue(),before)
  assert.equal(f.editor.view.contentDOM.getAttribute('contenteditable'),'false')
  f.editor.setMode('live'); f.editor.focus(); assert.equal(document.activeElement,f.editor.view.contentDOM)
 } finally{f.dispose()}
})
test('table preview never serializes or trims cell text, editing uses source', () => {
 const original='# 标题\n\n| A | B |\n| --- | --- |\n| hello  world | 保留  空格 |\n\n结尾'
 const f=setup(original); try {
  assert.ok(f.parent.querySelector('table'))
  const cell=f.parent.querySelector('td'); cell.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true}))
  assert.equal(document.activeElement,f.editor.view.contentDOM)
  assert.equal(f.editor.getValue(),original)
  const pos=f.editor.view.state.doc.toString().indexOf('hello')+5
  f.editor.view.dispatch({changes:{from:pos,insert:' '}})
  assert.equal(f.editor.getValue(),original.replace('hello  world','hello   world'))
 } finally{f.dispose()}
})
test('hidden frontmatter survives Backspace-style deletion and can be edited explicitly in source mode', () => {
 const original='---\ntype: workflow\n---\n\n正文'
 const f=setup(original);try{
  const end=original.indexOf('\n\n正文')+1
  f.editor.view.dispatch({changes:{from:0,to:3,insert:'broken'}})
  assert.equal(f.editor.getValue(),original)
  f.editor.setMode('source');f.editor.view.dispatch({changes:{from:original.indexOf('workflow'),to:original.indexOf('workflow')+8,insert:'memory'}})
  assert.equal(f.editor.getValue(),original.replace('workflow','memory'))
 }finally{f.dispose()}
})
test('editor teardown removes its DOM and owned styles',()=>{const f=setup();f.dispose();assert.equal(document.querySelectorAll('.lexflowMarkdownEditor').length,0);assert.equal(document.querySelectorAll('style[data-lexflow-editor]').length,0)})

test('inline images render as a pinned block widget without replacing the source line',()=>{
 const original='# 标题\n\n正文一行\n\n![截图](data:image/png;base64,QUJD)\n\n结尾'
 const f=setup(original);try{
  const figure=f.parent.querySelector('.lexflowEditorImage')
  assert.ok(figure,'image widget must render')
  assert.equal(f.editor.getValue(),original)
  // The image source line keeps its own (normal-height) line element instead of
  // being swallowed by the widget, which is what broke caret height and clicks.
  const lines=f.editor.view.contentDOM.querySelectorAll('.cm-line').length
  assert.ok(lines>=4,`expected the source line to survive, got ${lines} lines`)
  assert.equal(figure.dataset.from,String(original.indexOf('![截图]')))
 }finally{f.dispose()}
})

test('image stays rendered and hidden from source text in every mode, including after 文档属性',()=>{
 const original='---\ntype: memory\n---\n\n![截图](data:image/png;base64,QUJD)\n\n正文'
 const f=setup(original);try{
  const meta=f.parent.querySelector('.lexflowEditorMetadata')
  meta.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}))
  assert.equal(f.parent.querySelector('.lexflowMarkdownEditor').dataset.editorMode,'source')
  assert.ok(f.parent.querySelector('.lexflowEditorImage'),'image must stay rendered in source mode')
  assert.ok(!(f.editor.view.contentDOM.textContent||'').includes('QUJD'),'base64 must never surface in source mode')
  assert.ok((f.editor.view.contentDOM.textContent||'').includes('type: memory'),'frontmatter must stay editable in source mode')
  assert.equal(f.editor.getValue(),original)
 }finally{f.dispose()}
})

test('Enter on an image line adds a line and never deletes the image',()=>{
 const original='# 标题\n\n![截图](data:image/png;base64,QUJD)\n\n结尾'
 const f=setup(original);try{
  const view=f.editor.view
  const start=original.indexOf('![截图]')
  view.dispatch({selection:{anchor:start,head:start+'![截图](data:image/png;base64,QUJD)'.length}})
  const event=new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true})
  view.contentDOM.dispatchEvent(event)
  assert.equal(event.defaultPrevented,true,'the image-line Enter binding must handle the key')
  const next=f.editor.getValue()
  assert.ok(next.includes('![截图]'),'image must survive Enter')
  assert.equal(next.split('\n').length,original.split('\n').length+1)
 }finally{f.dispose()}
})

test('image selection outline tracks the selection and clears when the caret moves away',()=>{
 const original='# 标题\n\n![截图](data:image/png;base64,QUJD)\n\n正文'
 const f=setup(original);try{
  const view=f.editor.view, figure=f.parent.querySelector('.lexflowEditorImage')
  const from=original.indexOf('![截图]'), to=from+'![截图](data:image/png;base64,QUJD)'.length
  view.dispatch({selection:{anchor:from,head:to}})
  assert.equal(figure.dataset.selected,'true')
  view.dispatch({selection:{anchor:0}})
  assert.equal(figure.dataset.selected,'false')
 }finally{f.dispose()}
})

test('search panel counts the actual match, preserves hidden metadata and replaces in one undo step', () => {
 const original='\uFEFF---\r\ntype: memory\r\n---\r\n\r\nmemory memory\r\n末尾'
 const f=setup(original)
 try {
  f.editor.search()
  const find=f.parent.querySelector('[aria-label="查找"]'), replacement=f.parent.querySelector('[aria-label="替换"]')
  find.value='memory'; find.dispatchEvent(new Event('input',{bubbles:true}))
  assert.equal(f.parent.querySelector('.lexflowSearchCount').textContent,'0 / 2')
  f.parent.querySelector('[aria-label="下一个"]').click()
  assert.equal(f.parent.querySelector('.lexflowSearchCount').textContent,'1 / 2')
  f.parent.querySelector('[aria-label="下一个"]').click()
  assert.equal(f.parent.querySelector('.lexflowSearchCount').textContent,'2 / 2')
  f.parent.querySelector('[aria-label="查找全部"]').click()
  assert.equal(f.editor.view.state.selection.ranges.length,2)
  replacement.value='中文'; replacement.dispatchEvent(new Event('input',{bubbles:true}))
  f.parent.querySelector('[aria-label="替换全部"]').click()
  assert.equal(f.editor.getValue(),original.replace('memory memory','中文 中文'))
  f.editor.undo();assert.equal(f.editor.getValue(),original)
  f.editor.setMode('reading');assert.equal(f.parent.querySelector('[aria-label="替换全部"]').disabled,true)
  f.parent.querySelector('[aria-label="替换全部"]').click();assert.equal(f.editor.getValue(),original)
 }finally{f.dispose()}
})

test('inline mark source reveals only when the cursor is inside that mark', () => {
 const f=setup('**执行阶段**：经用户完成审议后，AI 将结论转化为持久化操作。')
 try {
  const view=f.editor.view
  const showsMark=()=>view.contentDOM.textContent.includes('**')
  view.focus()
  view.dispatch({selection:{anchor:20}})
  assert.equal(showsMark(),false,'plain text on the same line must not reveal the mark source')
  view.dispatch({selection:{anchor:4}})
  assert.equal(showsMark(),true,'cursor inside the bold mark must reveal its source')
 }finally{f.dispose()}
})
