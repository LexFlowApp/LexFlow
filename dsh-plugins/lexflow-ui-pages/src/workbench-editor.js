import { Compartment, EditorState, Annotation, StateField, Transaction } from '@codemirror/state'
import { EditorView, Decoration, WidgetType, keymap, drawSelection } from '@codemirror/view'
import { history, undo, redo, undoDepth, redoDepth, defaultKeymap, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown, markdownLanguage, markdownKeymap } from '@codemirror/lang-markdown'
import { syntaxTree } from '@codemirror/language'
import { searchKeymap, openSearchPanel, search, SearchQuery, setSearchQuery, getSearchQuery, findNext, findPrevious, selectMatches, replaceNext, replaceAll, closeSearchPanel } from '@codemirror/search'
import { inlinePreview, highlightMarkdown, atomicMarkdownSyntax, readOnlyExtension, readOnlyFacet } from '@atomic-editor/editor'
import vendorStyles from '@atomic-editor/editor/styles.css'

const externalSnapshot = Annotation.define()
const normalize = (source) => source.replace(/\r\n?/g, '\n')
const frontmatterEnd = (doc) => doc.toString().match(/^\uFEFF?---\n[\s\S]*?\n---(?:\n|$)/)?.[0].length ?? 0

// Maintain the exact source outside CM's normalized line representation. Only
// changed spans are replaced, preserving BOM, mixed line endings and untouched bytes.
export function rawOffset(source, offset) {
  let raw = 0, normalized = 0
  while (raw < source.length && normalized < offset) {
    if (source[raw] === '\r' && source[raw + 1] === '\n') raw += 2
    else raw += 1
    normalized += 1
  }
  return raw
}
export function applyRawChanges(source, changes, lineSeparator = '\n') {
  const spans = []
  changes.iterChanges((from, to, _fromB, _toB, inserted) => spans.push({ from: rawOffset(source, from), to: rawOffset(source, to), text: inserted.toString().replace(/\n/g, lineSeparator) }))
  for (const span of spans.reverse()) source = source.slice(0, span.from) + span.text + source.slice(span.to)
  return source
}

