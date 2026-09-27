import mammoth from 'mammoth'
import TurndownService from 'turndown'
import * as XLSX from 'xlsx'
import * as DOCX from 'docx'
import PptxGenJS from 'pptxgenjs'
import { createRequire } from 'node:module'
const { gfm } = createRequire(import.meta.url)('turndown-plugin-gfm')
import { randomUUID, createHash } from 'node:crypto'
import { existsSync, realpathSync } from 'node:fs'
import { cp, copyFile, link, lstat, mkdir, open, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { atomicWrite, inside, safeName, safeRelative } from './file-boundary.js'

export const inject = ['lexflow']

const FILE_TYPES = new Set(['workflow', 'memory'])
const MAX_MARKDOWN_BYTES = 32 * 1024 * 1024
const KNOWLEDGE_INDEX_VERSION = 1
const WORKFLOW_SETTINGS_VERSION = 1
const MAX_TOOL_READ_BYTES = 256 * 1024
const MAX_DOCUMENT_TOOL_BYTES = 64 * 1024 * 1024
const ARCHIVE_FOLDER_NAME = '档案室'
const WORKFLOW_FOLDER_NAME = '工作流'
// Paths remain knowledge-base-relative so file identities and session bindings survive moves.
function workflowPath(value = '.') {
  const relative = toPortablePath(safeRelative(value || '.'))
  if (relative === '.') return WORKFLOW_FOLDER_NAME
  if (relative === ARCHIVE_FOLDER_NAME || relative.startsWith(ARCHIVE_FOLDER_NAME + '/')) throw new Error('工作流操作只能访问工作流目录。')
  return relative === WORKFLOW_FOLDER_NAME || relative.startsWith(WORKFLOW_FOLDER_NAME + '/') ? relative : WORKFLOW_FOLDER_NAME + '/' + relative
}
const DEFAULT_USE_MODE = 'manual'
const NEW_USE_MODE = 'relevant'
const USE_MODES = new Set(['manual', 'relevant', 'session_start'])
const digest = (value) => createHash('sha256').update(value).digest('hex')
const json = (res, status, payload) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(payload))
}
const FONT_FILES = new Set(['SourceHanSerifSC-Regular.otf', 'SourceHanSerifSC-SemiBold.otf'])
const fontRoot = process.env.LEXFLOW_FONT_ROOT ? path.resolve(process.env.LEXFLOW_FONT_ROOT) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../fonts')
const OCR_DIRECTORY_ENV = 'LEXFLOW_OCR_DIR'
const appRuntimeOcrDirectory = () => path.resolve(process.env[OCR_DIRECTORY_ENV] || path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../../resources/ocr'))
const sendFont = async (name, res) => {
  if (!FONT_FILES.has(name)) { res.writeHead(404); res.end(); return }
  try {
    const filename = path.join(fontRoot, name)
    const info = await stat(filename)
    if (!info.isFile()) throw new Error('not a file')
    res.writeHead(200, { 'content-type': 'font/otf', 'cache-control': 'public, max-age=31536000, immutable', 'content-length': info.size })
    res.end(await readFile(filename))
  } catch { res.writeHead(404); res.end() }
}

const titleOf = (filename) => path.basename(filename, '.md')
const toPortablePath = (value) => value.split(path.sep).join('/')
const within = (root, target) => target === root || target.startsWith(root + path.sep)

function frontmatterOf(content) {
  const match = String(content).match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u)
  if (!match) return undefined
  const raw = match[0]
  return {
    body: String(content).slice(raw.length),
    text: match[1],
    newline: raw.includes('\r\n') ? '\r\n' : '\n',
    hasClosingNewline: raw.endsWith('\n'),
  }
}

function typeOf(content) {
  const frontmatter = frontmatterOf(content)
  const match = frontmatter?.text.match(/^type:\s*(workflow|memory)\s*$/mu)
  return match?.[1] ?? null
}

// 文件身份写在文件头（与 type 并列），而不是只记在按路径组织的外部索引里。
// 索引按路径记账，用户在访达改名/移动后路径变化即认作新文件、身份丢失，
// 已应用该文件的对话随即失配；把身份挂在文件上，改名、移动、跨机搬运都随文件走。
// 新号一律是 UUID；此处放宽为一般令牌，使历史索引里的既有编号也能被识别——
// 若只认 UUID，这类编号每次刷新都会被重写，陷入反复改写的循环。
const ID_PATTERN = /^[A-Za-z0-9_-]{4,64}$/u

function idOf(content) {
  const match = frontmatterOf(content)?.text.match(/^lexflow-id:\s*(\S+)\s*$/mu)
  return match && ID_PATTERN.test(match[1]) ? match[1] : null
}

function withId(content, id) {
  const source = String(content ?? '')
  if (idOf(source) === id) return source
  const frontmatter = frontmatterOf(source)
  const line = 'lexflow-id: ' + id
  if (!frontmatter) return '---\n' + line + '\n---\n\n' + source
  const lines = frontmatter.text.split(/\r?\n/u)
  let replaced = false
  const next = lines.map((item) => {
    if (/^lexflow-id:\s*/u.test(item)) { replaced = true; return line }
    return item
  })
  if (!replaced) next.push(line)
  const closing = '---' + (frontmatter.hasClosingNewline ? frontmatter.newline : '')
  return (source.startsWith('\uFEFF') ? '\uFEFF' : '') + '---' + frontmatter.newline + next.join(frontmatter.newline) + frontmatter.newline + closing + frontmatter.body
}

function withType(content, type) {
  if (!FILE_TYPES.has(type)) throw new Error('文件类型必须是工作流或长期记忆。')
  const source = String(content ?? '')
  if (typeOf(source) === type) return source
  const frontmatter = frontmatterOf(source)
  if (!frontmatter) return '---\ntype: ' + type + '\n---\n\n' + source
  const lines = frontmatter.text.split(/\r?\n/u)
  let replaced = false
  const next = lines.map((line) => {
    if (/^type:\s*/u.test(line)) {
      replaced = true
      return 'type: ' + type
    }
    return line
  })
  if (!replaced) next.unshift('type: ' + type)
  const closing = '---' + (frontmatter.hasClosingNewline ? frontmatter.newline : '')
  return (source.startsWith('\uFEFF') ? '\uFEFF' : '') + '---' + frontmatter.newline + next.join(frontmatter.newline) + frontmatter.newline + closing + frontmatter.body
}

function descriptionOf(content) {
  const body = String(content).replace(/^---[\s\S]*?\r?\n---(?:\r?\n|$)/u, '')
  const paragraph = body.split(/\n\s*\n/u).map((item) => item.replace(/^#+\s*/u, '').trim()).find(Boolean)
  return (paragraph ?? '暂无简介。').slice(0, 160)
}

function normalizedSearchText(value) {
  return String(value ?? '').normalize('NFKC').toLocaleLowerCase('zh-CN')
}

function searchTerms(value) {
  const text = normalizedSearchText(value)
  const terms = new Set(text.match(/[\p{L}\p{N}_-]{2,}/gu) ?? [])
  const han = [...text].filter((character) => /\p{Script=Han}/u.test(character))
  for (let index = 0; index + 1 < han.length; index += 1) terms.add(han[index] + han[index + 1])
  return [...terms].filter((term) => term.length > 1)
}

function scoreSearchText(query, haystack) {
  const needle = normalizedSearchText(query)
  const source = normalizedSearchText(haystack)
  if (!needle || !source) return 0
  let score = source.includes(needle) ? 4 : 0
  for (const term of searchTerms(query)) if (source.includes(term)) score += term.length > 2 ? 2 : 1
  return score
}

function ensureMarkdownName(name, requireExtension = false) {
  const raw = String(name ?? '').trim()
  if (requireExtension && !/\.(?:md|markdown)$/iu.test(raw)) throw new Error('目前只能导入 Markdown 文件。')
  return safeName(raw.replace(/\.(?:md|markdown)$/iu, ''), '.md')
}

function safeTargetName(name, isFile) {
  return isFile ? safeName(name, '.md') : safeName(name)
}

function builtinAgentEntry(content, updatedAt = new Date(0).toISOString()) {
  return {
    kind: 'file',
    name: 'AGENT.md',
    title: 'AGENT',
    type: 'agent',
    documentKey: 'builtin:agent',
    builtin: 'global-agent',
    pinned: true,
    readonlyName: true,
    capabilities: { rename: false, move: false, trash: false, setType: false },
    updatedAt,
    size: Buffer.byteLength(String(content ?? ''), 'utf8'),
    revision: digest(String(content ?? '')),
  }
}

function pathFromRoot(root, relativePath) {
  const safe = safeRelative(relativePath || '.')
  return { relativePath: toPortablePath(safe), filename: inside(root, safe) }
}

function truncateUtf8(value, maxBytes) {
  const source = String(value)
  if (Buffer.byteLength(source, 'utf8') <= maxBytes) return { content: source, truncated: false }
  let low = 0
  let high = source.length
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (Buffer.byteLength(source.slice(0, middle), 'utf8') <= maxBytes) low = middle
    else high = middle - 1
  }
  if (low > 0 && source.charCodeAt(low - 1) >= 0xd800 && source.charCodeAt(low - 1) <= 0xdbff) low -= 1
  return { content: source.slice(0, low), truncated: true }
}

function normalizeKnowledgeIndex(value, root) {
  const files = {}
  if (!value || typeof value !== 'object' || !value.files || typeof value.files !== 'object') return { version: KNOWLEDGE_INDEX_VERSION, files }
  for (const [rawPath, rawEntry] of Object.entries(value.files)) {
    if (!rawEntry || typeof rawEntry !== 'object') continue
    try {
      const relativePath = toPortablePath(safeRelative(rawPath))
      if (relativePath === '.' || !relativePath.toLowerCase().endsWith('.md') || !FILE_TYPES.has(rawEntry.type)) continue
      files[relativePath] = {
        fileId: typeof rawEntry.fileId === 'string' && rawEntry.fileId.length > 0 ? rawEntry.fileId : digest(root + '\0' + relativePath).slice(0, 32),
        relativePath,
        name: path.basename(relativePath),
        type: rawEntry.type,
        description: typeof rawEntry.description === 'string' ? rawEntry.description : '暂无简介。',
        updatedAt: typeof rawEntry.updatedAt === 'string' ? rawEntry.updatedAt : '',
        size: Number.isSafeInteger(rawEntry.size) && rawEntry.size >= 0 ? rawEntry.size : 0,
        revision: typeof rawEntry.revision === 'string' ? rawEntry.revision : '',
        searchTerms: Array.isArray(rawEntry.searchTerms) ? rawEntry.searchTerms.filter((item) => typeof item === 'string').slice(0, 256) : [],
        ...rawEntry.status === 'unreadable' || rawEntry.status === 'invalid' ? { status: rawEntry.status } : {},
      }
    } catch {}
  }
  return { version: KNOWLEDGE_INDEX_VERSION, files }
}

async function readKnowledgeIndex(indexRoot, root) {
  await mkdir(indexRoot, { recursive: true })
  const filename = path.join(indexRoot, digest(root).slice(0, 24) + '.json')
  return normalizeKnowledgeIndex(await readJsonFile(filename, null), root)
}

async function writeKnowledgeIndex(indexRoot, root, index) {
  await mkdir(indexRoot, { recursive: true })
  const filename = path.join(indexRoot, digest(root).slice(0, 24) + '.json')
  await atomicWrite(filename, JSON.stringify({ version: KNOWLEDGE_INDEX_VERSION, files: index.files }, null, 2) + '\n')
}

async function knowledgeIndexEntry(root, relativePath, signal, previous, options = {}) {
  const current = pathFromRoot(root, relativePath)
  if (!current.filename.toLowerCase().endsWith('.md')) throw new Error('这里只管理 Markdown 文件。')
  if (!(await stat(current.filename)).isFile()) throw new Error('知识库文件无效。')
  let content = await readFile(current.filename, { encoding: 'utf8', signal })
  const type = typeOf(content)
  if (!type) throw new Error('知识库文件缺少工作流或长期记忆类型。')
  // 身份以文件内的 lexflow-id 为准：改名、移动、跨机搬运都随文件走，
  // 因此已应用该文件的对话在文件改名后仍能对上号（修复"改名即失效"）。
  // renewId 供复制使用，复制品必须换发新号；taken 是其他条目已占用的编号，
  // 在访达里整份复制会带出同一个 lexflow-id，此时改发新号写回，避免两个文件互相顶替。
  const declared = idOf(content)
  const taken = options.taken ?? null
  const usable = (value) => typeof value === 'string' && value.length > 0 && taken?.has(value) !== true
  const fileId = options.renewId
    ? randomUUID()
    : (usable(declared) ? declared : (usable(previous?.fileId) ? previous.fileId : randomUUID()))
  if (fileId !== declared) {
    if (options.historyRoot) await historyCopy(options.historyRoot, 'workflow-identity', current.relativePath, current.filename)
    await atomicWrite(current.filename, withId(content, fileId))
    content = await readFile(current.filename, { encoding: 'utf8', signal })
  }
  const info = await stat(current.filename)
  return {
    fileId,
    relativePath: current.relativePath,
    name: path.basename(current.filename),
    type,
    updatedAt: info.mtime.toISOString(),
    size: info.size,
    revision: digest(content),
    searchTerms: searchTerms(content).slice(0, 256),
    description: descriptionOf(content),
  }
}

// 最近一次扫描得到的未归类文件（工作流目录中缺类型声明的 Markdown），按知识库根隔离，
// 供工作流页面提示用户归类；不进入索引，也不参与任何读取或检索。
const unclassifiedWorkflowFiles = new Map()

async function refreshKnowledgeIndex(indexRoot, root, force = false, options = {}) {
  const index = await readKnowledgeIndex(indexRoot, root)
  let changed = false
  const taken = new Set(Object.values(index.files).map((entry) => entry.fileId))
  for (const [relativePath, existing] of Object.entries(index.files)) {
    try {
      const current = pathFromRoot(root, relativePath)
      const info = await stat(current.filename)
      // 文件未变化时跳过重读；但尚未把身份写进文件头的条目必须回填一次，
      // 否则"编号随文件走"只在新写入的文件上成立，既有文件仍会在改名后失配。
      let backfill = false
      if (info.isFile() && !existing.status) {
        try { backfill = idOf(await readFile(current.filename, 'utf8')) === null } catch { backfill = false }
      }
      if (!force && !backfill && info.isFile() && existing.updatedAt === info.mtime.toISOString() && existing.size === info.size && existing.revision && existing.status === undefined) continue
      // 补写身份时不把自己的编号视为占用；其余条目占用则改发新号。
      const scope = new Set(taken)
      scope.delete(existing.fileId)
      const next = await knowledgeIndexEntry(root, relativePath, undefined, existing, { historyRoot: options.historyRoot, taken: scope })
      taken.add(next.fileId)
      if (JSON.stringify(next) !== JSON.stringify(index.files[relativePath])) {
        index.files[relativePath] = next
        changed = true
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        if (existing.status !== 'unreadable') {
          index.files[relativePath] = { ...existing, status: 'unreadable' }
          changed = true
        }
        continue
      }
      delete index.files[relativePath]
      changed = true
    }
  }
  if (changed) await writeKnowledgeIndex(indexRoot, root, index)
  return index
}

// 工作流目录里的文件按「类型声明」自我登记：只读取文件头就能判断是否属于 LexFlow，
// 未声明类型的文件保持未收录并单独上报，避免把目录中无关的 Markdown 卷入索引。
async function declaredWorkflowType(filename) {
  const handle = await open(filename, 'r')
  try {
    const buffer = Buffer.alloc(8192)
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
    return typeOf(buffer.toString('utf8', 0, bytesRead))
  } finally { await handle.close() }
}

const declaredScanCache = new Map()

async function scanDeclaredWorkflowFiles(root, index, force = false, options = {}) {
  const cached = force ? undefined : declaredScanCache.get(root)
  const known = cached?.known ?? new Map()
  const additions = []
  const unclassified = []
  const current = new Map()
  const visit = async (directory) => {
    let entries = []
    try { entries = await readdir(directory, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const filename = path.join(directory, entry.name)
      if (entry.isDirectory()) { await visit(filename); continue }
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.md')) continue
      const relativePath = toPortablePath(path.relative(root, filename))
      if (index.files[relativePath]) continue
      try {
        const info = await stat(filename)
        const stamp = info.mtime.toISOString() + ':' + info.size
        const previous = known.get(relativePath)
        const declared = previous?.stamp === stamp ? previous.declared : await declaredWorkflowType(filename)
        current.set(relativePath, { stamp, declared })
        if (declared) additions.push(relativePath)
        else unclassified.push(relativePath)
      } catch {}
    }
  }
  await visit(inside(root, WORKFLOW_FOLDER_NAME))
  // 已登记的编号先入集合：在访达里整份复制会带出同一个 lexflow-id，
  // 收录新文件时据此改发新号，避免两个文件共用一个身份。
  const taken = new Set(Object.values(index.files).map((entry) => entry.fileId))
  for (const relativePath of additions) {
    try {
      const entry = await knowledgeIndexEntry(root, relativePath, undefined, undefined, { taken, historyRoot: options.historyRoot })
      taken.add(entry.fileId)
      index.files[entry.relativePath] = entry
    } catch {}
  }
  declaredScanCache.set(root, { known: current })
  return { added: additions, unclassified: unclassified.sort((a, b) => a.localeCompare(b, 'zh-CN')) }
}

function remapKnowledgeIndex(index, from, to, keepSource = false) {
  const files = {}
  const prefix = from === '.' ? '' : from + '/'
  for (const [relativePath, entry] of Object.entries(index.files)) {
    if (relativePath !== from && !relativePath.startsWith(prefix)) {
      files[relativePath] = entry
      continue
    }
    if (keepSource) files[relativePath] = entry
    const suffix = relativePath === from ? '' : relativePath.slice(prefix.length)
    const nextPath = to === '.' ? suffix : to + (suffix ? '/' + suffix : '')
    files[nextPath] = { ...entry, fileId: keepSource ? randomUUID() : entry.fileId, relativePath: nextPath, name: path.basename(nextPath) }
  }
  return { version: KNOWLEDGE_INDEX_VERSION, files }
}

function removeKnowledgeSubtree(index, relativePath) {
  const prefix = relativePath === '.' ? '' : relativePath + '/'
  for (const key of Object.keys(index.files)) if (relativePath === '.' || key === relativePath || key.startsWith(prefix)) delete index.files[key]
  return index
}

async function assertIndexedSubtree(root, index, relativePath) {
  if (relativePath === '.') return
  const current = pathFromRoot(root, relativePath)
  const info = await stat(current.filename)
  const files = info.isDirectory() ? await markdownFiles(current.filename) : [current.filename]
  for (const filename of files) {
    const item = toPortablePath(path.relative(root, filename))
    if (!index.files[item]) throw new Error('该文件尚未由 LexFlow 创建或导入，请先使用导入功能。')
  }
}

async function markdownFiles(root) {
  const result = []
  const visit = async (directory) => {
    let entries = []
    try { entries = await readdir(directory, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const filename = path.join(directory, entry.name)
      if (entry.isDirectory()) await visit(filename)
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) result.push(filename)
    }
  }
  await visit(root)
  return result
}

async function listTree(root, prefix = '', allowedFiles) {
  let entries = []
  try { entries = await readdir(root, { withFileTypes: true }) } catch { return [] }
  const result = []
  for (const entry of entries.filter((item) => !item.name.startsWith('.')).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))) {
    const relativePath = prefix ? prefix + '/' + entry.name : entry.name
    const filename = path.join(root, entry.name)
    if (entry.isDirectory()) {
      result.push({ kind: 'folder', name: entry.name, relativePath, children: await listTree(filename, relativePath, allowedFiles) })
      continue
    }
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.md')) continue
    if (allowedFiles && !allowedFiles.has(relativePath)) continue
    const indexed = allowedFiles?.get(relativePath)
    const content = indexed ? '' : await readFile(filename, 'utf8')
    const info = await stat(filename)
    result.push({
      kind: 'file',
      fileId: indexed?.fileId,
      name: entry.name,
      relativePath,
      updatedAt: info.mtime.toISOString(),
      size: info.size,
      type: indexed?.type ?? typeOf(content),
      useMode: indexed?.useMode,
      description: indexed?.description ?? descriptionOf(content),
    })
  }
  return result
}

