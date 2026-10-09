window.__ModuleLoader__.load({
  id: '@lexflow/ui-pages',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    const React = require('react')
    const { createWorkbenchEditor } = require('@lexflow/workbench-editor')
    const { jsx, jsxs, Fragment } = require('react/jsx-runtime')
    const { createPortal } = require('react-dom')

    const DocumentContext = React.createContext(null)
    const DEFAULT_HIGHLIGHT_COLOR = '#9b8bc0'
    const HIGHLIGHT_COLORS = [
      { name: '紫色', value: '#9b8bc0' },
      { name: '黄色', value: '#c9b458' },
      { name: '绿色', value: '#84ae7c' },
      { name: '蓝色', value: '#7d9cc0' },
      { name: '粉红', value: '#c48b9f' },
    ]
    const button = { background: 'var(--lexflow-dsw-alias-button-elevated-fill)', border: '1px solid var(--lexflow-dsw-alias-border-l2)', borderRadius: '7px', color: 'var(--lexflow-dsw-alias-label-primary)', cursor: 'pointer', font: 'inherit', padding: '7px 10px' }
    const toolButton = { ...button, fontSize: '12px', padding: '5px 8px' }
    const input = { background: 'var(--lexflow-dsw-alias-bg-base)', border: '1px solid var(--lexflow-dsw-alias-border-l2)', borderRadius: '7px', color: 'var(--lexflow-dsw-alias-label-primary)', font: 'inherit', padding: '8px 10px' }
    let requestOverride
    let navigateOverride = (page, document) => window.dispatchEvent(new CustomEvent('lexflow:navigate', { detail: { page, document: document ?? null } }))
    let pickDirectoryOverride
    let useFileOverride
    let currentSessionIdOverride

    function configure(options = {}) {
      if (typeof options.request === 'function') requestOverride = options.request
      if (typeof options.navigate === 'function') navigateOverride = options.navigate
      if (typeof options.pickDirectory === 'function') pickDirectoryOverride = options.pickDirectory
      if (typeof options.useFile === 'function') useFileOverride = options.useFile
      if (typeof options.currentSessionId === 'function') currentSessionIdOverride = options.currentSessionId
    }
    async function api(action, payload = {}) {
      if (requestOverride) return requestOverride(action, payload)
      const response = await fetch('/lexflow-api', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, ...payload }) })
      const data = await response.json()
      if (!response.ok || !data.ok) throw new Error(data.error || '操作失败。')
      return data.value
    }
    async function fileToBase64(file) {
      const bytes = new Uint8Array(await file.arrayBuffer())
      let binary = ''
      const chunkSize = 0x8000
      for (let index = 0; index < bytes.length; index += chunkSize) binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
      return btoa(binary)
    }
    function go(page, document) { navigateOverride(page, document) }
    function typeLabel(type) { return type === 'workflow' ? '工作流' : type === 'memory' ? '长期记忆' : type === 'agent' ? '全局规则' : 'Markdown' }
    function SearchIcon() { return jsx('svg', { 'aria-hidden': true, fill: 'none', height: 16, viewBox: '0 0 16 16', width: 16, children: [jsx('circle', { cx: 7, cy: 7, r: 4.2, stroke: 'currentColor', strokeWidth: 1.4 }, 'circle'), jsx('path', { d: 'm10.2 10.2 3.1 3.1', stroke: 'currentColor', strokeLinecap: 'round', strokeWidth: 1.4 }, 'handle')] }) }
    function FilterIcon() { return jsx('svg', { 'aria-hidden': true, fill: 'none', height: 16, viewBox: '0 0 16 16', width: 16, children: jsx('path', { d: 'M2.5 3.5h11L9.2 8.1v4.4l-2.4 1V8.1L2.5 3.5Z', stroke: 'currentColor', strokeLinejoin: 'round', strokeWidth: 1.25 }) }) }
    function PlusIcon() { return jsx('svg', { 'aria-hidden': true, fill: 'none', height: 16, viewBox: '0 0 16 16', width: 16, children: jsx('path', { d: 'M8 3v10M3 8h10', stroke: 'currentColor', strokeLinecap: 'round', strokeWidth: 1.4 }) }) }
    function ChevronIcon({ expanded = false }) { return jsx('span', { className: 'lexflowWorkflowChevron', 'data-expanded': expanded, 'aria-hidden': true, children: '›' }) }
    function FolderIcon({ open = false }) { return jsxs('svg', { 'aria-hidden': true, fill: open ? 'currentColor' : 'none', height: 18, viewBox: '0 0 16 16', width: 18, children: [jsx('path', { d: 'M2.2 4.6c0-.8.6-1.4 1.4-1.4h2.3l1.3 1.5h5.2c.8 0 1.4.6 1.4 1.4v5.1c0 .8-.6 1.4-1.4 1.4H3.6c-.8 0-1.4-.6-1.4-1.4V4.6Z', fill: open ? 'currentColor' : 'none', stroke: 'currentColor', strokeLinejoin: 'round', strokeWidth: 1.2 }), open && jsx('path', { d: 'M2.7 6.1h10.6', stroke: 'var(--lexflow-dsw-alias-bg-base)', strokeWidth: 1 })] }) }
    function WorkflowFileIcon() { return jsxs('svg', { 'aria-hidden': true, fill: 'none', height: 15, viewBox: '0 0 18 18', width: 15, children: [jsx('rect', { x: 2.5, y: 2.5, width: 5, height: 5, rx: 1.2, stroke: 'currentColor', strokeWidth: 1.25 }), jsx('rect', { x: 10.5, y: 10.5, width: 5, height: 5, rx: 1.2, stroke: 'currentColor', strokeWidth: 1.25 }), jsx('path', { d: 'M7.5 5H11a2 2 0 0 1 2 2v3.5M5 7.5V13h5.5', stroke: 'currentColor', strokeLinecap: 'round', strokeWidth: 1.25 })] }) }
    function MemoryFileIcon() { return jsxs('svg', { 'aria-hidden': true, fill: 'none', height: 15, viewBox: '0 0 18 18', width: 15, children: [jsx('path', { d: 'M3.2 5.2c0-1.1.9-2 2-2h7.6c1.1 0 2 .9 2 2v7.6c0 1.1-.9 2-2 2H5.2c-1.1 0-2-.9-2-2V5.2Z', stroke: 'currentColor', strokeWidth: 1.25 }), jsx('path', { d: 'M6 7.1h6M6 10h4.2', stroke: 'currentColor', strokeLinecap: 'round', strokeWidth: 1.25 }), jsx('circle', { cx: 13.1, cy: 12.8, fill: 'currentColor', r: 1.1 })] }) }
    function CloseIcon() { return jsx('svg', { 'aria-hidden': true, fill: 'none', height: 16, viewBox: '0 0 16 16', width: 16, children: jsx('path', { d: 'm4 4 8 8M12 4l-8 8', stroke: 'currentColor', strokeLinecap: 'round', strokeWidth: 1.45 }) }) }
    function EditIcon() { return jsx('svg', { 'aria-hidden': true, fill: 'none', height: 16, viewBox: '0 0 16 16', width: 16, children: jsx('path', { d: 'm3.2 11.9-.5 2.4 2.4-.5L12.8 6a1.4 1.4 0 0 0-2-2l-7.6 7.9ZM9.8 4.9l1.3 1.3', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 1.25 }) }) }
    function SelectIcon() { return jsx('svg', { 'aria-hidden': true, fill: 'none', height: 16, viewBox: '0 0 16 16', width: 16, children: [jsx('rect', { x: 2.5, y: 2.5, width: 11, height: 11, rx: 2.5, stroke: 'currentColor', strokeWidth: 1.3 }, 'box'), jsx('path', { d: 'm5.3 8.2 1.9 1.9 3.7-4.1', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 1.4 }, 'check')] }) }
    function SaveIcon() { return jsx('svg', { 'aria-hidden': true, fill: 'none', height: 16, viewBox: '0 0 16 16', width: 16, children: [jsx('path', { d: 'M3 2.8h8.2L13 4.6v8.6H3V2.8Z', stroke: 'currentColor', strokeLinejoin: 'round', strokeWidth: 1.2 }), jsx('path', { d: 'M5.1 3.1v3.3h5.2V3.1M5.1 13.2v-3.5h5.8v3.5', stroke: 'currentColor', strokeWidth: 1.2 })] }) }
    function BackIcon() { return jsx('svg', { 'aria-hidden': true, fill: 'none', height: 20, viewBox: '0 0 20 20', width: 20, children: jsx('path', { d: 'M8 4 2 10l6 6M2 10h16', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 1.35 }) }) }
    function PreviewLockIcon({ locked = false }) { return jsxs('svg', { 'aria-hidden': true, fill: 'none', height: 16, viewBox: '0 0 16 16', width: 16, children: [jsx('path', { d: 'M2.8 4.2h10.4v7.6H2.8z', stroke: 'currentColor', strokeLinejoin: 'round', strokeWidth: 1.25 }), jsx('path', { d: locked ? 'm5 8 1.9 1.8L11 5.8' : 'M5.2 6.2h5.6M5.2 8.1h5.6', stroke: 'currentColor', strokeLinecap: 'round', strokeWidth: 1.25 })] }) }
    function parentPath(value) { const index = String(value).lastIndexOf('/'); return index < 0 ? '.' : String(value).slice(0, index) || '.' }
    function pathLabel(value) { return value === '.' || value === '' ? '知识库根目录' : value }
    function dateLabel(value) { try { return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) } catch { return '未知时间' } }
    function displayName(node) { return node.builtin ? node.name : node.kind === 'file' ? node.name.replace(/\.md$/iu, '') : node.name }
    function safeTitle(value) { return String(value ?? '').trim().replace(/[\\/:*?"<>|]/gu, '－').replace(/\s+/gu, ' ').slice(0, 90) }
    function documentTitleOf(item) { return String(item?.title || item?.name || '').replace(/\.md$/iu, '') }
    function KnowledgeBaseSelector({ status, onSelect, onChoose }) {
      const [open, setOpen] = React.useState(false)
      const ref = React.useRef(null)
      React.useEffect(() => {
        const close = (event) => { if (!ref.current?.contains(event.target)) setOpen(false) }
        const escape = (event) => { if (event.key === 'Escape') setOpen(false) }
        document.addEventListener('mousedown', close)
        document.addEventListener('keydown', escape)
        return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', escape) }
      }, [])
      const active = status?.knowledgeBases?.find((item) => item.active) ?? { name: status?.rootName || '知识库' }
      return jsxs('div', { ref, className: 'lexflowKnowledgeBaseSelector', children: [
        jsx('button', { type: 'button', className: 'lexflowKnowledgeBaseButton', 'aria-expanded': open, 'aria-haspopup': 'listbox', onClick: () => setOpen((value) => !value), children: [jsx(ChevronIcon, { expanded: open }, 'chevron'), jsx('span', { children: active.name }, 'name')] }, 'button'),
        open && jsxs('div', { className: 'lexflowKnowledgeBaseMenu', role: 'listbox', children: [
          (status?.knowledgeBases ?? []).map((item) => jsx('button', { type: 'button', role: 'option', 'aria-selected': item.active, disabled: !item.valid, className: 'lexflowKnowledgeBaseOption', 'data-active': item.active, onClick: async () => { if (item.active || !item.valid) return; await onSelect(item.id); setOpen(false) }, children: [jsx('span', { children: item.name }, 'name'), item.active && jsx('span', { className: 'lexflowKnowledgeBaseCheck', children: '✓' }, 'check'), !item.valid && jsx('small', { children: '路径失效' }, 'invalid')] }, item.id)),
          jsx('button', { type: 'button', className: 'lexflowKnowledgeBaseChoose', onClick: () => { setOpen(false); onChoose() }, children: '选择其他知识库…' }, 'choose'),
        ] }),
      ] })
    }
    function AppSelect({ value, options, onChange, ariaLabel, className = '', disabled = false, placeholder = '', title }) {
      const [open, setOpen] = React.useState(false)
      const ref = React.useRef(null)
      React.useEffect(() => {
        if (!open) return
        const close = (event) => { if (!ref.current?.contains(event.target)) setOpen(false) }
        const escape = (event) => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false) } }
        document.addEventListener('mousedown', close)
        document.addEventListener('keydown', escape)
        return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', escape) }
      }, [open])
      const current = options.find((option) => option.value === value)
      return jsxs('div', { ref, className: 'lexflowSelect' + (className ? ' ' + className : ''), children: [
        jsx('button', { type: 'button', className: 'lexflowSelectButton', 'aria-haspopup': 'listbox', 'aria-expanded': open, 'aria-label': ariaLabel, title: title ?? ariaLabel, disabled, onClick: () => setOpen((state) => !state), children: [
          jsx('span', { className: 'lexflowSelectValue', children: current?.label ?? placeholder }, 'value'),
          jsx('span', { className: 'lexflowSelectCaret', 'aria-hidden': true, children: '⌄' }, 'caret'),
        ] }, 'button'),
        open && jsx('div', { className: 'lexflowSelectMenu', role: 'listbox', 'aria-label': ariaLabel, children: options.map((option) => jsx('button', { key: option.value, type: 'button', role: 'option', 'aria-selected': option.value === value, className: 'lexflowSelectOption', 'data-selected': option.value === value, disabled: option.disabled, onClick: () => { setOpen(false); if (option.value !== value) onChange?.(option.value) }, children: option.label }, option.value)) }, 'menu'),
      ] })
    }
    function foldersFromTree(nodes) {
      const result = [{ path: '.', label: '知识库根目录' }]
      const visit = (items, depth = 0) => { for (const node of items) { if (node.kind !== 'folder') continue; result.push({ path: node.relativePath, label: '　'.repeat(depth) + node.name }); visit(node.children ?? [], depth + 1) } }
      visit(nodes)
      return result
    }
    function folderNode(nodes, value) {
      if (!value || value === '.') return { kind: 'folder', relativePath: '.', children: nodes }
      return findNode(nodes, value) ?? { kind: 'folder', relativePath: value, children: [] }
    }
    function findNode(nodes, relativePath) {
      for (const node of nodes) {
        if ((node.documentKey || node.relativePath) === relativePath) return node
        if (node.kind === 'folder') { const found = findNode(node.children ?? [], relativePath); if (found) return found }
      }
      return null
    }
    function nodeKey(node) { return node?.documentKey || node?.relativePath || '' }
    function filterTree(nodes, type) {
      if (type === 'all') return nodes
      return nodes.map((node) => {
        if (node.pinned) return node
        if (node.kind === 'folder') {
          const children = filterTree(node.children ?? [], type)
          return children.length ? { ...node, children } : null
        }
        return node.type === type ? node : null
      }).filter(Boolean)
    }
    function filterTextTree(nodes, query) {
      const needle = String(query ?? '').trim().toLowerCase()
      if (!needle) return nodes
      return nodes.map((node) => {
        if (node.pinned) return node
        if (node.kind === 'folder') {
          const children = filterTextTree(node.children ?? [], needle)
          return node.name.toLowerCase().includes(needle) || children.length ? { ...node, children } : null
        }
        const haystack = [node.name, node.relativePath, node.description, typeLabel(node.type)].join(' ').toLowerCase()
        return haystack.includes(needle) ? node : null
      }).filter(Boolean)
    }
    function sortNodes(nodes, field, direction) {
      const factor = direction === 'desc' ? -1 : 1
      return [...nodes].sort((left, right) => {
        if (Boolean(left.pinned) !== Boolean(right.pinned)) return left.pinned ? -1 : 1
        const leftFolder = left.kind === 'folder' ? 0 : 1
        const rightFolder = right.kind === 'folder' ? 0 : 1
        if (leftFolder !== rightFolder) return leftFolder - rightFolder
        const a = field === 'updatedAt' ? String(left.updatedAt ?? '') : field === 'type' ? typeLabel(left.type) : left.name
        const b = field === 'updatedAt' ? String(right.updatedAt ?? '') : field === 'type' ? typeLabel(right.type) : right.name
        return a.localeCompare(b, 'zh-CN') * factor
      })
    }

    function installStyles() {
      if (document.querySelector('style[data-lexflow-workflow-page]')) return
      const style = document.createElement('style')
      style.dataset.lexflowWorkflowPage = 'true'
      // 样式归属标记：防止被底座模块系统认领给无关插件、随其重载误删（2026-09-30 界面坍缩修复）。
      style.dataset.plugin = '@lexflow/ui-pages'
      style.textContent = '.lexflowWorkflowPage{box-sizing:border-box;color:var(--lexflow-dsw-alias-label-primary);display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden;padding:42px 30px 18px;position:relative}.lexflowWorkflowDragBar{height:28px;left:0;position:absolute;right:0;top:0;-webkit-app-region:drag}.lexflowWorkflowHeader{align-items:flex-start;border-bottom:1px solid var(--lexflow-dsw-alias-border-l1);display:flex;gap:12px;min-height:62px;padding:0 2px 8px}.lexflowWorkflowHeaderWorkflow{border-bottom:0}.lexflowWorkflowHeaderMain{flex:1;min-width:0}.lexflowWorkflowTitle{font-size:20px;font-weight:650;margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.lexflowWorkflowPath{color:var(--lexflow-dsw-alias-label-secondary);font-size:12px;margin:4px 0 0}.lexflowWorkflowToolbar{display:flex;gap:5px}.lexflowWorkflowIconButton{align-items:center;background:transparent;border:0;border-radius:7px;color:var(--lexflow-dsw-alias-label-secondary);cursor:pointer;display:inline-flex;font:inherit;height:30px;justify-content:center;padding:0;width:30px}.lexflowWorkflowIconButton:hover,.lexflowWorkflowIconButton:focus-visible{background:var(--lexflow-dsw-alias-interactive-bg-hover);color:var(--lexflow-dsw-alias-label-primary);outline:none}.lexflowWorkflowIconButton:disabled{opacity:.35}.lexflowWorkflowIcon{font-size:20px;line-height:1}.lexflowWorkflowListHeader,.lexflowWorkflowRow{display:grid;gap:12px;grid-template-columns:minmax(260px,1fr) 168px 116px}.lexflowWorkflowListHeader{border-bottom:1px solid var(--lexflow-dsw-alias-border-l1);color:var(--lexflow-dsw-alias-label-secondary);font-size:11px;padding:14px 12px 8px}.lexflowWorkflowSetupSelector{align-self:flex-end;margin-bottom:18px}.lexflowWorkflowHeaderActions{align-items:flex-end;display:flex;flex-direction:column;gap:4px;min-width:190px}.lexflowWorkflowTitle{font-size:24px}.lexflowWorkflowSubtitle{color:var(--lexflow-dsw-alias-label-secondary);font-size:12px;margin:5px 0 0}.lexflowKnowledgeBaseSelector{position:relative}.lexflowKnowledgeBaseButton{align-items:center;background:transparent;border:0;border-radius:7px;color:var(--lexflow-dsw-alias-label-primary);cursor:pointer;display:flex;font:inherit;font-size:13px;gap:6px;max-width:260px;min-height:26px;padding:2px 5px}.lexflowKnowledgeBaseButton:hover,.lexflowKnowledgeBaseButton:focus-visible{background:var(--lexflow-dsw-alias-interactive-bg-hover);outline:none}.lexflowKnowledgeBaseButton>span:last-child{max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.lexflowKnowledgeBaseMenu{background:var(--lexflow-dsw-alias-bg-base);border:1px solid var(--lexflow-dsw-alias-border-l2);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.12);min-width:220px;padding:4px;position:absolute;right:0;top:31px;z-index:20}.lexflowKnowledgeBaseOption,.lexflowKnowledgeBaseChoose{align-items:center;background:transparent;border:0;border-radius:6px;color:var(--lexflow-dsw-alias-label-primary);cursor:pointer;display:flex;font:inherit;font-size:12px;gap:8px;justify-content:space-between;padding:7px 8px;text-align:left;width:100%}.lexflowKnowledgeBaseOption:hover,.lexflowKnowledgeBaseOption:focus-visible,.lexflowKnowledgeBaseChoose:hover,.lexflowKnowledgeBaseChoose:focus-visible{background:var(--lexflow-dsw-alias-interactive-bg-hover);outline:none}.lexflowKnowledgeBaseOption:disabled{color:var(--lexflow-dsw-alias-label-tertiary);cursor:not-allowed}.lexflowKnowledgeBaseCheck{color:var(--lexflow-dsw-alias-state-business-primary);font-weight:700}.lexflowKnowledgeBaseOption small{color:var(--lexflow-dsw-alias-label-tertiary);font-size:11px}.lexflowKnowledgeBaseChoose{border-top:1px solid var(--lexflow-dsw-alias-border-l1);border-radius:0;margin-top:4px}.lexflowWorkflowChevron{display:inline-flex;font-size:19px;height:18px;justify-content:center;line-height:16px;transition:transform .18s ease;width:18px}.lexflowWorkflowChevron[data-expanded=true]{transform:rotate(90deg)}.lexflowWorkflowDisclosure{align-items:center;background:transparent;border:0;border-radius:5px;color:var(--lexflow-dsw-alias-label-secondary);cursor:pointer;display:inline-flex;height:24px;justify-content:center;padding:0;width:24px}.lexflowWorkflowDisclosure:hover,.lexflowWorkflowDisclosure:focus-visible{background:var(--lexflow-dsw-alias-interactive-bg-hover);color:var(--lexflow-dsw-alias-label-primary);outline:none}.lexflowWorkflowFolderRow{cursor:pointer}.lexflowWorkflowFolderRow:hover,.lexflowWorkflowFolderRow[data-selected=true]{background:var(--lexflow-dsw-alias-interactive-bg-hover)}.lexflowWorkflowFolderIcon,.lexflowWorkflowFileIcon{align-items:center;color:var(--lexflow-dsw-alias-label-secondary);display:inline-flex;height:20px;justify-content:center;width:20px}.lexflowWorkflowFolderIcon svg{color:var(--lexflow-dsw-alias-state-business-primary)}.lexflowWorkflowFileIcon svg{color:var(--lexflow-dsw-alias-label-secondary)}.lexflowWorkflowFolderChildren{display:grid;grid-template-rows:0fr;opacity:0;transition:grid-template-rows .18s ease,opacity .18s ease}.lexflowWorkflowFolderChildren[data-expanded=true]{grid-template-rows:1fr;opacity:1}.lexflowWorkflowFolderChildrenInner{min-height:0;overflow:hidden}.lexflowWorkflowPanel{align-items:center;gap:7px;min-height:34px;padding:6px 10px}.lexflowWorkflowPanel input,.lexflowWorkflowPanel select{font-size:12px;padding:5px 7px}.lexflowWorkflowChoiceGroup{margin-top:12px}.lexflowWorkflowChoiceGroup h3{color:var(--lexflow-dsw-alias-label-secondary);font-size:12px;font-weight:650;margin:0 0 6px}.lexflowWorkflowChoice{align-items:center;display:flex;gap:9px;text-align:left}.lexflowWorkflowChoice>span:last-child{display:grid;gap:2px}.lexflowWorkflowMethodIcon{align-items:center;color:var(--lexflow-dsw-alias-state-business-primary);display:inline-flex;font-size:17px;height:20px;justify-content:center;width:20px}.lexflowWorkbenchPage{box-sizing:border-box;color:var(--lexflow-dsw-alias-label-primary);display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden;padding:42px 30px 18px;position:relative}.lexflowWorkbenchHeader{align-items:center;display:flex;gap:12px;justify-content:space-between;min-height:48px}.lexflowWorkbenchTitleWrap{flex:1;min-width:0}.lexflowWorkbenchTitleInput{background:var(--lexflow-dsw-alias-bg-base);border:1px solid var(--lexflow-dsw-alias-border-l2);border-radius:7px;color:var(--lexflow-dsw-alias-label-primary);font:inherit;font-size:20px;padding:8px 10px;width:100%}.lexflowWorkbenchTitleText{font-size:24px;margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.lexflowWorkbenchHeaderActions{align-items:center;display:flex;gap:8px}.lexflowWorkbenchType{color:var(--lexflow-dsw-alias-label-secondary);font-size:12px}.lexflowWorkbenchToolbar{align-items:center;border-bottom:1px solid var(--lexflow-dsw-alias-border-l1);display:flex;flex-wrap:wrap;gap:4px;margin:8px 0 8px;padding:5px 0 9px}.lexflowWorkbenchToolButton{align-items:center;background:transparent;border:0;border-radius:6px;color:var(--lexflow-dsw-alias-label-secondary);cursor:pointer;display:inline-flex;font:inherit;height:28px;justify-content:center;min-width:28px;padding:0 7px}.lexflowWorkbenchToolButton:hover,.lexflowWorkbenchToolButton:focus-visible{background:var(--lexflow-dsw-alias-interactive-bg-hover);color:var(--lexflow-dsw-alias-label-primary);outline:none}.lexflowWorkbenchToolButton:disabled{cursor:not-allowed;opacity:.4}.lexflowWorkbenchToolButtonPrimary{background:var(--lexflow-dsw-alias-state-business-primary);color:#fff}.lexflowWorkbenchToolButtonPrimary:hover,.lexflowWorkbenchToolButtonPrimary:focus-visible{background:var(--lexflow-dsw-alias-state-business-primary);color:#fff}.lexflowWorkbenchGlyph{font-size:14px;font-weight:650;line-height:1}.lexflowWorkbenchSelect{background:transparent;border:0;border-radius:6px;color:var(--lexflow-dsw-alias-label-secondary);cursor:pointer;font:inherit;font-size:12px;height:28px;padding:0 4px}.lexflowWorkbenchSelect:hover,.lexflowWorkbenchSelect:focus-visible{background:var(--lexflow-dsw-alias-interactive-bg-hover);outline:none}.lexflowWorkbenchToolbarSpacer{flex:1}.lexflowWorkbenchTarget{align-items:center;color:var(--lexflow-dsw-alias-label-secondary);display:flex;font-size:12px;gap:8px;margin:0 0 8px}.lexflowWorkbenchTarget select{background:var(--lexflow-dsw-alias-bg-base);border:1px solid var(--lexflow-dsw-alias-border-l2);border-radius:7px;color:var(--lexflow-dsw-alias-label-primary);font:inherit;font-size:12px;min-width:260px;padding:6px 8px}.lexflowWorkbenchStatus{color:var(--lexflow-dsw-alias-label-secondary);font-size:12px;margin:0 0 8px}.lexflowWorkbenchCanvas{background:var(--lexflow-dsw-alias-bg-base);border:1px solid var(--lexflow-dsw-alias-border-l2);border-radius:10px;display:flex;flex:1;min-height:0;overflow:hidden}.lexflowWorkbenchEditor{background:transparent;border:0;box-sizing:border-box;color:var(--lexflow-dsw-alias-label-primary);font:inherit;font-family:var(--lexflow-font-code,monospace);line-height:1.6;min-height:0;outline:none;padding:20px;resize:none;width:100%}.lexflowWorkbenchPreview{box-sizing:border-box;min-height:0;overflow:auto;padding:24px;width:100%}.lexflowWorkbenchHome{align-items:center;justify-content:center}.lexflowWorkflowRows{flex:1;min-height:0;overflow:auto}.lexflowWorkflowRow{align-items:center;border-bottom:1px solid var(--lexflow-dsw-alias-border-l1);min-height:46px;padding:0 12px}.lexflowWorkflowRow:hover,.lexflowWorkflowRow[data-selected=true]{background:var(--lexflow-dsw-alias-interactive-bg-hover)}.lexflowWorkflowName{align-items:center;display:flex;gap:8px;min-width:0}.lexflowWorkflowNameText{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.lexflowWorkflowType,.lexflowWorkflowSecondary{color:var(--lexflow-dsw-alias-label-secondary);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.lexflowWorkflowFolderDetails>summary{align-items:center;display:grid;gap:12px;grid-template-columns:minmax(260px,1fr) 168px 116px;list-style:none;min-height:46px;padding:0 12px;cursor:pointer}.lexflowWorkflowFolderDetails>summary::-webkit-details-marker{display:none}.lexflowWorkflowFolderDetails>summary:focus-visible{outline:2px solid var(--lexflow-dsw-alias-state-business-primary);outline-offset:-2px}.lexflowWorkflowFolderChildren{margin-left:24px}.lexflowWorkflowDisclosure{color:var(--lexflow-dsw-alias-label-secondary);display:inline-block;width:12px}.lexflowWorkflowFolderIcon{color:var(--lexflow-dsw-alias-state-business-primary)}.lexflowWorkflowFileIcon{color:var(--lexflow-dsw-alias-label-tertiary)}.lexflowWorkflowPanel{background:var(--lexflow-dsw-alias-bg-layer-1);border:1px solid var(--lexflow-dsw-alias-border-l2);border-radius:9px;display:flex;flex-wrap:wrap;gap:10px;margin:10px 0;padding:11px;position:relative;z-index:3}.lexflowWorkflowPanel label{align-items:center;color:var(--lexflow-dsw-alias-label-secondary);display:flex;font-size:12px;gap:6px}.lexflowWorkflowPanel input,.lexflowWorkflowPanel select{background:var(--lexflow-dsw-alias-bg-base);border:1px solid var(--lexflow-dsw-alias-border-l2);border-radius:6px;color:var(--lexflow-dsw-alias-label-primary);font:inherit;padding:6px 8px}.lexflowWorkflowMenu{background:var(--lexflow-dsw-alias-bg-layer-1);border:1px solid var(--lexflow-dsw-alias-border-l2);border-radius:8px;box-shadow:0 10px 30px rgba(15,14,12,.18);display:grid;min-width:170px;padding:5px;position:fixed;z-index:80}.lexflowWorkflowMenu button{background:transparent;border:0;border-radius:6px;color:var(--lexflow-dsw-alias-label-primary);cursor:pointer;font:inherit;font-size:12px;padding:8px 10px;text-align:left}.lexflowWorkflowMenu button:hover,.lexflowWorkflowMenu button:focus-visible{background:var(--lexflow-dsw-alias-interactive-bg-hover);outline:none}.lexflowWorkflowDialogBackdrop{align-items:center;background:rgba(15,18,25,.38);backdrop-filter:blur(3px);bottom:0;display:flex;justify-content:center;left:0;position:fixed;right:0;top:0;z-index:70}.lexflowWorkflowDialog{background:var(--lexflow-dsw-alias-bg-base);border:1px solid var(--lexflow-dsw-alias-border-l2);border-radius:12px;box-shadow:0 18px 48px rgba(15,14,12,.24);display:flex;flex-direction:column;gap:12px;max-width:520px;min-width:360px;padding:20px;width:calc(100% - 32px)}.lexflowWorkflowDialog h2{font-size:17px;margin:0}.lexflowWorkflowDialog p{color:var(--lexflow-dsw-alias-label-secondary);font-size:12px;line-height:1.6;margin:0}.lexflowWorkflowDialog label{color:var(--lexflow-dsw-alias-label-secondary);display:flex;flex-direction:column;font-size:12px;gap:6px}.lexflowWorkflowDialog label.lexflowWorkflowFieldRow{align-items:center;flex-direction:row;justify-content:space-between}.lexflowWorkflowDialog label.lexflowWorkflowFieldRow select{flex:0 0 auto;min-width:180px}.lexflowWorkflowDialog input,.lexflowWorkflowDialog select{background:var(--lexflow-dsw-alias-bg-base);border:1px solid var(--lexflow-dsw-alias-border-l2);border-radius:7px;color:var(--lexflow-dsw-alias-label-primary);font:inherit;padding:8px 10px}.lexflowWorkflowDialogActions{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end}.lexflowWorkflowChoices{display:grid;gap:8px;grid-template-columns:repeat(2,minmax(0,1fr))}.lexflowWorkflowChoice{background:var(--lexflow-dsw-alias-button-elevated-fill);border:1px solid var(--lexflow-dsw-alias-border-l2);border-radius:8px;color:var(--lexflow-dsw-alias-label-primary);cursor:pointer;font:inherit;padding:11px;text-align:left}.lexflowWorkflowChoice[data-selected=true],.lexflowWorkflowChoice:hover,.lexflowWorkflowChoice:focus-visible{background:var(--lexflow-dsw-alias-state-business-tertiary);border-color:var(--lexflow-dsw-alias-state-business-primary);outline:none}.lexflowWorkflowChoice strong{display:block;font-size:13px}.lexflowWorkflowChoice small{color:var(--lexflow-dsw-alias-label-secondary);display:block;font-size:11px;margin-top:4px}.lexflowWorkflowError{color:#b42318;font-size:12px;margin:10px 0}.lexflowWorkflowEmpty{align-items:center;color:var(--lexflow-dsw-alias-label-secondary);display:flex;flex:1;flex-direction:column;gap:9px;justify-content:center;min-height:200px;text-align:center}.lexflowWorkflowEmpty strong{color:var(--lexflow-dsw-alias-label-primary);font-size:15px}.lexflowWorkflowFooter{align-items:center;border-top:1px solid var(--lexflow-dsw-alias-border-l1);color:var(--lexflow-dsw-alias-label-secondary);display:flex;font-size:11px;gap:12px;justify-content:space-between;min-height:36px;padding:0 12px}.lexflowWorkflowFooter button{background:transparent;border:0;color:var(--lexflow-dsw-alias-label-secondary);cursor:pointer;font:inherit;padding:4px 6px}.lexflowWorkflowFooter button:hover,.lexflowWorkflowFooter button:focus-visible{color:var(--lexflow-dsw-alias-label-primary);outline:2px solid var(--lexflow-dsw-alias-state-business-primary);outline-offset:1px}.lexflowWorkflowPreview{box-sizing:border-box;height:100%;min-height:0;overflow:auto;padding:42px 30px 28px;position:relative}.lexflowWorkflowPreviewBar{align-items:center;border-bottom:1px solid var(--lexflow-dsw-alias-border-l1);display:flex;gap:8px;margin:0 auto 18px;max-width:820px;padding-bottom:12px}.lexflowWorkflowPreviewTitle{flex:1;min-width:0}.lexflowWorkflowPreviewTitle h1{font-size:22px;font-weight:650;margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.lexflowWorkflowPreviewTitle p,.lexflowWorkflowPreviewMeta{color:var(--lexflow-dsw-alias-label-secondary);font-size:11px;margin:5px auto 0;max-width:820px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.lexflowWorkflowPreviewAction{align-items:center;background:transparent;border:0;border-radius:7px;color:var(--lexflow-dsw-alias-label-secondary);cursor:pointer;display:inline-flex;font:inherit;height:32px;justify-content:center;padding:0;width:32px}.lexflowWorkflowPreviewAction:hover,.lexflowWorkflowPreviewAction:focus-visible{background:var(--lexflow-dsw-alias-interactive-bg-hover);color:var(--lexflow-dsw-alias-label-primary);outline:none}.lexflowWorkflowPreviewArticle{line-height:1.8;margin:0 auto;max-width:820px;padding:8px 12px 46px}.lexflowWorkflowPreviewArticle h1,.lexflowWorkflowPreviewArticle h2,.lexflowWorkflowPreviewArticle h3{font-weight:650;margin:22px 0 10px}.lexflowWorkflowPreviewArticle p{margin:0 0 11px}.lexflowWorkflowPreviewArticle li{margin:4px 0}.lexflowWorkflowPreviewArticle blockquote{border-left:3px solid var(--lexflow-dsw-alias-state-business-primary);color:var(--lexflow-dsw-alias-label-secondary);margin:0 0 12px;padding-left:13px}.lexflowWorkflowPreviewArticle pre{background:var(--lexflow-dsw-alias-markdown-code-block);border:1px solid var(--lexflow-dsw-alias-border-l1);border-radius:7px;overflow:auto;padding:11px 12px;white-space:pre-wrap}.lexflowWorkflowPreviewArticle code{font-family:var(--lexflow-font-code,monospace)}@media (max-width:640px){.lexflowWorkflowPage{padding:38px 10px 12px}.lexflowWorkflowListHeader{display:none}.lexflowWorkflowRow,.lexflowWorkflowFolderDetails>summary{display:flex;min-height:48px;padding:0 8px}.lexflowWorkflowRow>.lexflowWorkflowSecondary,.lexflowWorkflowRow>.lexflowWorkflowType,.lexflowWorkflowFolderDetails>summary>.lexflowWorkflowSecondary,.lexflowWorkflowFolderDetails>summary>.lexflowWorkflowType{display:none}.lexflowWorkflowDialog{min-width:0}.lexflowWorkflowToolbarPanel{align-items:stretch;flex-direction:column}}'
      style.textContent += `
.lexflowLibrary{padding:68px clamp(20px,4vw,56px) 16px;box-sizing:border-box;display:flex;flex-direction:column;height:100%;min-width:0}
.lexflowLibrary .lexflowWorkflowHeader{display:flex;align-items:center;justify-content:space-between;gap:24px;margin:0 0 30px;padding:0;border:0}
.lexflowLibrary .lexflowWorkflowTitle{font-size:28px;font-weight:600;letter-spacing:.02em;margin:0 0 8px}
.lexflowLibrary .lexflowWorkflowSubtitle{font-size:13px;font-weight:400;line-height:1.6;margin:0;color:var(--lexflow-dsw-alias-label-tertiary)}
.lexflowLibraryControls{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:12px;min-width:0}
.lexflowLibraryBreadcrumb{display:flex;gap:8px;align-items:center;font-size:12px;min-width:0;overflow:auto;white-space:nowrap;color:var(--lexflow-dsw-alias-label-tertiary)}
.lexflowLibraryBreadcrumb button{background:none;border:0;color:var(--lexflow-dsw-alias-label-secondary);padding:5px 0;font:inherit;cursor:pointer}
.lexflowLibraryToolbar{display:flex;gap:4px;position:relative;flex-shrink:0}
.lexflowLibrary .lexflowWorkflowIconButton{width:32px;height:32px;display:inline-flex;align-items:center;justify-content:center;border:0;background:transparent;border-radius:7px;color:var(--lexflow-dsw-alias-label-secondary)}
.lexflowLibrary .lexflowWorkflowIconButton:hover{background:var(--lexflow-dsw-alias-interactive-bg-hover)}
.lexflowLibraryPopover{position:absolute;right:0;top:40px;z-index:20;background:var(--lexflow-dsw-alias-bg-layer-1);border:1px solid var(--lexflow-dsw-alias-border-l1);border-radius:10px;box-shadow:0 8px 28px #00000016;padding:14px;min-width:230px;display:grid;gap:12px}
.lexflowLibraryPopover input{box-sizing:border-box;width:100%;min-width:0;background:transparent;border:0;outline:0;color:inherit;font:inherit;font-size:13px;padding:4px}
.lexflowLibraryPopover label{display:flex;justify-content:space-between;align-items:center;gap:16px;font-size:12px}
.lexflowLibraryPopover select{background:transparent;border:0;color:inherit;font:inherit}
.lexflowLibraryNewMenu{padding:4px;gap:0;min-width:220px}
.lexflowLibraryNewMenu button{background:transparent;border:0;border-bottom:1px solid var(--lexflow-dsw-alias-border-l1);font:inherit;font-size:13px;text-align:left;padding:13px 14px;color:inherit;cursor:pointer}
.lexflowLibraryNewMenu button:last-child{border-bottom:0}.lexflowLibraryNewMenu button:hover{background:var(--lexflow-dsw-alias-interactive-bg-hover);border-radius:6px}
.lexflowLibrary .lexflowWorkflowRows{border:0;border-radius:0;flex:1;overflow:auto;min-height:0}
.lexflowLibrary .lexflowWorkflowListHeader,.lexflowLibrary .lexflowWorkflowRow{display:grid;grid-template-columns:minmax(0,1fr) 142px 80px;column-gap:16px;align-items:center;padding:0 12px}
.lexflowLibrary .lexflowWorkflowListHeader{height:34px;font-size:11px;color:var(--lexflow-dsw-alias-label-tertiary);border-bottom:1px solid var(--lexflow-dsw-alias-border-l1);background:transparent}
.lexflowLibrary .lexflowWorkflowRow{min-height:48px;border:0;border-bottom:1px solid color-mix(in srgb,var(--lexflow-dsw-alias-border-l1) 55%,transparent);border-radius:0;font-size:14px}
.lexflowLibrary .lexflowWorkflowSecondary,.lexflowLibrary .lexflowWorkflowType{font-size:11px;font-weight:400;color:var(--lexflow-dsw-alias-label-tertiary)}
.lexflowWorkflowDisclosure{border:0;background:none;display:inline-flex;align-items:center;justify-content:center;padding:0;width:20px;height:28px;cursor:pointer}
.lexflowWorkflowName{gap:9px;min-width:0}.lexflowWorkflowNameText{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:text}
.lexflowLibrary .lexflowWorkflowFolderIcon{color:var(--lexflow-dsw-alias-label-secondary)}
.lexflowLibrary .lexflowWorkflowEmpty{min-height:240px;gap:12px;font-size:13px}.lexflowLibrary .lexflowWorkflowEmpty>svg{width:28px;height:28px;opacity:.55}
.lexflowLibrary .lexflowWorkflowFooter{padding:6px 0 0;font-size:11px;border-top:1px solid var(--lexflow-dsw-alias-border-l1)}
.lexflowPendingFolder{display:flex;align-items:center;gap:10px;min-height:48px;padding:0 12px}.lexflowPendingFolder input{font:inherit;color:inherit;background:transparent;border:0;border-bottom:1px solid var(--lexflow-dsw-alias-state-business-primary);outline:0;padding:5px;min-width:180px}
.lexflowFolderPicker{max-height:240px;overflow:auto;padding:2px 0;display:flex;flex-direction:column;align-items:flex-start}
.lexflowFolderPickerRow{display:flex;align-items:center;gap:2px;min-height:30px;width:100%;border-radius:7px}
.lexflowFolderPickerRow:hover{background:var(--lexflow-dsw-alias-interactive-bg-hover)}
.lexflowFolderPickerDisclosure{align-items:center;background:transparent;border:0;border-radius:7px;color:var(--lexflow-dsw-alias-label-secondary);cursor:pointer;display:inline-flex;flex:none;height:26px;justify-content:center;padding:0;width:22px}
.lexflowFolderPickerDisclosure:disabled{opacity:0;pointer-events:none}
.lexflowFolderPickerDisclosure:focus-visible,.lexflowFolderPickerItem:focus-visible{outline:none;box-shadow:0 0 0 2px color-mix(in srgb,var(--lexflow-dsw-alias-state-business-primary) 30%,transparent)}
.lexflowFolderPickerItem{align-items:center;background:transparent;border:0;border-radius:7px;color:var(--lexflow-dsw-alias-label-primary);cursor:pointer;display:inline-flex;font:inherit;font-size:12px;font-weight:400;gap:8px;padding:5px 8px;text-align:left}
.lexflowFolderPickerItem:hover{background:transparent}
.lexflowFolderPickerRow:has(.lexflowFolderPickerItem[aria-pressed=true]){background:var(--lexflow-dsw-alias-state-business-tertiary)}
.lexflowFolderPickerItem[aria-pressed=true]{color:var(--lexflow-dsw-alias-state-business-primary);font-weight:500}
.lexflowWorkflowChoices{display:flex;flex-direction:column;gap:0;border:1px solid var(--lexflow-dsw-alias-border-l1);border-radius:8px;overflow:hidden}.lexflowWorkflowChoice{border:0;border-radius:0;border-bottom:1px solid var(--lexflow-dsw-alias-border-l1);padding:14px;background:transparent}.lexflowWorkflowChoice:last-child{border-bottom:0}
.lexflowWorkbenchCanvas{border:0!important;border-radius:0!important;box-shadow:none!important;background:transparent!important}
.lexflowWorkbenchToolbar[data-expanded=false]>*:not(.lexflowWorkbenchAlways){display:none}.lexflowWorkbenchToolbar[data-expanded=false]{justify-content:flex-end}
.lexflowWorkbenchStatus{font-size:12px;color:var(--lexflow-dsw-alias-label-tertiary);overflow-wrap:anywhere}
.lexflowWorkbenchToolbar{flex-wrap:wrap;gap:4px}.lexflowWorkbenchTarget{max-width:520px}.lexflowWorkbenchBlockSpace{min-height:24px}
.lexflowWorkflowTopBack,.lexflowWorkflowPreviewBack{left:20px!important;transition:left .3s cubic-bezier(.4,0,.2,1)}/* 收起态：适配层按开关几何推导安全区（右边界 + 44px = 28px 内边距 + 16px 箭头间隙），
   箭头占安全区最左 28px 槽位，右缘与内容起点对齐、与侧栏开关之间留出 16px；
   展开态页面左边界本身已避开交通灯，箭头保持在页面内左缘，不做全局偏移。
   必须带 left 的过渡：展开时 collapsed 标记消失会让 left 从安全区（约 130px）瞬间跳回
   20px，而页面此时仍停在 x≈0（列位移刚起步），箭头于是短暂落到交通灯与侧栏开关上——
   与对话页标题的重叠同源（用户 2026-10-09 反馈"工作流和档案室界面返回箭头也有缩放重叠"）。
   过渡使箭头右移与页面位移同步，全程避开开关。 */
[data-sidebar-collapsed] .lexflowWorkflowTopBack,[data-sidebar-collapsed] .lexflowWorkflowPreviewBack{left:calc(var(--lexflow-leading-clearance,158px) - 28px)!important}.lexflowWorkflowDialog{max-height:calc(100vh - 64px);overflow:auto;box-sizing:border-box}
.lexflowSelect{position:relative;display:inline-flex;min-width:0}
.lexflowSelectButton{align-items:center;background:transparent;border:0;border-radius:7px;color:inherit;cursor:pointer;display:inline-flex;font:inherit;font-size:12px;gap:5px;justify-content:space-between;min-height:26px;padding:2px 6px;white-space:nowrap}
.lexflowSelectButton:hover,.lexflowSelectButton:focus-visible{background:var(--lexflow-dsw-alias-interactive-bg-hover);outline:none}
.lexflowSelectButton:disabled{opacity:.4;cursor:not-allowed}
.lexflowSelectValue{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lexflowSelectCaret{color:var(--lexflow-dsw-alias-label-tertiary);font-size:11px;line-height:1}
.lexflowSelectMenu{background:var(--lexflow-dsw-alias-bg-layer-1);border:1px solid var(--lexflow-dsw-alias-border-l1);border-radius:10px;box-shadow:0 10px 30px rgba(15,14,12,.16);display:grid;gap:2px;left:0;min-width:100%;padding:4px;position:absolute;top:calc(100% + 4px);z-index:60}
.lexflowSelectOption{background:transparent;border:0;border-radius:6px;color:var(--lexflow-dsw-alias-label-primary);cursor:pointer;font:inherit;font-size:12px;padding:7px 9px;text-align:left;white-space:nowrap}
.lexflowSelectOption:hover,.lexflowSelectOption:focus-visible{background:var(--lexflow-dsw-alias-interactive-bg-hover);outline:none}
.lexflowSelectOption[data-selected=true]{background:var(--lexflow-dsw-alias-state-business-tertiary);color:var(--lexflow-dsw-alias-state-business-primary)}
.lexflowSelectOption:disabled{color:var(--lexflow-dsw-alias-label-tertiary);cursor:not-allowed}
.lexflowWorkflowInlineSelect{vertical-align:baseline}
.lexflowHighlightControl{position:relative;display:inline-flex;align-items:center;flex-direction:column;gap:0}
.lexflowHighlightCombo{align-items:center;border:0;display:inline-flex;gap:0;overflow:visible}
.lexflowHighlightComboMain,.lexflowHighlightComboArrow{align-items:center;background:transparent;border:0;cursor:pointer;display:inline-flex;height:26px;justify-content:center;padding:0}
.lexflowHighlightComboMain{min-width:22px;padding:0 3px;position:relative;color:inherit}
.lexflowHighlightComboArrow{border:0;min-width:12px;color:inherit}
.lexflowHighlightComboMain:hover,.lexflowHighlightComboMain:focus-visible,.lexflowHighlightComboArrow:hover,.lexflowHighlightComboArrow:focus-visible{background:var(--lexflow-dsw-alias-interactive-bg-hover);outline:none}
.lexflowHighlightComboMain:disabled,.lexflowHighlightComboArrow:disabled{cursor:not-allowed;opacity:.4}
.lexflowHighlightComboMain .lexflowWorkbenchGlyph svg{display:block;height:15px;width:15px}
.lexflowHighlightCaret{color:var(--lexflow-dsw-alias-label-tertiary);font-size:11px;line-height:1}
.lexflowHighlightUnderbar{display:block;height:2px;position:absolute;bottom:2px;left:50%;transform:translateX(-50%);width:11px;pointer-events:none}
.lexflowHighlightBoard{background:var(--lexflow-dsw-alias-bg-layer-1);border:1px solid var(--lexflow-dsw-alias-border-l1);border-radius:10px;box-shadow:0 10px 30px rgba(15,14,12,.16);display:flex;gap:6px;left:50%;padding:7px;position:absolute;top:calc(100% + 6px);transform:translateX(-50%);z-index:60}
.lexflowHighlightChip{border:1px solid transparent;border-radius:50%;cursor:pointer;height:18px;padding:0;width:18px}
.lexflowHighlightChip:hover,.lexflowHighlightChip:focus-visible{outline:none;box-shadow:0 0 0 2px color-mix(in srgb,currentColor 30%,transparent)}
.lexflowHighlightChip[aria-pressed=true]{border-color:var(--lexflow-dsw-alias-label-primary);box-shadow:0 0 0 2px var(--lexflow-dsw-alias-bg-layer-1) inset}
.lexflowWorkbenchInsert{position:relative;display:inline-flex}
.lexflowWorkbenchInsertMenu{background:var(--lexflow-dsw-alias-bg-layer-1);border:1px solid var(--lexflow-dsw-alias-border-l1);border-radius:10px;box-shadow:0 10px 30px rgba(15,14,12,.16);display:grid;gap:2px;min-width:132px;padding:4px;position:absolute;right:0;top:calc(100% + 6px);z-index:60}
.lexflowWorkbenchInsertMenu button{background:transparent;border:0;border-radius:6px;color:var(--lexflow-dsw-alias-label-primary);cursor:pointer;font:inherit;font-size:12px;padding:8px 10px;text-align:left;white-space:nowrap}
.lexflowWorkbenchInsertMenu button:hover,.lexflowWorkbenchInsertMenu button:focus-visible{background:var(--lexflow-dsw-alias-interactive-bg-hover);outline:none}
.lexflowTablePicker{display:grid;gap:3px}
.lexflowTablePickerRow{display:flex;gap:3px}
.lexflowTablePickerCell{border:1px solid var(--lexflow-dsw-alias-border-l2);border-radius:4px;background:transparent;cursor:pointer;height:20px;padding:0;width:20px}
.lexflowTablePickerCell[data-active=true]{background:var(--lexflow-dsw-alias-state-business-tertiary);border-color:var(--lexflow-dsw-alias-state-business-primary)}
.lexflowTablePickerLabel{color:var(--lexflow-dsw-alias-label-secondary);font-size:12px;margin:8px 0 0;text-align:center}
@media(max-width:780px){.lexflowLibrary[data-select-mode="true"] .lexflowWorkflowListHeader,.lexflowLibrary[data-select-mode="true"] .lexflowWorkflowRow{grid-template-columns:auto minmax(0,1fr) 70px}.lexflowLibrary{padding:64px 20px 12px}.lexflowLibrary .lexflowWorkflowHeader{align-items:flex-start;flex-wrap:wrap;gap:14px;margin-bottom:20px}.lexflowLibrary .lexflowWorkflowListHeader,.lexflowLibrary .lexflowWorkflowRow{grid-template-columns:minmax(0,1fr) 70px}.lexflowLibrary .lexflowWorkflowSecondary{display:none}.lexflowWorkflowDialog{min-width:0}.lexflowWorkbenchHeader{flex-wrap:wrap;gap:10px}.lexflowWorkbenchTitleText{font-size:22px!important}}
`
      document.head.appendChild(style)
      const editorStyle = document.createElement('style')
      editorStyle.dataset.lexflowWorkbenchShell = 'true'
      editorStyle.dataset.plugin = '@lexflow/ui-pages'
      editorStyle.textContent = '.lexflowWorkbenchCanvas{display:flex!important;flex:1;min-height:0;overflow:hidden!important;border:0!important;border-radius:0!important;background:transparent!important}.lexflowWorkbenchEditorHost{width:100%;height:100%;min-height:0}.lexflowWorkbenchToolbar{flex-shrink:0;border:0!important;flex-wrap:wrap}.lexflowWorkbenchTitleButton{border:0;background:transparent;text-align:left;color:inherit;cursor:text}.lexflowWorkbenchTitleInput{font:inherit;font-size:24px}.lexflowWorkbenchTarget{max-height:200px;overflow:auto;flex-shrink:0}.lexflowWorkflowInlineSelect{border:0;background:transparent;color:inherit;font:inherit}.lexflowWorkbenchHeader{flex-shrink:0}.lexflowWorkbenchStatus{margin:8px 0 12px;font-size:12px}'
      document.head.appendChild(editorStyle)
      const interactionStyle = document.createElement('style')
      interactionStyle.dataset.lexflowInteraction = 'true'
      interactionStyle.dataset.plugin = '@lexflow/ui-pages'
      interactionStyle.textContent = `
:root{--lexflow-surface-radius:18px}
.lexflowLibrary{container-type:inline-size;min-width:0;padding-top:56px}.lexflowWorkbenchPage,.lexflowWorkflowPreview{isolation:isolate}.lexflowLibrary .lexflowWorkflowHeader{min-height:0}.lexflowLibrary .lexflowWorkflowNameText{cursor:text}.lexflowLibrary .lexflowWorkflowFooter button:hover,.lexflowLibrary .lexflowWorkflowFooter button:focus-visible{color:var(--lexflow-dsw-alias-state-business-primary);outline:none}.lexflowLibrary .lexflowWorkflowFolderChildren{margin-left:0}.lexflowLibrary .lexflowWorkflowFolderChildren .lexflowWorkflowName{padding-left:18px}.lexflowWorkbenchNotice{color:var(--lexflow-dsw-alias-label-secondary);font-size:12px;margin:0}.lexflowWorkbenchHeader{display:grid;grid-template-columns:minmax(0,1fr) auto}.lexflowWorkbenchStatus{flex:none;margin:8px 0 0}.lexflowWorkflowPreviewTitleRow{display:flex;align-items:center;gap:12px;min-width:0}.lexflowWorkflowPreviewMeta{width:100%;align-items:center}.lexflowWorkflowPreviewBar{display:block}.lexflowWorkflowPreviewMeta>span:last-child{text-align:right;overflow-wrap:anywhere}.lexflowWorkbenchToolButton svg{display:block;width:16px;height:16px}.lexflowWorkbenchToolButton[aria-label="任务"] svg{width:18px;height:18px}
.lexflowLibrary .lexflowWorkflowHeader{align-items:center;gap:16px;min-width:0}
.lexflowLibrary .lexflowWorkflowHeader{display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-rows:32px 32px;margin-bottom:8px}
.lexflowLibrary .lexflowWorkflowHeaderMain{display:flex;min-width:0;grid-column:1;grid-row:1}
.lexflowLibrary .lexflowWorkflowHeaderActions{align-items:center;grid-column:2;grid-row:1;min-width:0}
.lexflowLibrary .lexflowWorkflowSubheader{align-items:center;display:flex;gap:16px;grid-column:1 / -1;grid-row:2;min-width:0}
.lexflowLibrary .lexflowWorkflowSubheader .lexflowWorkflowSubtitle{flex:1;min-width:0}
.lexflowLibrary .lexflowWorkflowSubheader .lexflowLibraryToolbar{margin-left:auto}
.lexflowLibrary .lexflowWorkflowTitle{font-size:24px;line-height:1.2;margin:0}
.lexflowLibrary .lexflowWorkflowSubtitle{margin:0}
.lexflowLibraryControls{align-items:center;flex-wrap:wrap;margin-top:0}
.lexflowLibraryControls:empty{display:none}
.lexflowLibraryBreadcrumb{flex:1 1 220px;min-width:0}
.lexflowLibraryToolbar{flex:0 0 auto}
.lexflowLibrary .lexflowWorkflowListHeader,.lexflowLibrary .lexflowWorkflowRow{grid-template-columns:minmax(0,1fr) 140px 88px;column-gap:12px}
.lexflowLibrary .lexflowWorkflowRow{min-height:40px;border-radius:var(--lexflow-surface-radius);border-bottom:0}
.lexflowLibrary[data-select-mode="true"] .lexflowWorkflowListHeader,.lexflowLibrary[data-select-mode="true"] .lexflowWorkflowRow,.lexflowLibrary[data-select-mode="true"] .lexflowWorkflowFolderDetails>summary{grid-template-columns:auto minmax(0,1fr) 140px 88px}.lexflowLibrary[data-select-mode="true"] .lexflowWorkflowRow>input[type="checkbox"]{accent-color:var(--lexflow-dsw-alias-state-business-primary);cursor:pointer;justify-self:center;margin:0}
.lexflowLibrary .lexflowWorkflowRow:hover,.lexflowLibrary .lexflowWorkflowRow[data-selected=true]{background:var(--lexflow-dsw-alias-interactive-bg-hover)}
.lexflowLibrary .lexflowWorkflowFolderDetails>summary{grid-template-columns:minmax(0,1fr) 140px 88px;min-height:40px;border-radius:var(--lexflow-surface-radius)}
.lexflowLibrary .lexflowWorkflowFolderDetails>summary:hover{background:var(--lexflow-dsw-alias-interactive-bg-hover)}
.lexflowLibrary .lexflowWorkflowName,.lexflowLibrary .lexflowWorkflowNameText{min-width:0}
.lexflowLibrary .lexflowWorkflowNameText{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lexflowLibrary .lexflowWorkflowIconButton{width:28px;height:28px;border-radius:999px}
.lexflowWorkflowUnclassified{align-items:center;background:var(--lexflow-dsw-alias-bg-layer-1);border:1px solid var(--lexflow-dsw-alias-border-l2);border-radius:var(--lexflow-surface-radius);color:var(--lexflow-dsw-alias-label-secondary);display:flex;font-size:12px;gap:12px;justify-content:space-between;margin:8px 0;padding:8px 12px}
.lexflowWorkflowUnclassified button{background:transparent;border:0;border-radius:6px;color:var(--lexflow-dsw-alias-state-business-primary);cursor:pointer;font:inherit;font-size:12px;padding:4px 8px}
.lexflowWorkflowUnclassified button:hover,.lexflowWorkflowUnclassified button:focus-visible{background:var(--lexflow-dsw-alias-interactive-bg-hover);outline:none}
.lexflowClassifyList{display:flex;flex-direction:column;gap:6px;max-height:320px;overflow-y:auto}
.lexflowClassifyRow{align-items:center;display:flex;gap:12px;justify-content:space-between}
.lexflowClassifyName{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lexflowClassifyChoices{display:flex;flex:0 0 auto;gap:4px}
.lexflowClassifyChoice{background:transparent;border:0;color:var(--lexflow-dsw-alias-label-secondary);cursor:pointer;font:inherit;font-size:12px;padding:4px 6px}
.lexflowClassifyChoice:hover,.lexflowClassifyChoice:focus-visible{color:var(--lexflow-dsw-alias-state-business-primary);outline:none}
.lexflowClassifyChoice[data-selected=true]{color:var(--lexflow-dsw-alias-state-business-primary);font-weight:600}
.lexflowLibrary .lexflowLibraryPopover{border-radius:var(--lexflow-surface-radius)}
.lexflowLibrary .lexflowLibraryNewMenu button{border-bottom:0}
.lexflowLibrary .lexflowPendingFolder{min-height:40px;padding:0 12px}
.lexflowLibrary .lexflowPendingFolder input,.lexflowLibrary .lexflowWorkflowInlineName{background:transparent;border:0;border-bottom:1px solid var(--lexflow-dsw-alias-state-business-primary);border-radius:0;box-shadow:none;box-sizing:border-box;height:28px;outline:none;padding:2px 4px}
.lexflowLibrary .lexflowPendingFolder input{max-width:min(360px,100%);min-width:0}
.lexflowFolderPickerHead button:first-child:disabled{visibility:hidden}
.lexflowFolderPicker .lexflowWorkflowChevron{font-size:16px;height:16px;line-height:14px;width:16px}
.lexflowWorkflowTopBack{align-items:center;background:transparent;border:0;border-radius:999px;display:inline-flex;height:28px;justify-content:center;left:20px;padding:0;position:absolute;top:20px;width:28px;flex:none;box-shadow:none;outline:none;z-index:1;-webkit-app-region:no-drag}
.lexflowWorkflowTopBack:hover,.lexflowWorkflowPreviewBack:hover{background:transparent;color:var(--lexflow-dsw-alias-state-business-primary);outline:none;box-shadow:none}.lexflowWorkflowTopBack:focus-visible,.lexflowWorkflowPreviewBack:focus-visible{background:transparent;color:var(--lexflow-dsw-alias-state-business-primary);outline:none;filter:drop-shadow(0 0 2px currentColor)}
.lexflowWorkflowPreview{padding-top:68px}
.lexflowWorkflowPreviewBar{max-width:none;margin:0 0 10px;padding:0 0 10px}
.lexflowWorkflowPreviewBack{left:20px;position:absolute;top:20px;width:28px;height:28px;background:transparent;border:0;box-shadow:none}
.lexflowWorkflowPreviewMeta{display:flex;justify-content:space-between;gap:12px;max-width:none;white-space:normal}
.lexflowWorkflowPreviewArticle{max-width:none;padding-left:0;padding-right:0}
.lexflowWorkbenchTitleInput{background:transparent;border:0;border-radius:0;box-shadow:none;box-sizing:border-box;min-width:0;padding:0}
.lexflowWorkbenchTarget{display:none}
.lexflowWorkbenchToolbar{margin-top:4px;padding-top:0}
.lexflowWorkbenchToolbar[data-mode="reading"] .lexflowWorkbenchFormat{display:none}
.lexflowWorkbenchStatus{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;margin:0 0 8px;min-height:20px}
.lexflowWorkbenchCanvas{min-height:0}
@container (max-width:600px){.lexflowLibrary[data-select-mode="true"] .lexflowWorkflowListHeader,.lexflowLibrary[data-select-mode="true"] .lexflowWorkflowRow,.lexflowLibrary[data-select-mode="true"] .lexflowWorkflowFolderDetails>summary{grid-template-columns:auto minmax(0,1fr) 88px}.lexflowLibrary .lexflowWorkflowListHeader,.lexflowLibrary .lexflowWorkflowRow,.lexflowLibrary .lexflowWorkflowFolderDetails>summary{grid-template-columns:minmax(0,1fr) 88px}.lexflowLibrary [data-column="modified"]{display:none}}
@container (max-width:440px){.lexflowLibrary .lexflowWorkflowHeader{grid-template-columns:minmax(0,1fr);grid-template-rows:auto auto auto}.lexflowLibrary .lexflowWorkflowHeaderActions{grid-column:1;grid-row:2;justify-self:start}.lexflowLibrary .lexflowWorkflowSubheader{grid-row:3;flex-wrap:wrap}.lexflowLibrary .lexflowKnowledgeBaseButton{max-width:100%}}
@container (max-width:380px){.lexflowLibrary[data-select-mode="true"] .lexflowWorkflowListHeader,.lexflowLibrary[data-select-mode="true"] .lexflowWorkflowRow,.lexflowLibrary[data-select-mode="true"] .lexflowWorkflowFolderDetails>summary{grid-template-columns:auto minmax(0,1fr)}.lexflowLibrary .lexflowWorkflowListHeader,.lexflowLibrary .lexflowWorkflowRow,.lexflowLibrary .lexflowWorkflowFolderDetails>summary{grid-template-columns:minmax(0,1fr)}.lexflowLibrary [data-column="type"]{display:none}}
@media(max-width:760px){.lexflowLibrary{padding-left:12px;padding-right:12px}.lexflowLibrary .lexflowWorkflowHeader{align-items:flex-start}.lexflowWorkflowPreviewMeta{align-items:flex-start;flex-direction:column}}
      `
      document.head.appendChild(interactionStyle)
    }


    function Dialog({ title, description, children, onClose, actions, compact = false }) {
      const root = React.useRef(null)
      const closeRef = React.useRef(onClose); closeRef.current = onClose
      React.useEffect(() => {
        const previous = document.activeElement
        root.current?.querySelector('button,input,select,textarea,[tabindex]')?.focus()
        const key = (event) => {
          if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); closeRef.current?.() }
          if (event.key === 'Tab') { const items = [...(root.current?.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]') ?? [])]; const first = items[0], last = items.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() } }
        }
        document.addEventListener('keydown', key, true)
        return () => { document.removeEventListener('keydown', key, true); if (previous?.isConnected) previous.focus?.() }
      }, [])
      const modal = jsx('div', { className: 'lexflowWorkflowDialogBackdrop', role: 'presentation', 'data-lexflow-modal': 'true', children: jsx('div', { ref: root, className: 'lexflowWorkflowDialog', role: 'dialog', 'aria-modal': true, children: [
        jsx('h2', { style: compact ? { fontSize: '14px' } : undefined, children: title }),
        description && jsx('p', { children: description }),
        children,
        jsx('div', { className: 'lexflowWorkflowDialogActions', children: [jsx('button', { type: 'button', style: compact ? { ...button, fontSize: '12px', padding: '5px 10px' } : button, onClick: onClose, children: '取消' }), actions] }),
      ] }) })
      return document.body ? createPortal(modal, document.body) : modal
    }

    function LocalImage({ href, alt }) {
      const context = React.useContext(DocumentContext)
      const [src, setSrc] = React.useState(() => (/^data:image\/(?:png|jpeg|gif|webp);base64,/iu.test(href) ? href : null))
      React.useEffect(() => {
        let active = true
        if (/^data:image\/(?:png|jpeg|gif|webp);base64,/iu.test(href)) return
        if ((context?.kind === 'archive' || context?.kind === 'workflow') && !/^(?:[a-z]+:|\/)/iu.test(href)) api(context.kind + '.asset', { documentPath: context.id, href, knowledgeBaseId: context.knowledgeBaseId }).then((value) => { if (active) setSrc(value.src) }, () => {})
        return () => { active = false }
      }, [context?.id, href])
      return src ? jsx('img', { src, alt, style: { maxWidth: '100%', maxHeight: '640px', objectFit: 'contain' } }) : jsx('span', { children: alt || '图片' })
    }

    function InlineMarkdown({ value }) {
      const parts = String(value ?? '').split(/(==[^=]+==|\*\*[^*]+\*\*|~~[^~]+~~|\*[^*]+\*)/gu)
      return parts.map((part, index) => {
        if (/^==[^=]+==$/u.test(part)) return jsx('mark', { children: part.slice(2, -2) }, index)
        if (/^\*\*[^*]+\*\*$/u.test(part)) return jsx('strong', { children: part.slice(2, -2) }, index)
        if (/^~~[^~]+~~$/u.test(part)) return jsx('s', { children: part.slice(2, -2) }, index)
        if (/^\*[^*]+\*$/u.test(part)) return jsx('em', { children: part.slice(1, -1) }, index)
        return part
      })
    }

    function MarkdownPreview({ content, compact = false }) {
      const source = String(content ?? '').replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/u, '')
      const lines = source.split('\n')
      const blocks = []
      let index = 0
      while (index < lines.length) {
        const line = lines[index]
        if (!line.trim()) { blocks.push(jsx('div', { style: { height: '8px' } }, 'space-' + index)); index += 1; continue }
        if (line.startsWith(String.fromCharCode(96).repeat(3))) {
          const code = [line]
          index += 1
          while (index < lines.length) { code.push(lines[index]); if (lines[index].startsWith(String.fromCharCode(96).repeat(3))) { index += 1; break } index += 1 }
          blocks.push(jsx('pre', { children: code.join('\n') }, 'code-' + index))
          continue
        }
        const image = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/u)
        if (image) { blocks.push(jsx(LocalImage, { alt: image[1], href: image[2] }, 'image-' + index)); index += 1; continue }
        const heading = line.match(/^(#{1,6})\s+(.+)$/u)
        if (heading) { blocks.push(jsx('h' + heading[1].length, { children: jsx(InlineMarkdown, { value: heading[2] }) }, 'heading-' + index)); index += 1; continue }
        if (/^>\s?/u.test(line)) { blocks.push(jsx('blockquote', { children: jsx(InlineMarkdown, { value: line.replace(/^>\s?/u, '') }) }, 'quote-' + index)); index += 1; continue }
        const task = line.match(/^\s*[-*+]\s+\[([ xX])\]\s+(.+)$/u)
        if (task) { blocks.push(jsxs('div', { style: { display: 'flex', gap: '8px', margin: '4px 0' }, children: [jsx('input', { type: 'checkbox', checked: task[1].toLowerCase() === 'x', disabled: true }), jsx('span', { children: jsx(InlineMarkdown, { value: task[2] }) })] }, 'task-' + index)); index += 1; continue }
        const list = line.match(/^\s*[-*+]\s+(.+)$/u)
        if (list) { blocks.push(jsx('div', { style: { margin: '4px 0 4px 18px' }, children: ['• ', jsx(InlineMarkdown, { value: list[1] })] }, 'list-' + index)); index += 1; continue }
        const ordered = line.match(/^\s*(\d+)\.\s+(.+)$/u)
        if (ordered) { blocks.push(jsx('div', { style: { margin: '4px 0 4px 18px' }, children: [ordered[1] + '. ', jsx(InlineMarkdown, { value: ordered[2] })] }, 'ordered-' + index)); index += 1; continue }
        if (/^\|.*\|$/u.test(line)) {
          const tableLines = []
          while (index < lines.length && /^\|.*\|$/u.test(lines[index])) { tableLines.push(lines[index]); index += 1 }
          const rows = tableLines.filter((row) => !/^\|[\s:|\-]+\|$/u.test(row)).map((row) => row.slice(1, -1).split('|').map((cell) => cell.trim()))
          blocks.push(jsx('div', { style: { overflowX: 'auto' }, children: jsx('table', { style: { borderCollapse: 'collapse', width: '100%', margin: '12px 0' }, children: jsx('tbody', { children: rows.map((row, rowIndex) => jsx('tr', { children: row.map((cell, cellIndex) => jsx(rowIndex ? 'td' : 'th', { style: { border: '1px solid var(--lexflow-dsw-alias-border-l2)', padding: '8px 12px', textAlign: 'left' }, children: jsx(InlineMarkdown, { value: cell }) }, cellIndex)) }, rowIndex)) }) }) }, 'table-' + index))
          continue
        }
        blocks.push(jsx('p', { children: jsx(InlineMarkdown, { value: line }) }, 'paragraph-' + index)); index += 1
      }
      return jsx('article', { className: compact ? 'lexflowWorkflowPreviewArticle lexflowMarkdownBlockPreview' : 'lexflowWorkflowPreviewArticle', children: blocks })
    }

    function MarkdownEditorSurface({ sessionKey, content, mode, onChange, onState, editorRef, resolveImage, onDropImage }) {
      const element = React.useRef(null)
      const callbacks = React.useRef({ onChange, onState, resolveImage, onDropImage })
      callbacks.current = { onChange, onState, resolveImage, onDropImage }
      React.useLayoutEffect(() => {
        if (!element.current) return
        const editor = createWorkbenchEditor(element.current, { content, mode,
          onChange: (value) => callbacks.current.onChange(value),
          onState: (value) => callbacks.current.onState(value),
          resolveImage: (href) => callbacks.current.resolveImage?.(href),
          onDropImage: (files, lineStart) => callbacks.current.onDropImage?.(files, lineStart),
        })
        editorRef.current = editor
        return () => { editorRef.current = null; editor.destroy() }
      }, [sessionKey])
      React.useEffect(() => { editorRef.current?.setValue(content) }, [content])
      React.useEffect(() => { editorRef.current?.setMode(mode) }, [mode])
      return jsx('div', { ref: element, className: 'lexflowWorkbenchEditorHost', 'data-editor-document': sessionKey })
    }

    function TextDialog({ title, label, value = '', description, onClose, onSubmit }) {
      const [text, setText] = React.useState(value)
      return jsx(Dialog, { title, description, onClose, actions: jsx('button', { type: 'button', style: { ...button, background: 'var(--lexflow-dsw-alias-state-business-primary)', borderColor: 'transparent', color: '#fff' }, onClick: () => onSubmit(text), children: '确定' }), children: jsx('label', { children: [label, jsx('input', { autoFocus: true, value: text, onChange: (event) => setText(event.target.value) })] }) })
    }

    function FieldsDialog({ title, fields, onClose, onSubmit }) {
      const [values, setValues] = React.useState(() => Object.fromEntries(fields.map((field) => [field.key, field.value ?? ''])))
      return jsx(Dialog, { title, onClose, actions: jsx('button', { type: 'button', style: { ...button, background: 'var(--lexflow-dsw-alias-state-business-primary)', borderColor: 'transparent', color: '#fff' }, onClick: () => onSubmit(values), children: '确定' }), children: fields.map((field, index) => jsx('label', { children: [field.label, jsx('input', { autoFocus: index === 0, value: values[field.key], placeholder: field.placeholder, onChange: (event) => setValues((old) => ({ ...old, [field.key]: event.target.value })) })] }, field.key)) })
    }

    function ConfirmDialog({ title = '请确认', message, confirmLabel = '确认', destructive = false, onClose, onConfirm }) {
      return jsx(Dialog, { title, onClose, actions: jsx('button', { type: 'button', style: { ...button, background: destructive ? '#b42318' : 'var(--lexflow-dsw-alias-state-business-primary)', borderColor: 'transparent', color: '#fff' }, onClick: onConfirm, children: confirmLabel }), children: jsx('p', { children: message }) })
    }

    function TypeMethodDialog({ onClose, onDone }) {
      const [type, setType] = React.useState('')
      const [method, setMethod] = React.useState('')
      const methods = [['flowchart', '流程图'], ['prompt', '提示词'], ['template', '固定模板'], ['direct', '直接编辑']]
      return jsx(Dialog, { title: '开始创建', description: '先选择文件类型，再选择创建方式。', onClose, actions: jsx('button', { type: 'button', disabled: !type || !method, style: { ...button, background: 'var(--lexflow-dsw-alias-state-business-primary)', borderColor: 'transparent', color: '#fff', opacity: type && method ? 1 : .45 }, onClick: () => onDone(type, method), children: '进入工作台' }), children: jsxs(Fragment, { children: [
        jsxs('section', { className: 'lexflowWorkflowChoiceGroup', children: [jsx('h3', { children: '内容类型' }), jsx('div', { className: 'lexflowWorkflowChoices', children: [jsx('button', { type: 'button', className: 'lexflowWorkflowChoice', 'data-selected': type === 'workflow', onClick: () => setType('workflow'), children: [jsx(WorkflowFileIcon, {}), jsx('span', { children: [jsx('strong', { children: '工作流' }), jsx('small', { children: '系统化、可复用的内容' })] })] }), jsx('button', { type: 'button', className: 'lexflowWorkflowChoice', 'data-selected': type === 'memory', onClick: () => setType('memory'), children: [jsx(MemoryFileIcon, {}), jsx('span', { children: [jsx('strong', { children: '长期记忆' }), jsx('small', { children: '可以先零散保存的内容' })] })] })] })] }),
        jsxs('section', { className: 'lexflowWorkflowChoiceGroup', children: [jsx('h3', { children: '创建方式' }), jsx('div', { className: 'lexflowWorkflowChoices', children: methods.map(([id, label]) => jsx('button', { type: 'button', className: 'lexflowWorkflowChoice', 'data-selected': method === id, onClick: () => setMethod(id), children: [jsx('span', { className: 'lexflowWorkflowMethodIcon', 'aria-hidden': true, children: id === 'flowchart' ? '⌘' : id === 'prompt' ? '✦' : id === 'template' ? '▤' : '✎' }), jsx('span', { children: [jsx('strong', { children: label }), jsx('small', { children: '完成选择后进入工作台' })] })] }, id)) })] }),
      ] }) })
    }

    function ImportDialog({ files, folders, onPick, onClose, onSubmit }) {
      const [type, setType] = React.useState('')
      const [target, setTarget] = React.useState('')
      return jsx(Dialog, { title: '导入 Markdown 文件', description: '目前只支持 Markdown。原文件不会移动或删除。', onClose, actions: jsx('button', { type: 'button', disabled: !type || !target || !files?.length, style: { ...button, background: 'var(--lexflow-dsw-alias-state-business-primary)', borderColor: 'transparent', color: '#fff', opacity: type && target && files?.length ? 1 : .45 }, onClick: () => onSubmit(type, target), children: '确认导入' }), children: jsxs(Fragment, { children: [
        jsx('label', { className: 'lexflowWorkflowFieldRow', children: ['内容类型', jsx(AppSelect, { value: type, ariaLabel: '内容类型', placeholder: '请选择类型', onChange: setType, options: [{ value: '', label: '请选择类型' }, { value: 'workflow', label: '工作流' }, { value: 'memory', label: '长期记忆' }] })] }),
        jsx('label', { children: ['目标文件夹', jsx(FolderPicker, { folders, value: target, scope: 'workflow', onChange: setTarget })] }),
        jsx('div', { style: { alignItems: 'center', display: 'flex', gap: '8px' }, children: [jsx('button', { type: 'button', style: toolButton, onClick: onPick, children: files?.length ? '重新选择 Markdown' : '选择 Markdown 文件' }), jsx('span', { style: { color: 'var(--lexflow-dsw-alias-label-secondary)', fontSize: '12px' }, children: files?.length ? '已选择 ' + files.length + ' 个文件。' : '尚未选择文件。' })] }),
      ] }) })
    }

    function ClassifyDialog({ files, onClose, onSubmit }) {
      const [types, setTypes] = React.useState(() => Object.fromEntries(files.map((file) => [file, 'workflow'])))
      const [busy, setBusy] = React.useState(false)
      const confirm = async () => {
        setBusy(true)
        try { await onSubmit(types); setBusy(false) }
        catch { setBusy(false) }
      }
      // 用并排按钮而不是下拉：列表容器带纵向滚动，下拉菜单是绝对定位、从按钮下方展开，
      // 会被容器裁掉而看起来"点了没反应"。按钮不产生溢出，从根上避免这一层裁剪。
      const rows = files.map((file) => jsxs('div', { className: 'lexflowClassifyRow', children: [
        jsx('span', { className: 'lexflowClassifyName', title: file, children: file.split('/').pop() }),
        jsx('div', { className: 'lexflowClassifyChoices', role: 'radiogroup', 'aria-label': '文件类型', children: [['workflow', '工作流'], ['memory', '长期记忆']].map(([value, label]) => jsx('button', {
          key: value,
          type: 'button',
          role: 'radio',
          'aria-checked': types[file] === value,
          'data-selected': types[file] === value,
          className: 'lexflowClassifyChoice',
          onClick: () => setTypes((old) => ({ ...old, [file]: value })),
          children: label,
        }, value)) }),
      ] }, file))
      const submit = jsx('button', { type: 'button', disabled: busy, style: { ...button, background: 'var(--lexflow-dsw-alias-state-business-primary)', borderColor: 'transparent', color: '#fff', opacity: busy ? .45 : 1 }, onClick: confirm, children: busy ? '正在归类…' : '确认归类' })
      return jsx(Dialog, {
        title: '归类文件',
        description: '这些文件在工作流目录中但缺少类型声明。选择类型后将写入声明并纳入 LexFlow。',
        onClose,
        actions: submit,
        children: jsx('div', { className: 'lexflowClassifyList', children: rows }),
      })
    }

    function OldDataDialog({ onClose, onRefresh, scope = 'workflow' }) {
      const [entries, setEntries] = React.useState(null)
      const [error, setError] = React.useState('')
      const [pendingDelete, setPendingDelete] = React.useState(null)
      const load = () => api('workflow.oldData.list', { scope }).then(setEntries, (cause) => setError(cause.message))
      React.useEffect(() => { load() }, [])
      const restore = async (id) => { try { await api('workflow.oldData.restore', { id }); await load(); onRefresh() } catch (cause) { setError(cause.message) } }
      const erase = async (id) => { try { await api('workflow.oldData.delete', { id }); await load() } catch (cause) { setError(cause.message) } }
      return jsx(Dialog, { title: '旧数据', description: '删除的文件和旧规范会保留在这里。', onClose, actions: null, children: [
        error && jsx('p', { className: 'lexflowWorkflowError', role: 'alert', children: error }),
        entries === null ? jsx('p', { children: '读取中……' }) : entries.length === 0 ? jsx('p', { children: '暂无旧数据。' }) : jsx('div', { style: { display: 'grid', gap: '8px', maxHeight: '350px', overflow: 'auto' }, children: entries.map((entry) => jsxs('div', { style: { alignItems: 'center', borderTop: '1px solid var(--lexflow-dsw-alias-border-l1)', display: 'flex', gap: '8px', justifyContent: 'space-between', padding: '8px 0' }, children: [
          jsx('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, children: entry.originalName || entry.kind }),
          jsxs('span', { style: { display: 'flex', gap: '5px' }, children: [jsx('button', { type: 'button', style: toolButton, onClick: () => void restore(entry.id), children: '恢复' }), jsx('button', { type: 'button', style: { ...toolButton, color: '#b42318' }, onClick: () => setPendingDelete(entry.id), children: '永久删除' })] }),
        ] }, entry.id)) }),
        pendingDelete && jsx(ConfirmDialog, { title: '永久删除旧数据？', message: '该操作无法恢复，请确认。', confirmLabel: '永久删除', destructive: true, onClose: () => setPendingDelete(null), onConfirm: () => { const id = pendingDelete; setPendingDelete(null); void erase(id) } }),
      ] })
    }

    function ContextMenu({ menu, onClose, onRename, onMove, onCopy, onDelete, onReveal, onUse, onCreate, onCreateFolder, onCreateFile, onImport }) {
      React.useEffect(() => { const close = () => onClose(); window.addEventListener('click', close); return () => window.removeEventListener('click', close) }, [onClose])
      if (!menu) return null
      const node = menu.node
      const nodeParent = node?.kind === 'folder' ? node.relativePath : node ? parentPath(node.relativePath) : menu.parent ?? '.'
      const createButtons = onCreate ? [
        jsx('button', { type: 'button', onClick: () => { onClose(); onCreate('workflow', nodeParent) }, children: '创建工作流' }),
        jsx('button', { type: 'button', onClick: () => { onClose(); onCreate('memory', nodeParent) }, children: '创建长期记忆' }),
      ] : []
      return jsx('div', { className: 'lexflowWorkflowMenu', style: { left: Math.max(8, Math.min(menu.x, window.innerWidth - 190)), top: Math.max(8, Math.min(menu.y, window.innerHeight - 220)) }, onClick: (event) => event.stopPropagation(), children: node ? [
        ...(node.kind === 'folder' ? createButtons : []),
        node.kind === 'folder' && onCreateFolder && jsx('button', { type: 'button', onClick: () => { onClose(); onCreateFolder(node.relativePath) }, children: '创建文件夹' }),
        node.kind === 'folder' && onCreateFile && jsx('button', { type: 'button', onClick: () => { onClose(); onCreateFile(node.relativePath) }, children: '创建 Markdown 文件' }),
        jsx('button', { type: 'button', onClick: () => { onClose(); onRename(node) }, children: '重命名' }),
        jsx('button', { type: 'button', onClick: () => { onClose(); onMove(node) }, children: '移动' }),
        jsx('button', { type: 'button', onClick: () => { onClose(); onCopy(node) }, children: '复制' }),
        onUse && node.kind === 'file' && (node.type === 'workflow' || node.type === 'memory') && jsx('button', { type: 'button', onClick: () => { onClose(); onUse(node) }, children: '应用到当前对话' }),
        onReveal && node.kind === 'file' && jsx('button', { type: 'button', onClick: () => { onClose(); onReveal(node) }, children: '在 Finder 中显示' }),
        jsx('button', { type: 'button', onClick: () => { onClose(); onDelete(node) }, children: '移入旧数据' }),
      ] : [
        ...createButtons,
        onCreateFolder && jsx('button', { type: 'button', onClick: () => { onClose(); onCreateFolder(nodeParent) }, children: '创建文件夹' }),
        onCreateFile && jsx('button', { type: 'button', onClick: () => { onClose(); onCreateFile(nodeParent) }, children: '创建 Markdown 文件' }),
        onImport && jsx('button', { type: 'button', onClick: () => { onClose(); onImport() }, children: '导入' }),
      ] })
    }

    function DocumentPreview({ document, onBack, onEdit, onTypeChange, onUseModeChange, onStop, error, notice }) {
      const [confirmation, setConfirmation] = React.useState(null)
      const [useModeOverride, setUseModeOverride] = React.useState(null)
      const [typeOverride, setTypeOverride] = React.useState(null)
      const useMode = useModeOverride ?? document.item?.useMode ?? 'manual'
      const type = typeOverride ?? document.item?.type ?? document.type
      const isWorkflow = document.kind === 'workflow'
      const isAgent = document.kind === 'agent'
      const changeUseMode = async (next) => {
        if (next === 'session_start') {
          const entries = await api('workflow.settings.list')
          const fixed = entries.filter((entry) => entry.useMode === 'session_start' && entry.fileId !== document.item?.fileId)
          if (fixed.length >= 2) { setConfirmation({ next, count: fixed.length + 1, bytes: fixed.reduce((sum, item) => sum + item.size, 0) + (document.item?.size || 0) }); return }
        }
        setUseModeOverride(next)
        await onUseModeChange?.(next)
      }
      return jsxs('main', { className: 'lexflowWorkflowPreview', children: [
        jsx('button', { type: 'button', className: 'lexflowWorkflowPreviewAction lexflowWorkflowPreviewBack', title: '返回列表', 'aria-label': '返回列表', onClick: onBack, children: jsx(BackIcon, {}) }),
        jsxs('div', { className: 'lexflowWorkflowPreviewBar', children: [
          jsx('div', { className: 'lexflowWorkflowPreviewTitleRow', children: [
            jsx('div', { className: 'lexflowWorkflowPreviewTitle', children: jsx('h1', { children: document.item?.name?.replace(/\.md$/iu, '') ?? '未命名文件' }) }),
            isWorkflow && !isAgent && jsx(AppSelect, { value: useMode, className: 'lexflowWorkflowInlineSelect', ariaLabel: type === 'memory' ? '长期记忆适用方式' : '工作流使用方式', onChange: changeUseMode, options: [{ value: 'manual', label: '仅手动使用' }, { value: 'relevant', label: '相关时自动使用' }, { value: 'session_start', label: '新会话自动加载' }] }),
            jsx('button', { type: 'button', className: 'lexflowWorkflowPreviewAction', title: '编辑', 'aria-label': '编辑', onClick: onEdit, children: jsx(EditIcon, {}) }),
          ] }),
          jsx('div', { className: 'lexflowWorkflowPreviewMeta', children: [
            isWorkflow ? jsx(AppSelect, { value: type, className: 'lexflowWorkflowInlineSelect', ariaLabel: '文件类型', onChange: (next) => { setTypeOverride(next); onTypeChange?.(next) }, options: [{ value: 'workflow', label: '工作流' }, { value: 'memory', label: '长期记忆' }] }) : jsx('span', { children: isAgent ? '长期记忆' : 'Markdown' }),
            jsx('span', { children: (isAgent ? '全局规则' : (isWorkflow ? '工作流区域' : '档案室区域') + (() => { const parent = parentPath(document.item?.relativePath ?? '.'); const suffix = isWorkflow ? parent.replace(/^工作流(?:\/|$)/u, '') : parent; return suffix && suffix !== '.' ? '／' + suffix : '' })()) + '　·　' + dateLabel(document.item?.updatedAt) }),
          ] }),
        ] }),
        error && jsx('p', { role: 'alert', className: 'lexflowWorkflowError', children: error }),
        notice && jsx('p', { role: 'status', children: notice }),
        confirmation && jsx(ConfirmDialog, { title: '确认新会话自动加载', message: '共 ' + confirmation.count + ' 份工作流，约 ' + Math.ceil(confirmation.bytes / 1024) + ' KB。每个新对话都会使用这些内容并占用上下文；后续不会重复询问。', onClose: () => setConfirmation(null), onConfirm: async () => { const next = confirmation.next; setConfirmation(null); await onUseModeChange(next) } }),
        jsx(DocumentContext.Provider, { value: document, children: jsx(MarkdownPreview, { content: document.content }) }),
      ] })
    }

    function ArchiveImportDialog({ files, folders, onPick, onClose, onSubmit }) {
      const [target, setTarget] = React.useState('')
      return jsx(Dialog, { title: '导入档案', description: '支持 Markdown、Word、Excel、PowerPoint 和 PDF；原文件会保留在档案室中，复杂排版需要人工检查。', onClose, actions: jsx('button', { type: 'button', disabled: !target || !files?.length, style: { ...button, background: 'var(--lexflow-dsw-alias-state-business-primary)', borderColor: 'transparent', color: '#fff', opacity: target && files?.length ? 1 : .45 }, onClick: () => onSubmit(target), children: '确认导入' }), children: [
        jsx('label', { children: ['目标文件夹', jsx(FolderPicker, { folders, value: target, scope: 'archive', onChange: setTarget })] }),
        jsx('div', { style: { alignItems: 'center', display: 'flex', gap: '8px' }, children: [jsx('button', { type: 'button', style: toolButton, onClick: onPick, children: files?.length ? '重新选择文件' : '选择文件' }), jsx('span', { style: { color: 'var(--lexflow-dsw-alias-label-secondary)', fontSize: '12px' }, children: files?.length ? '已选择 ' + files.length + ' 个文件。' : '尚未选择文件。' })] }),
      ] })
    }

    function FolderPicker({ folders, value, onChange, scope = 'workflow', rootLabel }) {
      const [open, setOpen] = React.useState({})
      const resolvedScope = scope
      const displayRootLabel = rootLabel || (resolvedScope === 'archive' ? '档案室区域' : '工作流区域')
      const protocolRoot = resolvedScope === 'archive' ? '档案室' : '工作流'
      const normalized = folders.map((folder) => ({ ...folder, path: folder.path === protocolRoot ? '.' : folder.path.replace(new RegExp('^' + protocolRoot + '/'), '') }))
      const originalPath = (relative) => folders[normalized.findIndex((folder) => folder.path === relative)]?.path ?? '.'
      const rootOpen = open['.'] ?? true
      const allPaths = normalized.filter((folder) => folder.path !== '.').map((folder) => folder.path)
      const toggleRoot = () => setOpen(Object.fromEntries(allPaths.map((path) => [path, !rootOpen])))
      const branch = (parent, depth) => normalized.filter((folder) => folder.path !== '.' && parentPath(folder.path) === parent).map((folder) => {
        const hasChildren = normalized.some((child) => child.path !== folder.path && parentPath(child.path) === folder.path)
        const actual = originalPath(folder.path)
        return jsx(Fragment, { children: [
          jsx('div', { className: 'lexflowFolderPickerRow', style: { paddingLeft: depth * 18 }, children: [
            jsx('button', { type: 'button', className: 'lexflowFolderPickerDisclosure', disabled: !hasChildren, 'aria-label': '展开 ' + folder.label.trim(), 'aria-expanded': Boolean(open[folder.path]), onClick: () => setOpen({ ...open, [folder.path]: !open[folder.path] }), children: jsx(ChevronIcon, { expanded: open[folder.path] }) }),
            jsx('button', { type: 'button', className: 'lexflowFolderPickerItem', 'aria-pressed': value === actual, onClick: () => onChange(actual), children: [jsx(FolderIcon, {}), folder.label.trim()] }),
          ] }, 'toolbar'),
          open[folder.path] && branch(folder.path, depth + 1),
        ] }, folder.path)
      })
      return jsx('div', { className: 'lexflowFolderPicker', children: [
        jsx('div', { className: 'lexflowFolderPickerRow', children: [
          jsx('button', { type: 'button', className: 'lexflowFolderPickerDisclosure', 'aria-label': rootOpen ? '收起文件夹分类' : '展开文件夹分类', 'aria-expanded': rootOpen, onClick: toggleRoot, children: jsx(ChevronIcon, { expanded: rootOpen }) }),
          jsx('button', { type: 'button', className: 'lexflowFolderPickerItem', 'aria-pressed': value === originalPath('.'), onClick: () => onChange(originalPath('.')), children: [jsx(FolderIcon, {}), displayRootLabel] }),
        ] }),
        rootOpen && branch('.', 0),
      ] })
    }

    function TablePickerDialog({ onPick, onClose }) {
      const [hover, setHover] = React.useState({ rows: 3, columns: 3 })
      const grid = Array.from({ length: 6 }, (_row, rowIndex) => Array.from({ length: 6 }, (_col, colIndex) => ({ rows: rowIndex + 1, columns: colIndex + 1 })))
      return jsx(Dialog, { title: '插入表格', description: '拖动选择行列数。', onClose, actions: null, children: [
        jsx('div', { className: 'lexflowTablePicker', onMouseLeave: () => setHover({ rows: 3, columns: 3 }), children: grid.map((row) => jsx('div', { className: 'lexflowTablePickerRow', children: row.map((cell) => jsx('button', { key: cell.rows + 'x' + cell.columns, type: 'button', className: 'lexflowTablePickerCell', 'data-active': cell.rows <= hover.rows && cell.columns <= hover.columns, 'aria-label': cell.rows + ' 行 ' + cell.columns + ' 列', onMouseEnter: () => setHover(cell), onClick: () => onPick(cell.rows, cell.columns) })) })) }),
        jsx('p', { className: 'lexflowTablePickerLabel', children: hover.rows + ' 行 × ' + hover.columns + ' 列' }),
      ] })
    }

    function PendingFolder({ onSave, onCancel }) {
      const [name, setName] = React.useState('新建文件夹')
      const [busy, setBusy] = React.useState(false)
      const closed = React.useRef(false)
      const commit = async () => { if (closed.current || busy) return; if (!name.trim()) { closed.current = true; onCancel(); return }; setBusy(true); closed.current = true; if (!await onSave(name.trim())) { closed.current = false; setBusy(false) } }
      return jsx('div', { className: 'lexflowPendingFolder', children: [jsx(FolderIcon, {}, 'icon'), jsx('input', { autoFocus: true, 'aria-label': '新文件夹名称', value: name, disabled: busy, onFocus: (event) => event.target.select(), onChange: (event) => setName(event.target.value), onBlur: () => void commit(), onKeyDown: (event) => { if (event.key === 'Enter') { event.preventDefault(); void commit() }; if (event.key === 'Escape') { closed.current = true; onCancel() } } }, 'input')] })
    }

    function FileLibrary({ kind, initial }) {
      installStyles()
      const isWorkflow = kind === 'workflow'
      const label = isWorkflow ? '工作流' : '档案室'
      const [status, setStatus] = React.useState(null)
      const [nodes, setNodes] = React.useState([])
      const [loading, setLoading] = React.useState(true)
      const [error, setError] = React.useState('')
      const [path, setPath] = React.useState(initial?.browsePath ?? '.')
      const [selectedPath, setSelectedPath] = React.useState(null)
      const [selectedPaths, setSelectedPaths] = React.useState(() => new Set())
      const [selectMode, setSelectMode] = React.useState(false)
      const [query, setQuery] = React.useState('')
      const [typeFilter, setTypeFilter] = React.useState('all')
      const [sort, setSort] = React.useState('name')
      const [expanded, setExpanded] = React.useState({})
      const [panel, setPanel] = React.useState(null)
      const [menu, setMenu] = React.useState(null)
      const [dialog, setDialog] = React.useState(null)
      const [pendingFolder, setPendingFolder] = React.useState(null)
      const [importFiles, setImportFiles] = React.useState(null)
      const [oldData, setOldData] = React.useState(false)
      const [unclassified, setUnclassified] = React.useState([])
      const [notice, setNotice] = React.useState('')
      const picker = React.useRef(null)
      const toolbar = React.useRef(null)
      const lastSelected = React.useRef(null)
      const generation = React.useRef(0)
      const activeKnowledgeBaseId = status?.knowledgeBases?.find((base) => base.active)?.id
      const request = (action, payload = {}) => api(kind + '.' + action, { ...payload, ...(activeKnowledgeBaseId ? { knowledgeBaseId: activeKnowledgeBaseId } : {}) })
      const load = React.useCallback(async (force = false) => {
        const current = ++generation.current
        setLoading(true)
        try {
          const state = await api('workflow.status')
          if (current !== generation.current) return
          setStatus(state)
          if (state.configured) {
            const value = await api(kind + (isWorkflow && force ? '.refresh' : '.list'))
            if (current !== generation.current) return
            const nextNodes = value.nodes ?? []
            setNodes(nextNodes)
            setUnclassified(isWorkflow ? (value.unclassified ?? []) : [])
            setSelectedPath((currentPath) => currentPath && findNode(nextNodes, currentPath) ? currentPath : null)
          } else { setNodes([]); setUnclassified([]) }
          setError('')
        } catch (cause) { if (current === generation.current) setError(cause.message) }
        finally { if (current === generation.current) setLoading(false) }
      }, [kind])
      React.useEffect(() => { void load(); return () => { generation.current += 1 } }, [load])
      React.useEffect(() => { const dismiss = (event) => { if (!toolbar.current?.contains(event.target)) setPanel(null) }; const escape = (event) => { if (event.key === 'Escape') { setPanel(null); setMenu(null) } }; window.addEventListener('pointerdown', dismiss); window.addEventListener('keydown', escape); return () => { window.removeEventListener('pointerdown', dismiss); window.removeEventListener('keydown', escape) } }, [])
      const attempt = async (task) => { try { await task(); setError(''); return true } catch (cause) { setError(cause.message); return false } }
      const choose = () => attempt(async () => { const root = await pickDirectoryOverride?.(); if (!root) return; await api('workflow.selectRoot', { rootPath: root }); setPath('.'); setSelectedPath(null); setQuery(''); await load() })
      const selectBase = (id) => attempt(async () => { await api('workflow.knowledgeBases.select', { id }); setPath('.'); setSelectedPath(null); setSelectedPaths(new Set()); setQuery(''); await load() })
      const folders = foldersFromTree(nodes).map((folder, i) => i === 0 ? { ...folder, label } : folder)
      const toggleSelected = (node, event) => {
        const key = nodeKey(node)
        setSelectedPaths((current) => {
          const next = new Set(current)
          if (next.has(key)) next.delete(key); else next.add(key)
          return next
        })
      }
      const selectNode = (node, event) => {
        const key = nodeKey(node)
        if (selectMode) { setSelectedPath(key); lastSelected.current = key; toggleSelected(node, event); return }
        setSelectedPath(key); lastSelected.current = key
        if (event?.metaKey || event?.ctrlKey) return toggleSelected(node, event)
        if (event?.shiftKey && lastSelected.current) {
          const order = []
          const walk = (nodes) => { for (const item of nodes) { order.push(item); if (item.children?.length) walk(item.children) } }
          walk(nodes)
          const start = order.findIndex((item) => nodeKey(item) === lastSelected.current)
          const end = order.findIndex((item) => nodeKey(item) === key)
          if (start >= 0 && end >= 0) {
            const [low, high] = start < end ? [start, end] : [end, start]
            setSelectedPaths(new Set(order.slice(low, high + 1).filter((item) => item.kind !== 'file' || !item.builtin).map(nodeKey)))
            return
          }
        }
        setSelectedPaths(new Set([key]))
      }
      const openFolder = (node) => { setPath(node.relativePath); setSelectedPath(null); setSelectedPaths(new Set()); setQuery(''); setPendingFolder(null) }
      const create = (type = 'workflow', parent = path) => { const siblings = folderNode(nodes, parent).children ?? []; let title = '未命名文件', suffix = 0; while (siblings.some((node) => documentTitleOf(node) === title)) title = '未命名文件 ' + (++suffix); setPanel(null); go('workbench', { kind, mode: 'new', draftId: globalThis.crypto?.randomUUID?.() ?? String(Date.now()) + Math.random(), item: { title, type: isWorkflow ? type : null, parent }, content: '', targetFolder: parent, targetFolders: folders, browsePath: path, knowledgeBaseId: activeKnowledgeBaseId }) }
      const open = (node) => attempt(async () => {
        if (node.builtin === 'global-agent') { await agent('preview'); return }
        const value = await request('read', { relativePath: node.relativePath })
        const document = { kind, mode: 'preview', id: node.relativePath, browsePath: path, item: value.item ?? { ...node, title: value.title }, content: value.content, revision: value.revision, knowledgeBaseId: status?.knowledgeBases?.find((base) => base.active)?.id }
        go(kind, document)
      })
      const move = (node, targetFolder, copy = false) => attempt(async () => {
        const target = targetFolder === '.' ? node.name : targetFolder + '/' + node.name
        if (target === node.relativePath) return
        await request(copy ? 'copy' : 'move', { from: node.relativePath, to: target }); setDialog(null); await load(true)
      })
      const renameNode = (node, name) => attempt(async () => {
        const filename = node.kind === 'file' && !/\.md$/iu.test(name) ? name + '.md' : name
        const target = parentPath(node.relativePath) === '.' ? filename : parentPath(node.relativePath) + '/' + filename
        await request('move', { from: node.relativePath, to: target }); setSelectedPath(target); setDialog(null); await load(true)
      })
      const dropMove = (source, target) => { const node = findNode(nodes, source); if (!node || source === target || (node.kind === 'folder' && target.startsWith(source + '/'))) return; void move(node, target) }
      const beginFolder = (parent = path) => { setPath(parent); setPendingFolder(parent); setPanel(null) }
      const saveFolder = (name) => attempt(async () => { await request('createFolder', { parent: pendingFolder, name }); setPendingFolder(null); await load(true) })
      const startImport = () => { setPanel(null); setImportFiles(null); setDialog({ kind: 'import' }) }
      const importSelected = (type, target) => attempt(async () => {
        const result = await request('import', { type, targetFolder: target, files: importFiles })
        const warnings = (Array.isArray(result) ? result : []).flatMap((item) => item.warnings ?? [])
        setNotice(warnings.join('；')); setDialog(null); setImportFiles(null); await load()
      })
      const classifySelected = (types) => attempt(async () => {
        const failed = []
        for (const [relativePath, type] of Object.entries(types)) {
          try { await request('classify', { relativePath, type }) }
          catch (cause) { failed.push(cause.message) }
        }
        setDialog(null)
        setNotice(failed.length ? `归类未全部完成：${failed.join('；')}` : '已归类并纳入 LexFlow。')
        await load(true)
      })
      const batchApply = (values) => attempt(async () => {
        const items = [...selectedPaths].filter((value) => value && value !== 'builtin:agent').map((relativePath) => ({ relativePath }))
        if (!items.length) throw new Error('请先选择文件或文件夹。')
        if (['setType', 'setUseMode'].includes(values.operation) && !isWorkflow) throw new Error('档案室不支持此批量操作。')
        if (values.operation === 'setType' && !values.type) throw new Error('请选择文件类型。')
        if (values.operation === 'setUseMode' && !values.useMode) throw new Error('请选择适用方式。')
        const result = await request('batch', { items, ...values })
        setSelectedPaths(new Set()); setSelectedPath(null); setDialog(null)
        const failed = result?.failed ?? []
        setNotice(failed.length ? `已完成 ${result.completed?.length ?? 0} 项，${failed.length} 项失败：${failed.map((item) => item.error).join('；')}` : `已完成 ${result.completed?.length ?? items.length} 项。`)
        await load(true)
      })
      const agent = (mode = 'preview') => attempt(async () => { const value = await api('workflow.agent.read'); go('workflow', { kind: 'agent', mode, id: 'builtin:agent', item: { title: 'AGENT', name: 'AGENT.md', type: 'agent', builtin: 'global-agent', updatedAt: value.updatedAt }, content: value.content, revision: value.revision, sourcePath: value.path, effective: value.effective, browsePath: path, knowledgeBaseId: activeKnowledgeBaseId }) })
      const changeType = (type) => attempt(async () => { const value = await request('setType', { relativePath: initial.item.relativePath, type }); const latest = await request('read', { relativePath: initial.item.relativePath }); go('workflow', { ...initial, ...latest, revision: value.revision }) })
      if (initial?.mode === 'preview') return jsx(DocumentPreview, { document: initial, error, notice, onBack: () => go(kind, { browsePath: initial.browsePath ?? '.' }), onEdit: () => go('workbench', { ...initial, kind: initial.kind === 'agent' ? 'agent' : kind }), onTypeChange: isWorkflow ? changeType : undefined, onUseModeChange: isWorkflow ? (mode) => attempt(async () => { await api('workflow.settings.set', { fileId: initial.item.fileId, useMode: mode, knowledgeBaseId: initial.knowledgeBaseId }); go('workflow', { ...initial, item: { ...initial.item, useMode: mode } }) }) : undefined, onStop: isWorkflow ? () => attempt(async () => { await api('workflow.session.stop', { sessionId: currentSessionIdOverride?.(), fileId: initial.item.fileId, knowledgeBaseId: initial.knowledgeBaseId }); setNotice('已停止在当前对话应用') }) : undefined })
      const current = folderNode(nodes, path)
      const visible = sortNodes(filterTree(filterTextTree(current.children ?? [], query), typeFilter), sort, 'asc')
      const iconButton = (title, icon, action) => jsx('button', { type: 'button', className: 'lexflowWorkflowIconButton', title, 'aria-label': title, onClick: action, children: icon }, title)
      const libraryToolbar = jsx('div', { className: 'lexflowWorkflowToolbar lexflowLibraryToolbar', ref: toolbar, children: [
        iconButton(selectMode ? '退出多选' : '多选', jsx(SelectIcon, {}), () => { setPanel(null); setSelectedPaths(new Set()); setSelectedPath(null); setSelectMode((value) => !value) }),
        iconButton('搜索', jsx(SearchIcon, {}), () => setPanel(panel === 'search' ? null : 'search')),
        iconButton('排序与筛选', jsx(FilterIcon, {}), () => setPanel(panel === 'filter' ? null : 'filter')),
        iconButton('新建', jsx(PlusIcon, {}), () => setPanel(panel === 'new' ? null : 'new')),
        panel === 'search' && jsx('div', { className: 'lexflowLibraryPopover', children: jsx('input', { autoFocus: true, value: query, 'aria-label': '搜索' + label, placeholder: '搜索名称与文件夹', onChange: (event) => setQuery(event.target.value) }) }),
        panel === 'filter' && jsx('div', { className: 'lexflowLibraryPopover', children: [jsx('label', { children: ['排序', jsx(AppSelect, { value: sort, ariaLabel: '排序', onChange: setSort, options: [{ value: 'name', label: '名称' }, { value: 'updatedAt', label: '修改日期' }] })] }), isWorkflow && jsx('label', { children: ['类型', jsx(AppSelect, { value: typeFilter, ariaLabel: '类型筛选', onChange: setTypeFilter, options: [{ value: 'all', label: '全部' }, { value: 'workflow', label: '工作流' }, { value: 'memory', label: '长期记忆' }] })] })] }),
        panel === 'new' && jsx('div', { className: 'lexflowLibraryPopover lexflowLibraryNewMenu', children: [jsx('button', { type: 'button', onClick: () => isWorkflow ? (setPanel(null), setDialog({ kind: 'type' })) : create(null), children: isWorkflow ? '创建工作流／长期记忆' : '创建文档' }), jsx('button', { type: 'button', onClick: () => beginFolder(), children: '新建文件夹' }), jsx('button', { type: 'button', onClick: startImport, children: '导入' })] }),
      ] }, 'toolbar')
      return jsxs('main', { className: 'lexflowWorkflowPage lexflowLibrary', 'data-select-mode': selectMode ? 'true' : 'false', children: [
        jsx('div', { className: 'lexflowWorkflowDragBar' }, 'drag'),
        jsx('button', { type: 'button', className: 'lexflowWorkflowTopBack', title: path === '.' ? '返回对话' : '返回上一级', 'aria-label': path === '.' ? '返回对话' : '返回上一级', onClick: () => { if (path === '.') go('conversation'); else { const parent = parentPath(path); setPath(isWorkflow && parent === '工作流' ? '.' : parent); setQuery('') } }, children: jsx(BackIcon, {}) }, 'back'),
        jsx('header', { className: 'lexflowWorkflowHeader lexflowWorkflowHeaderWorkflow', children: [
          jsx('div', { className: 'lexflowWorkflowHeaderMain', children: jsx('h1', { className: 'lexflowWorkflowTitle', children: label }) }, 'main'),
          jsx('div', { className: 'lexflowWorkflowHeaderActions', children: jsx(KnowledgeBaseSelector, { status, onSelect: selectBase, onChoose: choose }) }, 'actions'),
          jsx('div', { className: 'lexflowWorkflowSubheader', children: [jsx('p', { className: 'lexflowWorkflowSubtitle', children: isWorkflow ? '可复用的工作方法与长期记忆' : '保存资料，积累工作成果' }, 'subtitle'), libraryToolbar] }, 'subheader'),
        ] }, 'header'),
        jsx('div', { className: 'lexflowLibraryControls', children: [
          path !== '.' && jsx('nav', { className: 'lexflowLibraryBreadcrumb', 'aria-label': label + '路径', children: [jsx('button', { type: 'button', onClick: () => setPath('.'), onDragOver: (event) => event.preventDefault(), onDrop: (event) => { event.preventDefault(); dropMove(event.dataTransfer.getData('application/x-lexflow-path'), '.') }, children: label }), ...(isWorkflow ? path.replace(/^工作流\//u, '') : path).split('/').map((part, index, parts) => jsx(Fragment, { children: [jsx('span', { children: '/' }, 'slash'), jsx('button', { type: 'button', onClick: () => setPath((isWorkflow ? '工作流/' : '') + parts.slice(0, index + 1).join('/')), children: part }, 'part')] }, index))] }, 'breadcrumb'),
        ] }, 'controls'),
        error && jsx('p', { className: 'lexflowWorkflowError', role: 'alert', children: error }, 'error'),
        notice && jsx('p', { className: 'lexflowWorkflowSubtitle', role: 'status', children: notice }, 'notice'),
        isWorkflow && unclassified.length > 0 && jsx('div', { className: 'lexflowWorkflowUnclassified', role: 'status', children: [jsx('span', { children: `发现 ${unclassified.length} 个未归类文件（工作流目录中缺少类型声明）` }), jsx('button', { type: 'button', onClick: () => setDialog({ kind: 'classify' }), children: '归类' })] }, 'unclassified'),
        jsx('div', { className: 'lexflowWorkflowListHeader', children: [selectMode && jsx('span', { 'aria-hidden': true }, 'select'), jsx('span', { children: '名称' }, 'name'), jsx('span', { 'data-column': 'modified', children: '修改日期' }, 'modified'), jsx('span', { 'data-column': 'type', children: '类型' }, 'type')] }, 'list-header'),
        jsx('div', { className: 'lexflowWorkflowRows', onDragOver: (event) => event.preventDefault(), onDrop: (event) => { event.preventDefault(); dropMove(event.dataTransfer.getData('application/x-lexflow-path'), path) }, onContextMenu: (event) => { if (!event.target.closest('.lexflowWorkflowRow')) { event.preventDefault(); setMenu({ x: event.clientX, y: event.clientY, parent: path }) } }, children: [
          pendingFolder !== null && jsx(PendingFolder, { onSave: saveFolder, onCancel: () => setPendingFolder(null) }, 'pending-folder'),
          loading ? jsx('div', { className: 'lexflowWorkflowEmpty', children: '正在读取…' }, 'loading') : !status?.configured ? jsx('div', { className: 'lexflowWorkflowEmpty', children: [jsx('strong', { children: '选择知识库位置' }), jsx('p', { children: '工作流与档案室共用位置，各自管理所属文件。' }), jsx('button', { type: 'button', style: button, onClick: choose, children: '选择文件夹' })] }, 'unconfigured') : visible.length ? jsx(TreeList, { nodes: visible, selected: selectedPath, selectedPaths, selectMode, expandedFolders: expanded, onSelect: selectNode, onToggleSelect: toggleSelected, onToggleFolder: (value) => setExpanded({ ...expanded, [value]: !expanded[value] }), onOpenFolder: openFolder, onOpenFile: open, onContextMenu: (event, node) => setMenu({ x: event.clientX, y: event.clientY, node, parent: path }), onRename: renameNode, onDrop: dropMove }, 'tree') : jsx('div', { className: 'lexflowWorkflowEmpty', children: [jsx(FolderIcon, {}), jsx('strong', { children: query ? '没有找到匹配内容' : '这里还没有文件' }), jsx('p', { children: query ? '试试其他关键词。' : '点击右上角加号，或在此处右键创建和导入。' })] }, 'empty'),
        ] }, 'rows'),
        jsx('footer', { className: 'lexflowWorkflowFooter', children: [jsx('span', { children: visible.length + ' 项' }, 'count'), jsx('span', { children: [selectedPaths.size > 0 && jsx('button', { type: 'button', onClick: () => { setPanel(null); setDialog({ kind: 'batch' }) }, children: '操作' }, 'batch'), jsx('button', { type: 'button', onClick: () => void load(true), children: '刷新' }, 'refresh'), jsx('button', { type: 'button', onClick: () => setOldData(true), children: '旧数据' }, 'old')] }, 'actions')] }, 'footer'),
        jsx(ContextMenu, { menu, onClose: () => setMenu(null), onRename: (node) => setDialog({ kind: 'rename', node }), onMove: (node) => setDialog({ kind: 'move', node }), onCopy: (node) => setDialog({ kind: 'copy', node }), onDelete: (node) => setDialog({ kind: 'delete', node }), onCreate: isWorkflow ? create : undefined, onCreateFolder: beginFolder, onCreateFile: isWorkflow ? undefined : (parent) => create(null, parent), onImport: startImport, onUse: isWorkflow ? (node) => attempt(async () => { if (!useFileOverride) throw new Error('请先开启对话'); await useFileOverride(node) }) : undefined }, 'context'),
        dialog?.kind === 'type' && jsx(Dialog, { title: '创建', onClose: () => setDialog(null), children: jsx('div', { className: 'lexflowWorkflowChoices', children: ['workflow', 'memory'].map((type) => jsx('button', { type: 'button', className: 'lexflowWorkflowChoice', onClick: () => create(type), children: typeLabel(type) }, type)) }) }),
        dialog?.kind === 'rename' && jsx(TextDialog, { title: '重命名', label: '名称', value: displayName(dialog.node), onClose: () => setDialog(null), onSubmit: (name) => renameNode(dialog.node, name) }),
        ['move', 'copy'].includes(dialog?.kind) && jsx(MoveDialog, { folders, scope: kind, rootLabel: label + '区域', onClose: () => setDialog(null), onSubmit: (target) => move(dialog.node, target, dialog.kind === 'copy'), title: dialog.kind === 'copy' ? '复制到' : '移动到' }),
        dialog?.kind === 'batch' && jsx(BatchDialog, { kind, count: selectedPaths.size, folders, onClose: () => setDialog(null), onSubmit: batchApply }),
        dialog?.kind === 'classify' && jsx(ClassifyDialog, { files: unclassified, onClose: () => setDialog(null), onSubmit: classifySelected }),
        dialog?.kind === 'delete' && jsx(ConfirmDialog, { title: '移入旧数据', message: '文件可在旧数据中恢复。', confirmLabel: '移入旧数据', onClose: () => setDialog(null), onConfirm: () => attempt(async () => { await request('trash', { relativePath: dialog.node.relativePath }); setDialog(null); await load() }) }),
        dialog?.kind === 'import' && (isWorkflow ? jsx(ImportDialog, { files: importFiles, folders, onPick: () => picker.current?.click(), onClose: () => setDialog(null), onSubmit: importSelected }) : jsx(ArchiveImportDialog, { files: importFiles, folders, onPick: () => picker.current?.click(), onClose: () => setDialog(null), onSubmit: (target) => importSelected(null, target) })),
        oldData && jsx(OldDataDialog, { scope: kind, onClose: () => setOldData(false), onRefresh: load }),
        jsx('input', { ref: picker, type: 'file', multiple: true, accept: isWorkflow ? '.md,.markdown' : '.md,.markdown,.docx,.xlsx,.xlsm,.csv,.pptx,.pdf', style: { display: 'none' }, onChange: async (event) => { const files = [...event.target.files]; event.target.value = ''; await attempt(async () => setImportFiles(await Promise.all(files.map(async (file) => /\.(?:docx|xlsx|xlsm|csv|pptx|pdf)$/iu.test(file.name) ? { name: file.name, contentBase64: await fileToBase64(file) } : { name: file.name, content: await file.text() })))) } }),
      ] })
    }
    function MoveDialog({ folders, onClose, onSubmit, title, scope, rootLabel, value: initialValue = '.' }) {
      const [target, setTarget] = React.useState(initialValue)
      return jsx(Dialog, { title, onClose, actions: jsx('button', { type: 'button', style: button, onClick: () => onSubmit(target), children: '确认' }), children: jsx(FolderPicker, { folders, value: target, scope, rootLabel, onChange: setTarget }) })
    }
    function BatchDialog({ kind, count, folders, onClose, onSubmit }) {
      const [operation, setOperation] = React.useState('move')
      const [target, setTarget] = React.useState('.')
      const [type, setType] = React.useState('')
      const [useMode, setUseMode] = React.useState('')
      const isWorkflow = kind === 'workflow'
      const submit = () => onSubmit({ operation, targetFolder: target, type: type || undefined, useMode: useMode || undefined })
      return jsx(Dialog, { title: `批量操作（${count} 项）`, description: '文件夹操作会作用于其中已纳入 LexFlow 的 Markdown 文件。', onClose, actions: jsx('button', { type: 'button', style: button, onClick: submit, children: '执行' }), children: [
        jsx('label', { className: 'lexflowWorkflowFieldRow', children: ['操作', jsx(AppSelect, { value: operation, ariaLabel: '操作', onChange: setOperation, options: [{ value: 'move', label: '移动到' }, { value: 'copy', label: '复制到' }, { value: 'trash', label: '移入旧数据' }, ...(isWorkflow ? [{ value: 'setType', label: '修改文件类型' }, { value: 'setUseMode', label: '修改适用方式' }] : [])] })] }),
        ['move', 'copy'].includes(operation) && jsx('label', { children: ['目标文件夹', jsx(FolderPicker, { folders, value: target, scope: kind, rootLabel: (kind === 'workflow' ? '工作流' : '档案室') + '区域', onChange: setTarget })] }),
        operation === 'setType' && jsx('label', { className: 'lexflowWorkflowFieldRow', children: ['文件类型', jsx(AppSelect, { value: type, ariaLabel: '文件类型', placeholder: '请选择类型', onChange: setType, options: [{ value: '', label: '请选择类型' }, { value: 'workflow', label: '工作流' }, { value: 'memory', label: '长期记忆' }] })] }),
        operation === 'setUseMode' && jsx('label', { className: 'lexflowWorkflowFieldRow', children: ['适用方式', jsx(AppSelect, { value: useMode, ariaLabel: '适用方式', placeholder: '请选择适用方式', onChange: setUseMode, options: [{ value: '', label: '请选择适用方式' }, { value: 'manual', label: '仅手动使用' }, { value: 'relevant', label: '相关时自动使用' }, { value: 'session_start', label: '新会话自动加载' }] })] }),
      ] })
    }
    function Workflow({ document: initial }) { return jsx(FileLibrary, { kind: 'workflow', initial }) }
    function Archive({ document: initial }) { installStyles(); return jsx(FileLibrary, { kind: 'archive', initial }) }

    function InlineNodeName({ node, selected, onSelect, onOpen, onRename, editRequest }) {
      const [editing, setEditing] = React.useState(false)
      const [value, setValue] = React.useState(displayName(node))
      const [error, setError] = React.useState('')
      const timer = React.useRef(null), finishing = React.useRef(false)
      const cancelTimer = () => { if (timer.current) window.clearTimeout(timer.current); timer.current = null }
      const start = () => { if (!onRename) return; finishing.current = false; setError(''); setEditing(true) }
      React.useEffect(() => { setValue(displayName(node)); setEditing(false); cancelTimer() }, [node.documentKey, node.relativePath, node.name])
      React.useEffect(() => { if (!selected) cancelTimer() }, [selected])
      React.useEffect(() => { if (editRequest) start() }, [editRequest])
      React.useEffect(() => () => cancelTimer(), [])
      const finish = async () => {
        if (finishing.current) return
        finishing.current = true
        const next = value.trim()
        if (!next || next === displayName(node)) { setValue(displayName(node)); setEditing(false); return }
        try { if (await onRename(node, next) === false) throw new Error('改名失败，请修改名称后重试。'); setEditing(false) }
        catch (cause) { setError(cause.message); finishing.current = false }
      }
      if (editing) return jsx('span', { children: [jsx('input', { autoFocus: true, value, className: 'lexflowWorkflowInlineName', 'aria-label': '编辑名称', 'aria-invalid': Boolean(error), title: error || undefined, onClick: (event) => event.stopPropagation(), onDoubleClick: (event) => event.stopPropagation(), onChange: (event) => setValue(event.target.value), onBlur: () => void finish(), onKeyDown: (event) => { event.stopPropagation(); if (event.nativeEvent?.isComposing || event.isComposing || event.keyCode === 229) return; if (event.key === 'Enter') { event.preventDefault(); void finish() } if (event.key === 'Escape') { event.preventDefault(); finishing.current = true; setValue(displayName(node)); setEditing(false) } } }), error && jsx('span', { role: 'alert', children: error })] })
      return jsx('span', { className: 'lexflowWorkflowNameText', title: node.name, onPointerMove: (event) => { if (event.buttons) cancelTimer() }, onClick: (event) => { event.stopPropagation(); onSelect(node); if (selected && onRename && event.detail !== 2) { cancelTimer(); timer.current = window.setTimeout(start, 500) } }, onDoubleClick: (event) => { event.stopPropagation(); cancelTimer(); onOpen(node) }, children: displayName(node) })
    }

    function TreeList({ nodes, selected, selectedPaths = new Set(), selectMode = false, expandedFolders = {}, onSelect, onToggleFolder, onToggleSelect, onOpenFolder, onOpenFile, onContextMenu, onRename, onDrop }) {
      const [renameRequest, setRenameRequest] = React.useState(null)
      const isExpanded = (node) => expandedFolders[node.relativePath] ?? false
      return jsx(Fragment, { children: nodes.map((node) => node.kind === 'folder'
        ? (() => {
          const expanded = isExpanded(node)
          return jsxs('div', { className: 'lexflowWorkflowFolderDetails', 'data-expanded': expanded, children: [
            jsxs('div', { className: 'lexflowWorkflowRow lexflowWorkflowFolderRow', 'data-selected': selected === nodeKey(node), tabIndex: 0, role: 'button', 'aria-selected': selected === nodeKey(node), draggable: true, onDragStart: (event) => { event.dataTransfer.setData('application/x-lexflow-path', node.relativePath); event.dataTransfer.effectAllowed = 'move' }, onDragOver: (event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move' }, onDrop: (event) => { event.preventDefault(); event.stopPropagation(); onDrop?.(event.dataTransfer.getData('application/x-lexflow-path'), node.relativePath) }, onClick: (event) => onSelect(node, event), onDoubleClick: (event) => { event.preventDefault(); onOpenFolder(node) }, onContextMenu: (event) => { event.preventDefault(); onContextMenu(event, node) }, onKeyDown: (event) => { if (event.target !== event.currentTarget) return; if (event.key === 'F2') { event.preventDefault(); onSelect(node, event); setRenameRequest({ key: nodeKey(node) }) }; if (event.key === 'Enter') { event.preventDefault(); onOpenFolder(node) } if (event.key === 'F10' && event.shiftKey) { event.preventDefault(); onContextMenu(event, node) } }, children: [
              selectMode && jsx('input', { type: 'checkbox', checked: selectedPaths.has(nodeKey(node)), 'aria-label': '选择 ' + node.name, onClick: (event) => event.stopPropagation(), onChange: (event) => onToggleSelect?.(node, event) }, 'select'),
              jsxs('span', { className: 'lexflowWorkflowName', children: [
                jsx('button', { type: 'button', className: 'lexflowWorkflowDisclosure', 'aria-label': expanded ? '收起文件夹' : '展开文件夹', 'aria-expanded': expanded, onDoubleClick: (event) => { event.preventDefault(); event.stopPropagation() }, onClick: (event) => { event.stopPropagation(); onToggleFolder(node.relativePath) }, children: jsx(ChevronIcon, { expanded }) }, 'disclosure'),
                jsx('span', { className: 'lexflowWorkflowFolderIcon', 'aria-hidden': true, children: jsx(FolderIcon, { open: expanded || selected === nodeKey(node) }) }, 'folder'),
                jsx(InlineNodeName, { node, editRequest: renameRequest?.key === nodeKey(node) ? renameRequest : null, selected: selected === nodeKey(node), onSelect, onOpen: onOpenFolder, onRename }, 'name'),
              ] }),
              jsx('span', { className: 'lexflowWorkflowSecondary', 'data-column': 'modified', children: (node.children ?? []).length + ' 项' }),
              jsx('span', { className: 'lexflowWorkflowType', 'data-column': 'type', children: '文件夹' }),
            ] }),
            expanded && jsx('div', { className: 'lexflowWorkflowFolderChildren', 'data-expanded': expanded, children: jsx('div', { className: 'lexflowWorkflowFolderChildrenInner', children: jsx(TreeList, { nodes: node.children ?? [], selected, selectedPaths, selectMode, expandedFolders, onSelect, onToggleFolder, onToggleSelect, onOpenFolder, onOpenFile, onContextMenu, onRename, onDrop }) }) }),
          ] }, node.relativePath)
        })()
        : jsx('div', { className: 'lexflowWorkflowRow', 'data-selected': selected === nodeKey(node), tabIndex: 0, role: 'button', 'aria-selected': selected === nodeKey(node), draggable: !node.builtin, onDragStart: (event) => { if (node.builtin) return; event.dataTransfer.setData('application/x-lexflow-path', node.relativePath); event.dataTransfer.effectAllowed = 'move' }, onDragOver: (event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move' }, onDrop: (event) => { if (node.builtin) return; event.preventDefault(); event.stopPropagation(); onDrop?.(event.dataTransfer.getData('application/x-lexflow-path'), parentPath(node.relativePath)) }, onClick: (event) => onSelect(node, event), onDoubleClick: (event) => { event.preventDefault(); onOpenFile(node) }, onContextMenu: (event) => { event.preventDefault(); if (!node.builtin) onContextMenu(event, node) }, onKeyDown: (event) => { if (event.target !== event.currentTarget) return; if (event.key === 'F2' && !node.builtin) { event.preventDefault(); onSelect(node, event); setRenameRequest({ key: nodeKey(node) }) }; if (event.key === 'Enter') { event.preventDefault(); onOpenFile(node) } if (event.key === 'F10' && event.shiftKey && !node.builtin) { event.preventDefault(); onContextMenu(event, node) } }, children: [selectMode && jsx('input', { type: 'checkbox', checked: !node.builtin && selectedPaths.has(nodeKey(node)), disabled: node.builtin, 'aria-label': '选择 ' + node.name, onClick: (event) => event.stopPropagation(), onChange: (event) => onToggleSelect?.(node, event) }, 'select'), jsx('span', { className: 'lexflowWorkflowName', children: [jsx('span', { className: 'lexflowWorkflowFileIcon', 'aria-hidden': true, children: node.type === 'workflow' ? jsx(WorkflowFileIcon, {}) : jsx(MemoryFileIcon, {}) }, 'icon'), jsx(InlineNodeName, { node, editRequest: renameRequest?.key === nodeKey(node) ? renameRequest : null, selected: selected === nodeKey(node), onSelect, onOpen: onOpenFile, onRename: node.builtin ? undefined : onRename }, 'text')] }, 'name'), jsx('span', { className: 'lexflowWorkflowSecondary', 'data-column': 'modified', children: dateLabel(node.updatedAt) }, 'modified'), jsx('span', { className: 'lexflowWorkflowType', 'data-column': 'type', children: typeLabel(node.type) }, 'type')] }, nodeKey(node))
      ) })
    }

    function ToolIcon({ name }) {
      const paths = { undo: 'M6 4 2 8l4 4M2 8h7a5 5 0 0 1 5 5', redo: 'm10 4 4 4-4 4m4-4H7a5 5 0 0 0-5 5', highlight: 'M11.3 2.4 13.6 4.7 8.2 10.1 5 11.6 6.5 8.4 11.3 2.4ZM2.6 14.4h10.8', task: 'M6 3H2v11h12V9M5 7l3 3 6-7', export: 'M6 3H2v11h12v-4M8 2h6v6m0-6L7 9' }
      if (name === 'quote') return QuoteIcon()
      return jsx('svg', { 'aria-hidden': true, width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', children: jsx('path', { d: paths[name], stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }) })
    }
    function QuoteIcon() {
      return jsxs('svg', { 'aria-hidden': true, width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', children: [
        jsx('circle', { cx: 4.6, cy: 6.9, fill: 'currentColor', r: 1.35 }),
        jsx('circle', { cx: 10.4, cy: 6.9, fill: 'currentColor', r: 1.35 }),
        jsx('path', { d: 'M3.2 8.4c0 2.4 1.1 3.9 3 4.6M9 8.4c0 2.4 1.1 3.9 3 4.6', stroke: 'currentColor', strokeLinecap: 'round', strokeWidth: 1.3 }),
      ] })
    }
    function WorkbenchToolButton({ label, onClick, children, disabled = false, primary = false, format = false }) {
      return jsx('button', { type: 'button', className: [primary ? 'lexflowWorkbenchToolButton lexflowWorkbenchToolButtonPrimary' : 'lexflowWorkbenchToolButton', format ? 'lexflowWorkbenchFormat' : ''].join(' '), title: label, 'aria-label': label, disabled, onMouseDown: (event) => event.preventDefault(), onClick, children })
    }

    function UnsavedDialog({ onSave, onDiscard, onCancel }) {
      return jsx(Dialog, { title: '存在未保存的修改', description: '退出前请选择如何处理当前修改。', onClose: onCancel, compact: true, actions: jsxs(Fragment, { children: [jsx('button', { type: 'button', style: { ...button, fontSize: '12px', padding: '5px 10px' }, onClick: onDiscard, children: '放弃' }), jsx('button', { type: 'button', style: { ...button, background: 'var(--lexflow-dsw-alias-state-business-primary)', borderColor: 'transparent', color: '#fff', fontSize: '12px', padding: '5px 10px' }, onClick: onSave, children: '保存' })] }), children: jsx('p', { style: { fontSize: '11px' }, children: '取消将继续留在当前编辑页面。' }) })
    }

    function Workbench({ document: initial }) {
      installStyles()
      const initialTitle = initial?.kind === 'agent' ? 'AGENT.md' : documentTitleOf(initial?.item) || (initial?.mode === 'new' ? '未命名文件' : '')
      const [document, setDocument] = React.useState(initial ?? null)
      const [content, setContent] = React.useState(initial?.content ?? '')
      const [title, setTitle] = React.useState(initialTitle)
      const [editorMode, setEditorMode] = React.useState('live')
      const previewOnly = editorMode === 'reading'
      const [editorState, setEditorState] = React.useState({ undo: false, redo: false, mode: 'live', line: 1, focused: false })
      const [titleEditing, setTitleEditing] = React.useState(false)
      const [headingLevel, setHeadingLevel] = React.useState('')
      const [highlightOpen, setHighlightOpen] = React.useState(false)
      const highlightRef = React.useRef(null)
      const [insertOpen, setInsertOpen] = React.useState(false)
      const insertRef = React.useRef(null)
      const insertFileRef = React.useRef(null)
      const [tablePicker, setTablePicker] = React.useState(null)
      const [highlightColor, setHighlightColorState] = React.useState(() => { try { return window.localStorage?.getItem('lexflow.highlightColor') || DEFAULT_HIGHLIGHT_COLOR } catch { return DEFAULT_HIGHLIGHT_COLOR } })
      const setHighlightColor = (color) => { setHighlightColorState(color); try { window.localStorage?.setItem('lexflow.highlightColor', color) } catch {} }
      React.useEffect(() => { window.document.documentElement?.style?.setProperty('--lexflow-highlight-color', highlightColor) }, [highlightColor])
      React.useEffect(() => {
        if (!highlightOpen) return
        const close = (event) => { if (!highlightRef.current?.contains(event.target)) setHighlightOpen(false) }
        const escape = (event) => { if (event.key === 'Escape') setHighlightOpen(false) }
        window.document.addEventListener('mousedown', close)
        window.document.addEventListener('keydown', escape)
        return () => { window.document.removeEventListener('mousedown', close); window.document.removeEventListener('keydown', escape) }
      }, [highlightOpen])
      React.useEffect(() => {
        if (!insertOpen) return
        const close = (event) => { if (!insertRef.current?.contains(event.target)) setInsertOpen(false) }
        const escape = (event) => { if (event.key === 'Escape') setInsertOpen(false) }
        window.document.addEventListener('mousedown', close)
        window.document.addEventListener('keydown', escape)
        return () => { window.document.removeEventListener('mousedown', close); window.document.removeEventListener('keydown', escape) }
      }, [insertOpen])
      const [archiveExport, setArchiveExport] = React.useState(null)
      const [savePicker, setSavePicker] = React.useState(null)
      const [targetFolder, setTargetFolder] = React.useState(initial?.targetFolder ?? '')
      const [status, setStatus] = React.useState('')
      const [error, setError] = React.useState('')
      const [pendingExit, setPendingExit] = React.useState(null)
      const editorRef = React.useRef(null)
      const titleInputRef = React.useRef(null)
      const allowNavigationRef = React.useRef(false)
      const savingRef = React.useRef(false)
      const saveIntentRef = React.useRef(false)
      const saveSequence = React.useRef(0)
      const latestTitle = React.useRef(title)
      latestTitle.current = title
      const type = document?.kind === 'agent' ? 'agent' : document?.item?.type ?? document?.type
      const targetFolders = document?.targetFolders ?? []
      const editableBlock = Boolean(document && !previewOnly)
      const updateContent = (next) => { saveIntentRef.current = true; setContent(next); setStatus('未保存的修改') }
      const onEditorState = (next) => setEditorState((old) => old.undo === next.undo && old.redo === next.redo && old.mode === next.mode && old.line === next.line && old.focused === next.focused ? old : next)
      const insertMarkdown = (before, after = '') => { if (after) editorRef.current?.inline(before, after); else editorRef.current?.linePrefix(before) }
      const MAX_INLINE_IMAGE_BYTES = 8 * 1024 * 1024
      const insertFile = (file) => {
        if (file) void insertAssetFile(file).catch((cause) => setError(cause.message))
      }
      const insertAssetFile = async (file, lineStart = null) => {
        const editor = editorRef.current
        if (!editor || !editableBlock) return
        if (file.size > MAX_INLINE_IMAGE_BYTES) throw new Error('图片过大，内联图片不超过 8MB。')
        const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('读取图片失败。')); reader.readAsDataURL(file) })
        if (!/^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/u.test(dataUrl)) throw new Error('请选择 PNG、JPEG、GIF 或 WebP 图片。')
        if (editorRef.current !== editor) return
        const label = file.name.replace(/\.[^.]+$/u, '').replace(/[\[\]\\\r\n]/gu, '_')
        const text = '![' + label + '](' + dataUrl + ')'
        if (new TextEncoder().encode(editor.getValue() + text).length > 32 * 1024 * 1024 - 2) throw new Error('加入图片后文档超过 32 MiB，请缩小图片。')
        editor.insertAtCursor(text, lineStart)
      }
      const dropImage = async (files, lineStart) => {
        try { for (const file of files) await insertAssetFile(file, lineStart) } catch (cause) { setError(cause.message) }
      }
      const insertImage = () => {
        if (!insertFileRef.current) {
          insertFileRef.current = window.document.createElement('input')
          insertFileRef.current.type = 'file'
          insertFileRef.current.accept = 'image/png,image/jpeg,image/gif,image/webp'
          insertFileRef.current.style.display = 'none'
          window.document.body.appendChild(insertFileRef.current)
          insertFileRef.current.addEventListener('change', () => { const file = insertFileRef.current?.files?.[0]; insertFileRef.current.value = ''; insertFile(file) })
        }
        insertFileRef.current.click()
      }
      const insertTable = () => setTablePicker({ rows: 3, columns: 3 })
      const applyHeading = (level) => editorRef.current?.linePrefix('#'.repeat(level) + ' ', true)
      const beginTitleEdit = () => { if (previewOnly || document?.kind === 'agent') return; setTitleEditing(true) }
      const undo = () => editorRef.current?.undo()
      const redo = () => editorRef.current?.redo()
      React.useEffect(() => {
        const nextTitle = initial?.kind === 'agent' ? 'AGENT.md' : documentTitleOf(initial?.item) || (initial?.mode === 'new' ? '未命名文件' : '')
        setDocument(initial ?? null); setContent(initial?.content ?? ''); setTitle(nextTitle); setEditorMode('live'); setTitleEditing(false); setTargetFolder(initial?.targetFolder ?? ''); setStatus(''); setError(''); setPendingExit(null); setSavePicker(null); saveIntentRef.current = false; allowNavigationRef.current = false
      }, [initial])
      React.useEffect(() => { if (!previewOnly && titleEditing) titleInputRef.current?.focus() }, [previewOnly, titleEditing])
      React.useEffect(() => { const timer = setTimeout(() => { if (document && content !== document.content) api('workbench.saveDraft', { id: document.draftId || document.id || 'new', content }).then(() => setStatus('草稿已自动保存'), (cause) => setError(cause.message)) }, 900); return () => clearTimeout(timer) }, [content, document, title])
      const dirty = Boolean(document && (document.mode === 'new' ? saveIntentRef.current || content !== '' || title !== initialTitle : content !== document.content || title.trim() !== (document.kind === 'agent' ? 'AGENT.md' : documentTitleOf(document.item))))
      const performSave = async (chosenFolder, fromPicker = false) => {
        if (savingRef.current) return false
        if (editorRef.current?.composing()) { setError('请先完成当前中文输入，再保存。'); return false }
        if (document?.mode === 'new' && document.kind !== 'agent' && !fromPicker) { try { const listing = await api(document.kind + '.list', { knowledgeBaseId: document.knowledgeBaseId }); setSavePicker({ folders: foldersFromTree(listing.nodes ?? []), value: targetFolder || '.' }); } catch (cause) { setError(cause.message) }; return false }
        savingRef.current = true
        const snapshot = editorRef.current?.getValue() ?? content
        const requestId = `${document?.kind ?? 'document'}:${document?.draftId ?? document?.id ?? 'new'}:${saveSequence.current += 1}`
        const unchanged = () => (editorRef.current?.getValue() ?? content) === snapshot && latestTitle.current === title
        try {
          if (!document) return false
          if (document.kind !== 'agent' && !title.trim()) throw new Error('请输入文件名称。')
          if (document.kind === 'agent') {
            const saved = await api('workflow.agent.save', { content: snapshot, revision: document.revision })
            setDocument({ ...document, content: snapshot, revision: saved.revision }); setStatus('全局规则已保存'); setError(''); return unchanged()
          }
          const parent = chosenFolder ?? targetFolder
          if (document.kind === 'workflow') {
            if (!type) throw new Error('请先在预览页设置内容类型。')
            if (!parent && document.mode === 'new') throw new Error('请先选择保存位置。')
            const result = await api('workflow.commitDocument', { requestId, knowledgeBaseId: document.knowledgeBaseId, mode: document.mode === 'new' ? 'new' : 'existing', relativePath: document.mode === 'new' ? undefined : document.id, parent: document.mode === 'new' ? parent : undefined, name: title, type, content: snapshot, revision: document.mode === 'new' ? undefined : document.revision })
            const nextDocument = { ...document, mode: 'existing', id: result.relativePath, item: result.item, content: result.content, revision: result.revision, targetFolders }
            setDocument(nextDocument); if (result.status === 'content-saved-rename-failed') { setError('正文已保存，改名未完成：' + (result.error || '请重试')); setStatus('正文已保存，文件名称仍待处理'); return false }; if (unchanged()) { setContent(result.content); setTitle(documentTitleOf(result.item)) }; setTargetFolder(parentPath(result.relativePath)); setTitleEditing(false); setStatus(unchanged() ? '已保存' : '已保存，仍有新的修改'); setError('')
          } else if (document.kind === 'archive') {
            if (!parent && document.mode === 'new') throw new Error('请先选择保存位置。')
            const result = await api('archive.commitDocument', { requestId, knowledgeBaseId: document.knowledgeBaseId, mode: document.mode === 'new' ? 'new' : 'existing', relativePath: document.mode === 'new' ? undefined : document.id, parent: document.mode === 'new' ? parent : undefined, name: title, content: snapshot, revision: document.mode === 'new' ? undefined : document.revision })
            const nextDocument = { ...document, mode: 'existing', id: result.relativePath, content: result.content, revision: result.revision, item: result.item, targetFolders }
            setDocument(nextDocument); if (result.status === 'content-saved-rename-failed') { setError('正文已保存，改名未完成：' + (result.error || '请重试')); setStatus('正文已保存，文件名称仍待处理'); return false }; if (unchanged()) { setContent(result.content); setTitle(documentTitleOf(result.item)) }; setTitleEditing(false); setStatus(unchanged() ? '已保存到档案室' : '已保存，仍有新的修改'); setError('')
          } else throw new Error('不支持的编辑类型。')
          const saved = unchanged()
          saveIntentRef.current = !saved
                    return saved
        } catch (cause) { setError(cause.message); return false } finally { savingRef.current = false }
      }
      const save = () => performSave(undefined, false)
      const exit = () => { const destination = document?.kind === 'workflow' ? { page: 'workflow', document: { browsePath: document.browsePath ?? '.' } } : document?.kind === 'archive' ? { page: 'archive', document: { browsePath: document.browsePath ?? '.' } } : { page: 'conversation' }; if (dirty) setPendingExit(destination); else go(destination.page, destination.document) }
      React.useEffect(() => {
        const onNavigate = (event) => { const page = event.detail?.page ?? 'conversation'; if (!dirty || allowNavigationRef.current) return; event.preventDefault(); event.stopImmediatePropagation(); setPendingExit({ page, document: event.detail?.document ?? null, afterNavigate: event.detail?.afterNavigate }) }
        window.addEventListener('lexflow:navigate', onNavigate, true); return () => window.removeEventListener('lexflow:navigate', onNavigate, true)
      }, [dirty])
      React.useEffect(() => { const onKeyDown = (event) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') { event.preventDefault(); void save() } }; window.addEventListener('keydown', onKeyDown); return () => window.removeEventListener('keydown', onKeyDown) }, [document, content, title, targetFolder])
      const leaveAfterExit = (destination) => { allowNavigationRef.current = true; setPendingExit(null); go(destination.page, destination.document); destination.afterNavigate?.(); window.setTimeout(() => { allowNavigationRef.current = false }, 0) }
      if (!document) return jsx('main', { className: 'lexflowWorkbenchHome lexflowWorkflowEmpty', children: [jsx('strong', { children: '工作台' }), jsx('p', { children: '选择文件后，在这里查看或编辑。' })] })
      const tool = (label, glyph, onClick, disabled = !editableBlock) => jsx(WorkbenchToolButton, { label, onClick, disabled, format: true, children: jsx('span', { className: 'lexflowWorkbenchGlyph', 'aria-hidden': true, children: glyph }) }, label)
      return jsxs('main', { className: 'lexflowWorkbenchPage', children: [
        jsx('div', { className: 'lexflowWorkflowDragBar' }),
        jsxs('header', { className: 'lexflowWorkbenchHeader', children: [
          jsx('div', { className: 'lexflowWorkbenchTitleWrap', children: titleEditing && !previewOnly && document.kind !== 'agent' ? jsx('input', { autoFocus: true, ref: titleInputRef, value: title, onChange: (event) => { saveIntentRef.current = true; setTitle(event.target.value); setStatus('未保存的修改') }, onBlur: () => setTitleEditing(false), onKeyDown: (event) => { if (event.isComposing || event.keyCode === 229) return; if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur() } if (event.key === 'Escape') { setTitle(document.mode === 'new' ? initialTitle : documentTitleOf(document.item)); setStatus(''); event.currentTarget.blur() } }, className: 'lexflowWorkbenchTitleInput', 'aria-label': '编辑文件标题' }) : jsx('div', { className: 'lexflowWorkbenchTitleButton', role: 'button', tabIndex: 0, onClick: beginTitleEdit, onKeyDown: (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); beginTitleEdit() } }, children: jsx('h1', { className: 'lexflowWorkbenchTitleText', children: title || '未命名文件' }) }) }),
          jsxs('div', { className: 'lexflowWorkbenchHeaderActions', children: [jsx(AppSelect, { className: 'lexflowWorkbenchSelect', value: editorMode, ariaLabel: '编辑模式', onChange: (next) => { setTitleEditing(false); setEditorMode(next) }, options: [{ value: 'live', label: '实时预览' }, { value: 'source', label: '源码' }, { value: 'reading', label: '仅预览' }] }), jsx('button', { type: 'button', className: 'lexflowWorkflowIconButton', title: '退出工作台', 'aria-label': '退出工作台', onClick: exit, children: jsx(CloseIcon, {}) })] }),
        ] }),
        jsxs('div', { className: 'lexflowWorkbenchToolbar', 'data-mode': editorMode, children: [
          tool('撤销', jsx(ToolIcon, { name: 'undo' }), undo, previewOnly || !editorState.undo), tool('重做', jsx(ToolIcon, { name: 'redo' }), redo, previewOnly || !editorState.redo),
          jsx(AppSelect, { value: headingLevel, disabled: !editableBlock, ariaLabel: '标题', className: 'lexflowWorkbenchSelect lexflowWorkbenchFormat', onChange: (next) => { const level = Number(next); setHeadingLevel(''); applyHeading(level) }, options: [{ value: '', label: '标题', disabled: true }, ...[1, 2, 3, 4, 5, 6].map((level) => ({ value: level, label: level + ' 级标题' }))] }),
          tool('加粗', 'B', () => insertMarkdown('**', '**')), tool('斜体', 'I', () => insertMarkdown('*', '*')), tool('删除线', 'S', () => insertMarkdown('~~', '~~')),
          jsxs('span', { ref: highlightRef, className: 'lexflowHighlightControl', children: [
            jsxs('span', { className: 'lexflowHighlightCombo', children: [
              jsxs('button', { type: 'button', className: 'lexflowHighlightComboMain', title: '高亮', 'aria-label': '高亮', disabled: !editableBlock, onMouseDown: (event) => event.preventDefault(), onClick: () => insertMarkdown('==', '=='), children: [jsx('span', { className: 'lexflowWorkbenchGlyph', 'aria-hidden': true, children: jsx(ToolIcon, { name: 'highlight' }) }), jsx('span', { className: 'lexflowHighlightUnderbar', 'aria-hidden': true, style: { background: highlightColor } })] }),
              jsx('button', { type: 'button', className: 'lexflowHighlightComboArrow', title: '高亮颜色', 'aria-label': '高亮颜色', 'aria-haspopup': 'true', 'aria-expanded': highlightOpen, disabled: !editableBlock, onMouseDown: (event) => event.preventDefault(), onClick: () => setHighlightOpen((state) => !state), children: jsx('span', { className: 'lexflowHighlightCaret', 'aria-hidden': true, children: '⌄' }) }),
            ] }),
            highlightOpen && jsx('div', { className: 'lexflowHighlightBoard', role: 'group', 'aria-label': '高亮颜色', children: HIGHLIGHT_COLORS.map((color) => jsx('button', { key: color.value, type: 'button', className: 'lexflowHighlightChip', 'aria-label': color.name, 'aria-pressed': color.value === highlightColor, title: color.name, style: { background: color.value }, onClick: () => { setHighlightColor(color.value); setHighlightOpen(false) } }, color.value)) }),
          ] }),
          tool('列表', '•', () => insertMarkdown('- ')), tool('有序列表', '1.', () => insertMarkdown('1. ')), tool('任务', jsx(ToolIcon, { name: 'task' }), () => insertMarkdown('- [ ] ')), tool('引用', jsx(ToolIcon, { name: 'quote' }), () => insertMarkdown('> ')),
          jsx('span', { className: 'lexflowWorkbenchToolbarSpacer' }),
          jsxs('span', { ref: insertRef, className: 'lexflowWorkbenchInsert', children: [
            jsx('button', { type: 'button', className: 'lexflowWorkbenchToolButton', 'aria-label': '插入', title: '插入', 'aria-haspopup': 'true', 'aria-expanded': insertOpen, disabled: !editableBlock, onClick: () => setInsertOpen((state) => !state), children: jsx(PlusIcon, {}) }),
            insertOpen && jsxs('div', { className: 'lexflowWorkbenchInsertMenu', role: 'menu', children: [
              jsx('button', { type: 'button', role: 'menuitem', onClick: () => { setInsertOpen(false); void insertImage() }, children: '插入图片' }),
              jsx('button', { type: 'button', role: 'menuitem', onClick: () => { setInsertOpen(false); insertTable() }, children: '插入表格' }),
            ] }),
          ] }),
          jsx('button', { type: 'button', className: 'lexflowWorkbenchToolButton', 'aria-label': '查找正文', title: '查找正文', onClick: () => editorRef.current?.search(), children: jsx(SearchIcon, {}) }),
          document.kind !== 'agent' && jsx('button', { type: 'button', className: 'lexflowWorkbenchToolButton', title: '另存到档案室', 'aria-label': '另存到档案室', onClick: async () => { try { const result = await api('archive.list', { knowledgeBaseId: document.knowledgeBaseId }); setArchiveExport(foldersFromTree(result.nodes).map((folder, index) => index === 0 ? { ...folder, label: '档案室区域' } : folder)) } catch (cause) { setError(cause.message) } }, children: jsx(ToolIcon, { name: 'export' }) }),
          jsx('button', { type: 'button', className: 'lexflowWorkbenchToolButton lexflowWorkbenchToolButtonPrimary', title: '保存', 'aria-label': '保存', onClick: () => void save(), children: jsx(SaveIcon, {}) }),
        ] }),
        error && jsx('p', { className: 'lexflowWorkflowError', role: 'alert', children: error }),
        jsx('div', { className: 'lexflowWorkbenchCanvas', 'data-preview-only': previewOnly, children: jsx(MarkdownEditorSurface, { sessionKey: [initial?.kind, initial?.id ?? 'new', initial?.knowledgeBaseId ?? ''].join(':'), content, mode: editorMode, onChange: updateContent, onState: onEditorState, editorRef, resolveImage: async (href) => { if (/^data:image\/(?:png|jpeg|gif|webp);base64,/iu.test(href)) return href; if (!document.id) return null; const result = await api(document.kind === 'archive' ? 'archive.asset' : 'workflow.asset', { documentPath: document.id, href, knowledgeBaseId: document.knowledgeBaseId }); return result.src }, onDropImage: (files, lineStart) => { void dropImage(files, lineStart) } }) }),
        jsx('div', { className: 'lexflowWorkbenchStatus', children: [jsx('span', { children: previewOnly ? '仅预览模式' : titleEditing ? '编辑标题' : '编辑正文 第' + editorState.line + '行' }), jsx('span', { children: content.replace(/!\[[^\]]*\]\(data:image\/[^)]+\)/gu, '').replace(/\s/g, '').length + ' 字' })] }),
        status && jsx('p', { className: 'lexflowWorkbenchNotice', role: 'status', children: status }),
        savePicker && jsx(MoveDialog, { folders: savePicker.folders, value: savePicker.value, scope: document.kind, rootLabel: document.kind === 'archive' ? '档案室区域' : '工作流区域', title: '选择保存位置', onClose: () => setSavePicker(null), onSubmit: async (parent) => { setTargetFolder(parent); setSavePicker(null); if (await performSave(parent, true)) { if (pendingExit) leaveAfterExit(pendingExit) } } }),
        archiveExport && jsx(MoveDialog, { folders: archiveExport, scope: 'archive', rootLabel: '档案室区域', title: '另存到档案室', onClose: () => setArchiveExport(null), onSubmit: async (parent) => { try { await api('archive.createMarkdown', { knowledgeBaseId: document.knowledgeBaseId, parent, name: title || '未命名文件', content: content.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/u, '') }); setArchiveExport(null); setStatus('已另存到档案室，源文件保留') } catch (cause) { setError(cause.message) } } }),
        pendingExit && jsx(UnsavedDialog, { onSave: async () => { const destination = pendingExit; if (await save()) leaveAfterExit(destination) }, onDiscard: () => leaveAfterExit(pendingExit), onCancel: () => setPendingExit(null) }),
        tablePicker && jsx(TablePickerDialog, { onClose: () => setTablePicker(null), onPick: (rows, columns) => {
          setTablePicker(null)
          const header = '| ' + Array.from({ length: columns }, (_item, index) => '列' + (index + 1)).join(' | ') + ' |'
          const divider = '| ' + Array.from({ length: columns }, () => '---').join(' | ') + ' |'
          const body = Array.from({ length: rows }, () => '| ' + Array.from({ length: columns }, () => '　').join(' | ') + ' |')
          editorRef.current?.insertAtCursor([header, divider, ...body].join('\n'))
        } }),
      ] })
    }

    const inject = []
    function apply() {}
    exports.configure = configure
    exports.pages = { Workflow, Archive, Workbench }
    exports.AppSelect = AppSelect
    exports.apply = apply
    return module.exports
  },
})
