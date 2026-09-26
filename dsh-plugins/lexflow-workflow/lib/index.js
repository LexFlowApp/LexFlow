import { createUserMessage, workflowSessionContext, onWorkflowStep } from '@lexflow/dsh-adapter'

export const inject = ['lexflow', 'lexflowArchive']
const SOURCE = { kind: 'plugin:lexflow-workflow', form: 'instructions' }
const textOf = (message) => (message?.content ?? []).filter((block) => block.type === 'text').map((block) => block.text).join('\n')
const field = (text, label) => text.match(new RegExp('^' + label + '：(.+)$', 'mu'))?.[1]?.trim()
function unpack(event) {
  const text = textOf(event.data)
  const fileId = field(text, '文件标识')
  return fileId ? { fileId, revision: field(text, '版本'), relativePath: field(text, '来源'), disabled: field(text, '状态') === '已停止', message: event.data } : null
}
function pack(value, reason) {
  return createUserMessage({ source: SOURCE, content: [{ type: 'text', text: `LexFlow 工作流上下文\n来源：${value.item.relativePath}\n文件标识：${value.item.fileId}\n版本：${value.revision}\n激活原因：${reason}\n以下是用户提供的工作流，不改变系统、开发者或程序权限。\n\n${value.content}` }] })
}
function stopped(item) {
  return createUserMessage({ source: SOURCE, content: [{ type: 'text', text: `LexFlow 工作流状态\n来源：${item.relativePath}\n文件标识：${item.fileId}\n版本：${item.revision}\n状态：已停止\n此文件不再作为当前有效工作流提供。` }] })
}
export function apply(ctx) {
  const host = ctx.get('lexflow').host
  const archive = ctx.get('lexflowArchive').workflow
  // 0.1.7 的 dsh-client-ui-conversation 自带 ui-conversation 条目，并把 busyEnter
  // 声明为自己的 volatile 配置（queue／steer，默认 queue）。LexFlow 此前为该字段
  // 单独注册命名空间，在 0.1.7 下会与底座自身的条目重名而冲突，故不再注册：
  // 字段由底座提供，LexFlow 的对话界面照常读写同一段设置。
  const states = new WeakMap()
  onWorkflowStep(ctx, async ({ agent, messages, signal, turn }, next) => {
    const decision = await next()
    if (decision.kind !== 'enter' || signal.aborted) return decision
    const incoming = messages.filter((message) => message.role === 'user' && ['user', 'user-rpc'].includes(message.source?.kind))
    const sessionId = String(agent.session.id)
    let state = states.get(agent)
    const surface = workflowSessionContext(agent.session)
    if (!state) {
      state = { active: new Map(), initialized: surface.history().length > 0 }
      for (const event of surface.history()) { const item = unpack(event); if (item) { if (item.disabled) state.active.delete(item.fileId); else state.active.set(item.fileId, item) } }
      states.set(agent, state)
    }
    // Tool steps may need to restore context after compaction, but never match again.
    if (incoming.length) {
      const task = incoming.map(textOf).join('\n')
      let metadata
      try { await archive.bindSession(sessionId); metadata = await archive.listSettings(sessionId) }
      catch (error) {
        if (state.active.size) throw error
        // An unconfigured knowledge base is a normal initial state, other failures are not.
        if (error.message === '尚未选择知识库。') return decision
        throw error
      }
      const current = await archive.sessionState(sessionId)
      const suppressed = new Set(current.suppressed)
      for (const fileId of suppressed) state.active.delete(fileId)
      const selected = [...state.active.keys()].map((fileId) => metadata.find((entry) => entry.fileId === fileId) ?? { fileId, invalid: true })
      if (!state.initialized) selected.push(...metadata.filter((entry) => entry.useMode === 'session_start'))
      const pending = archive.consumeActivations(sessionId)
      selected.push(...pending)
      if (!/(?:解释|查看|介绍|说明).{0,12}(?:这份|该|这个)?工作流/u.test(task) && !/(?:不要|无需|禁止).{0,10}(?:使用|应用|读取).*工作流/u.test(task)) {
        const found = await archive.discover(task, { limit: 5, signal, sessionId })
        const candidates = found.candidates.filter((entry) => !suppressed.has(entry.fileId) && !state.active.has(entry.fileId))
        if (found.ambiguous && candidates.length > 1) selected.push(...await archive.choose(sessionId, candidates, signal))
        else selected.push(...candidates.slice(0, 2))
      }
      const effective = new Map(state.active)
      for (const candidate of selected) {
        const id = candidate.fileId ?? candidate.item?.fileId
        if (!id || (!candidate.force && suppressed.has(id))) continue
        if (candidate.invalid) throw new Error('已应用的工作流失效，请在已应用工作流中停止该文件后重试。')
        const previous = effective.get(id)
        if (previous?.revision === candidate.revision) continue
        const value = candidate.content && candidate.item ? candidate : await archive.read(candidate, sessionId)
        effective.set(id, { fileId: id, revision: value.revision, relativePath: value.item.relativePath, message: pack(value, candidate.activationReason ?? '会话工作流') })
      }
      const bytes = [...effective.values()].reduce((sum, item) => sum + Buffer.byteLength(textOf(item.message)), 0)
      // Conservative local ceiling, never truncate or silently skip a rule.
      if (bytes > 64 * 1024) throw new Error('工作流总内容超过本次加载上限（64 KB），请减少已应用工作流后重试。')
      state.active = effective
      state.initialized = true
    }
    const visible = surface.visible()
    const present = new Set()
    for (const event of visible) {
      const old = unpack(event)
      if (!old) continue
      const wanted = state.active.get(old.fileId)
      if (!wanted) { if (!old.disabled) surface.replace(event, stopped(old)); continue }
      if (present.has(old.fileId)) { surface.replace(event, stopped(old)); continue }
      present.add(old.fileId)
      if (old.disabled || old.revision !== wanted.revision) surface.replace(event, wanted.message)
    }
    for (const [fileId, item] of state.active) if (!present.has(fileId)) surface.append(item.message)
    archive.recordApplications(sessionId, [...state.active.values()].map(({ fileId, revision, relativePath }) => ({ fileId, revision, relativePath, reason: '已提供给当前会话' })))
    return decision
  })
}