function flattenFiles(nodes, result = []) {
  for (const node of nodes) {
    if (node.kind === 'folder') flattenFiles(node.children ?? [], result)
    else result.push(node)
  }
  return result
}

function escapeRegExp(value) {
  return String(value).replace(/[\\^$.*+?()[\]{}|]/gu, '\\$&')
}

function rewriteMarkdownReferences(content, oldPath, newPath) {
  const source = String(content)
  const escaped = escapeRegExp(oldPath)
  const linkPattern = new RegExp('(\\]\\()((?:\\.\\/)?' + escaped + '(?:\\/[^)#]*)?)([)#])', 'gu')
  const wikiPattern = new RegExp('(\\[\\[)' + escaped + '(?:\\/[^\\]]*)?(\\]\\])', 'gu')
  return source
    .replace(linkPattern, (_all, open, href, close) => open + href.replace(new RegExp('^(?:\\.\\/)?' + escaped, 'u'), newPath) + close)
    .replace(wikiPattern, (_all, open, close) => open + newPath + close)
}

async function updateMarkdownReferences(root, oldPath, newPath, historyRoot) {
  const changed = []
  for (const filename of await markdownFiles(oldPath.startsWith(WORKFLOW_FOLDER_NAME + '/') ? inside(root, WORKFLOW_FOLDER_NAME) : root)) {
    const content = await readFile(filename, 'utf8')
    const next = rewriteMarkdownReferences(content, oldPath, newPath)
    if (next === content) continue
    const relative = toPortablePath(path.relative(root, filename))
    const history = path.join(historyRoot, 'references', digest(relative).slice(0, 24), Date.now() + '-' + randomUUID().slice(0, 8) + '.md')
    await mkdir(path.dirname(history), { recursive: true })
    await copyFile(filename, history)
    await atomicWrite(filename, next)
    changed.push(relative)
  }
  return changed
}

function realPathOrResolve(value) {
  try { return realpathSync(value) } catch { return path.resolve(value) }
}

function externalRoot(root, workspaceRoot) {
  const candidate = realPathOrResolve(root)
  const workspace = realPathOrResolve(workspaceRoot)
  if (within(workspace, candidate) || within(candidate, workspace)) throw new Error('知识库必须位于工作区之外。')
  return candidate
}

async function uniqueFilename(directory, baseName) {
  const extension = path.extname(baseName)
  const stem = path.basename(baseName, extension)
  for (let index = 0; index < 500; index += 1) {
    const candidate = index === 0 ? stem + extension : stem + ' ' + index + extension
    if (!existsSync(path.join(directory, candidate))) return candidate
  }
  throw new Error('附件数量过多，请整理后重试。')
}
async function uniqueTarget(root, relativePath, extension = '') {
  const safe = safeRelative(relativePath)
  const directory = path.dirname(safe)
  const isFile = extension !== ''
  const base = path.basename(safe, extension)
  const targetName = (name) => isFile ? safeName(name, extension) : safeName(name)
  const first = path.join(directory, targetName(base))
  if (!existsSync(inside(root, first))) return first
  for (let index = 1; index < 100000; index += 1) {
    const candidate = path.join(directory, targetName(base + ' ' + index))
    if (!existsSync(inside(root, candidate))) return candidate
  }
  throw new Error('无法为重名文件生成可用名称。')
}

async function moveWithinRoot(root, historyRoot, from, to) {
  const source = pathFromRoot(root, from)
  if (!existsSync(source.filename)) throw new Error('文件或文件夹不存在。')
  const sourceInfo = await stat(source.filename)
  if (sourceInfo.isFile() && !source.filename.toLowerCase().endsWith('.md')) throw new Error('这里只管理 Markdown 文件。')
  const requested = safeRelative(to)
  if (source.relativePath === toPortablePath(requested)) return { relativePath: source.relativePath, changedReferences: [] }
  const requestedName = safeTargetName(path.basename(requested), sourceInfo.isFile())
  const requestedRelative = toPortablePath(path.join(path.dirname(requested), requestedName))
  if (source.relativePath === requestedRelative) return { relativePath: source.relativePath, changedReferences: [] }
  const requestedAbsolute = inside(root, requestedRelative)
  if (sourceInfo.isDirectory() && within(source.filename, requestedAbsolute)) throw new Error('不能把文件夹移动到自身或其子文件夹内。')
  const targetRelative = await uniqueTarget(root, requestedRelative, sourceInfo.isFile() ? '.md' : '')
  const target = inside(root, targetRelative)
  await mkdir(path.dirname(target), { recursive: true })
  await rename(source.filename, target)
  try {
  if (sourceInfo.isFile()) {
    const content = await readFile(target, 'utf8')
    const next = content.replace(/(!?\[[^\]]*\]\()([^\s)]+)([^)]*\))/gu, (all, open, href, tail) => {
      if (/^(?:[a-z]+:|#|\/)/iu.test(href)) return all
      const absolute = path.resolve(path.dirname(source.filename), href)
      if (!within(root, absolute)) return all
      return open + toPortablePath(path.relative(path.dirname(target), absolute)) + tail
    })
    if (next !== content) await atomicWrite(target, next)
  }
  const changedReferences = await updateMarkdownReferences(root, source.relativePath, targetRelative, historyRoot)
  return { relativePath: targetRelative, changedReferences }
  } catch (error) { error.movedRelativePath = targetRelative; throw error }
}

async function copyWithinRoot(root, from, to) {
  const source = pathFromRoot(root, from)
  if (!existsSync(source.filename)) throw new Error('文件或文件夹不存在。')
  const sourceInfo = await stat(source.filename)
  if (sourceInfo.isFile() && !source.filename.toLowerCase().endsWith('.md')) throw new Error('这里只管理 Markdown 文件。')
  const requested = safeRelative(to)
  const requestedName = safeTargetName(path.basename(requested), sourceInfo.isFile())
  const requestedRelative = toPortablePath(path.join(path.dirname(requested), requestedName))
  const requestedAbsolute = inside(root, requestedRelative)
  if (sourceInfo.isDirectory() && source.relativePath !== requestedRelative && within(source.filename, requestedAbsolute)) throw new Error('不能把文件夹复制到自身或其子文件夹内。')
  const targetRelative = await uniqueTarget(root, requestedRelative, sourceInfo.isFile() ? '.md' : '')
  const target = inside(root, targetRelative)
  await mkdir(path.dirname(target), { recursive: true })
  await cp(source.filename, target, { recursive: sourceInfo.isDirectory(), errorOnExist: true, force: false })
  return { relativePath: targetRelative }
}

async function readJsonFile(filename, fallback) {
  try { return JSON.parse(await readFile(filename, 'utf8')) }
  catch { return fallback }
}

const normalizeKnowledgeRoot = (value) => typeof value === 'string' && value.length > 0 ? realPathOrResolve(value) : null

async function readKnowledgeState(statePath) {
  const value = await readJsonFile(statePath, null)
  if (value && Array.isArray(value.roots)) {
    const roots = [...new Set(value.roots.map(normalizeKnowledgeRoot).filter(Boolean))]
    const requestedActive = normalizeKnowledgeRoot(value.activeRootPath) ?? normalizeKnowledgeRoot(value.rootPath)
    const activeRootPath = requestedActive && roots.includes(requestedActive) ? requestedActive : roots[0] ?? null
    const state = { version: 2, roots, activeRootPath }
    if (value.version !== 2) await saveKnowledgeState(statePath, roots, activeRootPath)
    return state
  }
  const legacyRoot = normalizeKnowledgeRoot(value?.rootPath)
  if (legacyRoot) {
    const state = { version: 2, roots: [legacyRoot], activeRootPath: legacyRoot }
    await saveKnowledgeState(statePath, state.roots, state.activeRootPath)
    return state
  }
  return { version: 2, roots: [], activeRootPath: null }
}

async function saveKnowledgeState(statePath, roots, activeRootPath) {
  const normalizedRoots = [...new Set(roots.map(normalizeKnowledgeRoot).filter(Boolean))]
  const normalizedActive = normalizeKnowledgeRoot(activeRootPath)
  const active = normalizedRoots.includes(normalizedActive) ? normalizedActive : normalizedRoots[0] ?? null
  await atomicWrite(statePath, JSON.stringify({ version: 2, roots: normalizedRoots, activeRootPath: active }, null, 2) + '\n')
}

function normalizeUseMode(value, fallback = DEFAULT_USE_MODE) {
  return USE_MODES.has(value) ? value : fallback
}

function workflowRootId(root) {
  return digest(root).slice(0, 24)
}

