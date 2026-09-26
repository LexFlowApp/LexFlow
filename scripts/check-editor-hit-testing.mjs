// Run against an open LexFlow editor: node scripts/check-editor-hit-testing.mjs 9222
// Start LexFlow with --remote-debugging-port=9222. Only clicks/scrolls; no edits.
import assert from 'node:assert/strict'

const port = Number(process.argv[2] || 9222)
const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
const page = pages.find(item => item.type === 'page' && item.title === 'LexFlow')
assert.ok(page, 'Open the LexFlow document editor first')
const socket = new WebSocket(page.webSocketDebuggerUrl)
const pending = new Map()
let sequence = 0
socket.onmessage = event => {
  const message = JSON.parse(event.data)
  pending.get(message.id)?.(message)
  pending.delete(message.id)
}
await new Promise(resolve => { socket.onopen = resolve })
const send = (method, params = {}) => new Promise(resolve => {
  const id = ++sequence
  pending.set(id, resolve)
  socket.send(JSON.stringify({ id, method, params }))
})
const evaluate = async expression => {
  const message = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  assert.ok(!message.error && !message.result?.exceptionDetails, 'Application evaluation failed')
  return message.result.result.value
}
const settle = () => new Promise(resolve => setTimeout(resolve, 150))
try {
  await evaluate(`(() => {
    const line = document.querySelector('.lexflowMarkdownEditor .cm-line');
    if (!line) throw Error('Open the document editor');
    let tile = line.cmTile; while (tile && !tile.view) tile = tile.parent;
    const view = tile.view;
    window.__lfHitCheck = {view, text:view.state.doc.toString(), selection:view.state.selection,
      scroll:view.scrollDOM.scrollTop, active:document.activeElement};
  })()`)
  const failures = []
  let checked = 0
  for (const fraction of [0, 0.5, 1]) {
    await evaluate(`(() => {const v=window.__lfHitCheck.view; v.scrollDOM.scrollTop=(v.scrollDOM.scrollHeight-v.scrollDOM.clientHeight)*${fraction}; v.requestMeasure()})()`)
    await settle()
    const count = await evaluate('window.__lfHitCheck.view.contentDOM.querySelectorAll(".cm-line").length')
    for (let index = 0; index < count; index++) {
      // Re-read rectangles after each click: active Markdown can change layout.
      const target = await evaluate(`(() => {
        const v=window.__lfHitCheck.view, el=v.contentDOM.querySelectorAll('.cm-line')[${index}];
        if (!el || !v.dom.isConnected) return null;
        const r=el.getBoundingClientRect(), s=v.scrollDOM.getBoundingClientRect();
        const x=r.left+8, y=r.top+r.height/2;
        if(y<s.top+2 || y>s.bottom-2 || y<0 || y>=innerHeight) return null;
        if(!el.contains(document.elementFromPoint(x,y))) return null;
        return {x,y,expected:v.state.doc.lineAt(v.posAtDOM(el)).number};
      })()`)
      if (!target) continue
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x:target.x, y:target.y, button:'left', buttons:1, clickCount:1 })
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x:target.x, y:target.y, button:'left', buttons:0, clickCount:1 })
      await settle()
      const actual = await evaluate('window.__lfHitCheck.view.state.doc.lineAt(window.__lfHitCheck.view.state.selection.main.head).number')
      checked++
      if (actual !== target.expected) failures.push({ fraction, expected: target.expected, actual })
    }
  }
  const unchanged = await evaluate('window.__lfHitCheck.text === window.__lfHitCheck.view.state.doc.toString()')
  console.log(JSON.stringify({ checked, failures, unchanged }))
  assert.ok(checked > 0, 'No visible lines tested')
  assert.ok(unchanged, 'Document must remain unchanged')
  assert.equal(failures.length, 0, 'Clicks landed on the wrong line')
} finally {
  await evaluate(`(() => {const s=window.__lfHitCheck;if(s?.view.dom.isConnected){s.view.dispatch({selection:s.selection});s.view.scrollDOM.scrollTop=s.scroll;s.active?.focus()}delete window.__lfHitCheck})()`)
  socket.close()
}
