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
    dshVersion: '0.1.7-alpha.1',
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
