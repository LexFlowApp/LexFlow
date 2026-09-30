/** Host half of the LexFlow adapter for the pinned DeepSeek Harness runtime. */

// All DeepSeek Harness imports in LexFlow-owned integrations terminate here.
// Business plugins consume these names without knowing which Harness package
// currently provides the implementation.
export { Service } from '@deepseek-ai/cordis'
export { deepEqualJson } from '@deepseek-ai/dsh-util-values'
export { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
export { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
export { createUserMessage, resolveRetryPolicy } from '@deepseek-ai/dsh-llm'
export { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai'
export { SessionId } from '@deepseek-ai/dsh-session'
export { AttachmentId } from '@deepseek-ai/dsh-attachment'
export { TOOL_ABORTED, defineTool } from '@deepseek-ai/dsh-tools'
export { WebError } from '@deepseek-ai/dsh-web'
import { credentialKey } from '@deepseek-ai/dsh-credentials'
export { default as schemastery } from '@deepseek-ai/schemastery'

import { defineTool } from '@deepseek-ai/dsh-tools'
import z from '@deepseek-ai/schemastery'
import { SessionId } from '@deepseek-ai/dsh-session'

export const inject = ['webServer', 'tools', 'settings', 'llm']

const SETTINGS_NAMESPACE_PATTERN = /^[a-z][a-z0-9-]*$/u
export function settingsNamespace(value) {
  if (!SETTINGS_NAMESPACE_PATTERN.test(value)) throw new TypeError(`settings namespace "${value}" must match ${String(SETTINGS_NAMESPACE_PATTERN)}`)
  return value
}

function provide(ctx, name, value) {
  if (ctx.reflect && typeof ctx.reflect.provide === 'function') return ctx.reflect.provide(name, value)
  if (typeof ctx.provide === 'function') return ctx.provide(name, value)
  throw new Error(`LexFlow 适配层无法提供服务：${name}`)
}

function service(ctx, name) {
  if (typeof ctx.get === 'function') return ctx.get(name)
  return ctx[name]
}

function requiredService(ctx, name) {
  const value = service(ctx, name)
  if (value === undefined) throw new Error(`LexFlow 适配层无法取得服务：${name}`)
  return value
}

/**
 * 按值解出一个插件配置：0.1.7 中被 .volatile() 标记的字段在运行时是带 get() 的引用对象，
 * 其余字段是普通值。旧版设置读取到的始终是值，这里把引用解成当前值，使第三层的读取代码
 * 不必区分两种形态。只处理顶层字段——设置字段一律声明在配置根对象上。
 * @param raw - 插件配置对象（可能含 volatile 引用）。
 * @returns 顶层字段均为当前值的对象。
 */
export function derefConfig(raw) {
  if (raw === null || typeof raw !== 'object') return raw
  const result = {}
  for (const [key, value] of Object.entries(raw)) {
    result[key] = value !== null && typeof value === 'object' && typeof value.get === 'function' ? value.get() : value
  }
  return result
}

/**
 * 服务商登录桥：把底座 authorization／credentials 两个服务的用法收敛成产品插件可用的最小面。
 *
 * pi-ai 已为每个内置目录服务商（含 Kimi 套餐 kimi-coding）注册好授权流程，登录成功后
 * 凭据写入共享凭证存储；模型目录从同一存储读取，因此凭证一旦落盘，对应模型自动出现在选择器里。
 * 产品插件因此无需知道凭证键格式、通知载荷或流程细节，也无需自建凭据文件。
 *
 * 两个服务按调用时惰性获取（与底座 dsh-llm-pi-ai 取 credentials 的方式一致），
 * 不写进 dsh.host.inject：未挂载授权／凭证服务的组合里，本桥只报不可用，不会拖垮适配层挂载。
 *
 * @param ctx - 适配层宿主上下文。
 * @returns 冻结的服务商登录面。
 */
function createProviderAuth(ctx) {
  const sessions = new Map()
  // pi-ai 的凭证记录作用域固定为 llm-pi-ai，记录键即「作用域/服务商」。
  const keyFor = (providerId) => credentialKey('llm-pi-ai', providerId)
  const sessionOf = (providerId) => sessions.get(providerId) ?? { inFlight: false, notice: null, error: null }
  const idle = { available: false, configured: false, inFlight: false, methods: [], notice: null, error: null }
  const face = {
    /**
     * 确保某个内置服务商在模型层的路由表中已声明（幂等）。
     *
     * 底层只为「已声明的路由」注册模型，所以仅登录（凭据落盘）不足以让模型出现，
     * 还必须在设置里声明该路由。声明走 settings.mutate——与设置界面写配置同一条通道，
     * 对用户已有的 providers 字典做路径级修改（合并）。这很关键：覆盖层式的整段注入
     * 会把整份 providers 替换掉，抹平用户自己接入的服务商。
     * @param providerId - 底层服务商标识（如 kimi-coding）。
     * @param displayName - 界面上展示的服务商名称。
     * @returns 本次是否新写入（已声明时返回 false）。
     */
    async ensureProviderRoute(providerId, displayName) {
      const llm = service(ctx, 'llm')
      const settings = service(ctx, 'settings')
      if (llm === undefined || settings === undefined || typeof settings.mutate !== 'function') return false
      if (llm.listProviders().some((provider) => provider.id === providerId)) return false
      await settings.mutate('llm-pi-ai', [
        { op: 'set', path: ['providers', providerId, 'displayName'], value: displayName ?? providerId },
      ])
      return true
    },
    /** 查询某个服务商的登录可用性与当前状态。 */
    async status(providerId) {
      const auth = service(ctx, 'authorization')
      const credentials = service(ctx, 'credentials')
      if (auth === undefined || credentials === undefined) return { ...idle }
      const key = keyFor(providerId)
      const flow = auth.describe(key)
      if (flow === undefined) return { ...idle }
      const record = await credentials.describeRecord(key)
      const session = sessionOf(providerId)
      return {
        available: true,
        methods: flow.methods,
        inFlight: flow.inFlight === true,
        configured: record?.configured === true,
        notice: session.notice,
        error: session.error,
      }
    },
    /**
     * 发起一次登录。设备码流程先取得验证网址与用户码（notify），再进入轮询；
     * 因此这里立即返回，由调用方轮询 status() 取回验证信息与最终结果。
     */
    login(providerId, method, displayName) {
      const auth = requiredService(ctx, 'authorization')
      const existing = sessionOf(providerId)
      if (existing.inFlight) return { started: false, notice: existing.notice }
      const session = { inFlight: true, notice: null, error: null }
      sessions.set(providerId, session)
      void auth.begin({
        key: keyFor(providerId),
        method: method ?? 'oauth',
        interaction: {
          notify: (notice) => {
            session.notice = { message: notice?.message ?? '', url: notice?.url ?? null, code: notice?.code ?? null }
          },
          // 设备码流程不向用户提问；若上游改为需要输入，这里明确拒绝，避免请求静默挂起。
          prompt: () => Promise.reject(new Error('该登录方式无需额外输入。')),
        },
      }).then(async (outcome) => {
        session.inFlight = false
        session.notice = null
        session.error = outcome?.status === 'authorized' || outcome?.status === 'cancelled' ? null : '登录未完成，请重试。'
        // 登录只写入凭据；路由声明补上后，模型才会出现在选择器里（失败不影响登录本身）。
        if (outcome?.status === 'authorized') {
          try { await face.ensureProviderRoute(providerId, displayName) }
          catch (error) { (ctx.logger ?? console).warn?.(`lexflow: 未能声明服务商路由 ${providerId}`, error) }
        }
      }).catch((error) => {
        session.inFlight = false
        session.notice = null
        session.error = error instanceof Error ? error.message : '登录失败。'
      })
      return { started: true, notice: null }
    },
    /** 撤销进行中的登录。 */
    cancel(providerId) {
      service(ctx, 'authorization')?.cancel(keyFor(providerId))
      sessions.set(providerId, { inFlight: false, notice: null, error: null })
      return { ok: true }
    },
    /** 退出登录：删除该服务商的凭据记录，模型随之下线。 */
    async logout(providerId) {
      const credentials = requiredService(ctx, 'credentials')
      await credentials.deleteRecord(keyFor(providerId))
      sessions.delete(providerId)
      return { ok: true }
    },
  }
  return Object.freeze(face)
}

function createHostFace(ctx) {
  const logger = ctx.logger ?? console
  return Object.freeze({
    lifecycle: Object.freeze({
      effect: (factory, label) => ctx.effect(factory, label),
      on: (event, listener) => ctx.on(event, listener),
      emit: (event, ...args) => ctx.emit(event, ...args),
    }),
    logger: Object.freeze({
      info: (...args) => logger.info(...args),
      warn: (...args) => logger.warn(...args),
      error: (...args) => logger.error(...args),
    }),
    llm: Object.freeze({
      listProviders: () => requiredService(ctx, 'llm').listProviders(),
      registerAdapter: (providers, adapter) => requiredService(ctx, 'llm').registerAdapter(providers, adapter),
      resolveModelInfo: (...args) => requiredService(ctx, 'llm').resolveModelInfo(...args),
    }),
    registerWebRoutes(register) {
      return ctx.inject(['webServer'], scope => register(Object.freeze({
        effect: (factory, label) => scope.effect(factory, label),
        register: route => scope.webServer.register(route),
      })))
    },
    registerSearchProvider(register) {
      return ctx.inject(['web'], scope => register(Object.freeze({
        register: provider => scope.web.registerSearchProvider(provider),
        currentRequestId: () => scope.get('agents')?.currentInitiator()?.session.id,
      })))
    },
    registerTools(services, register) {
      return ctx.inject(services, scope => register(Object.freeze({
        register: tool => scope.tools.register(tool),
        attachments: scope.attachments,
        fs: scope.fs,
        resolveModelInfo: (...args) => requiredService(ctx, 'llm').resolveModelInfo(...args),
        emit: (event, ...args) => scope.emit(event, ...args),
      })))
    },
    registerSettings(owner, namespace, schema, entry, hooks) {
      // DeepSeek Harness 0.1.7 不再有「注册设置命名空间」API：设置直接由插件自身的
      // Config 投影，字段带 .volatile() 即进入设置文档，命名空间就是该插件的 profile 条目 id。
      // 旧版的 settings.installSection(owner, ns, schema, entry, hooks) 因此不复存在。
      // 适配层在这里把旧调用形状翻译成新机制：
      //   · 条目 id 用 settingsNamespace(namespace)（0.1.7 中它就是该插件的 profile 条目 id）；
      //   · configure({ auto: false }) 声明由 LexFlow 自带页面呈现该设置，而非底座自动生成页面；
      //   · hooks.setSource 交给调用方的读取函数返回「顶层已解引用的当前值」，
      //     使第三层沿用旧版的读取代码即可拿到值（0.1.7 的 volatile 字段在插件内是引用对象）；
      //   · 配置热更新（loader/volatile-update）到达时回调 hooks.onChange，并先跑一次校验。
      // owner 缺省时退回当前 fiber，未组合设置服务时静默降级为提交初值，不阻断插件加载。
      // 读取面：调用方传入的 entry 就是插件的实时配置对象（形参名沿用旧版签名，内容为 config）。
      // 0.1.7 中被 .volatile() 标记的字段在其中是带 get() 的实时引用，配置热更新由加载器
      // 就地写入这些引用、插件无需重载；因此每次读取时解引用顶层字段即可拿到最新值。
      const readConfig = () => derefConfig(entry)
      const ns = settingsNamespace(namespace)
      return ctx.inject(['settings'], scope => {
        const forms = scope.settings
        // configure({ auto: false })：声明该设置由 LexFlow 自带页面呈现，底座不自动生成页面。
        // 未组合设置服务（或服务不支持该策略）时跳过，不影响插件其余能力。
        const disposePolicy = forms !== undefined && typeof forms.configure === 'function'
          ? forms.configure({ auto: false }, owner?.fiber ?? ctx.fiber)
          : undefined
        if (typeof hooks?.setSource === 'function') hooks.setSource(readConfig)
        try { hooks?.validate?.(readConfig()) } catch (error) { scope.logger?.warn?.(error) }
        if (typeof hooks?.onChange === 'function') hooks.onChange()
        // 配置热更新到达时同步通知：插件的实时引用已由加载器更新，这里只做校验与副作用回调。
        const off = scope.on?.('loader/volatile-update', () => {
          try { hooks?.validate?.(readConfig()) } catch (error) { scope.logger?.warn?.(error) }
          hooks?.onChange?.()
        })
        return () => { off?.(); disposePolicy?.() }
      })
    },
    registerPrompt(register) {
      return ctx.inject(['systemPrompt'], scope => register(Object.freeze({
        section: section => scope.systemPrompt.section(section),
        context: context => scope.systemPrompt.context(context),
        getSectionOrder: name => scope.systemPrompt.getSectionOrder(name),
        getContextOrder: name => scope.systemPrompt.getContextOrder(name),
      })))
    },
    sessions: Object.freeze({
      get: id => service(ctx, 'sessions')?.get(SessionId(id)),
    }),
    resources: Object.freeze({
      attachments: () => service(ctx, 'attachments'),
    }),
  })
}

export function apply(ctx) {
  const settings = ctx.settings
  const adapter = Object.freeze({
    contractVersion: 2,
    dshVersion: '0.2.0-rc.2',
    host: Object.freeze({
      registerRoute(route) {
        return ctx.webServer.register(route)
      },
      registerTool(tool) {
        return ctx.tools.register(tool)
      },
      defineTool(definition) {
        return defineTool(definition)
      },
      defineSettingsSchema(shape) {
        return z.object(shape)
      },
      defineEnumSchema(values, defaultValue) {
        return z.union([...values]).default(defaultValue)
      },
      registerSettings(namespace, schema) {
        if (!settings || typeof settings.register !== 'function') throw new Error('LexFlow 适配层无法注册设置：当前 DeepSeek Harness 没有设置服务。')
        return settings.register(settingsNamespace(namespace), schema)
      },
      registerPrompt(register) {
        return ctx.inject(['systemPrompt'], scope => register(Object.freeze({
          section: section => scope.systemPrompt.section(section),
          context: context => scope.systemPrompt.context(context),
          getSectionOrder: name => scope.systemPrompt.getSectionOrder(name),
          getContextOrder: name => scope.systemPrompt.getContextOrder(name),
        })))
      },
      providerAuth: createProviderAuth(ctx),
    }),
    runtime: createHostFace(ctx),
  })
  const dispose = provide(ctx, 'lexflow', adapter)
  return typeof dispose === 'function' ? dispose : undefined
}

// All session-surface knowledge belongs here. Positional replacement preserves
// append-only history while changing the actual model-visible derivation.
export function workflowSessionContext(session) {
  if (!session?.append || !session.surface) throw new Error('当前会话不支持工作流上下文替换。')
  // 0.1.7 会话格式 v4 要求生产者自有 source kind（plugin:<名称>，不再带 plugin 字段）；
  // 旧格式（kind:'plugin' + plugin 字段）仍需识别，以归属升级前写入的历史事件。
  const isOwned = (event) => event?.type === 'user/message' && (event.data?.source?.plugin === 'lexflow-workflow' || event.data?.source?.kind === 'plugin:lexflow-workflow')
  return {
    history: () => session.snapshotEvents().filter(isOwned),
    visible: () => session.surface.nodes.map((seq) => session.eventAt(seq)).filter(isOwned),
    // 底座 0.1.5-rc.1 的 surfaceOp 校验要求 replace 操作携带 startSeq／endSeq
    // （旧字段 start／end 会被判为 invalid replace surfaceOp）。
    replace: (event, message) => session.append('user/message', message, { surfaceOp: { op: 'replace', startSeq: event.seq, endSeq: event.seq }, sourceEventSeqs: [event.seq] }),
    append: (message) => session.append('user/message', message, { surfaceOp: 'append' }),
  }
}
export function onWorkflowStep(ctx, handler) {
  return ctx.effect(() => ctx.on('agent/pre-step', handler), 'lexflow:workflow-step')
}
export function workflowToolSession(exec) {
  return String(exec?.agent?.session?.id ?? exec?.session?.id ?? exec?.sessionId ?? '')
}