const theme = EditorView.theme({
  '&': { height: '100%', color: 'var(--lexflow-dsw-alias-label-primary)', backgroundColor: 'transparent', fontSize: '16px' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { overflow: 'auto', lineHeight: '1.85', fontFamily: 'var(--lexflow-font-ui)', overscrollBehavior: 'contain' },
  '.cm-content': { padding: '16px 24px 120px', minHeight: '100%', caretColor: 'var(--lexflow-dsw-alias-label-primary)' },
  '.cm-line': { padding: '0 4px', overflowWrap: 'anywhere' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: 'var(--lexflow-dsw-alias-state-business-tertiary)' },
  '.cm-cursor': { borderLeftColor: 'var(--lexflow-dsw-alias-label-primary)' },
  '.cm-panels': { background: 'transparent', color: 'inherit', border: '0' },
  '.cm-search input, .cm-search button': { fontFamily: 'inherit', color: 'inherit', background: 'transparent', border: '1px solid var(--lexflow-dsw-alias-border-l2)' },
})

const styles = `
.lexflowMarkdownEditor{height:100%;min-height:0;min-width:0;--atomic-editor-font:var(--lexflow-font-ui);--atomic-editor-font-mono:var(--lexflow-font-code);--atomic-editor-body-size:16px;--atomic-editor-body-leading:1.85;--atomic-editor-measure:100%;--atomic-editor-fg:var(--lexflow-dsw-alias-label-primary);--atomic-editor-fg-muted:var(--lexflow-dsw-alias-label-secondary);--atomic-editor-fg-faint:var(--lexflow-dsw-alias-label-tertiary);--atomic-editor-bg:var(--lexflow-dsw-alias-bg-base);--atomic-editor-bg-panel:var(--lexflow-dsw-alias-bg-layer-1);--atomic-editor-bg-surface:var(--lexflow-dsw-alias-bg-layer-1);--atomic-editor-border:var(--lexflow-dsw-alias-border-l2);--atomic-editor-accent:var(--lexflow-dsw-alias-state-business-primary);--atomic-editor-accent-bright:var(--lexflow-highlight-color,#9b8bc0);--atomic-editor-link:var(--lexflow-dsw-alias-state-business-primary);--atomic-editor-code-bg:var(--lexflow-dsw-alias-markdown-code-block);--atomic-editor-selection-bg:var(--lexflow-dsw-alias-state-business-tertiary)}
.lexflowMarkdownEditor .cm-content{box-sizing:border-box;max-width:100%;text-wrap:wrap;padding:16px 24px 120px;min-height:100%}
.lexflowMarkdownEditor .cm-line{overflow:visible;min-height:1.85em}
.lexflowMarkdownEditor .cm-atomic-h1{font-size:1.6em}.lexflowMarkdownEditor .cm-atomic-h2{font-size:1.35em}.lexflowMarkdownEditor .cm-atomic-h3{font-size:1.15em}
.lexflowMarkdownEditor[data-editor-mode=source] .cm-content{font-family:var(--lexflow-font-code)!important;font-size:14px;line-height:1.8}
.lexflowMarkdownEditor[data-editor-mode=reading] .cm-atomic-task-checkbox{pointer-events:none}
.lexflowEditorTable{overflow-x:auto;margin:8px 4px;max-width:100%;cursor:text}.lexflowEditorTable table{border-collapse:collapse;min-width:50%;font:inherit}.lexflowEditorTable td,.lexflowEditorTable th{border:1px solid var(--lexflow-dsw-alias-border-l2);padding:7px 12px;text-align:left;white-space:pre-wrap;min-width:70px}
.lexflowEditorMetadata{font:inherit;font-size:11px;color:var(--lexflow-dsw-alias-label-tertiary);background:transparent;border:0;padding:4px;cursor:pointer}
.lexflowMarkdownEditor .cm-search{background:transparent;border:0;box-shadow:none;display:flex;flex-direction:column;gap:6px;padding:8px 0;font-size:12px}.lexflowSearchRow{display:flex;align-items:center;flex-wrap:wrap;gap:6px}.lexflowMarkdownEditor .cm-search input:not([type=checkbox]){flex:1;min-width:110px;background:transparent;border:1px solid var(--lexflow-dsw-alias-border-l2);border-radius:14px;color:inherit;font:inherit;height:28px;padding:0 10px}.lexflowMarkdownEditor .cm-search button{background:transparent;border:0;border-radius:14px;color:inherit;font:inherit;cursor:pointer;height:28px;padding:0 6px}.lexflowMarkdownEditor .cm-search button:hover,.lexflowMarkdownEditor .cm-search button:focus-visible{color:var(--lexflow-dsw-alias-state-business-primary);outline:1px solid currentColor}.lexflowMarkdownEditor .cm-search button:disabled{opacity:.4;cursor:default}.lexflowSearchCount{min-width:40px;white-space:nowrap}.lexflowMarkdownEditor .cm-search label{display:inline-flex;align-items:center;gap:4px;margin-right:12px}.lexflowMarkdownEditor .cm-search details summary{cursor:pointer;color:var(--lexflow-dsw-alias-label-secondary)}

.lexflowEditorImage{max-width:100%;padding:8px 4px}.lexflowEditorImage[data-selected=true]{outline:2px solid var(--lexflow-dsw-alias-state-business-primary);outline-offset:2px;border-radius:6px}.lexflowEditorImage img{max-width:100%;max-height:500px;object-fit:contain}.lexflowEditorImage figcaption{font-size:12px;color:var(--lexflow-dsw-alias-label-tertiary)}
/* CodeMirror measures block widget boxes without margins. The browser's
   default figure margins otherwise shift every following line's hit target. */
.lexflowEditorImage{margin-block:0}
@media(max-width:760px){.lexflowMarkdownEditor .cm-content{padding:12px 8px 100px}}
`

class MetadataWidget extends WidgetType {
  constructor(onSource) { super(); this.onSource = onSource }
  eq() { return true }
  toDOM() {
    const button = document.createElement('button')
    button.className = 'lexflowEditorMetadata'; button.type = 'button'
    button.textContent = '文档属性'; button.title = '在源码模式中查看文档属性'
    button.addEventListener('click', () => this.onSource())
    return button
  }
  ignoreEvent() { return true }
}
class TableWidget extends WidgetType {
  constructor(source, from, to) { super(); this.source = source; this.from = from; this.to = to }
  eq(other) { return this.source === other.source && this.from === other.from && this.to === other.to }
  toDOM(view) {
    const wrapper = document.createElement('div'); wrapper.className = 'lexflowEditorTable'
    const table = document.createElement('table'); wrapper.appendChild(table)
    const rows = this.source.split('\n')
    let offset = this.from
    rows.forEach((line, index) => {
      const start = offset; offset += line.length + 1
      if (/^[\s|:\-]+$/.test(line)) return
      const tr = document.createElement('tr')
      // Only render cells; editing always uses the unchanged Markdown source.
      const cells = line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split(/(?<!\\)\|/)
      cells.forEach((cell) => { const td = document.createElement(index === 0 ? 'th' : 'td'); td.textContent = cell.trim(); tr.appendChild(td) })
      tr.addEventListener('mousedown', (event) => {
        if (view.state.readOnly) return
        event.preventDefault()
        view.dispatch({ selection: { anchor: Math.min(this.to, start + 2) }, scrollIntoView: true }); view.focus()
      })
      table.appendChild(tr)
    })
    return wrapper
  }
  ignoreEvent() { return true }
}
class ImageWidget extends WidgetType {
  // lineFrom anchors the block widget; from/to is the markdown range that the
  // block selection (and the selected outline) tracks.
  constructor(lineFrom, from, to, href, alt, resolveImage) { super(); this.lineFrom = lineFrom; this.from = from; this.to = to; this.href = href; this.alt = alt; this.resolveImage = resolveImage }
  eq(other) { return this.lineFrom === other.lineFrom && this.from === other.from && this.to === other.to && this.href === other.href && this.alt === other.alt }
  toDOM(view) {
    const figure = document.createElement('figure'); figure.className = 'lexflowEditorImage'
    figure.dataset.from = String(this.from); figure.dataset.to = String(this.to)
    figure.dataset.selected = String(view.state.selection.ranges.some((range) => range.from <= this.to && range.to >= this.from))
    const caption = document.createElement('figcaption'); caption.textContent = this.alt || '图片'; figure.appendChild(caption)
    // Local document service only: no remote image fetch or file:// access.
    Promise.resolve(this.resolveImage?.(this.href)).then((src) => {
      if (!figure.isConnected || !/^data:image\/(png|jpeg|gif|webp);base64,/.test(src ?? '')) return
      const image = document.createElement('img'); image.alt = this.alt; image.src = src
      image.onload = () => view.requestMeasure(); figure.prepend(image)
    }).catch(() => {})
    figure.addEventListener('mousedown', (event) => {
      if (view.state.readOnly) return
      event.preventDefault()
      view.dispatch({ selection: { anchor: this.from, head: this.to } })
      view.focus()
    })
    return figure
  }
  ignoreEvent() { return true }
}

function createLexFlowSearchPanel(view, matchAllowed) {
  let composing = false
  const find = document.createElement('input'); find.className = 'lexflowSearchFindInput'; find.placeholder = '查找'; find.setAttribute('aria-label', '查找'); find.setAttribute('main-field', 'true')
  const replace = document.createElement('input'); replace.className = 'lexflowSearchReplaceInput'; replace.placeholder = '替换'; replace.setAttribute('aria-label', '替换')
  const count = document.createElement('span'); count.className = 'lexflowSearchCount'; count.setAttribute('aria-live', 'polite')
  const makeButton = (label, className, command) => { const button = document.createElement('button'); button.type = 'button'; button.className = className; button.textContent = label; button.title = label; button.setAttribute('aria-label', label); button.addEventListener('click', () => { if (!composing && (!className.includes('Replace') || !view.state.readOnly)) { command(view); if (command === closeSearchPanel) view.focus() } }); return button }
  const caseField = document.createElement('input'); caseField.type = 'checkbox'; const caseLabel = document.createElement('label'); caseLabel.className = 'lexflowSearchCase'; caseLabel.append(caseField, '区分大小写')
  const regexpField = document.createElement('input'); regexpField.type = 'checkbox'; const regexpLabel = document.createElement('label'); regexpLabel.className = 'lexflowSearchRegexp'; regexpLabel.append(regexpField, '正则')
  const wordField = document.createElement('input'); wordField.type = 'checkbox'; const wordLabel = document.createElement('label'); wordLabel.className = 'lexflowSearchWord'; wordLabel.append(wordField, '完整词')
  const updateCount = () => {
    const query = getSearchQuery(view.state); let total = 0, current = 0
    if (query.valid && query.search) { const cursor = query.getCursor(view.state); for (let match = cursor.next(); !match.done; match = cursor.next()) { total++; if (match.value.from === view.state.selection.main.from && match.value.to === view.state.selection.main.to) current = total } }
    count.textContent = query.search && !query.valid ? '无效正则表达式' : `${current} / ${total}`
    for (const button of dom.querySelectorAll('[class*=lexflowSearchReplace]')) button.disabled = view.state.readOnly
    replace.disabled = view.state.readOnly
  }
  const commit = () => { if (composing) return; const query = new SearchQuery({ search: find.value, replace: replace.value, caseSensitive: caseField.checked, regexp: regexpField.checked, wholeWord: wordField.checked, test: matchAllowed }); if (!query.eq(getSearchQuery(view.state))) view.dispatch({ effects: setSearchQuery.of(query) }); updateCount() }
  const sync = (query) => { find.value = query.search; replace.value = query.replace; caseField.checked = query.caseSensitive; regexpField.checked = query.regexp; wordField.checked = query.wholeWord; updateCount() }
  const onCompositionStart = () => { composing = true }
  const onCompositionEnd = () => { composing = false; commit() }
  for (const field of [find, replace]) { field.addEventListener('input', commit); field.addEventListener('compositionstart', onCompositionStart); field.addEventListener('compositionend', onCompositionEnd); field.addEventListener('keydown', (event) => { if (event.isComposing || event.keyCode === 229) return; if (event.key === 'Enter') { event.preventDefault(); (event.shiftKey ? findPrevious : findNext)(view) }; if (event.key === 'Escape') { event.preventDefault(); closeSearchPanel(view); view.focus() } }) }
  for (const field of [caseField, regexpField, wordField]) field.addEventListener('change', commit)
  const dom = document.createElement('div'); dom.className = 'cm-search'
  const first = document.createElement('div'); first.className = 'lexflowSearchRow'; first.append(find, count, makeButton('上一个', 'lexflowSearchPrevious', findPrevious), makeButton('下一个', 'lexflowSearchNext', findNext), makeButton('查找全部', 'lexflowSearchFindAll', selectMatches), makeButton('关闭搜索', 'lexflowSearchClose', closeSearchPanel))
  const second = document.createElement('div'); second.className = 'lexflowSearchRow'; second.append(replace, makeButton('替换', 'lexflowSearchReplaceCurrent', replaceNext), makeButton('替换全部', 'lexflowSearchReplaceAll', replaceAll))
  const options = document.createElement('details'); const summary = document.createElement('summary'); summary.textContent = '查找选项'; options.append(summary, caseLabel, regexpLabel, wordLabel)
  dom.append(first, second, options)

  return { dom, top: true, mount() { sync(getSearchQuery(view.state)); find.focus(); find.select() }, update(update) { if (update.docChanged || update.selectionSet || update.transactions.some((transaction) => transaction.effects.some((effect) => effect.is(setSearchQuery)))) sync(getSearchQuery(view.state)) } }
}

export function createWorkbenchEditor(parent, options = {}) {
  const style = document.createElement('style'); style.dataset.lexflowEditor = 'true'; style.dataset.plugin = '@lexflow/ui-pages'; style.textContent = vendorStyles + '\n' + styles
  parent.appendChild(style)
  const mount = document.createElement('div'); mount.className = 'atomic-cm-editor lexflowMarkdownEditor'; parent.appendChild(mount)
  let raw = String(options.content ?? '')
  const newline = raw.includes('\r\n') ? '\r\n' : '\n'
  let mode = options.mode ?? 'live', pendingMode = null, destroyed = false
  const display = new Compartment(), locking = new Compartment()
  let view
  const hasSelection = (state, from, to) => state.selection.ranges.some((range) => range.from <= to && range.to >= from)
  const blocks = StateField.define({
    create: (state) => decorate(state),
    update: (value, tr) => tr.docChanged || tr.selection || tr.reconfigured ? decorate(tr.state) : value,
    provide: (field) => EditorView.decorations.from(field),
  })
  function decorate(state) {
    const ranges = [], ro = state.facet(readOnlyFacet), end = frontmatterEnd(state.doc), source = mode === 'source'
    // Source mode keeps frontmatter and tables as raw text so they stay
    // editable; only images are always rendered (their base64 must never show).
    if (end > 0 && !source) ranges.push(Decoration.replace({ widget: new MetadataWidget(() => api.setMode('source')), block: true }).range(0, end - (state.doc.sliceString(end - 1, end) === '\n' ? 1 : 0)))
    syntaxTree(state).iterate({ enter(node) {
      if (node.to <= end) return false
      if (node.name === 'Table' && !source && (ro || !hasSelection(state, node.from, node.to))) {
        ranges.push(Decoration.replace({ widget: new TableWidget(state.doc.sliceString(node.from, node.to), node.from, node.to), block: true }).range(node.from, node.to)); return false
      }
      if (node.name === 'Image') {
        const match = state.doc.sliceString(node.from, node.to).match(/^!\[([^\]]*)\]\(([^)]+)\)$/)
        if (match) {
          // Render the image as a block widget pinned to its source line and
          // hide the markdown with a zero-width replace. Replacing the whole
          // line with the widget (the previous approach) made that line inherit
          // the image height, which produced a full-height caret, broke
          // click-to-line mapping and let Enter overwrite the atomic range.
          const line = state.doc.lineAt(node.from)
          ranges.push(Decoration.widget({ widget: new ImageWidget(line.from, node.from, node.to, match[2], match[1], options.resolveImage), block: true, side: -1 }).range(line.from))
          ranges.push(Decoration.replace({}).range(node.from, node.to))
        }
      }
    } })
    return Decoration.set(ranges, true)
  }
  // Source mode keeps rendering images: the raw `![alt](data:...)` must never
  // surface as an unreadable base64 blob, including after 文档属性 is clicked.
  const preview = () => mode === 'source' ? [blocks] : [inlinePreview({ onLinkClick: (url) => options.onLink?.(url) }), blocks]
  const matchAllowed = (_match, state, from) => mode === 'source' || from >= frontmatterEnd(state.doc)
  const notify = () => options.onState?.({ undo: undoDepth(view.state) > 0, redo: redoDepth(view.state) > 0, mode, line: view.state.doc.lineAt(view.state.selection.main.head).number, focused: view.hasFocus })
  const canWrite = () => !view.state.readOnly && !view.composing
  const edit = (spec) => { if (!canWrite()) return false; view.dispatch({ ...spec, userEvent: 'input', scrollIntoView: true }); view.focus(); return true }
  const api = {
    get view() { return view },
    getValue: () => raw,
    composing: () => view.composing,
    focus: () => { if (!view.state.readOnly) view.focus() },
    setMode(next) {
      if (!['live', 'source', 'reading'].includes(next)) return
      if (view.composing) { pendingMode = next; return }
      const top = view.scrollDOM.scrollTop, left = view.scrollDOM.scrollLeft
      mode = next; mount.dataset.editorMode = mode
      const query = getSearchQuery(view.state)
      view.dispatch({ effects: [display.reconfigure(preview()), locking.reconfigure(readOnlyExtension(mode === 'reading')), setSearchQuery.of(new SearchQuery({ ...query, test: (_text, state, from) => matchAllowed(_text, state, from) }))] })
      view.scrollDOM.scrollTop = top; view.scrollDOM.scrollLeft = left
      notify()
    },
    setValue(next) {
      next = String(next)
      if (next === raw) return
      if (view.composing) return
      raw = next
      const head = Math.min(view.state.selection.main.head, normalize(next).length)
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: normalize(next) }, selection: { anchor: head }, annotations: [externalSnapshot.of(true), Transaction.addToHistory.of(false)] })
    },
    undo() { if (canWrite()) { undo(view); view.focus() } },
    redo() { if (canWrite()) { redo(view); view.focus() } },
    search() { openSearchPanel(view) },
    inline(before, after = before) {
      const { from, to } = view.state.selection.main
      const doc = view.state.doc, selected = doc.sliceString(from, to)
      let start = from, end = to, text, anchor, head
      if (from >= before.length && doc.sliceString(from - before.length, from) === before && doc.sliceString(to, to + after.length) === after) {
        start -= before.length; end += after.length; text = selected; anchor = start; head = start + selected.length
      } else if (selected.startsWith(before) && selected.endsWith(after) && selected.length >= before.length + after.length) {
        text = selected.slice(before.length, -after.length); anchor = start; head = start + text.length
      } else { text = before + selected + after; anchor = start + before.length; head = anchor + selected.length }
      edit({ changes: { from: start, to: end, insert: text }, selection: { anchor, head } })
    },
    linePrefix(prefix, heading = false) {
      const { from, to } = view.state.selection.main, doc = view.state.doc
      const first = doc.lineAt(from), last = doc.lineAt(to > from && doc.sliceString(to - 1, to) === '\n' ? to - 1 : to)
      const lines = []
      for (let n = first.number; n <= last.number; n++) lines.push(doc.line(n))
      const remove = !heading && lines.every((line) => line.text.startsWith(prefix))
      const changes = lines.map((line, index) => {
        const old = heading ? line.text.match(/^#{1,6}\s+/)?.[0] ?? '' : remove ? prefix : ''
        const insert = remove ? '' : prefix === '1. ' ? (index + 1) + '. ' : prefix
        return { from: line.from, to: line.from + old.length, insert }
      })
      const delta = changes[0].insert.length - (changes[0].to - changes[0].from)
      edit({ changes, selection: { anchor: Math.max(first.from + changes[0].insert.length, from + delta) } })
    },
    insertAtCursor(text, target = null) {
      const head = target ?? view.state.selection.main.head, line = view.state.doc.lineAt(head)
      const at = Math.min(Math.max(target ?? view.state.selection.main.head, line.from), line.to)
      const prefix = target !== null ? '\n' : (line.text.trim() ? '\n' : '')
      edit({ changes: { from: at, to: target !== null && line.text.trim() === '' ? line.to : at, insert: prefix + text + '\n' }, selection: { anchor: at + prefix.length + text.length } })
    },
    cursorAt(coords) {
      const position = view.posAtCoords(coords)
      if (position === null) return null
      const line = view.state.doc.lineAt(position)
      return { lineStart: line.from, lineEnd: line.to, lineNumber: line.number }
    },
    destroy() { destroyed = true; view.destroy(); mount.remove(); style.remove() },
  }
  const prefix = frontmatterEnd(EditorState.create({ doc: normalize(raw) }))
  view = new EditorView({ parent: mount, state: EditorState.create({
    doc: normalize(raw), selection: { anchor: prefix },
    extensions: [
      history(), drawSelection(), EditorView.lineWrapping, EditorState.allowMultipleSelections.of(true),
      markdown({ base: markdownLanguage, extensions: highlightMarkdown }), atomicMarkdownSyntax,
      search({ top: true, createPanel: (view) => createLexFlowSearchPanel(view, matchAllowed) }),
      // Enter on an image line inserts a fresh line after the image instead of
      // letting the default binding replace the selected atomic range (which
      // silently deleted the image). Registered first so it wins over defaultKeymap.
      keymap.of([{ key: 'Enter', run: (editorView) => {
        const selection = editorView.state.selection.main, line = editorView.state.doc.lineAt(selection.head)
        if (!/^!\[[^\]]*\]\([^)]+\)$/u.test(line.text)) return false
        const at = Math.max(line.to, selection.to)
        editorView.dispatch({ changes: { from: at, insert: '\n' }, selection: { anchor: at + 1 }, userEvent: 'input', scrollIntoView: true })
        return true
      } }, ...historyKeymap, ...searchKeymap, ...markdownKeymap, indentWithTab, ...defaultKeymap]),
      theme, display.of(preview()), locking.of(readOnlyExtension(mode === 'reading')),
      EditorView.contentAttributes.of({ 'aria-label': 'Markdown 正文编辑器', spellcheck: 'false' }),
      EditorState.changeFilter.of((tr) => {
        if (tr.annotation(externalSnapshot)) return true
        if (tr.startState.readOnly && tr.docChanged) return false
        // Metadata is editable in source mode only; Backspace from the first body
        // line cannot consume hidden type/other file properties.
        const end = mode === 'source' ? 0 : frontmatterEnd(tr.startState.doc)
        return end ? [0, end] : true
      }),
      EditorView.domEventHandlers({
        compositionend() { setTimeout(() => { if (!destroyed && pendingMode) { const next = pendingMode; pendingMode = null; api.setMode(next) } }, 0); return false },
        blur() { options.onBlur?.() },
        mousedown(event, editorView) {
          if (view.state.readOnly || event.button !== 0) return false
          const position = editorView.posAtCoords({ x: event.clientX, y: event.clientY })
          if (position === null) return false
          const doc = editorView.state.doc
          const line = doc.lineAt(position)
          if (event.detail === 1) return false
          event.preventDefault()
          if (event.detail === 2) {
            let start = line.from, end = line.to
            if (line.text.trim()) {
              let cursor = line.number
              while (cursor > 1) { const previous = doc.line(cursor - 1); if (!previous.text.trim()) break; start = previous.from; cursor -= 1 }
              cursor = line.number
              while (cursor < doc.lines) { const following = doc.line(cursor + 1); if (!following.text.trim()) break; end = following.to; cursor += 1 }
            }
            editorView.dispatch({ selection: { anchor: start, head: end } })
          } else if (event.detail >= 3) {
            // Triple click selects the whole document (detail keeps incrementing
            // while the user clicks, so treat three or more as the same gesture).
            editorView.dispatch({ selection: { anchor: 0, head: doc.length } })
          }
          view.lastClickLine = line.number
          editorView.focus()
          return true
        },
        dragover(event) {
          if (!options.onDropImage || view.state.readOnly || !Array.from(event.dataTransfer?.types ?? []).includes('Files')) return false
          event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; return true
        },
        drop(event) {
          const files = Array.from(event.dataTransfer?.files ?? []).filter((file) => /^image\/(?:png|jpeg|gif|webp)$/u.test(file.type))
          if (!options.onDropImage || view.state.readOnly || !files.length) return false
          event.preventDefault()
          const position = view.posAtCoords({ x: event.clientX, y: event.clientY })
          const line = position === null ? null : view.state.doc.lineAt(position)
          options.onDropImage(files, line ? line.from : null)
          return true
        },
      }),
      EditorView.atomicRanges.of((currentView) => {
        const ranges = []
        syntaxTree(currentView.state).iterate({ enter(node) {
          if (node.name === 'Image') ranges.push(Decoration.replace({}).range(node.from, node.to))
        } })
        return Decoration.set(ranges, true)
      }),
      EditorView.updateListener.of((update) => {
        // Track the atomic selection on the image itself so the outline clears
        // as soon as the caret moves elsewhere.
        if (update.selectionSet || update.docChanged) {
          const ranges = update.state.selection.ranges
          for (const figure of update.view.contentDOM.querySelectorAll('.lexflowEditorImage')) {
            const from = Number(figure.dataset.from), to = Number(figure.dataset.to)
            figure.dataset.selected = String(ranges.some((range) => range.from <= to && range.to >= from))
          }
        }
        if (update.docChanged && !update.transactions.some((tr) => tr.annotation(externalSnapshot))) {
          raw = applyRawChanges(raw, update.changes, newline); options.onChange?.(raw)
        }
        notify()
      }),
    ],
  }) })
  mount.dataset.editorMode = mode
  notify()
  return api
}
