import { spawn as defaultSpawn } from 'node:child_process'
import { access } from 'node:fs/promises'
import { accessSync, constants, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'

const fail = (code, message) => Object.assign(new Error(message), { code })

// 解析 Codex 可执行文件位置。不写死本机用户名与 Node 版本号：
// 依次尝试 LexFlow 环境变量、版本管理器（nvm／Volta）的通用安装位置、
// 常见系统安装位置，最后交给 spawn 按 PATH 解析。
export function resolveCodexExecutable(env = process.env, home = homedir()) {
  if (typeof env.LEXFLOW_CODEX_PATH === 'string' && env.LEXFLOW_CODEX_PATH.length > 0) return env.LEXFLOW_CODEX_PATH
  const candidates = []
  const nvmVersions = join(home, '.nvm', 'versions', 'node')
  try {
    for (const version of readdirSync(nvmVersions)) candidates.push(join(nvmVersions, version, 'bin', 'codex'))
  } catch { /* 未安装 nvm，继续尝试其他位置 */ }
  candidates.push(
    join(home, '.volta', 'bin', 'codex'),
    join(home, '.local', 'bin', 'codex'),
    '/opt/homebrew/bin/codex',
    '/usr/local/bin/codex',
  )
  for (const candidate of candidates) {
    try {
      accessSync(candidate, constants.X_OK)
      return candidate
    } catch { /* 该位置没有可执行的 codex，继续尝试 */ }
  }
  return 'codex'
}

const EFFORTS = new Set(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'])
export async function discoverCodexModels({ executable = resolveCodexExecutable(), spawnImpl = defaultSpawn, timeoutMs = 20_000, maxPages = 20, maxBytes = 2 * 1024 * 1024, version = '0.2.2', signal } = {}) {
  await access(executable, constants.X_OK).catch(() => { throw fail('DISCOVERY_UNAVAILABLE', '本地 Codex 目录服务不可用。') })
  if (signal?.aborted) throw fail('DISCOVERY_CANCELLED', '目录刷新已取消。')
  const child = spawnImpl(executable, ['app-server'], { shell: false, stdio: ['pipe', 'pipe', 'pipe'] })
  const reader = createInterface({ input: child.stdout })
  const pending = new Map(), cursors = new Set(), models = new Map()
  let bytes = 0, nextId = 1, fatal
  const rejectAll = (error) => { fatal = error; for (const waiter of pending.values()) waiter.reject(error); pending.clear() }
  const onError = () => rejectAll(fail('DISCOVERY_UNAVAILABLE', 'Codex 目录进程启动失败。'))
  const onExit = () => rejectAll(fail('DISCOVERY_CLOSED', 'Codex 目录进程已退出。'))
  const onAbort = () => rejectAll(fail('DISCOVERY_CANCELLED', '目录刷新已取消。'))
  child.on('error', onError); child.on('exit', onExit); child.stdin.on('error', onError)
  child.stderr.resume()
  // Bound raw bytes before readline buffers an unterminated oversized line.
  child.stdout.on('data', (chunk) => { bytes += Buffer.byteLength(chunk); if (bytes > maxBytes) { rejectAll(fail('DISCOVERY_LIMIT', '模型目录响应过大。')); child.kill() } })
  reader.on('line', (line) => {
    let value
    try { value = JSON.parse(line) } catch { return }
    const waiter = pending.get(value?.id)
    if (!waiter) return
    pending.delete(value.id)
    if (value.error) waiter.reject(fail('DISCOVERY_PROTOCOL', 'Codex 目录接口返回错误。'))
    else waiter.resolve(value.result)
  })
  signal?.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => rejectAll(fail('DISCOVERY_TIMEOUT', '模型目录刷新超时。')), timeoutMs)
  const request = (method, params) => new Promise((resolve, reject) => {
    if (fatal) { reject(fatal); return }
    const id = nextId++; pending.set(id, { resolve, reject })
    child.stdin.write(JSON.stringify({ id, method, params }) + '\n')
  })
  try {
    await request('initialize', { clientInfo: { name: 'lexflow_model_catalog', title: 'LexFlow', version } })
    child.stdin.write(JSON.stringify({ method: 'initialized', params: {} }) + '\n')
    let cursor
    for (let page = 0; page < maxPages; page++) {
      const result = await request('model/list', { limit: 100, includeHidden: false, ...(cursor ? { cursor } : {}) })
      if (!result || !Array.isArray(result.data)) throw fail('DISCOVERY_PROTOCOL', '模型目录格式不兼容。')
      for (const item of result.data) {
        if (!item || typeof item.model !== 'string' || !item.model || item.model.length > 256) continue
        const efforts = [...new Set((item.supportedReasoningEfforts ?? []).map((entry) => typeof entry === 'string' ? entry : entry?.reasoningEffort).filter((effort) => EFFORTS.has(effort)))]
        const input = (item.inputModalities ?? ['text']).filter((value) => value === 'text' || value === 'image')
        models.set(item.model, { provider: 'openai-codex', id: item.model, name: typeof item.displayName === 'string' ? item.displayName.slice(0, 256) : item.model, efforts, input, defaultEffort: EFFORTS.has(item.defaultReasoningEffort) ? item.defaultReasoningEffort : undefined, transport: 'codex-responses', source: 'codex-app-server', access: 'unverified' })
      }
      if (result.nextCursor == null || result.nextCursor === '') {
        if (!models.size) throw fail('DISCOVERY_EMPTY', '模型目录为空，保留之前的目录。')
        return [...models.values()]
      }
      if (typeof result.nextCursor !== 'string' || cursors.has(result.nextCursor)) throw fail('DISCOVERY_PROTOCOL', '模型目录分页游标重复或无效。')
      cursor = result.nextCursor; cursors.add(cursor)
    }
    throw fail('DISCOVERY_LIMIT', '模型目录分页超过上限。')
  } finally {
    clearTimeout(timer); signal?.removeEventListener('abort', onAbort)
    rejectAll(fail('DISCOVERY_CLOSED', '目录刷新结束。')); reader.close(); child.stdin.end()
    if (child.exitCode === null && !child.killed) child.kill()
    child.removeListener('error', onError); child.removeListener('exit', onExit)
    // Keep stdin's error handler until the pipe actually closes.
  }
}