function normalizeWorkflowSettings(value) {
  const roots = {}
  const sessions = {}
  if (value && typeof value === 'object' && value.roots && typeof value.roots === 'object') {
    for (const [rootId, rawRoot] of Object.entries(value.roots)) {
      if (!rawRoot || typeof rawRoot !== 'object' || !rawRoot.files || typeof rawRoot.files !== 'object') continue
      const files = {}
      for (const [fileId, rawFile] of Object.entries(rawRoot.files)) {
        if (!rawFile || typeof rawFile !== 'object' || typeof rawFile.relativePath !== 'string') continue
        try {
          const relativePath = toPortablePath(safeRelative(rawFile.relativePath))
          if (relativePath === '.') continue
          files[fileId] = {
            relativePath,
            useMode: normalizeUseMode(rawFile.useMode),
            ...typeof rawFile.updatedAt === 'string' ? { updatedAt: rawFile.updatedAt } : {},
            ...typeof rawFile.revision === 'string' ? { revision: rawFile.revision } : {},
          }
        } catch {}
      }
      roots[rootId] = { rootPath: typeof rawRoot.rootPath === 'string' ? rawRoot.rootPath : '', files }
    }
  }
  if (value && typeof value === 'object' && value.sessions && typeof value.sessions === 'object') {
    for (const [sessionId, rawSession] of Object.entries(value.sessions)) {
      if (!rawSession || typeof rawSession !== 'object' || typeof rawSession.rootPath !== 'string') continue
      sessions[sessionId] = { rootPath: rawSession.rootPath, suppressed: Array.isArray(rawSession.suppressed) ? rawSession.suppressed.filter((item) => typeof item === 'string') : [] }
    }
  }
  // applications：每个会话已应用的工作流清单，落盘以便重启后仍可停止。
  const applications = {}
  if (value && typeof value === 'object' && value.applications && typeof value.applications === 'object') {
    for (const [rootId, rawBucket] of Object.entries(value.applications)) {
      if (!rawBucket || typeof rawBucket !== 'object') continue
      const bucket = {}
      for (const [sessionId, rawList] of Object.entries(rawBucket)) {
        if (!Array.isArray(rawList)) continue
        const list = rawList.filter((item) => item && typeof item.fileId === 'string').map((item) => ({
          fileId: item.fileId,
          relativePath: String(item.relativePath ?? ''),
          revision: String(item.revision ?? ''),
          reason: String(item.reason ?? '相关任务'),
        }))
        if (list.length > 0) bucket[sessionId] = list
      }
      if (Object.keys(bucket).length > 0) applications[rootId] = bucket
    }
  }
  return { version: WORKFLOW_SETTINGS_VERSION, roots, sessions, applications }
}

async function readWorkflowSettings(filename) {
  return normalizeWorkflowSettings(await readJsonFile(filename, null))
}

async function writeWorkflowSettings(filename, settings) {
  await atomicWrite(filename, JSON.stringify({ version: WORKFLOW_SETTINGS_VERSION, roots: settings.roots, sessions: settings.sessions, applications: settings.applications ?? {} }, null, 2) + '\n')
}

function defaultWorkflowContent() {
  return [
    '---',
    'type: workflow',
    '---',
    '',
    '# 法律研究工作流',
    '',
    '这是一份 LexFlow 初始工作流。用户可以在工作台中自由编辑、移动、复制或删除。',
    '',
    '## 研究目标',
    '',
    '明确需要解决的法律问题、适用范围和预期成果。',
    '',
    '## 工作步骤',
    '',
    '1. 明确研究问题。',
    '2. 收集并核对相关材料。',
    '3. 区分事实、法源、分析和结论。',
    '4. 形成研究成果并进行交付前检查。',
    '',
  ].join('\n')
}

async function seedDefaultWorkflow(root) {
  await mkdir(inside(root, '工作流'), { recursive: true })
  await mkdir(inside(root, ARCHIVE_FOLDER_NAME), { recursive: true })
  const target = inside(root, '工作流/法律研究工作流.md')
  if (!existsSync(target)) await atomicWrite(target, defaultWorkflowContent())
}

async function moveToOldData(oldDataRoot, root, relativePath, kind, history = {}) {
  const source = pathFromRoot(root, relativePath)
  if (!existsSync(source.filename)) throw new Error('文件或文件夹不存在。')
  const id = Date.now() + '-' + randomUUID().slice(0, 8)
  const bucket = path.join(oldDataRoot, id)
  const payload = path.join(bucket, 'payload')
  await mkdir(payload, { recursive: true })
  await rename(source.filename, path.join(payload, path.basename(source.filename)))
  await atomicWrite(path.join(bucket, 'metadata.json'), JSON.stringify({
    version: 1,
    kind,
    rootPath: root,
    originalPath: source.relativePath,
    originalName: path.basename(source.filename),
    trashedAt: new Date().toISOString(),
    ...history,
  }, null, 2) + '\n')
  return id
}

async function listOldData(oldDataRoot) {
  let entries = []
  try { entries = await readdir(oldDataRoot, { withFileTypes: true }) } catch { return [] }
  const result = []
  for (const entry of entries.filter((item) => item.isDirectory())) {
    try {
      const metadata = JSON.parse(await readFile(path.join(oldDataRoot, entry.name, 'metadata.json'), 'utf8'))
      result.push({ id: entry.name, ...metadata })
    } catch {}
  }
  return result.sort((a, b) => String(b.trashedAt).localeCompare(String(a.trashedAt)))
}

function oldDataBucket(oldDataRoot, id) {
  const relative = safeRelative(id)
  if (relative === '.' || path.dirname(relative) !== '.') throw new Error('旧数据项目无效。')
  return inside(oldDataRoot, relative)
}

async function oldDataMetadata(oldDataRoot, id) {
  return JSON.parse(await readFile(path.join(oldDataBucket(oldDataRoot, id), 'metadata.json'), 'utf8'))
}

async function restoreOldData(oldDataRoot, id, defaultRoot) {
  const bucket = oldDataBucket(oldDataRoot, id)
  const metadata = JSON.parse(await readFile(path.join(bucket, 'metadata.json'), 'utf8'))
  if (metadata.kind === 'legacy-standards') {
    const entries = await readdir(path.join(bucket, 'payload'), { withFileTypes: true })
    const sourceEntry = entries.find((entry) => entry.isDirectory())
    if (!sourceEntry || typeof metadata.originalPath !== 'string') throw new Error('旧规范数据不完整。')
    const target = path.resolve(metadata.originalPath)
    if (existsSync(target)) throw new Error('旧规范恢复目标已存在。')
    await mkdir(path.dirname(target), { recursive: true })
    await rename(path.join(bucket, 'payload', sourceEntry.name), target)
  } else if (metadata.kind === 'legacy-agent') {
    if (typeof metadata.originalPath !== 'string') throw new Error('旧 Agent 数据不完整。')
    const target = path.resolve(metadata.originalPath)
    if (existsSync(target)) {
      const targetInfo = await stat(target)
      if (!targetInfo.isFile() || targetInfo.size > 0) throw new Error('旧 Agent 恢复目标已存在。')
      await rm(target, { force: true })
    }
    const sourceEntries = await readdir(path.join(bucket, 'payload'), { withFileTypes: true })
    const sourceEntry = sourceEntries.find((entry) => entry.isFile())
    if (!sourceEntry) throw new Error('旧 Agent 数据内容不完整。')
    await mkdir(path.dirname(target), { recursive: true })
    await rename(path.join(bucket, 'payload', sourceEntry.name), target)
  } else {
    if (typeof metadata.rootPath !== 'string' || typeof metadata.originalPath !== 'string') throw new Error('旧数据元信息不完整。')
    const root = metadata.rootPath === '__default__' ? defaultRoot : metadata.rootPath
    if (!root || !existsSync(root)) throw new Error('原保存位置已经不存在。')
    const original = pathFromRoot(root, metadata.kind === 'workflow' ? workflowPath(metadata.originalPath) : metadata.originalPath)
    const sourceEntries = await readdir(path.join(bucket, 'payload'), { withFileTypes: true })
    const sourceEntry = sourceEntries[0]
    if (!sourceEntry) throw new Error('旧数据内容不完整。')
    const targetRelative = existsSync(original.filename)
      ? await uniqueTarget(root, metadata.originalPath, sourceEntry.isFile() ? '.md' : '')
      : metadata.originalPath
    const target = inside(root, targetRelative)
    await mkdir(path.dirname(target), { recursive: true })
    await rename(path.join(bucket, 'payload', sourceEntry.name), target)
  }
  await rm(bucket, { recursive: true, force: true })
  return metadata.originalPath
}

async function permanentDeleteOldData(oldDataRoot, id) {
  await rm(oldDataBucket(oldDataRoot, id), { recursive: true, force: true })
}

async function historyCopy(historyRoot, kind, id, filename) {
  const history = path.join(historyRoot, kind, digest(id).slice(0, 24), Date.now() + '-' + randomUUID().slice(0, 8) + '.md')
  await mkdir(path.dirname(history), { recursive: true })
  await copyFile(filename, history)
}

// Publish a complete temporary file without replacing a concurrently created name.
async function publishNewMarkdown(root, requested, content) {
  await mkdir(path.dirname(inside(root, requested)), { recursive: true })
  const temporary = inside(root, path.join(path.dirname(requested), '.' + randomUUID() + '.tmp'))
  try {
    await writeFile(temporary, content, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
    for (let attempt = 0; attempt < 1000; attempt++) {
      const candidate = await uniqueTarget(root, requested, '.md')
      try { await link(temporary, inside(root, candidate)); return candidate }
      catch (error) { if (error.code !== 'EEXIST') throw error }
    }
    throw new Error('并发创建过多，请重试。')
  } finally { await rm(temporary, { force: true }) }
}

async function createFileInRoot(root, historyRoot, request) {
  const type = request.type
  if (!FILE_TYPES.has(type)) throw new Error('文件类型必须是工作流或长期记忆。')
  const parent = safeRelative(request.parent ?? '.')
  const name = ensureMarkdownName(request.name)
  const content = withType(request.content ?? '', type)
  if (Buffer.byteLength(content, 'utf8') > MAX_MARKDOWN_BYTES) throw new Error('Markdown 文件过大。')
  const relativePath = await publishNewMarkdown(root, path.join(parent, name), content)
  return { relativePath, revision: digest(content) }
}

async function createArchiveMarkdown(root, request) {
  const parent = safeRelative(request.parent ?? '.')
  const name = ensureMarkdownName(request.name)
  const content = String(request.content ?? '')
  if (Buffer.byteLength(content, 'utf8') > MAX_MARKDOWN_BYTES) throw new Error('Markdown 文件过大。')
  const relativePath = await publishNewMarkdown(root, path.join(parent, name), content)
  return { relativePath, revision: digest(content) }
}

async function importArchiveFile(root, request) {
  const name = String(request.name ?? '').trim()
  const targetFolder = safeRelative(request.targetFolder ?? '.')
  if (!name) throw new Error('导入文件名称不能为空。')
  await mkdir(inside(root, targetFolder), { recursive: true })
  if (/\.docx$/iu.test(name)) {
    if (typeof request.contentBase64 !== 'string') throw new Error('Word 文件内容无效。')
    const binary = Buffer.from(request.contentBase64, 'base64')
    if (!binary.length || binary.length > 32 * 1024 * 1024) throw new Error('Word 文件过大或内容为空。')
    const assetsName = safeName(path.basename(name, path.extname(name))) + '-附件-' + randomUUID().slice(0, 8)
    const images = []
    const result = await mammoth.convertToHtml({ buffer: binary }, {
      convertImage: mammoth.images.imgElement(async (image) => {
        const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' }[image.contentType]
        if (!extension) throw new Error('Word 含不支持的图片格式，请转换图片后重试。')
        const imageName = 'image-' + (images.length + 1) + '.' + extension
        images.push({ name: imageName, bytes: Buffer.from(await image.read('base64'), 'base64') })
        return { src: assetsName + '/' + imageName }
      }),
    })
    const converter = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-', codeBlockStyle: 'fenced' })
    converter.use(gfm)
    const content = converter.turndown(result.value).trim() + '\n'
    if (!content.trim()) throw new Error('Word 文档没有可提取的正文。')
    if (Buffer.byteLength(content) > MAX_MARKDOWN_BYTES) throw new Error('转换结果过大。')
    const originalPath = await uniqueTarget(root, path.join(targetFolder, safeName(path.basename(name, path.extname(name)), '.docx')), '.docx')
    const markdownPath = await uniqueTarget(root, path.join(targetFolder, ensureMarkdownName(path.basename(name, path.extname(name)))), '.md')
    const written = []
    try {
      await writeFile(inside(root, originalPath), binary, { flag: 'wx' }); written.push(inside(root, originalPath))
      if (images.length) {
        const assets = inside(root, path.join(targetFolder, assetsName)); await mkdir(assets); written.push(assets)
        for (const image of images) await writeFile(inside(assets, image.name), image.bytes, { flag: 'wx' })
      }
      await writeFile(inside(root, markdownPath), content, { flag: 'wx' }); written.push(inside(root, markdownPath))
    } catch (error) {
      for (const target of written.reverse()) await rm(target, { recursive: true, force: true })
      throw error
    }
    return { relativePath: markdownPath, originalPath, warnings: [...result.messages.map((item) => item.message), '已保留原件。复杂版式及修订显示请对照原 Word 核对。'] }
  }
  if (/\.(?:xlsx|xlsm|csv|pptx)$/iu.test(name)) {
    if (typeof request.contentBase64 !== 'string') throw new Error('文档内容无效。')
    const binary = Buffer.from(request.contentBase64, 'base64')
    if (!binary.length || binary.length > 64 * 1024 * 1024) throw new Error('文档过大或内容为空。')
    const extension = path.extname(name).toLowerCase()
    const originalPath = await uniqueTarget(root, path.join(targetFolder, safeName(path.basename(name, path.extname(name)), extension)), extension)
    await writeFile(inside(root, originalPath), binary, { flag: 'wx' })
    return { relativePath: originalPath, warnings: ['已保留原件。在右侧边栏或通过文档工具读取内容。'] }
  }
  if (!/\.(?:md|markdown)$/iu.test(name)) throw new Error('档案室目前支持 Markdown 和现代 Word 文档。')
  const content = String(request.content ?? '')
  if (Buffer.byteLength(content) > MAX_MARKDOWN_BYTES) throw new Error('Markdown 文件过大。')
  const markdownPath = await uniqueTarget(root, path.join(targetFolder, ensureMarkdownName(name, true)), '.md')
  await writeFile(inside(root, markdownPath), content, { flag: 'wx' })
  return { relativePath: markdownPath, warnings: [] }
}

export function apply(ctx, config = {}) {
  const host = ctx.get('lexflow').host
  const workspaceRoot = path.resolve(config.workspaceRoot)
  const draftsRoot = path.resolve(config.draftsRoot)
  const historyRoot = path.resolve(config.historyRoot)
  const oldDataRoot = path.resolve(config.oldDataRoot)
  const defaultKnowledgeBaseRoot = path.resolve(config.defaultKnowledgeBaseRoot)
  const knowledgeBaseStatePath = path.resolve(config.knowledgeBaseStatePath)
  const knowledgeBaseIndexRoot = path.resolve(config.knowledgeBaseIndexRoot ?? path.join(path.dirname(knowledgeBaseStatePath), 'knowledge-index'))
  const workflowSettingsPath = path.resolve(config.workflowSettingsPath ?? path.join(path.dirname(knowledgeBaseStatePath), 'workflow-settings.json'))
  const userAgentPath = path.resolve(config.userAgentPath)

  const documentToolRoot = async (relativePath) => {
    const value = String(relativePath ?? '').trim()
    if (!value) throw new Error('请提供档案室内的相对路径。')
    if (/^(?:[a-z]+:|\/)/iu.test(value)) throw new Error('只支持档案室内的相对路径。')
    const root = await currentArchiveRoot()
    return pathFromRoot(root, value)
  }

  const readDocumentText = async (filename, pages) => {
    const info = await stat(filename)
    if (info.size > MAX_DOCUMENT_TOOL_BYTES) throw new Error('文件超过 64MiB，暂不支持读取。')
    const extension = path.extname(filename).toLowerCase()
    if (extension === '.pdf') {
      const pdfjs = createRequire(import.meta.url)('pdfjs-dist/legacy/build/pdf.mjs')
      const document = await pdfjs.getDocument({ data: new Uint8Array(await readFile(filename)), useSystemFonts: true }).promise
      const ranges = Array.isArray(pages) && pages.length ? pages.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value >= 1) : null
      const output = []
      const total = document.numPages
      for (let pageNumber = 1; pageNumber <= total; pageNumber += 1) {
        if (ranges && !ranges.includes(pageNumber)) continue
        const page = await document.getPage(pageNumber)
        const content = await page.getTextContent()
        output.push('## 第 ' + pageNumber + ' 页\n\n' + content.items.map((item) => item.str).join(' ').replace(/\s+/gu, ' ').trim())
      }
      return { kind: 'pdf', total, text: output.join('\n\n') }
    }
    if (extension === '.docx') {
      const result = await mammoth.extractRawText({ path: filename })
      return { kind: 'docx', text: result.value.replace(/\n{3,}/gu, '\n\n').trim() }
    }
    if (extension === '.xlsx' || extension === '.xlsm' || extension === '.csv') {
      const workbook = XLSX.read(await readFile(filename), { type: 'buffer' })
      const output = []
      for (const sheetName of workbook.SheetNames) {
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: false, defval: '' })
        output.push('## ' + sheetName + '\n\n' + rows.map((row) => row.join(' | ')).join('\n'))
      }
      return { kind: 'xlsx', text: output.join('\n\n') }
    }
    if (extension === '.pptx') {
      const JSZip = createRequire(import.meta.url)('jszip')
      const zip = await JSZip.loadAsync(await readFile(filename))
      const names = Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/u.test(name)).sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
      const output = []
      for (let index = 0; index < names.length; index += 1) {
        const xml = await zip.file(names[index]).async('string')
        const text = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/gu)].map((item) => item[1]).join(' ').trim()
        output.push('## 第 ' + (index + 1) + ' 页\n\n' + text)
      }
      return { kind: 'pptx', text: output.join('\n\n') }
    }
    throw new Error('支持的读取格式：PDF、Word（.docx）、Excel（.xlsx/.xlsm/.csv）、PowerPoint（.pptx）。')
  }

  const writeDocumentFile = async (target, format, title, content) => {
    const extension = String(format ?? '').toLowerCase()
    if (typeof target !== 'string' || !target) throw new Error('生成目标路径无效。')
    if (extension === 'docx') {
      const paragraphs = String(content ?? '').split(/\n{2,}/u).map((block) => block.trim()).filter(Boolean)
      const children = []
      for (const block of paragraphs) {
        if (block.startsWith('### ')) children.push(new DOCX.Paragraph({ text: block.slice(4), heading: DOCX.HeadingLevel.HEADING_3 }))
        else if (block.startsWith('## ')) children.push(new DOCX.Paragraph({ text: block.slice(3), heading: DOCX.HeadingLevel.HEADING_2 }))
        else if (block.startsWith('# ')) children.push(new DOCX.Paragraph({ text: block.slice(2), heading: DOCX.HeadingLevel.HEADING_1 }))
        else children.push(new DOCX.Paragraph({ children: [new DOCX.TextRun(block)] }))
      }
      const document = new DOCX.Document({ sections: [{ children: children.length ? children : [new DOCX.Paragraph(title)] }] })
      const buffer = await DOCX.Packer.toBuffer(document)
      await writeFile(target, buffer)
      return { format: 'docx', bytes: buffer.length }
    }
    if (extension === 'xlsx') {
      const rows = Array.isArray(content?.rows) && content.rows.length ? content.rows : String(content ?? '').split(/\n+/u).map((line) => line.split(/\s*\|\s*/u))
      const workbook = XLSX.utils.book_new()
      const sheet = XLSX.utils.aoa_to_sheet(rows.map((row) => Array.isArray(row) ? row.map((cell) => typeof cell === 'object' ? cell.value : cell) : [row]))
      XLSX.utils.book_append_sheet(workbook, sheet, content?.sheetName ? String(content.sheetName).slice(0, 31) : 'Sheet1')
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
      await writeFile(target, buffer)
      return { format: 'xlsx', bytes: buffer.length }
    }
    if (extension === 'pptx') {
      const presentation = new PptxGenJS()
      const blocks = Array.isArray(content?.slides) && content.slides.length ? content.slides : [{ title: String(title ?? '演示文稿'), bullets: String(content ?? '').split(/\n+/u) }]
      for (const block of blocks) {
        const slide = presentation.addSlide()
        if (block.title) slide.addText(String(block.title), { x: 0.6, y: 0.5, w: 8.8, h: 0.8, fontSize: 24, bold: true })
        const bullets = (Array.isArray(block.bullets) ? block.bullets : [block.text ?? '']).filter((item) => String(item ?? '').trim())
        if (bullets.length) slide.addText(bullets.map((item) => ({ text: String(item), options: { bullet: true } })), { x: 0.8, y: 1.5, w: 8.4, h: 4.6, fontSize: 16 })
        if (Array.isArray(block.table) && block.table.length) slide.addTable(block.table.map((row) => (Array.isArray(row) ? row.map((cell) => ({ text: String(cell) })) : [{ text: String(row) }])), { x: 0.8, y: 2.2, w: 8.4 })
      }
      const filename = path.join(path.dirname(target), path.basename(target, path.extname(target)) + '.pptx')
      await mkdir(path.dirname(filename), { recursive: true })
      await presentation.writeFile({ fileName: filename })
      const info = await stat(filename)
      return { format: 'pptx', bytes: info.size }
    }
    throw new Error('支持的生成格式：Word（docx）、Excel（xlsx）、PowerPoint（pptx）。PDF 生成请在 LexFlow 中使用导出功能。')
  }

  const registerDocumentTools = () => {
    if (typeof host.defineTool !== 'function' || typeof host.registerTool !== 'function') return
    const readTool = host.defineTool({
      name: 'lexflow_document_read',
      description: 'Read a PDF, Word (.docx), Excel (.xlsx/.xlsm/.csv), or PowerPoint (.pptx) file from the LexFlow archive. Pass the archive-relative path shown in the archive browser. Scanned PDFs with no text layer should use lexflow_document_ocr instead.',
      parameters: {
        relativePath: { type: 'string', required: true, description: 'Archive-relative path of the document, for example 合同/附件.pdf.' },
        pages: { type: 'array', items: { type: 'integer' }, description: 'Optional 1-based page numbers for PDFs. Omit to read all pages.' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            path: { type: 'string', required: true },
            kind: { type: 'string', required: true },
            text: { type: 'string', required: true },
          },
        },
        render: (_args, value) => [{ type: 'text', text: '文档：' + value.path + '\n\n' + value.text }],
      },
      async execute(args, exec) {
        const current = await documentToolRoot(args.relativePath)
        const value = await readDocumentText(current.filename, args.pages)
        const excerpt = truncateUtf8(value.text, MAX_TOOL_READ_BYTES)
        return { path: current.relativePath, kind: value.kind, text: excerpt.content, ...(value.total === undefined ? {} : { total: value.total }) }
      },
    })
    const writeTool = host.defineTool({
      name: 'lexflow_document_write',
      description: 'Create a Word (.docx), Excel (.xlsx), or PowerPoint (.pptx) file inside the LexFlow archive from structured content. Markdown headings map to Word headings. Excel accepts an object with rows; PowerPoint accepts an object with slides.',
      parameters: {
        relativePath: { type: 'string', required: true, description: 'Archive-relative target path, for example 输出/报告.docx.' },
        format: { type: 'string', required: true, enum: ['docx', 'xlsx', 'pptx'] },
        title: { type: 'string', description: 'Optional document title used as fallback content.' },
        content: { type: 'json', description: 'Markdown-ish text for Word; object with rows for Excel; object with slides for PowerPoint.' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            path: { type: 'string', required: true },
            format: { type: 'string', required: true },
            bytes: { type: 'integer', required: true },
          },
        },
        render: (_args, value) => [{ type: 'text', text: '已生成 ' + value.path + '（' + value.format.toUpperCase() + '，' + value.bytes + ' 字节）。' }],
      },
      async execute(args) {
        const raw = String(args.relativePath ?? '').trim()
        if (!raw || /^(?:[a-z]+:|\/)/iu.test(raw)) throw new Error('请提供档案室内的相对路径。')
        if (!/\.(docx|xlsx|pptx)$/iu.test(raw)) throw new Error('目标文件扩展名必须与 format 一致。')
        const root = await currentArchiveRoot()
        const current = await uniqueTarget(root, safeRelative(raw), path.extname(raw))
        const value = await writeDocumentFile(current.filename, args.format, args.title ?? '', args.content ?? '')
        return { path: current.relativePath, format: value.format, bytes: value.bytes }
      },
    })
    const ocrTool = host.defineTool({
      name: 'lexflow_document_ocr',
      description: 'Recognize text from a scanned PDF page stored in the LexFlow archive using macOS Vision. Use only when lexflow_document_read returns little or no text. Always verify numbers, case numbers, and citations against the source image.',
      parameters: {
        relativePath: { type: 'string', required: true, description: 'Archive-relative path of the scanned PDF.' },
        pages: { type: 'array', items: { type: 'integer' }, description: 'Optional 1-based page numbers. Omit to process all pages.' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            path: { type: 'string', required: true },
            text: { type: 'string', required: true },
          },
        },
        render: (_args, value) => [{ type: 'text', text: 'OCR 结果（请人工核对数字、案号与引文）：\n\n' + value.text }],
      },
      async execute(args, exec) {
        const current = await documentToolRoot(args.relativePath)
        if (path.extname(current.filename).toLowerCase() !== '.pdf') throw new Error('OCR 目前只支持 PDF。')
        const ocrBinary = path.join(appRuntimeOcrDirectory(), 'lexflow-ocr')
        if (!existsSync(ocrBinary)) throw new Error('OCR 组件缺失。')
        const pages = (Array.isArray(args.pages) ? args.pages : []).map((value) => String(Number(value))).filter((value) => value !== 'NaN')
        const text = await new Promise((resolve, reject) => {
          const child = execFile(ocrBinary, [current.filename, ...pages], { timeout: 120000, maxBuffer: 32 * 1024 * 1024 }, (error, stdout, stderr) => {
            if (error && !stdout) reject(new Error('OCR 失败：' + (stderr || error.message)))
            else resolve(String(stdout ?? ''))
          })
          exec.signal?.addEventListener('abort', () => child.kill(), { once: true })
        })
        return { path: current.relativePath, text: truncateUtf8(text, MAX_TOOL_READ_BYTES).content }
      },
    })
    ctx.effect(() => {
      const disposers = [host.registerTool(readTool), host.registerTool(writeTool), host.registerTool(ocrTool)]
      return () => { for (const dispose of disposers) if (typeof dispose === 'function') dispose() }
    }, 'lexflow-archive: document read/write/ocr tools')
  }

  registerDocumentTools()

  const rootId = workflowRootId
  const inspectKnowledgeRoot = async (rootPath) => {
    const fallback = { id: rootId(rootPath), name: path.basename(rootPath), valid: false, rootPath }
    try {
      const root = externalRoot(rootPath, workspaceRoot)
      const info = await stat(root)
      if (!info.isDirectory()) return fallback
      return { id: rootId(root), name: path.basename(root), valid: true, rootPath: root }
    } catch { return fallback }
  }

  const configuredRoot = async () => {
    const state = await readKnowledgeState(knowledgeBaseStatePath)
    if (!state.activeRootPath || !existsSync(state.activeRootPath)) return null
    try {
      const root = externalRoot(state.activeRootPath, workspaceRoot)
      const info = await stat(root)
      return info.isDirectory() ? root : null
    } catch { return null }
  }

  const sessionRoots = new Map()
  const rootForSession = async (sessionId) => {
    if (typeof sessionId !== 'string' || sessionId.trim() === '') return requireKnowledgeRoot()
    const known = sessionRoots.get(sessionId)
    if (known) return known
    const settings = await readWorkflowSettings(workflowSettingsPath)
    const saved = settings.sessions[sessionId]?.rootPath
    let root = null
    if (saved) {
      try {
        const candidate = externalRoot(saved, workspaceRoot)
        const info = await stat(candidate)
        if (info.isDirectory()) root = candidate
      } catch {}
    }
    if (saved && !root) throw new Error('此会话绑定的知识库不可用，请恢复目录或开启新对话。')
    root ??= await requireKnowledgeRoot()
    sessionRoots.set(sessionId, root)
    if (settings.sessions[sessionId]?.rootPath !== root) {
      settings.sessions[sessionId] = { ...settings.sessions[sessionId], rootPath: root }
      await writeWorkflowSettings(workflowSettingsPath, settings)
    }
    return root
  }

  const requireKnowledgeRoot = async () => {
    const root = await configuredRoot()
    if (!root) throw new Error('尚未选择知识库。')
    return root
  }

  const scopeDirectory = async (root, name) => {
    const target = inside(root, name)
    await mkdir(target, { recursive: true })
    if (realpathSync(target) !== target) throw new Error('工作流和档案室必须使用各自的真实目录，不能通过链接指向其他目录。')
    return target
  }
  const currentArchiveRoot = async () => scopeDirectory(await requireKnowledgeRoot(), ARCHIVE_FOLDER_NAME)

  // Upgrade only previously registered files. Unregistered material and the archive
  // are never scanned or enrolled. A collision leaves the old file untouched.
  const migrations = new Map()
  const ensureWorkflowDirectory = (root) => {
    if (migrations.has(root)) return migrations.get(root)
    const pending = (async () => {
      await mkdir(inside(root, WORKFLOW_FOLDER_NAME), { recursive: true })
      const index = await readKnowledgeIndex(knowledgeBaseIndexRoot, root)
      let changed = false
      for (const [oldPath, entry] of Object.entries(index.files)) {
        if (oldPath.startsWith(WORKFLOW_FOLDER_NAME + '/')) continue
        if (oldPath.startsWith(ARCHIVE_FOLDER_NAME + '/')) continue
        const target = WORKFLOW_FOLDER_NAME + '/' + oldPath
        const source = inside(root, oldPath)
        const destination = inside(root, target)
        if (existsSync(source)) {
          if (existsSync(destination)) throw new Error('工作流迁移遇到重名文件，请处理后重试：' + target)
          await mkdir(path.dirname(destination), { recursive: true })
          await rename(source, destination)
        } else if (!existsSync(destination)) continue
        index.files[target] = { ...entry, relativePath: target, name: path.basename(target) }
        delete index.files[oldPath]
        changed = true
        // Commit each move to allow recovery after interruption without overwriting.
        await writeKnowledgeIndex(knowledgeBaseIndexRoot, root, index)
      }
      if (changed) await syncWorkflowSettings(root, index)
    })().catch((error) => { migrations.delete(root); throw error })
    migrations.set(root, pending)
    return pending
  }
  const loadKnowledgeIndex = async (root, force = false) => {
    await scopeDirectory(root, WORKFLOW_FOLDER_NAME)
    await ensureWorkflowDirectory(root)
    const index = await refreshKnowledgeIndex(knowledgeBaseIndexRoot, root, force, { historyRoot })
    const scanned = await scanDeclaredWorkflowFiles(root, index, force, { historyRoot })
    unclassifiedWorkflowFiles.set(root, scanned.unclassified)
    if (scanned.added.length > 0) {
      await writeKnowledgeIndex(knowledgeBaseIndexRoot, root, index)
      // 先写入使用方式再同步：自动收录的文件与导入一致，落在「相关内容」档。
      const settings = await readWorkflowSettings(workflowSettingsPath)
      const key = rootId(root)
      const bucket = settings.roots[key] ?? { rootPath: root, files: {} }
      bucket.rootPath = root
      for (const relativePath of scanned.added) {
        const entry = index.files[relativePath]
        if (!entry) continue
        bucket.files[entry.fileId] = { relativePath, useMode: NEW_USE_MODE, updatedAt: entry.updatedAt, revision: entry.revision }
      }
      settings.roots[key] = bucket
      await writeWorkflowSettings(workflowSettingsPath, settings)
      await syncWorkflowSettings(root, index)
    }
    return { ...index, files: Object.fromEntries(Object.entries(index.files).filter(([key]) => key.startsWith(WORKFLOW_FOLDER_NAME + '/'))) }
  }
  const unclassifiedFor = async (root) => unclassifiedWorkflowFiles.get(root) ?? []
  const syncWorkflowSettings = async (root, index) => {
    const settings = await readWorkflowSettings(workflowSettingsPath)
    const key = rootId(root)
    const bucket = settings.roots[key] ?? { rootPath: root, files: {} }
    let changed = settings.roots[key] === undefined || bucket.rootPath !== root
    bucket.rootPath = root
    const activeIds = new Set()
    for (const entry of Object.values(index.files)) {
      activeIds.add(entry.fileId)
      const previous = bucket.files[entry.fileId]
      const next = {
        relativePath: entry.relativePath,
        useMode: normalizeUseMode(previous?.useMode),
        updatedAt: entry.updatedAt,
        revision: entry.revision,
      }
      if (JSON.stringify(previous) !== JSON.stringify(next)) {
        bucket.files[entry.fileId] = next
        changed = true
      }
    }
    for (const fileId of Object.keys(bucket.files)) {
      if (!activeIds.has(fileId)) {
        delete bucket.files[fileId]
        changed = true
      }
    }
    if (changed) {
      settings.roots[key] = bucket
      await writeWorkflowSettings(workflowSettingsPath, settings)
    }
    return bucket
  }
  const setWorkflowUseMode = async (root, entry, useMode) => {
    if (!USE_MODES.has(useMode)) throw new Error('工作流使用方式无效。')
    const index = await loadKnowledgeIndex(root)
    const current = index.files[entry.relativePath]
    if (!current || current.fileId !== entry.fileId) throw new Error('工作流文件已经失效，请刷新后重试。')
    const settings = await readWorkflowSettings(workflowSettingsPath)
    const key = rootId(root)
    const bucket = settings.roots[key] ?? { rootPath: root, files: {} }
    bucket.rootPath = root
    bucket.files[entry.fileId] = {
      ...(bucket.files[entry.fileId] ?? {}),
      relativePath: entry.relativePath,
      useMode,
      updatedAt: current.updatedAt,
      revision: current.revision,
    }
    settings.roots[key] = bucket
    await writeWorkflowSettings(workflowSettingsPath, settings)
    return { ...current, useMode }
  }
  const registerKnowledgeFile = async (root, relativePath, useMode = NEW_USE_MODE) => {
    const index = await loadKnowledgeIndex(root)
    const taken = new Set(Object.values(index.files).map((item) => item.fileId))
    const entry = await knowledgeIndexEntry(root, relativePath, undefined, index.files[relativePath], { historyRoot, taken })
    index.files[entry.relativePath] = entry
    await writeKnowledgeIndex(knowledgeBaseIndexRoot, root, index)
    const bucket = await syncWorkflowSettings(root, index)
    bucket.files[entry.fileId] = { ...bucket.files[entry.fileId], useMode }
    const settings = await readWorkflowSettings(workflowSettingsPath)
    settings.roots[rootId(root)] = bucket
    await writeWorkflowSettings(workflowSettingsPath, settings)
    return entry
  }
  const registerKnowledgeSubtree = async (root, relativePath) => {
    const current = pathFromRoot(root, relativePath)
    const info = await stat(current.filename)
    const files = info.isDirectory() ? await markdownFiles(current.filename) : [current.filename]
    const index = await loadKnowledgeIndex(root)
    const taken = new Set(Object.values(index.files).map((item) => item.fileId))
    for (const filename of files) {
      try {
        const entry = await knowledgeIndexEntry(root, path.relative(root, filename), undefined, undefined, { historyRoot, taken })
        taken.add(entry.fileId)
        index.files[entry.relativePath] = entry
      } catch {}
    }
    await writeKnowledgeIndex(knowledgeBaseIndexRoot, root, index)
    await syncWorkflowSettings(root, index)
  }
  const assertKnowledgePath = async (root, relativePath) => {
    const index = await loadKnowledgeIndex(root)
    await assertIndexedSubtree(root, index, relativePath)
    return index
  }

  const chooseKnowledgeRoot = async (rootPath) => {
    if (typeof rootPath !== 'string' || !path.isAbsolute(rootPath)) throw new Error('知识库路径必须是绝对路径。')
    const root = externalRoot(rootPath, workspaceRoot)
    const info = await stat(root)
    if (!info.isDirectory()) throw new Error('知识库路径不是文件夹。')
    const state = await readKnowledgeState(knowledgeBaseStatePath)
    await mkdir(oldDataRoot, { recursive: true })
    await saveKnowledgeState(knowledgeBaseStatePath, [...state.roots, root], root)
    return { rootPath: root, rootName: path.basename(root) }
  }

  const useDefaultKnowledgeRoot = async () => {
    const root = externalRoot(defaultKnowledgeBaseRoot, workspaceRoot)
    await mkdir(root, { recursive: true })
    const state = await readKnowledgeState(knowledgeBaseStatePath)
    await saveKnowledgeState(knowledgeBaseStatePath, [...state.roots, root], root)
    await seedDefaultWorkflow(root)
    await registerKnowledgeFile(root, '工作流/法律研究工作流.md', NEW_USE_MODE)
    return { rootPath: root, rootName: path.basename(root) }
  }

  const knowledgeStatus = async () => {
    const state = await readKnowledgeState(knowledgeBaseStatePath)
    const root = await configuredRoot()
    const entries = await Promise.all(state.roots.map((item) => inspectKnowledgeRoot(item)))
    const counts = new Map()
    for (const entry of entries) counts.set(entry.name, (counts.get(entry.name) ?? 0) + 1)
    const seen = new Map()
    const visibleEntries = entries.map((entry) => {
      const count = counts.get(entry.name) ?? 1
      if (count <= 1) return entry
      const index = (seen.get(entry.name) ?? 0) + 1
      seen.set(entry.name, index)
      return { ...entry, name: entry.name + ' ' + index }
    })
    return {
      configured: root !== null,
      invalid: Boolean(state.activeRootPath) && root === null,
      rootPath: root,
      rootName: root ? path.basename(root) : '',
      defaultRoot: defaultKnowledgeBaseRoot,
      knowledgeBases: visibleEntries.map(({ id, name, valid, rootPath }) => ({ id, name, valid, active: root !== null ? rootId(root) === id : rootPath === state.activeRootPath })),
    }
  }

  const selectKnowledgeBase = async (id) => {
    const state = await readKnowledgeState(knowledgeBaseStatePath)
    const entry = state.roots.map((rootPath) => ({ rootPath, id: rootId(rootPath) })).find((item) => item.id === id)
    if (!entry) throw new Error('知识库不存在。')
    const root = externalRoot(entry.rootPath, workspaceRoot)
    const info = await stat(root)
    if (!info.isDirectory()) throw new Error('知识库路径不是文件夹。')
    await saveKnowledgeState(knowledgeBaseStatePath, state.roots, root)
    return knowledgeStatus()
  }

  const readKnowledgeFile = async (relativePath, signal, rootOverride) => {
    const root = rootOverride ?? await requireKnowledgeRoot()
    const scopedPath = workflowPath(relativePath)
    inside(inside(root, WORKFLOW_FOLDER_NAME), path.relative(WORKFLOW_FOLDER_NAME, scopedPath))
    const current = pathFromRoot(root, scopedPath)
    if (!current.filename.toLowerCase().endsWith('.md')) throw new Error('这里只管理 Markdown 文件。')
    const index = await loadKnowledgeIndex(root)
    const entry = index.files[current.relativePath]
    if (!entry || entry.status) throw new Error('该文件尚未由 LexFlow 创建或导入，请先使用导入功能。')
    const content = await readFile(current.filename, { encoding: 'utf8', signal })
    const bucket = await syncWorkflowSettings(root, index)
    const info = await stat(current.filename)
    return {
      item: {
        kind: 'file',
        fileId: entry.fileId,
        name: path.basename(current.filename),
        relativePath: current.relativePath,
        updatedAt: info.mtime.toISOString(),
        size: info.size,
        type: typeOf(content),
        description: descriptionOf(content),
        useMode: bucket.files[entry.fileId]?.useMode ?? DEFAULT_USE_MODE,
      },
      content,
      revision: digest(content),
    }
  }

  const saveKnowledgeFile = async ({ relativePath, content, revision, type }) => {
    const root = await requireKnowledgeRoot()
    const scopedPath = workflowPath(relativePath)
    inside(inside(root, WORKFLOW_FOLDER_NAME), path.relative(WORKFLOW_FOLDER_NAME, scopedPath))
    const current = pathFromRoot(root, scopedPath)
    if (!current.filename.toLowerCase().endsWith('.md')) throw new Error('这里只管理 Markdown 文件。')
    const index = await loadKnowledgeIndex(root)
    if (!index.files[current.relativePath] || index.files[current.relativePath].status) throw new Error('该文件尚未由 LexFlow 创建或导入，请先使用导入功能。')
    const currentContent = existsSync(current.filename) ? await readFile(current.filename, 'utf8') : ''
    if (revision && digest(currentContent) !== revision) throw new Error('文件已被其他程序修改，请刷新后再保存。')
    const next = type ? withType(content, type) : String(content ?? '')
    if (!typeOf(next)) throw new Error('文件类型不能为空。')
    if (Buffer.byteLength(next, 'utf8') > MAX_MARKDOWN_BYTES) throw new Error('Markdown 文件过大。')
    if (existsSync(current.filename)) await historyCopy(historyRoot, 'workflow', current.relativePath, current.filename)
    await atomicWrite(current.filename, next)
    index.files[current.relativePath] = await knowledgeIndexEntry(root, current.relativePath, undefined, index.files[current.relativePath])
    await writeKnowledgeIndex(knowledgeBaseIndexRoot, root, index)
    await syncWorkflowSettings(root, index)
    return { relativePath: current.relativePath, revision: digest(next) }
  }

  const classifyWorkflowFile = async ({ relativePath, type }) => {
    if (!FILE_TYPES.has(type)) throw new Error('文件类型必须是工作流或长期记忆。')
    const root = await requireKnowledgeRoot()
    const current = pathFromRoot(root, workflowPath(relativePath))
    inside(inside(root, WORKFLOW_FOLDER_NAME), path.relative(WORKFLOW_FOLDER_NAME, current.relativePath))
    if (!current.filename.toLowerCase().endsWith('.md')) throw new Error('这里只管理 Markdown 文件。')
    const info = await stat(current.filename)
    if (!info.isFile()) throw new Error('知识库文件无效。')
    if (info.size > MAX_MARKDOWN_BYTES) throw new Error('Markdown 文件过大。')
    const content = await readFile(current.filename, 'utf8')
    if (typeOf(content)) throw new Error('该文件已有类型声明，请刷新后重试。')
    const next = withType(content, type)
    await historyCopy(historyRoot, 'workflow-classify', current.relativePath, current.filename)
    await atomicWrite(current.filename, next)
    const entry = await registerKnowledgeFile(root, current.relativePath, NEW_USE_MODE)
    return { relativePath: entry.relativePath, name: entry.name, type: entry.type, fileId: entry.fileId, useMode: NEW_USE_MODE }
  }

  const setKnowledgeType = async ({ relativePath, type }) => {
    const root = await requireKnowledgeRoot()
    const current = pathFromRoot(root, relativePath)
    const existing = await readKnowledgeFile(relativePath)
    const next = withType(existing.content, type)
    await historyCopy(historyRoot, 'workflow-type', current.relativePath, current.filename)
    await atomicWrite(current.filename, next)
    const index = await loadKnowledgeIndex(root)
    index.files[current.relativePath] = await knowledgeIndexEntry(root, current.relativePath, undefined, index.files[current.relativePath])
    await writeKnowledgeIndex(knowledgeBaseIndexRoot, root, index)
    await syncWorkflowSettings(root, index)
    return { revision: digest(next), type }
  }

  const commitInFlight = new Map()
  const commitResults = new Map()
  const commitTails = new Map()
  const commitDocument = (kind, request, operation) => {
    const requestId = String(request.requestId ?? '')
    if (!requestId || requestId.length > 160) throw new Error('保存请求标识无效。')
    const key = kind + ':' + String(request.knowledgeBaseId ?? 'current') + ':' + requestId
    if (commitResults.has(key)) return Promise.resolve(commitResults.get(key))
    if (commitInFlight.has(key)) return commitInFlight.get(key)
    const lockKey = kind + ':' + String(request.knowledgeBaseId ?? 'current')
    const previous = commitTails.get(lockKey) ?? Promise.resolve()
    const pending = previous.then(async () => {
      if (commitResults.has(key)) return commitResults.get(key)
      if (request.knowledgeBaseId && request.knowledgeBaseId !== rootId(await requireKnowledgeRoot())) throw new Error('知识库已切换，请返回原知识库后保存；当前草稿已保留。')
      const result = await operation()
      if (commitResults.size >= 512) commitResults.delete(commitResults.keys().next().value)
      commitResults.set(key, result)
      return result
    })
    commitInFlight.set(key, pending)
    commitTails.set(lockKey, pending.catch(() => undefined))
    pending.then(() => { if (commitInFlight.get(key) === pending) commitInFlight.delete(key) }, () => { if (commitInFlight.get(key) === pending) commitInFlight.delete(key) })
    return pending
  }

  const commitWorkflowDocument = (request) => commitDocument('workflow', request, async () => {
    const root = await requireKnowledgeRoot()
    if (!['new', 'existing'].includes(request.mode)) throw new Error('工作流保存模式无效。')
    let relativePath = request.relativePath
    let partialError
    const wantedName = ensureMarkdownName(request.name)
    if (Buffer.byteLength(String(request.content ?? ''), 'utf8') > MAX_MARKDOWN_BYTES) throw new Error('Markdown 文件过大。')
    if (request.mode === 'new') {
      const created = await createFileInRoot(root, historyRoot, { parent: request.parent ?? '.', name: request.name, type: request.type, content: request.content })
      relativePath = created.relativePath
      await registerKnowledgeFile(root, relativePath, NEW_USE_MODE)
    } else {
      const saved = await saveKnowledgeFile({ relativePath, content: request.content, revision: request.revision, type: request.type })
      relativePath = saved.relativePath
      const current = pathFromRoot(root, relativePath)
      if (path.basename(current.relativePath) !== wantedName) {
        try {
        const moved = await moveWithinRoot(root, historyRoot, current.relativePath, path.join(path.dirname(current.relativePath), wantedName))
        const index = await loadKnowledgeIndex(root)
        const nextIndex = remapKnowledgeIndex(index, current.relativePath, moved.relativePath)
        await writeKnowledgeIndex(knowledgeBaseIndexRoot, root, nextIndex)
        await syncWorkflowSettings(root, nextIndex)
        relativePath = moved.relativePath
        } catch (error) { relativePath = error.movedRelativePath ?? relativePath; partialError = error.message }
      }
    }
    const latest = await readKnowledgeFile(relativePath)
    return { relativePath: latest.item.relativePath, content: latest.content, revision: latest.revision, item: latest.item, status: partialError ? 'content-saved-rename-failed' : 'saved', ...(partialError ? { error: partialError } : {}) }
  })

  const commitArchiveDocument = (request) => commitDocument('archive', request, async () => {
    const root = await currentArchiveRoot()
    if (!['new', 'existing'].includes(request.mode)) throw new Error('档案室保存模式无效。')
    let relativePath = request.relativePath
    let partialError
    const wantedName = ensureMarkdownName(request.name)
    if (Buffer.byteLength(String(request.content ?? ''), 'utf8') > MAX_MARKDOWN_BYTES) throw new Error('Markdown 文件过大。')
    if (request.mode === 'new') relativePath = (await createArchiveMarkdown(root, { parent: request.parent ?? '.', name: request.name, content: request.content })).relativePath
    else {
      const current = pathFromRoot(root, relativePath)
      const existing = await readFile(current.filename, 'utf8')
      if (request.revision !== undefined && digest(existing) !== request.revision) throw new Error('文件已被其他程序修改，请刷新后再保存。')
      await historyCopy(historyRoot, 'archive', current.relativePath, current.filename)
      await atomicWrite(current.filename, String(request.content ?? ''))
      if (path.basename(current.relativePath) !== wantedName) { try { relativePath = (await moveWithinRoot(root, historyRoot, current.relativePath, path.join(path.dirname(current.relativePath), wantedName))).relativePath } catch (error) { relativePath = error.movedRelativePath ?? relativePath; partialError = error.message } }
    }
    const current = pathFromRoot(root, relativePath)
    const content = await readFile(current.filename, 'utf8')
    const info = await stat(current.filename)
    return { relativePath, content, revision: digest(content), item: { kind: 'file', name: path.basename(current.filename), title: titleOf(current.filename), relativePath, updatedAt: info.mtime.toISOString(), size: info.size, type: null }, status: partialError ? 'content-saved-rename-failed' : 'saved', ...(partialError ? { error: partialError } : {}) }
  })

  const searchKnowledgeFiles = async ({ query, type, includeContent = false, signal, sessionId } = {}) => {
    const root = await rootForSession(sessionId)
    const needle = String(query ?? '').trim().toLowerCase()
    if (!needle) return []
    const index = await loadKnowledgeIndex(root)
    const result = []
    for (const entry of Object.values(index.files)) {
      if (signal?.aborted) throw new Error('知识库搜索已取消。')
      if (type && entry.type !== type) continue
      const metadata = [entry.relativePath, entry.name, entry.type, entry.type === 'workflow' ? '工作流' : '长期记忆', entry.description].join(' ').toLowerCase()
      let matches = metadata.includes(needle)
      if (!matches && includeContent) {
        try {
          const content = await readFile(pathFromRoot(root, entry.relativePath).filename, { encoding: 'utf8', signal })
          matches = content.toLowerCase().includes(needle)
        } catch (error) {
          if (signal?.aborted) throw error
        }
      }
      if (!matches) continue
      result.push(entry)
    }
    return result.sort((a, b) => a.relativePath.localeCompare(b.relativePath, 'zh-CN'))
  }

  const listWorkflowSettings = async (sessionId) => {
    const root = await rootForSession(sessionId)
    const index = await loadKnowledgeIndex(root)
    const bucket = await syncWorkflowSettings(root, index)
    return Object.values(index.files).filter((entry) => FILE_TYPES.has(entry.type) && !entry.status).map((entry) => ({
      ...entry,
      useMode: bucket.files[entry.fileId]?.useMode ?? DEFAULT_USE_MODE,
    }))
  }

  const readWorkflowVersion = async (candidate, sessionId) => {
    const root = await rootForSession(sessionId)
    const index = await loadKnowledgeIndex(root)
    const entry = Object.values(index.files).find((item) => (candidate?.fileId && item.fileId === candidate.fileId) || (candidate?.relativePath && item.relativePath === candidate.relativePath))
    if (!entry || !FILE_TYPES.has(entry.type) || entry.status) throw new Error('工作流或长期记忆文件已经失效，请刷新后重试。')
    const value = await readKnowledgeFile(entry.relativePath, undefined, root)
    if (!FILE_TYPES.has(value.item.type)) throw new Error('文件类型已经变化，不能自动应用。')
    const bucket = await syncWorkflowSettings(root, index)
    return { ...value, item: { ...value.item, fileId: entry.fileId, useMode: bucket.files[entry.fileId]?.useMode ?? DEFAULT_USE_MODE } }
  }

  const discoverWorkflows = async ({ query, limit = 3, signal, sessionId } = {}) => {
    const root = await rootForSession(sessionId)
    const index = await loadKnowledgeIndex(root)
    const bucket = await syncWorkflowSettings(root, index)
    const task = String(query ?? '').trim()
    if (!task) return { candidates: [], ambiguous: false }
    const candidates = []
    for (const entry of Object.values(index.files)) {
      if (signal?.aborted) throw new Error('工作流发现已取消。')
      if (!FILE_TYPES.has(entry.type) || entry.status) continue
      const setting = bucket.files[entry.fileId]
      if (normalizeUseMode(setting?.useMode) !== 'relevant') continue
      const metadata = [entry.relativePath, entry.name, entry.description, '工作流', ...(entry.searchTerms ?? [])].join(' ')
      const score = scoreSearchText(task, metadata)
      if (score > 0) candidates.push({ ...entry, useMode: 'relevant', score, activationReason: entry.type === 'memory' ? '相关长期记忆' : '相关工作流' })
    }
    candidates.sort((left, right) => right.score - left.score || left.relativePath.localeCompare(right.relativePath, 'zh-CN'))
    const selected = candidates.slice(0, Math.max(1, Math.min(5, Number(limit) || 3)))
    const ambiguous = selected.length > 1 && selected[0].score <= selected[1].score + 2
    return { candidates: selected, ambiguous }
  }

  const choices = new Map()
  const chooseWorkflows = (sessionId, candidates, signal) => new Promise((resolve, reject) => {
    const id = randomUUID()
    const abort = () => { choices.delete(sessionId); reject(new Error('工作流选择已取消。')) }
    if (signal.aborted) return abort()
    signal.addEventListener('abort', abort, { once: true })
    choices.set(sessionId, {
      public: { id, candidates: candidates.map(({ fileId, name, relativePath, description }) => ({ fileId, name, relativePath, description })) },
      finish: (ids) => { signal.removeEventListener('abort', abort); choices.delete(sessionId); resolve(candidates.filter((item) => ids.includes(item.fileId))) },
      abort,
    })
  })
  ctx.effect(() => () => { for (const choice of [...choices.values()]) choice.abort() }, 'workflow:choices')
  const pendingWorkflowActivations = new Map()
  const sessionApplications = new Map()
  const activateWorkflow = async (sessionId, relativePath) => {
    if (typeof sessionId !== 'string' || sessionId.trim() === '') throw new Error('当前没有可应用工作流的会话。')
    const value = await readWorkflowVersion({ relativePath }, sessionId)
    const settings = await readWorkflowSettings(workflowSettingsPath)
    const session = settings.sessions[sessionId]
    if (session) {
      settings.sessions[sessionId] = { rootPath: session.rootPath, suppressed: (session.suppressed ?? []).filter((item) => item !== value.item.fileId) }
      await writeWorkflowSettings(workflowSettingsPath, settings)
    }
    const pending = pendingWorkflowActivations.get(sessionId) ?? []
    if (!pending.some((item) => item.fileId === value.item.fileId)) pending.push({ fileId: value.item.fileId, relativePath: value.item.relativePath, force: true, activationReason: '用户明确应用' })
    pendingWorkflowActivations.set(sessionId, pending)
    return { fileId: value.item.fileId, relativePath: value.item.relativePath, revision: value.revision, status: 'pending' }
  }
  const consumeWorkflowActivations = (sessionId) => {
    const pending = pendingWorkflowActivations.get(sessionId) ?? []
    pendingWorkflowActivations.delete(sessionId)
    return pending
  }
  // 已应用清单随会话一起落盘（原来只存在进程内存里）：重启后进程内存清空，
  // 面板随之整个隐藏，用户想停止应用却找不到入口。落盘后重启仍可看到并停止。
  const recordWorkflowApplications = async (sessionId, applications) => {
    if (typeof sessionId !== 'string' || !Array.isArray(applications)) return
    const current = new Map()
    for (const item of applications) {
      if (typeof item?.fileId !== 'string' || typeof item.revision !== 'string') continue
      current.set(item.fileId, {
        fileId: item.fileId,
        relativePath: String(item.relativePath ?? ''),
        revision: item.revision,
        reason: String(item.reason ?? '相关任务'),
        status: 'applied',
      })
    }
    sessionApplications.set(sessionId, current)
    try { await writeSessionApplications(sessionId, current) }
    catch (error) { (ctx.logger ?? console).warn?.('lexflow-archive: 未能写入已应用工作流清单', error) }
  }
  const writeSessionApplications = async (sessionId, current) => {
    const settings = await readWorkflowSettings(workflowSettingsPath)
    const key = rootId(await rootForSession(sessionId))
    const bucket = settings.applications?.[key] ?? {}
    bucket[sessionId] = [...current.values()]
    settings.applications = { ...(settings.applications ?? {}), [key]: bucket }
    await writeWorkflowSettings(workflowSettingsPath, settings)
  }
  const readSessionApplications = async (sessionId) => {
    const settings = await readWorkflowSettings(workflowSettingsPath)
    const key = rootId(await rootForSession(sessionId))
    const list = settings.applications?.[key]?.[sessionId] ?? []
    return new Map(list.filter((item) => typeof item?.fileId === 'string').map((item) => [item.fileId, { ...item, status: 'applied' }]))
  }
  const sessionWorkflowState = async (sessionId) => {
    const root = await rootForSession(sessionId)
    const settings = await readWorkflowSettings(workflowSettingsPath)
    const state = settings.sessions[sessionId] ?? { rootPath: root, suppressed: [] }
    const applied = sessionApplications.get(sessionId) ?? await readSessionApplications(sessionId)
    // 标注"文件已不在知识库"供界面显示；这既不影响停止，也不影响对话中已注入的正文。
    let known = null
    try { known = await loadKnowledgeIndex(root) } catch {}
    const values = [...applied.values()].map((item) => ({ ...item, detached: known ? !Object.values(known.files).some((entry) => entry.fileId === item.fileId) : false }))
    return { rootName: path.basename(root), suppressed: [...new Set(state.suppressed ?? [])], applied: values, choice: choices.get(sessionId)?.public ?? null }
  }
  const stopWorkflow = async (sessionId, fileId) => {
    if (typeof sessionId !== 'string' || typeof fileId !== 'string' || fileId.length === 0) throw new Error('会话或工作流标识无效。')
    const root = await rootForSession(sessionId)
    // 停止只匹配对话消息里自带的编号，不查文件：文件被删除或改名后仍可停止。
    const settings = await readWorkflowSettings(workflowSettingsPath)
    const current = settings.sessions[sessionId] ?? { rootPath: root, suppressed: [] }
    settings.sessions[sessionId] = { rootPath: root, suppressed: [...new Set([...(current.suppressed ?? []), fileId])] }
    const key = rootId(root)
    const bucket = settings.applications?.[key] ?? {}
    const remaining = (bucket[sessionId] ?? []).filter((item) => item?.fileId !== fileId)
    if (remaining.length > 0) bucket[sessionId] = remaining
    else delete bucket[sessionId]
    settings.applications = { ...(settings.applications ?? {}), [key]: bucket }
    await writeWorkflowSettings(workflowSettingsPath, settings)
    sessionApplications.get(sessionId)?.delete(fileId)
    return sessionWorkflowState(sessionId)
  }
  const resumeWorkflow = async (sessionId, fileId) => {
    const root = await rootForSession(sessionId)
    const settings = await readWorkflowSettings(workflowSettingsPath)
    const current = settings.sessions[sessionId] ?? { rootPath: root, suppressed: [] }
    settings.sessions[sessionId] = { rootPath: root, suppressed: (current.suppressed ?? []).filter((item) => item !== fileId) }
    await writeWorkflowSettings(workflowSettingsPath, settings)
    return sessionWorkflowState(sessionId)
  }

  const registerKnowledgeTools = () => {
    if (typeof host.defineTool !== 'function' || typeof host.registerTool !== 'function') return
    const searchTool = host.defineTool({
      name: 'lexflow_knowledge_search',
      description: 'Search the current LexFlow knowledge base for indexed workflow and long-term-memory Markdown files. Search metadata by default; set includeContent only when the task requires searching document bodies.',
      parameters: {
        query: { type: 'string', required: true, description: 'A focused name, path, type, topic, or body keyword to search for.' },
        type: { type: 'string', enum: ['workflow', 'memory'], description: 'Optional content type filter.' },
        includeContent: { type: 'boolean', description: 'Search Markdown bodies as well as indexed metadata. Defaults to false.' },
        limit: { type: 'integer', description: 'Maximum number of results to return. Defaults to 20 and is capped at 50.' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            results: {
              type: 'array',
              required: true,
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  path: { type: 'string', required: true },
                  name: { type: 'string', required: true },
                  type: { type: 'string', required: true, enum: ['workflow', 'memory'] },
                  description: { type: 'string', required: true },
                  updatedAt: { type: 'string', required: true },
                },
              },
            },
            total: { type: 'integer', required: true },
            truncated: { type: 'boolean', required: true },
          },
        },
        render: (_args, value) => [{
          type: 'text',
          text: value.results.length === 0
            ? '当前 LexFlow 知识库没有找到匹配的工作流或长期记忆。'
            : `找到 ${value.total} 个匹配文件${value.truncated ? '，以下仅显示前部分：' : '：'}\n` + value.results.map((item) => `- ${item.name}（${item.type === 'workflow' ? '工作流' : '长期记忆'}）｜${item.path}\n  ${item.description}`).join('\n'),
        }],
      },
      async execute(args, exec) {
        const value = String(args.query ?? '').trim()
        if (!value) throw new Error('搜索关键词不能为空。')
        const results = await searchKnowledgeFiles({ query: value, type: args.type, includeContent: args.includeContent === true, signal: exec.signal, sessionId: exec.agent?.session?.id ? String(exec.agent.session.id) : undefined })
        const limit = Math.min(args.limit === undefined ? 20 : args.limit, 50)
        if (!Number.isInteger(limit) || limit < 1) throw new Error('搜索结果数量必须是 1 至 50 的整数。')
        return { results: results.slice(0, limit).map(({ relativePath: path, name, type, description, updatedAt }) => ({ path, name, type, description, updatedAt })), total: results.length, truncated: results.length > limit }
      },
    })
    const readTool = host.defineTool({
      name: 'lexflow_knowledge_read',
      description: 'Read one indexed workflow or long-term-memory Markdown file from the current LexFlow knowledge base. Accepts only a relative Markdown path returned by lexflow_knowledge_search; never accepts a new root or an absolute path.',
      parameters: {
        relativePath: { type: 'string', required: true, description: 'Relative Markdown path returned by the LexFlow knowledge search tool.' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            path: { type: 'string', required: true },
            name: { type: 'string', required: true },
            type: { type: 'string', required: true, enum: ['workflow', 'memory'] },
            content: { type: 'string', required: true },
            updatedAt: { type: 'string', required: true },
            bytes: { type: 'integer', required: true },
            truncated: { type: 'boolean', required: true },
          },
        },
        render: (_args, value) => [{ type: 'text', text: `文件：${value.name}\n类型：${value.type === 'workflow' ? '工作流' : '长期记忆'}\n路径：${value.path}${value.truncated ? '\n（文件内容过大，以下为受限读取结果）' : ''}\n\n${value.content}` }],
      },
      async execute(args, exec) {
        const value = await readKnowledgeFile(args.relativePath, exec.signal, await rootForSession(exec.agent?.session?.id ? String(exec.agent.session.id) : undefined))
        const excerpt = truncateUtf8(value.content, MAX_TOOL_READ_BYTES)
        return { path: value.item.relativePath, name: value.item.name, type: value.item.type, content: excerpt.content, updatedAt: value.item.updatedAt, bytes: value.item.size, truncated: excerpt.truncated }
      },
    })
    ctx.effect(() => {
      const disposers = [host.registerTool(searchTool), host.registerTool(readTool)]
      return () => { for (const dispose of disposers) if (typeof dispose === 'function') dispose() }
    }, 'lexflow-archive: knowledge search and read tools')
  }

  registerKnowledgeTools()

  const ensureAgentFile = async () => {
    await mkdir(path.dirname(userAgentPath), { recursive: true })
    try {
      const handle = await open(userAgentPath, 'wx')
      await handle.close()
      return
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error
      const info = await lstat(userAgentPath)
      if (!info.isFile() || info.isSymbolicLink()) throw new Error('AGENT.md 路径不是安全的普通文件。')
    }
  }
  const readAgent = async () => {
    await ensureAgentFile()
    const content = await readFile(userAgentPath, 'utf8')
    const info = await stat(userAgentPath)
    return { content, revision: digest(content), path: userAgentPath, effective: '新对话生效', updatedAt: info.mtime.toISOString() }
  }

  let agentSaveTail = Promise.resolve()
  const saveAgent = ({ content, revision }) => {
    const operation = agentSaveTail.then(async () => {
      const current = await readAgent()
      if (revision !== undefined && current.revision !== revision) throw new Error('AGENT.md 已被其他程序修改，请刷新后再保存。')
      const next = String(content ?? '')
      if (Buffer.byteLength(next, 'utf8') > MAX_MARKDOWN_BYTES) throw new Error('AGENT.md 文件过大。')
      await historyCopy(historyRoot, 'agent', 'AGENT.md', userAgentPath)
      await atomicWrite(userAgentPath, next)
      return { revision: digest(next), updatedAt: new Date().toISOString() }
    })
    agentSaveTail = operation.catch(() => undefined)
    return operation
  }

  const setWorkflowUseModeForRequest = async ({ relativePath, fileId, useMode }) => {
    const root = await requireKnowledgeRoot()
    const index = await loadKnowledgeIndex(root)
    const entry = Object.values(index.files).find((item) => item.relativePath === relativePath || item.fileId === fileId)
    if (!entry || !FILE_TYPES.has(entry.type)) throw new Error('工作流或长期记忆文件已经失效，请刷新后重试。')
    return setWorkflowUseMode(root, entry, useMode)
  }

  const indexedFilesFor = async (root, relativePath) => {
    const index = await loadKnowledgeIndex(root)
    const prefix = relativePath === '.' ? '' : relativePath + '/'
    return Object.values(index.files).filter((entry) => entry.relativePath === relativePath || entry.relativePath.startsWith(prefix))
  }

  const workflowBatch = async (request) => {
    const root = await requireKnowledgeRoot()
    const operation = String(request.operation ?? '')
    if (!['move', 'copy', 'trash', 'setType', 'setUseMode'].includes(operation)) throw new Error('不支持的批量工作流操作。')
    if (!Array.isArray(request.items) || request.items.length === 0) throw new Error('请先选择文件或文件夹。')
    if (operation === 'setType' && !FILE_TYPES.has(request.type)) throw new Error('文件类型必须是工作流或长期记忆。')
    if (operation === 'setUseMode' && !USE_MODES.has(request.useMode)) throw new Error('工作流使用方式无效。')
    const completed = []
    const failed = []
    for (const item of request.items) {
      const relativePath = workflowPath(item?.relativePath ?? item?.from)
      try {
        if (operation === 'setType' || operation === 'setUseMode') {
          const entries = await indexedFilesFor(root, relativePath)
          if (!entries.length) throw new Error('所选文件夹中没有已纳入 LexFlow 的 Markdown 文件。')
          for (const entry of entries) {
            if (operation === 'setType') await setKnowledgeType({ relativePath: entry.relativePath, type: request.type })
            else await setWorkflowUseMode(root, entry, request.useMode)
          }
          completed.push(relativePath)
          continue
        }
        const index = await assertKnowledgePath(root, relativePath)
        const targetFolder = workflowPath(request.targetFolder ?? '.')
        const target = path.join(targetFolder, path.basename(relativePath))
        let result
        if (operation === 'move') {
          result = await moveWithinRoot(root, historyRoot, relativePath, target)
          const nextIndex = remapKnowledgeIndex(index, relativePath, result.relativePath)
          await writeKnowledgeIndex(knowledgeBaseIndexRoot, root, nextIndex)
          await syncWorkflowSettings(root, nextIndex)
        } else if (operation === 'copy') {
          result = await copyWithinRoot(root, relativePath, target)
          const copiedIndex = remapKnowledgeIndex(index, relativePath, result.relativePath, true)
          for (const copiedPath of Object.keys(copiedIndex.files)) {
            if (index.files[copiedPath]) continue
            copiedIndex.files[copiedPath] = await knowledgeIndexEntry(root, copiedPath, undefined, undefined, { renewId: true, historyRoot })
          }
          await writeKnowledgeIndex(knowledgeBaseIndexRoot, root, copiedIndex)
          await syncWorkflowSettings(root, copiedIndex)
        } else {
          result = { id: await moveToOldData(oldDataRoot, root, relativePath, 'workflow') }
          const nextIndex = removeKnowledgeSubtree(index, relativePath)
          await writeKnowledgeIndex(knowledgeBaseIndexRoot, root, nextIndex)
          await syncWorkflowSettings(root, nextIndex)
        }
        completed.push({ relativePath, ...result })
      } catch (error) {
        failed.push({ relativePath, error: error instanceof Error ? error.message + ' @ ' + String(error.stack ?? '').split('\n')[1]?.trim() : String(error) })
      }
    }
    return { completed, failed }
  }

  const archiveBatch = async (request) => {
    const root = await currentArchiveRoot()
    const operation = String(request.operation ?? '')
    if (!['move', 'copy', 'trash'].includes(operation)) throw new Error('不支持的批量档案室操作。')
    if (!Array.isArray(request.items) || request.items.length === 0) throw new Error('请先选择文件或文件夹。')
    const completed = []
    const failed = []
    for (const item of request.items) {
      const relativePath = safeRelative(item?.relativePath ?? item?.from)
      try {
        const target = path.join(safeRelative(request.targetFolder ?? '.'), path.basename(relativePath))
        const result = operation === 'move'
          ? await moveWithinRoot(root, historyRoot, relativePath, target)
          : operation === 'copy'
            ? await copyWithinRoot(root, relativePath, target)
            : { id: await moveToOldData(oldDataRoot, root, relativePath, 'archive') }
        completed.push({ relativePath, ...result })
      } catch (error) {
        failed.push({ relativePath, error: error instanceof Error ? error.message : String(error) })
      }
    }
    return { completed, failed }
  }

  const archiveService = Object.freeze({
    workflow: Object.freeze({
      choose: (sessionId, candidates, signal) => chooseWorkflows(sessionId, candidates, signal),
      discover: (query, options = {}) => discoverWorkflows({ query, ...options }),
      read: (candidate, sessionId) => readWorkflowVersion(candidate, sessionId),
      listSettings: (sessionId) => listWorkflowSettings(sessionId),
      bindSession: (sessionId) => rootForSession(sessionId),
      sessionState: (sessionId) => sessionWorkflowState(sessionId),
      recordApplications: (sessionId, applications) => recordWorkflowApplications(sessionId, applications),
      stop: (sessionId, fileId) => stopWorkflow(sessionId, fileId),
      resume: (sessionId, fileId) => resumeWorkflow(sessionId, fileId),
      setUseMode: (request) => setWorkflowUseModeForRequest(request),
      activate: (sessionId, relativePath) => activateWorkflow(sessionId, relativePath),
      consumeActivations: (sessionId) => consumeWorkflowActivations(sessionId),
    }),
  })
  if (typeof ctx.provide === 'function') ctx.provide('lexflowArchive', archiveService)

  const handleRequest = async (request) => {
    const action = request.action
    if (request.documentKey === 'builtin:agent' || request.relativePath === 'builtin:agent' || request.from === 'builtin:agent' || request.to === 'builtin:agent') {
      if (['workflow.move', 'workflow.copy', 'workflow.trash', 'workflow.batch', 'workflow.setType', 'move', 'copy', 'trash', 'setType'].includes(action)) throw new Error('全局规则 AGENT.md 不允许移动、复制、删除或修改类型。')
    }
    if (request.knowledgeBaseId && request.knowledgeBaseId !== rootId(await requireKnowledgeRoot())) throw new Error('知识库已切换，请返回原知识库后保存；当前草稿已保留。')
    if (['workflow.create', 'workflow.createFolder', 'workflow.import', 'workflow.move', 'workflow.copy', 'workflow.trash', 'workflow.batch', 'workflow.save', 'workflow.read', 'workflow.setType', 'workflow.commitDocument'].includes(action)) {
      await ensureWorkflowDirectory(await requireKnowledgeRoot())
      request = { ...request }
      for (const key of ['relativePath', 'from', 'to', 'parent', 'targetFolder']) if (request[key] !== undefined) { request[key] = workflowPath(request[key]); inside(inside(await requireKnowledgeRoot(), WORKFLOW_FOLDER_NAME), path.relative(WORKFLOW_FOLDER_NAME, request[key])) }
      if (action === 'workflow.batch') request.items = Array.isArray(request.items) ? request.items.map((item) => ({ ...item, relativePath: workflowPath(item?.relativePath ?? item?.from) })) : request.items
      if (action === 'workflow.create' || action === 'workflow.createFolder') request.parent = workflowPath(request.parent)
      if (action === 'workflow.import') request.targetFolder = workflowPath(request.targetFolder)
      if (['workflow.move', 'workflow.copy', 'workflow.trash'].includes(action) && (request.from ?? request.relativePath) === WORKFLOW_FOLDER_NAME) throw new Error('不能移动或删除工作流根目录。')
    }
    if (action === 'workflow.status') return knowledgeStatus()
    if (action === 'workflow.selectRoot') return chooseKnowledgeRoot(request.rootPath)
    if (action === 'workflow.knowledgeBases.select') return selectKnowledgeBase(request.id)
    if (action === 'workflow.useDefaultRoot') return useDefaultKnowledgeRoot()
    if (action === 'workflow.list' || action === 'workflow.refresh') {
      const root = await requireKnowledgeRoot()
      const index = await loadKnowledgeIndex(root, request.force === true || action === 'workflow.refresh')
      const bucket = await syncWorkflowSettings(root, index)
      const entries = new Map(Object.values(index.files).filter((entry) => !entry.status).map((entry) => [entry.relativePath, { ...entry, useMode: bucket.files[entry.fileId]?.useMode ?? DEFAULT_USE_MODE }]))
      const nodes = await listTree(inside(root, WORKFLOW_FOLDER_NAME), WORKFLOW_FOLDER_NAME, entries)
      const agent = await readAgent()
      const unclassified = await unclassifiedFor(root)
      return { rootPath: root, rootName: path.basename(root), nodes: [builtinAgentEntry(agent.content, agent.updatedAt), ...nodes], unclassified }
    }
    if (action === 'workflow.classify') return classifyWorkflowFile(request)
    if (action === 'workflow.read') return readKnowledgeFile(request.relativePath)
    if (action === 'workflow.commitDocument') return commitWorkflowDocument(request)
    if (action === 'workflow.settings.list') return listWorkflowSettings()
    if (action === 'workflow.settings.set') return setWorkflowUseModeForRequest(request)
    if (action === 'workflow.batch') return workflowBatch(request)
    if (action === 'workflow.activate') return activateWorkflow(request.sessionId, request.relativePath)
    if (action === 'workflow.session.choose') {
      const choice = choices.get(request.sessionId)
      if (!choice || choice.public.id !== request.choiceId) throw new Error('工作流选择已经失效，请刷新。')
      if (!Array.isArray(request.fileIds) || request.fileIds.some((id) => !choice.public.candidates.some((item) => item.fileId === id))) throw new Error('请选择有效候选。')
      choice.finish(request.fileIds)
      return { accepted: true }
    }
    if (action === 'workflow.session.state') return sessionWorkflowState(request.sessionId)
    if (action === 'workflow.session.stop') return stopWorkflow(request.sessionId, request.fileId)
    if (action === 'workflow.session.resume') return resumeWorkflow(request.sessionId, request.fileId)
    if (action === 'workflow.createFolder') {
      const root = await requireKnowledgeRoot()
      const parent = safeRelative(request.parent ?? '.')
      const relativePath = await uniqueTarget(root, path.join(parent, safeName(request.name)), '')
      await mkdir(inside(root, relativePath), { recursive: false })
      return { relativePath }
    }
    if (action === 'workflow.create') {
      const root = await requireKnowledgeRoot()
      const result = await createFileInRoot(root, historyRoot, request)
      const entry = await registerKnowledgeFile(root, result.relativePath, NEW_USE_MODE)
      return { ...result, fileId: entry.fileId, useMode: NEW_USE_MODE }
    }
    if (action === 'workflow.save') return saveKnowledgeFile(request)
    if (action === 'workflow.setType') return setKnowledgeType(request)
    if (action === 'workflow.move') {
      const root = await requireKnowledgeRoot()
      const index = await assertKnowledgePath(root, request.from)
      const source = pathFromRoot(root, request.from)
      const result = await moveWithinRoot(root, historyRoot, request.from, request.to)
      const nextIndex = remapKnowledgeIndex(index, source.relativePath, result.relativePath)
      await writeKnowledgeIndex(knowledgeBaseIndexRoot, root, nextIndex)
      await syncWorkflowSettings(root, nextIndex)
      return result
    }
    if (action === 'workflow.copy') {
      const root = await requireKnowledgeRoot()
      const index = await assertKnowledgePath(root, request.from)
      const source = pathFromRoot(root, request.from)
      const result = await copyWithinRoot(root, request.from, request.to)
      const copiedIndex = remapKnowledgeIndex(index, source.relativePath, result.relativePath, true)
      for (const relativePath of Object.keys(copiedIndex.files)) {
        if (index.files[relativePath]) continue
        copiedIndex.files[relativePath] = await knowledgeIndexEntry(root, relativePath, undefined, undefined, { renewId: true, historyRoot })
      }
      await writeKnowledgeIndex(knowledgeBaseIndexRoot, root, copiedIndex)
      await syncWorkflowSettings(root, copiedIndex)
      return result
    }
    if (action === 'workflow.trash') {
      const root = await requireKnowledgeRoot()
      const index = await assertKnowledgePath(root, request.relativePath)
      const result = { id: await moveToOldData(oldDataRoot, root, request.relativePath, 'workflow') }
      const nextIndex = removeKnowledgeSubtree(index, pathFromRoot(root, request.relativePath).relativePath)
      await writeKnowledgeIndex(knowledgeBaseIndexRoot, root, nextIndex)
      await syncWorkflowSettings(root, nextIndex)
      return result
    }
    if (action === 'workflow.import') {
      const root = await requireKnowledgeRoot()
      if (!FILE_TYPES.has(request.type)) throw new Error('文件类型必须是工作流或长期记忆。')
      const targetFolder = safeRelative(request.targetFolder ?? '.')
      if (!Array.isArray(request.files) || request.files.length === 0) throw new Error('请选择要导入的 Markdown 文件。')
      const imported = []
      for (const file of request.files) {
        const name = ensureMarkdownName(file?.name, true)
        const content = withType(file?.content ?? '', request.type)
        if (Buffer.byteLength(content, 'utf8') > MAX_MARKDOWN_BYTES) throw new Error('Markdown 文件过大。')
        const relativePath = await uniqueTarget(root, path.join(targetFolder, name), '.md')
        await atomicWrite(inside(root, relativePath), content)
        const entry = await registerKnowledgeFile(root, relativePath, NEW_USE_MODE)
        imported.push({ relativePath, name: path.basename(relativePath), type: request.type, fileId: entry.fileId, useMode: NEW_USE_MODE })
      }
      return imported
    }
    if (action === 'workflow.search') {
      return searchKnowledgeFiles({ query: request.query, includeContent: request.includeContent === true, type: request.type })
    }
    if (action === 'workflow.oldData.list') return (await listOldData(oldDataRoot)).filter((entry) => !request.scope || entry.kind === request.scope)
    if (action === 'workflow.oldData.restore') {
      const metadata = await oldDataMetadata(oldDataRoot, request.id)
      const restored = await restoreOldData(oldDataRoot, request.id, await configuredRoot())
      const root = await configuredRoot()
      if (metadata.kind === 'workflow' && root && realPathOrResolve(metadata.rootPath) === root) await registerKnowledgeSubtree(root, restored)
      return { restored }
    }
    if (action === 'workflow.oldData.delete') return permanentDeleteOldData(oldDataRoot, request.id)
    if (action === 'workflow.agent.read') return readAgent()
    if (action === 'workflow.agent.save') return saveAgent(request)
    if (action === 'archive.list' || action === 'archive.listProjects') {
      const root = await currentArchiveRoot()
      const stripTypes = (nodes) => nodes.map((node) => node.kind === 'folder' ? { ...node, children: stripTypes(node.children) } : { ...node, type: null })
      return { rootName: path.basename(root), nodes: stripTypes(await listTree(root)) }
    }
    if (action === 'archive.asset' || action === 'workflow.asset') {
      const base = await requireKnowledgeRoot()
      const root = action === 'archive.asset' ? await currentArchiveRoot() : await scopeDirectory(base, WORKFLOW_FOLDER_NAME)
      const href = String(request.href ?? '')
      if (/^(?:[a-z]+:|\/)/iu.test(href)) throw new Error('只显示档案室内的图片。')
      const documentPath = action === 'workflow.asset' ? path.relative(WORKFLOW_FOLDER_NAME, workflowPath(request.documentPath)) : safeRelative(request.documentPath)
      const relative = path.join(path.dirname(documentPath), href)
      const filename = inside(root, relative)
      const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' }[path.extname(filename).toLowerCase()]
      if (!mime || (await stat(filename)).size > 16 * 1024 * 1024) throw new Error('图片格式或大小不支持。')
      return { src: 'data:' + mime + ';base64,' + (await readFile(filename)).toString('base64') }
    }
    if (action === 'archive.putAsset' || action === 'workflow.putAsset') {
      const base = await requireKnowledgeRoot()
      const root = action === 'archive.putAsset' ? await currentArchiveRoot() : await scopeDirectory(base, WORKFLOW_FOLDER_NAME)
      const documentPath = action === 'workflow.putAsset' ? path.relative(WORKFLOW_FOLDER_NAME, workflowPath(request.documentPath)) : safeRelative(request.documentPath)
      const raw = String(request.name ?? '')
      const extension = path.extname(raw).toLowerCase()
      const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' }[extension]
      if (!mime) throw new Error('仅支持 PNG、JPEG、GIF 或 WebP 图片。')
      if (typeof request.contentBase64 !== 'string') throw new Error('图片内容无效。')
      const binary = Buffer.from(request.contentBase64, 'base64')
      if (!binary.length || binary.length > 16 * 1024 * 1024) throw new Error('图片过大或内容为空。')
      const documentName = path.basename(documentPath, path.extname(documentPath))
      const assetsFolder = path.join(path.dirname(documentPath), documentName + '-附件')
      await mkdir(inside(root, assetsFolder), { recursive: true }).catch(() => {})
      const assetsName = await uniqueFilename(inside(root, assetsFolder), safeName(path.basename(raw, extension), extension))
      await writeFile(inside(root, path.join(assetsFolder, assetsName)), binary, { flag: 'wx' })
      return { href: documentName + '-附件/' + assetsName }
    }
    if (action === 'archive.read') {
      const root = await currentArchiveRoot()
      const current = pathFromRoot(root, request.relativePath)
      if (!current.filename.toLowerCase().endsWith('.md')) throw new Error('档案室只管理 Markdown 文件。')
      const content = await readFile(current.filename, 'utf8')
      const info = await stat(current.filename)
      return { item: { kind: 'file', name: path.basename(current.filename), title: titleOf(current.filename), relativePath: current.relativePath, updatedAt: info.mtime.toISOString(), size: info.size, type: null }, content, revision: digest(content) }
    }
    if (action === 'archive.createProject') {
      const root = await currentArchiveRoot()
      const target = await uniqueTarget(root, safeName(request.name), '')
      await mkdir(inside(root, target), { recursive: false })
      return { relativePath: target }
    }
    if (action === 'archive.createFolder') {
      const root = await currentArchiveRoot()
      const parent = safeRelative(request.parent ?? '.')
      const target = await uniqueTarget(root, path.join(parent, safeName(request.name)), '')
      await mkdir(inside(root, target), { recursive: false })
      return { relativePath: target }
    }
    if (action === 'archive.createMarkdown') return createArchiveMarkdown(await currentArchiveRoot(), request)
    if (action === 'archive.commitDocument') return commitArchiveDocument(request)
    if (action === 'archive.import') {
      const root = await currentArchiveRoot()
      if (!Array.isArray(request.files) || request.files.length === 0) throw new Error('请选择要导入的档案文件。')
      const imported = []
      for (const file of request.files) imported.push(await importArchiveFile(root, { ...file, targetFolder: request.targetFolder }))
      return imported
    }
    if (action === 'archive.save') {
      const root = await currentArchiveRoot()
      const current = pathFromRoot(root, request.relativePath)
      const existing = existsSync(current.filename) ? await readFile(current.filename, 'utf8') : ''
      if (request.revision !== undefined && digest(existing) !== request.revision) throw new Error('文件已被其他程序修改，请刷新后再保存。')
      if (existsSync(current.filename)) await historyCopy(historyRoot, 'archive', current.relativePath, current.filename)
      await atomicWrite(current.filename, String(request.content ?? ''))
      return { revision: digest(String(request.content ?? '')) }
    }
    if (action === 'archive.move') return moveWithinRoot(await currentArchiveRoot(), historyRoot, request.from, request.to)
    if (action === 'archive.copy') return copyWithinRoot(await currentArchiveRoot(), request.from, request.to)
    if (action === 'archive.trash') return { id: await moveToOldData(oldDataRoot, await currentArchiveRoot(), request.relativePath, 'archive') }
    if (action === 'archive.batch') return archiveBatch(request)
    if (action === 'archive.reveal') {
      const current = pathFromRoot(await currentArchiveRoot(), request.relativePath)
      await new Promise((resolve, reject) => execFile('open', ['-R', current.filename], (error) => error ? reject(new Error('无法在 Finder 中显示。')) : resolve()))
      return null
    }
    if (action === 'trash.list') return listOldData(oldDataRoot)
    if (action === 'trash.restore') return { restored: await restoreOldData(oldDataRoot, request.id, await configuredRoot()) }
    if (action === 'trash.delete') return permanentDeleteOldData(oldDataRoot, request.id)
    if (action === 'workbench.saveDraft') {
      const filename = inside(draftsRoot, digest(request.id).slice(0, 24) + '.md')
      await atomicWrite(filename, String(request.content ?? ''))
      return { revision: digest(String(request.content ?? '')) }
    }
    if (action === 'workbench.history') {
      const kind = request.kind === 'workflow' ? 'workflow' : request.kind === 'archive' ? 'archive' : 'workflow'
      const folder = path.join(historyRoot, kind, digest(request.id).slice(0, 24))
      let entries = []
      try { entries = await readdir(folder) } catch {}
      return entries.filter((name) => name.endsWith('.md')).sort().reverse()
    }
    throw new Error('不支持的操作。')
  }

  ctx.effect(() => host.registerRoute({
    kind: 'exact',
    path: '/lexflow-api',
    handler: async (req, res) => {
      let body = ''
      for await (const chunk of req) body += chunk
      let request = {}
      try { request = body ? JSON.parse(body) : {} } catch { json(res, 400, { error: '请求格式错误。' }); return }
      try { json(res, 200, { ok: true, value: await handleRequest(request) }) }
      catch (error) { json(res, 400, { ok: false, error: error instanceof Error ? error.message : '操作失败。' }) }
    },
  }), 'lexflow-archive: workflow and archive API')

  for (const filename of FONT_FILES) ctx.effect(() => host.registerRoute({
    kind: 'exact',
    path: '/lexflow-assets/fonts/' + filename,
    handler: async (_req, res) => { await sendFont(filename, res) },
  }), 'lexflow-archive: ' + filename)
}
