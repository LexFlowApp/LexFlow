window.__ModuleLoader__.load({
  id: '@lexflow/dsh-adapter',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    const primitives = require('@deepseek-ai/dsh-client-ui-primitives')
    const stores = require('@deepseek-ai/dsh-client-store')
    const slots = require('@deepseek-ai/dsh-client-ui-slots')
    const cordis = require('@deepseek-ai/cordis')

    // DeepSeek Harness 0.1.7 把界面图标由「名+尺寸后缀」改为「名+尺寸变体」：
    // 旧的 IconApiOutline14／IconBranchOutline16 在 0.1.7 中不再存在，改为
    // IconApiOutlineRegular 等（另有 Medium／Artwork 等尺寸）。LexFlow 的界面
    // 与第三层插件一直按旧名取用，此处保留旧名并把取值重定向到新名，
    // 使 0.1.5 与 0.1.7 两版都可用；将来若再改名，只需维护这一张映射表。
    const ICON_NAME_FALLBACK = {
      IconApiOutline14: 'IconApiOutlineRegular',
      IconBranchOutline16: 'IconBranchOutlineRegular',
      IconBrowseOutline16: 'IconBrowseOutlineRegular',
      IconCheckOutline16: 'IconCheckOutlineRegular',
      IconChecklistOutline14: 'IconChecklistOutlineRegular',
      IconChevronDownOutline14: 'IconChevronDownOutlineRegular',
      IconChevronRightOutline14: 'IconChevronRightOutlineRegular',
      IconChevronUpOutline14: 'IconChevronUpOutlineRegular',
      IconCloseOutline16: 'IconCloseOutlineRegular',
      IconCopyOutline16: 'IconCopyOutlineRegular',
      IconEditOutline16: 'IconEditOutlineRegular',
      IconFolderClose16: 'IconFolderCloseRegular',
      IconFolderOpen16: 'IconFolderOpenRegular',
      IconPanelLeftOutline16: 'IconPanelLeftOutlineRegular',
      IconPlusOutline16: 'IconPlusOutlineRegular',
      IconQueueOutline14: 'IconQueueOutlineRegular',
      IconSendOutline14: 'IconSendOutlineRegular',
      IconThinkOutline14: 'IconThinkOutlineRegular',
      IconTrashOutline16: 'IconTrashOutlineRegular',
      IconWarningOutline16: 'IconWarningOutlineRegular',
    }
    const icon = name => primitives[name] ?? primitives[ICON_NAME_FALLBACK[name]] ?? primitives.IconWarningOutlineRegular ?? primitives.IconWarningOutline16

    const {
      Button, CodeBlock, DisclosureRow, FishLogo, JsonBlock, MarkdownText, Menu,
      Modal, RiskConfirmation, StateDot, Toast, Tooltip, writeClipboard,
    } = primitives
    const {
      IconApiOutline14, IconBranchOutline16, IconBrowseOutline16, IconCheckOutline16,
      IconChecklistOutline14, IconChevronDownOutline14, IconChevronRightOutline14,
      IconChevronUpOutline14, IconCloseOutline16, IconCopyOutline16, IconEditOutline16,
      IconFolderClose16, IconFolderOpen16, IconPanelLeftOutline16, IconPlusOutline16,
      IconQueueOutline14, IconSendOutline14, IconThinkOutline14, IconTrashOutline16,
      IconWarningOutline16,
    } = Object.fromEntries(Object.keys(ICON_NAME_FALLBACK).map(name => [name, icon(name)]))
    // 0.1.7 的 primitives 不再提供 MessageText（LexFlow 各插件亦未实际使用），
    // 仅保留名字以免旧的转导出取到 undefined 时报错。
    const MessageText = primitives.MessageText ?? MarkdownText
    const { createSnapshotStore, defineStore, shallowEqual } = stores

    const CONTRACT_VERSION = 2

    class LexFlowError extends Error {
      constructor(code, message, details = {}, options = {}) {
        super(message, options.cause === undefined ? undefined : { cause: options.cause })
        this.name = 'LexFlowError'
        this.code = code
        this.details = details
      }
    }

    function normalizeError(value, fallbackCode = 'internal') {
      if (value instanceof LexFlowError) return value
      if (value instanceof Error) return new LexFlowError(fallbackCode, value.message, {}, { cause: value })
      return new LexFlowError(fallbackCode, String(value), {}, { cause: value })
    }

    function provide(ctx, name, value) {
      if (ctx.reflect && typeof ctx.reflect.provide === 'function') return ctx.reflect.provide(name, value)
      if (typeof ctx.provide === 'function') return ctx.provide(name, value)
      throw new Error(`LexFlow 适配层无法提供服务：${name}`)
    }

    function call(raw, name, args) {
      const method = raw && raw[name]
      if (typeof method !== 'function') throw new LexFlowError('unsupported', `当前 DeepSeek Harness 不提供 ${name} 能力。`)
      return method.apply(raw, args)
    }

    // 主题令牌翻译：把 LexFlow 自有前缀还原为底座变量名。
    // 适配层有 ui.theme.overrideTokens 与 ui.overrideTokens 两条覆写入口，
    // 必须共用这一处实现，否则同名入口的映射行为会不一致。
    function translateThemeTokens(tokens) {
      return Object.fromEntries(Object.entries(tokens).map(([key, value]) => [key.replace(/^--lexflow-(dsw|dsh|ds)-/u, '--$1-'), value]))
    }

    /**
     * 把 0.1.7 的设置表单（ConfigForms.get 返回的 ConfigForm）适配为第三层一直使用的
     * 旧 settingsScope 形状：getSnapshot() 返回 { status, value, mode }，subscribe 订阅变化，
     * set(field, value) 写一个字段。第三层（工作流欢迎提示、Codex 设置卡）据此无需改动。
     *
     * 参数沿用旧 bind 的形状 { namespace, decode }：namespace 即 0.1.7 的条目 id。
     * 旧版按命名空间读写设置文档中的一段；0.1.7 的设置直接是插件的 volatile 配置，
     * 同一段数据现在挂在同名条目上，故 id 一一对应。
     * @param raw - configForms 服务（0.1.7 的客户端设置表单服务）。
     * @param spec - { namespace, decode }。
     * @returns 稳定面形状的 scope 对象。
     */
    function bindSettings(raw, spec) {
      const namespace = String(spec?.namespace ?? '')
      const decode = typeof spec?.decode === 'function' ? spec.decode : value => value
      const form = raw && typeof raw.get === 'function' ? raw.get(namespace) : undefined
      if (!form) {
        // 取不到表单（例如未组合设置服务）时给出不可用但形状完整的对象，
        // 调用方据此显示错误态而不是抛异常。
        return Object.freeze({
          getSnapshot: () => ({ status: 'unavailable', value: undefined, mode: 'memory', error: 'settings are unavailable in this browser', revision: undefined, writable: false }),
          subscribe: () => () => {},
          set: async () => false,
          unset: async () => false,
        })
      }
      return Object.freeze({
        getSnapshot: (() => {
          // useSyncExternalStore 以 Object.is 判断快照是否变化：getSnapshot 每次返回新
          // 对象会让 React 判定"永远在变"，触发 #185 无限更新循环（GPT 设置页白屏）。
          // 这里按 form 快照缓存解码结果：底层引用不变时返回同一个外层对象。
          let cachedForm = undefined
          let cachedFace = undefined
          return () => {
            const snapshot = form.getSnapshot()
            if (cachedFace !== undefined && snapshot === cachedForm) return cachedFace
            cachedForm = snapshot
            cachedFace = Object.freeze({
              status: snapshot.status,
              value: decode(snapshot.value),
              mode: snapshot.mode,
              error: snapshot.error ?? null,
              // 0.1.7 的 ConfigForm 另给出修订号与可写标记：修订号用于写回时的并发校验
              //（旧 settingsScope 由 set 内部自行处理），可写标记供界面禁用编辑控件。
              revision: snapshot.revision,
              writable: snapshot.writable,
            })
            return cachedFace
          }
        })(),
        subscribe: listener => form.subscribe(listener),
        set: (field, value) => form.set(field, value),
        unset: field => form.unset(field),
      })
    }

    function slotFace(raw) {
      return Object.freeze({
        register: (...args) => call(raw, 'register', args),
        inject: (...args) => call(raw, 'inject', args),
        entries: (...args) => call(raw, 'entries', args),
        // 侧边栏面板行需要读取某席位已注册的条目元信息（id/order/label），
        // 底座侧边栏用自己的 slots 服务这么做；适配层暴露同一能力给产品壳。
        entriesOfSlot: (...args) => call(raw, 'entriesOfSlot', args),
        subscribe: (...args) => call(raw, 'subscribe', args),
        getVersion: (...args) => call(raw, 'getVersion', args),
      })
    }

    function pageRegistry() {
      const entries = new Map()
      const listeners = new Set()
      let revision = 0
      const notify = () => { revision += 1; for (const listener of listeners) listener(revision) }
      return {
        register(name, renderer) {
          if (!name || typeof renderer !== 'function') throw new LexFlowError('invalid-page', 'LexFlow 页面注册信息无效。')
          if (entries.has(name)) throw new LexFlowError('duplicate-page', `LexFlow 页面已注册：${name}`)
          entries.set(name, renderer)
          notify()
          return () => { if (entries.delete(name)) notify() }
        },
        get(name) { return entries.get(name) },
        has(name) { return entries.has(name) },
        subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
        getRevision() { return revision },
      }
    }

    function documentApi() {
      const request = async (action, payload = {}) => {
        let response
        try {
          response = await fetch('/lexflow-api', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action, ...payload }),
          })
        } catch (cause) {
          throw normalizeError(cause, 'offline')
        }
        let data
        try { data = await response.json() } catch (cause) { throw normalizeError(cause, 'invalid-response') }
        if (!response.ok || data?.ok === false) {
          throw new LexFlowError('document-request-failed', data?.error || `文档服务返回 HTTP ${response.status}`, { action, status: response.status })
        }
        return data?.value ?? null
      }
      return Object.freeze({
        request,
        workflowStatus: () => request('workflow.status'),
        listWorkflow: () => request('workflow.list'),
        readWorkflow: relativePath => request('workflow.read', { relativePath }),
        saveWorkflow: (relativePath, content, revision, type) => request('workflow.save', { relativePath, content, revision, type }),
        listArchive: () => request('archive.listProjects'),
        readArchive: relativePath => request('archive.read', { relativePath }),
        saveDraft: (id, content) => request('workbench.saveDraft', { id, content }),
        exportSessionLog: async (sessionId, signal) => {
          const url = new URL('/api/session.export', window.location.origin)
          url.searchParams.set('sessionId', String(sessionId ?? ''))
          url.searchParams.set('includeDescendants', 'true')
          const response = await fetch(url, { method: 'HEAD', credentials: 'same-origin', signal })
          if (!response.ok) throw new LexFlowError('session-log-export-failed', `会话日志导出准备失败（HTTP ${response.status}）。`, { status: response.status })
          return { url: url.toString(), filename: `LexFlow-session-${String(sessionId ?? '').replace(/[^A-Za-z0-9_-]+/gu, '_').slice(0, 80) || 'current'}.zip` }
        },
      })
    }

    /**
     * Host-facing browser compatibility belongs here rather than in a LexFlow
     * feature plugin.  DeepSeek Harness owns the DOM below the conversation
     * slot, so this is the only place that is allowed to know its current
     * generated class prefixes.  Feature plugins receive a stable installer
     * face and never query those nodes themselves.
     */
    const HOST_SURFACE_STYLE_ID = 'lexflow-host-surface-compatibility'
    // 设置-通用页版本行显示的产品版本与底座版本，由打包脚本按实际 package.json 注入
    // （识别下面的单引号占位符并替换为真实版本）。源码直载时占位符不含版本信息，
    // 渲染处据此跳过该行，不会写出错误版本号。
    const LEXFLOW_PRODUCT_VERSION = "0.5.1"
    const LEXFLOW_DSH_VERSION = "0.2.0-rc.2"
    const HOST_SURFACE_CSS = [
      // 0.1.5 把对话头部的分隔从 ::after 改成 header 自身的 border-bottom；
      // 保留 LexFlow 自带的下缘模糊，去掉底座新增的这条横线。
      '[class*="wSkVaW_header"] { border-bottom: none !important; }',
      "body { --lexflow-ds-font-family-code: var(--ds-font-family-code); --lexflow-dsh-content-font-delta: var(--dsh-content-font-delta); --lexflow-dsh-content-font-size: var(--dsh-content-font-size); --lexflow-dsh-scrollbar-thumb: var(--dsh-scrollbar-thumb); --lexflow-dsh-scrollbar-thumb-hover: var(--dsh-scrollbar-thumb-hover); --lexflow-dsw-alias-bg-base: var(--dsw-alias-bg-base); --lexflow-dsw-alias-bg-layer-1: var(--dsw-alias-bg-layer-1); --lexflow-dsw-alias-bg-layer-2: var(--dsw-alias-bg-layer-2); --lexflow-dsw-alias-bg-layer-3: var(--dsw-alias-bg-layer-3); --lexflow-dsw-alias-bg-module-platform: var(--dsw-alias-bg-module-platform); --lexflow-dsw-alias-bg-multi-select: var(--dsw-alias-bg-multi-select); --lexflow-dsw-alias-bg-overlay: var(--dsw-alias-bg-overlay); --lexflow-dsw-alias-border-inverted: var(--dsw-alias-border-inverted); --lexflow-dsw-alias-border-l1: var(--dsw-alias-border-l1); --lexflow-dsw-alias-border-l2: var(--dsw-alias-border-l2); --lexflow-dsw-alias-border-l3: var(--dsw-alias-border-l3); --lexflow-dsw-alias-brand-primary: var(--dsw-alias-brand-primary); --lexflow-dsw-alias-brand-primary-new-colorprimary-new-color: var(--dsw-alias-brand-primary-new-colorprimary-new-color); --lexflow-dsw-alias-button-elevated-fill: var(--dsw-alias-button-elevated-fill); --lexflow-dsw-alias-button-floating-fill: var(--dsw-alias-button-floating-fill); --lexflow-dsw-alias-button-floating-hover: var(--dsw-alias-button-floating-hover); --lexflow-dsw-alias-button-info-fill: var(--dsw-alias-button-info-fill); --lexflow-dsw-alias-button-info-hover: var(--dsw-alias-button-info-hover); --lexflow-dsw-alias-button-primary-fill: var(--dsw-alias-button-primary-fill); --lexflow-dsw-alias-button-primary-hover: var(--dsw-alias-button-primary-hover); --lexflow-dsw-alias-interactive-bg-hover: var(--dsw-alias-interactive-bg-hover); --lexflow-dsw-alias-interactive-bg-hover-danger: var(--dsw-alias-interactive-bg-hover-danger); --lexflow-dsw-alias-interactive-bg-hover-solid: var(--dsw-alias-interactive-bg-hover-solid); --lexflow-dsw-alias-label-caption: var(--dsw-alias-label-caption); --lexflow-dsw-alias-label-dimmed: var(--dsw-alias-label-dimmed); --lexflow-dsw-alias-label-primary: var(--dsw-alias-label-primary); --lexflow-dsw-alias-label-primary-bluish: var(--dsw-alias-label-primary-bluish); --lexflow-dsw-alias-label-primary-foreground: var(--dsw-alias-label-primary-foreground); --lexflow-dsw-alias-label-secondary: var(--dsw-alias-label-secondary); --lexflow-dsw-alias-label-tertiary: var(--dsw-alias-label-tertiary); --lexflow-dsw-alias-markdown-code-block: var(--dsw-alias-markdown-code-block); --lexflow-dsw-alias-markdown-code-block-banner: var(--dsw-alias-markdown-code-block-banner); --lexflow-dsw-alias-markdown-inline-code: var(--dsw-alias-markdown-inline-code); --lexflow-dsw-alias-scrollbar-bg-l1: var(--dsw-alias-scrollbar-bg-l1); --lexflow-dsw-alias-scrollbar-bg-l2: var(--dsw-alias-scrollbar-bg-l2); --lexflow-dsw-alias-scrollbar-hover-l1: var(--dsw-alias-scrollbar-hover-l1); --lexflow-dsw-alias-scrollbar-hover-l2: var(--dsw-alias-scrollbar-hover-l2); --lexflow-dsw-alias-state-business-primary: var(--dsw-alias-state-business-primary); --lexflow-dsw-alias-state-business-primary-hover: var(--dsw-alias-state-business-primary-hover); --lexflow-dsw-alias-state-business-tertiary: var(--dsw-alias-state-business-tertiary); --lexflow-dsw-alias-state-error-primary: var(--dsw-alias-state-error-primary); --lexflow-dsw-alias-state-success-primary: var(--dsw-alias-state-success-primary); --lexflow-dsw-alias-state-warn-label: var(--dsw-alias-state-warn-label); --lexflow-dsw-alias-state-warn-primary: var(--dsw-alias-state-warn-primary); --lexflow-dsw-alias-toast-bg: var(--dsw-alias-toast-bg); --lexflow-dsw-alias-tooltip-bg: var(--dsw-alias-tooltip-bg); --lexflow-dsw-font-family: var(--dsw-font-family); --lexflow-dsw-font-mono: var(--dsw-font-mono); --lexflow-dsw-shadow-lv2: var(--dsw-shadow-lv2); --lexflow-dsw-shadow-lv3: var(--dsw-shadow-lv3); --lexflow-dsw-specific-bubble: var(--dsw-specific-bubble); --lexflow-dsw-specific-bubble-highlight: var(--dsw-specific-bubble-highlight); --lexflow-dsw-specific-input-major: var(--dsw-specific-input-major); --lexflow-dsw-specific-menu: var(--dsw-specific-menu); --lexflow-dsw-specific-selector: var(--dsw-specific-selector); --lexflow-dsw-specific-sidebar-fill: var(--dsw-specific-sidebar-fill); --lexflow-dsw-specific-sidebar-nav-item-active: var(--dsw-specific-sidebar-nav-item-active); --lexflow-dsw-specific-sidebar-nav-item-active-accent: var(--dsw-specific-sidebar-nav-item-active-accent); --lexflow-dsw-specific-sidebar-nav-item-hover: var(--dsw-specific-sidebar-nav-item-hover); --lexflow-dsw-specific-tip: var(--dsw-specific-tip); --lexflow-dsw-static-neutral-bluish-00: var(--dsw-static-neutral-bluish-00); --dsw-font-family: var(--lexflow-font-ui); --dsw-font-mono: var(--lexflow-font-code); --ds-font-family-code: var(--lexflow-font-code); }",
      'html, body, button, input, textarea, select { font-family: var(--lexflow-font-ui, var(--dsw-font-family)) !important; }',
      'body { text-rendering: optimizeLegibility; font-feature-settings: "cv05" 1, "ss03" 1; letter-spacing: .001em; }',
      'div[class*="titleRow"] { -webkit-app-region: drag; min-height: 30px; }',
      'div[class*="titleRow"] button, div[class*="titleRow"] input, div[class*="titleRow"] [role="button"] { -webkit-app-region: no-drag; }',
      'header[class*="wSkVaW_header"]::after { display: none !important; }',
      // 0.1.7 把 header 从块/弹性布局改成 CSS Grid（grid-template-columns: auto minmax(0,1fr)、
      // min-height 76px），LexFlow 继续用 flex 是刻意选择：上面这条 display:flex + min-height:48px
      // 会覆盖底座网格，LexFlow 自绘的标题/页签/工具条排布依赖 flex 顺序（titleCluster/tabs/headerUtilities/corner
      // 的 order 1-4），改回网格会打乱既有排布，故保留覆盖。
      'header[class*="wSkVaW_header"] { align-items: center !important; box-sizing: border-box !important; display: flex !important; flex-wrap: nowrap !important; flex-direction: row !important; gap: 12px !important; min-height: 48px !important; padding: 18px 28px 0 !important; writing-mode: horizontal-tb !important; }',
      // 0.1.7 新增 headerLeading（插槽 conversation.header.leading，0.1.7 底座自身无注册者）。
      // 它原本靠网格 grid-area:1/1 定位；LexFlow 改为 flex 后它会成为普通 flex 项，
      // 与 LexFlow 自绘的头部控件抢位。LexFlow 已有自己的侧栏开关与安全区方案，故隐藏它。
      'header[class*="wSkVaW_header"] > [class*="headerLeading"] { display: none !important; }',
      // 0.1.7 在 header 与 titleRow 之间插入了一层包裹 div（display:contents）。旧规则用直接子元素
      // 选择器会失配，titleRow 保持 flex 盒，把「日志」与右侧边栏开关困在标题行内，而「对话／轨迹」
      // 被 margin-left:auto 推到最右，导致顶部顺序变成「标题 项目 日志 开关 … 对话 轨迹」。
      // 这里同时匹配两种结构（0.1.5 的直接子元素、0.1.7 的一层包裹），使 titleCluster／tabs／
      // headerUtilities／headerCorner 重新成为 header 的兄弟项，order 1-4 与 auto 外边距恢复
      // 设计要求顺序：标题与项目 → 对话 → 轨迹 → Session 日志。
      'header[class*="wSkVaW_header"] > div[class*="titleRow"], header[class*="wSkVaW_header"] > div > div[class*="titleRow"] { display: contents !important; }',
      // 0.1.7 新增 --dsh-frame-leading-clearance（底座侧栏收起时由 ui-layout 在 frame 上发布，
      // 供 titleRow 的 padding-inline-start 使用）。LexFlow 把 titleRow 拉成 display:contents、
      // 改由 header 自身的 padding-left 控制安全区，故不消费该变量；下方两条固定值保持不变。
      // 0.1.7 的底座初值为 160px／全屏 84px，与 LexFlow 的 142px／56px 不一致，属实机核验项。
      'header[class*="wSkVaW_header"] div[class*="titleCluster"] { align-items: center !important; align-self: center !important; display: flex !important; flex: 1 1 auto !important; min-width: 0 !important; order: 1 !important; }',
      'header[class*="wSkVaW_header"] div[class*="wSkVaW_tabs"] { align-items: center !important; align-self: center !important; display: flex !important; flex: 0 0 auto !important; flex-direction: row !important; gap: 12px !important; margin: 0 8px 0 auto !important; order: 2 !important; padding: 0 !important; white-space: nowrap !important; writing-mode: horizontal-tb !important; }',
      'header[class*="wSkVaW_header"] div[class*="wSkVaW_tabs"] button { align-items: center !important; display: inline-flex !important; flex: 0 0 auto !important; font-size: calc(var(--dsh-content-font-size-secondary, 13px) - 1px) !important; font-weight: 500 !important; height: 28px !important; justify-content: center !important; line-height: 20px !important; margin: 0 !important; padding: 4px 0 !important; white-space: nowrap !important; writing-mode: horizontal-tb !important; }',
      'header[class*="wSkVaW_header"] div[class*="wSkVaW_tabs"] button::before, header[class*="wSkVaW_header"] div[class*="wSkVaW_tabs"] button::after { box-shadow: none !important; text-decoration: none !important; }',
      'header[class*="wSkVaW_header"] div[class*="wSkVaW_headerUtilities"] { align-items: center !important; align-self: center !important; display: flex !important; flex: 0 0 auto !important; margin-left: 0 !important; min-width: 0 !important; order: 3 !important; }',
      'header[class*="wSkVaW_header"] .wSkVaW_crumbCurrent { font-weight: 700 !important; }',
      // 0.1.5 的右侧边栏开关（dsh-client-ui-sidebar-right 的 ExpandButton）注册在插槽
      // conversation.session.header.corner。适配层把 titleRow 拉成 display:contents 后它成为 header 的
      // 直接 flex 项，而适配层只给了 titleCluster/tabs/headerUtilities 顺序，它取默认 order 0 被排到
      // 标题左侧。这里补 order 4，让它落到头部最右（“日志”右侧），与顶部其它项同一条中心线。
      'header[class*="wSkVaW_header"] div[class*="wSkVaW_headerCorner"] { align-items: center !important; align-self: center !important; display: flex !important; flex: 0 0 auto !important; order: 4 !important; }',
      // 侧栏收起（含窄窗自动收起）时中心列从 x=0 起，标题会压住交通灯与 LexFlow 侧栏开关。
      // 安全区不再写死数值：--lexflow-leading-clearance 由 sweep() 按左侧栏开关按钮的实际
      // 右边界加 44px（28px 原有内边距 + 16px 箭头间隙）推导（窗口化 86+28+44=158、
      // 全屏 18+28+44=90 的等价结果），底座改按钮位置或宽度时自动跟随，不再复发重叠。
      // header 与 LexFlow 页面共用同一变量。
      '[data-sidebar-collapsed] header[class*="wSkVaW_header"] { padding-left: var(--lexflow-leading-clearance, 158px) !important; }',
      // LexFlow 一级页面（工作流／档案室／工作台／预览）收起时同样需要让出交通灯与开关安全区。
      '[data-sidebar-collapsed] .lexflowWorkflowPage, [data-sidebar-collapsed] .lexflowWorkbenchPage, [data-sidebar-collapsed] .lexflowWorkflowPreview { padding-left: var(--lexflow-leading-clearance, 158px) !important; }',
      // 底座右侧边栏在全屏形态（含窄窗自动全屏）下以 position:fixed inset:0 覆盖整窗，其顶部内容会与 macOS 交通灯重叠。为其顶部让出与 LexFlow 页面一致的安全区（42px）。
      '[data-lexflow-layout="rightbar"] [data-sidebar-right-panel="fullscreen"] { padding-top: 42px !important; }',
      '@media (max-width: 900px) { header[class*="wSkVaW_header"] { gap: 8px !important; padding-right: 12px !important; } header[class*="wSkVaW_header"] div[class*="wSkVaW_tabs"] { gap: 8px !important; margin-right: 8px !important; } header[class*="wSkVaW_header"] .wSkVaW_crumb { max-width: min(180px, 24vw) !important; } }',
      '@media (max-width: 700px) { header[class*="wSkVaW_header"] { align-items: stretch !important; flex-direction: column !important; flex-wrap: nowrap !important; gap: 4px !important; min-height: 116px !important; overflow: hidden !important; } header[class*="wSkVaW_header"] > div[class*="titleRow"] { align-items: stretch !important; display: block !important; flex: 0 0 auto !important; max-width: 100% !important; min-width: 0 !important; order: 1 !important; width: 100% !important; } header[class*="wSkVaW_header"] div[class*="titleCluster"] { flex: 0 0 auto !important; width: 100% !important; } header[class*="wSkVaW_header"] div[class*="wSkVaW_headerUtilities"] { align-self: flex-start !important; margin-left: 0 !important; order: 2 !important; } header[class*="wSkVaW_header"] div[class*="wSkVaW_tabs"] { align-self: flex-start !important; margin-left: 0 !important; margin-right: 0 !important; order: 2 !important; } }',
      '[data-lexflow-layout="frame"] { isolation: isolate; min-width: 0; min-height: 0; position: relative; }',
      '[data-lexflow-layout="center"] { min-width: 0; min-height: 0; overflow: hidden !important; position: relative; }',
      // 右栏列不得裁切：底座右侧边栏在窄视口（<768px）切换为全屏形态，面板按 100vw
      // 绘制并覆盖全界面（dsh-client-ui-sidebar-right 的 autoFullscreen）。底座自身的
      // 右栏列就是 overflow:visible（pI_x6G_rightbarCol）；LexFlow 此前沿用中央列的
      // overflow:hidden，把全屏面板剪成只剩一列宽的右边缘窄缝，左部全部不可见
      //（用户 2026-09-28 反馈"横屏电影在竖屏手机上只看到右侧竖边"）。
      '[data-lexflow-layout="rightbar"] { min-width: 0; min-height: 0; overflow: visible !important; position: relative; }',
      '[data-lexflow-layout="rightbar"] { background: var(--dsw-alias-bg-base); z-index: 1; }',
      '[data-lexflow-layout="center"] > *, [data-lexflow-layout="center"] [data-slot="conversation.session"] { max-width: 100%; min-width: 0; }',
      '[data-lexflow-layout="center"] > [class*="wSkVaW_root"] { isolation: isolate; overflow: hidden !important; position: relative; }',
      '[data-lexflow-layout="center"] > [class*="wSkVaW_root"]::before { -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px); background: linear-gradient(180deg, color-mix(in srgb, var(--dsw-alias-bg-base) 96%, transparent) 0%, color-mix(in srgb, var(--dsw-alias-bg-base) 78%, transparent) 54%, transparent 100%); content: ""; height: 104px; inset: 0 0 auto; pointer-events: none; position: absolute; z-index: 2; }',
      '[data-lexflow-layout="center"] > [class*="wSkVaW_root"] > * { position: relative; z-index: 3; }',
      '[data-conversation-scroll] { -webkit-mask-image: linear-gradient(180deg, transparent 0, #000 56px); mask-image: linear-gradient(180deg, transparent 0, #000 56px); }',
      // 0.1.7 会话根的 data-phase 只发 hero/settling/active（"inert" 仅出现在输入区自身的 data-phase 上，
      // 且不在 [data-conversation-scroll] 的祖先链上），故 inert 分支在 0.1.7 实为空转；
      // 保留该旧值不影响任何 0.1.7 行为，也便于 0.1.5 回滚。
      '[data-phase="hero"] [data-conversation-scroll], [data-phase="inert"] [data-conversation-scroll] { -webkit-mask-image: none; mask-image: none; }',
      '[data-lexflow-layout="center"] { isolation: isolate; position: relative; z-index: 0; }',
      '[data-lexflow-modal-open="true"] .lexflowWorkflowTopBack, [data-lexflow-modal-open="true"] .lexflowWorkflowPreviewBack, [data-lexflow-modal-open="true"] .lexflowTopSidebarToggle { visibility: hidden !important; pointer-events: none !important; }',
      '[data-shell-overlay] { isolation: isolate; z-index: 1000 !important; }',
      // 弹窗层级 1050：高于 LexFlow 全部自有层级（最高 data-shell-overlay 1000），
      // 低于底座浮层（菜单／提示为 1100，底座约定菜单显示在弹窗之上）。
      // 此前为 2147483000，会盖住设置页内的下拉菜单——菜单打开而不可点击（2026-09-30 修复）。
      // 遮盖目标（侧栏 z3、拖拽竖线 z2、侧栏开关 z30）全部在 1000 以下，1050 仍完整遮盖。
      '[role="presentation"]:has(> [role="dialog"][aria-modal="true"]) { isolation: isolate !important; position: fixed !important; inset: 0 !important; z-index: 1050 !important; }',
      '[role="presentation"]:has(> [role="dialog"][aria-modal="true"]) > [role="dialog"][aria-modal="true"] { position: relative !important; z-index: 1 !important; }',
      '[data-lexflow-modal-open="true"] .lexflowFrame_handle, [data-lexflow-modal-open="true"] [class*="wSkVaW_widthHandle"] { pointer-events: none !important; visibility: hidden !important; }',
      // 弹窗打开时一并隐藏运行态 Flowing 条：它是 position: fixed 的浮层（见下方 z-index 规则），
      // 与遮罩、弹窗卡片的层叠关系取决于底座当时的结构，逐个对层级既不可靠也无意义——
      // 弹窗期间用户的注意力在弹窗内，过程指示显示在遮罩下或遮罩上都是噪音。直接隐藏最干净。
      // 只隐藏运行态（data-lexflow-flowing），完成态过程条属于对话正文，留在原位。
      '[data-lexflow-modal-open="true"] [data-chat-running][data-lexflow-flowing="true"] { display: none !important; }',
      // 0.1.5 底座把会话日志控件从“下载按钮”改成“更多操作”菜单：类名由 sessionLogButton 变为 *moreButton，
      // 无障碍标签变为“更多操作”“More actions”，且不再下发 data-id/data-slot-id。
      // 依据 0.1.5-rc.1 产物与隔离实验（dsh-session-log-export/lib/client.js 的 register 选项与按钮属性）确定匹配方式。
      '[data-session-log-download], [data-id="session-log-download"], [data-slot-id="session-log-download"], button[aria-label="下载会话日志"], button[class*="sessionLogButton"], [class*="sessionLogButton"], [data-slot="conversation.session.header.utilities"] button[class*="moreButton"], [data-slot="conversation.session.header.utilities"] button[aria-label="更多操作"], [data-slot="conversation.session.header.utilities"] button[aria-label="More actions"] { display: none !important; }',
      // 右侧边栏使用的令牌补齐：底座 0.1.5 的右侧边栏引用这三项，LexFlow 令牌表此前未覆盖。
      'body { --lexflow-dsw-alias-border-l4: var(--dsw-alias-border-l4); --lexflow-dsw-static-neutral-200: var(--dsw-static-neutral-200); --lexflow-dsw-static-neutral-700: var(--dsw-static-neutral-700); }',
      'div[class*="sessionRow"] { box-sizing: border-box !important; height: 28px !important; overflow: hidden !important; padding-left: 10px !important; padding-right: 8px !important; position: relative !important; }',
      'div[class*="sessionRow"] > [class*="title"] { display: block !important; flex: 1 1 auto !important; font-size: var(--dsh-content-font-size-secondary, 13px) !important; line-height: 18px !important; min-width: 0 !important; order: 1; overflow: hidden !important; position: relative; text-overflow: clip !important; white-space: nowrap !important; }',
      'div[class*="sessionRow"] > [class*="slot"] { align-items: center; display: flex !important; flex: 0 0 16px !important; height: 18px; justify-content: center; margin: 0 !important; order: 2; position: absolute !important; right: 8px; top: 50%; transform: translateY(-50%); width: 16px !important; z-index: 2; }',
      'div[class*="sessionRow"] > [class*="slot"]:empty { display: none !important; }',
      'div[class*="sessionRow"] > [class*="time"] { display: none !important; }',
      'div[class*="sessionRow"] > [class*="rowActions"] { align-items: center; background: var(--dsw-alias-interactive-bg-hover); border-radius: 4px; box-sizing: border-box; display: flex !important; flex: 0 0 16px !important; height: 16px; justify-content: center; margin: 0 !important; min-width: 16px !important; opacity: 0; padding: 0 !important; pointer-events: none; position: absolute !important; right: 8px; top: 50%; transform: translateY(-50%); visibility: hidden; width: 16px !important; z-index: 3; }',
      'div[class*="sessionRow"] > [class*="rowActions"] [class*="iconButton"] { margin: 0 !important; }',
      'div[class*="sessionRow"]:hover > [class*="slot"], div[class*="sessionRow"]:focus-within > [class*="slot"], div[class*="sessionRow"][class*="menuOpen"] > [class*="slot"] { opacity: 0; visibility: hidden; }',
      'div[class*="sessionRow"]:hover > [class*="rowActions"], div[class*="sessionRow"]:focus-within > [class*="rowActions"], div[class*="sessionRow"][class*="menuOpen"] > [class*="rowActions"] { opacity: 1; pointer-events: auto; visibility: visible; }',
      'div[class*="projectRow"] { height: 26px !important; margin-top: 8px !important; font-size: 14px !important; font-weight: 600 !important; letter-spacing: .02em; color: var(--dsw-alias-label-secondary) !important; }',
      'div[class*="projectRow"] [class*="title"] { font-size: 14px !important; line-height: 20px !important; }',
      'div[class*="projectRow"]:hover { background: var(--dsw-alias-interactive-bg-hover); border-radius: 6px; }',
      // 底座的部分步骤行把"活动图标"与"箭头"叠放在同一槽位（如 ChatGroupSeat 的
      // O_Ebla_leading），靠 opacity 在 hover／展开时切换。早期为会话树行加的全局
      // opacity:1 覆盖会同时点亮两者，造成图标重叠；此处排除这类叠加箭头，
      // 让底座自己的显隐规则生效。
      'span[class*="chevron"]:not([class*="O_Ebla_chevron"]), span[class*="arrow"] { opacity: 1 !important; }',
      'div[class*="sessionRow"] > [class*="title"][data-lexflow-title-overflow="true"] { -webkit-mask-image: linear-gradient(90deg, #000 0%, #000 calc(100% - 14px), transparent 100%); mask-image: linear-gradient(90deg, #000 0%, #000 calc(100% - 14px), transparent 100%); color: var(--dsw-alias-label-primary) !important; }',
      'div[class*="sessionRow"] > [class*="title"][data-lexflow-title-overflow="true"]::after { color: var(--dsw-alias-label-primary); content: attr(data-lexflow-title); display: none; font: inherit; left: 0; max-width: none; pointer-events: none; position: absolute; top: 0; transform: translateX(0); white-space: nowrap; }',
      'div[class*="sessionRow"] > [class*="title"][data-lexflow-title-overflow="true"]::after { animation: lexflowSessionTitleMarquee var(--lexflow-title-duration, 8s) ease-in-out infinite alternate paused; }',
      'div[class*="sessionRow"] > [class*="title"][data-lexflow-title-overflow="true"]:hover, div[class*="sessionRow"] > [class*="title"][data-lexflow-title-overflow="true"]:focus-visible { color: transparent !important; }',
      'div[class*="sessionRow"] > [class*="title"][data-lexflow-title-overflow="true"]:hover::after, div[class*="sessionRow"] > [class*="title"][data-lexflow-title-overflow="true"]:focus-visible::after { animation-play-state: running; display: inline-block; }',
      '@keyframes lexflowSessionTitleMarquee { 0%, 12% { transform: translateX(0); } 84%, 100% { transform: translateX(var(--lexflow-title-shift)); } }',
      'div[class*="sessionRow"] [data-state="ongoing"], div[class*="sessionRow"] [data-state="warning"] { height: 8px !important; width: 8px !important; }',
      'div[class*="sessionRow"] svg[data-state="ongoing"] { background: var(--dsw-alias-state-business-primary); border-radius: 50%; color: var(--dsw-alias-state-business-primary); overflow: hidden; }',
      'div[class*="sessionRow"] svg[data-state="ongoing"] rect { display: none; }',
      'div[class*="sessionRow"] [data-state="ongoing"] { animation: lexflowTaskDotPulse 1.2s ease-in-out infinite; }',
      'div[class*="sessionRow"] [data-state="done"] { background: var(--dsw-alias-state-business-primary) !important; border-radius: 50% !important; color: var(--dsw-alias-state-business-primary) !important; display: block !important; height: 8px !important; width: 8px !important; }',
      '@keyframes lexflowTaskDotPulse { 0%, 100% { opacity: .38; transform: scale(.84); } 50% { opacity: 1; transform: scale(1); } }',
      '@media (prefers-reduced-motion: reduce) { div[class*="sessionRow"] [data-state="ongoing"], div[class*="sessionRow"] > [class*="title"][data-lexflow-title-overflow="true"]::after { animation: none !important; } }',
      'div[class*="bubble"] { border-radius: 14px !important; box-sizing: border-box; max-width: 100%; overflow-wrap: anywhere; }',
      'div[class*="bubble"] { padding: 10px 14px !important; font-size: var(--dsh-content-font-size, 14px) !important; line-height: calc(22px + var(--dsh-content-font-delta, 0px)) !important; }',
      'div[class*="composerSeat"] textarea, div[class*="composerSeat"] [data-input-mirror], div[class*="composerSeat"] [data-input-backdrop] { box-sizing: border-box !important; font-family: var(--lexflow-font-ui, var(--dsw-font-family)) !important; font-size: var(--dsh-content-font-size, 14px) !important; line-height: calc(24px + var(--dsh-content-font-delta, 0px)) !important; max-width: 100% !important; }',
      // 消息区现行结构（0.1.5-rc.1）：助手正文 hWmORq、消息列 EvIC1a、滚动区 EvIC1a_scroll。
      // 适配层此前使用的 0.1.4 消息容器类名在 0.1.5 中已不存在（对应规则实际未生效），
      // 此处换到现行锚点，并落实紧凑密度：正文行高 22px、流间距 12px。
      '[class*="hWmORq_root"] { line-height: calc(22px + var(--dsh-content-font-delta, 0px)) !important; max-width: 100% !important; }',
      '[class*="hWmORq_body"] { gap: 12px !important; min-width: 0 !important; }',
      // 0.1.7 把正文 Markdown 的 CSS module 哈希由 markdown_kcgor 换成 markdown_kj4sz
      // （0.1.5-rc.1 与 0.1.7-alpha.1 的 dsh-web-frontend 产物各含其一，旧哈希在 0.1.7 已无引用）；
      // 以下 6 条规则并列匹配两个哈希，保留旧类名以便回滚；hWmORq_root/body 在 0.1.7 仍有效，故不改。
      '[class*="hWmORq"] [class*="markdown_kcgor"], [class*="hWmORq"] [class*="markdown_kj4sz"] { font-size: var(--dsh-content-font-size, 14px) !important; line-height: calc(22px + var(--dsh-content-font-delta, 0px)) !important; max-width: 100% !important; }',
      '[class*="hWmORq"] [class*="markdown_kcgor"] p, [class*="hWmORq"] [class*="markdown_kj4sz"] p { margin: 6px 0 !important; }',
      '[class*="hWmORq"] [class*="markdown_kcgor"] :where(ul, ol), [class*="hWmORq"] [class*="markdown_kj4sz"] :where(ul, ol) { margin: 6px 0 !important; }',
      '[class*="hWmORq"] [class*="markdown_kcgor"] li:not(:first-child), [class*="hWmORq"] [class*="markdown_kj4sz"] li:not(:first-child) { margin-top: 3px !important; }',
      '[class*="hWmORq"] [class*="markdown_kcgor"] li::marker, [class*="hWmORq"] [class*="markdown_kj4sz"] li::marker { line-height: calc(22px + var(--dsh-content-font-delta, 0px)) !important; }',
      '[class*="hWmORq"] [class*="markdown_kcgor"] :where(pre, blockquote, hr), [class*="hWmORq"] [class*="markdown_kj4sz"] :where(pre, blockquote, hr) { margin-top: 8px !important; margin-bottom: 8px !important; max-width: 100% !important; }',
      // 此规则不得设置 max-width／min-width：EvIC1a_column 的 max-width 由
      // --dsh-chat-content-width 驱动，是原生列宽调整器的目标属性，覆盖它会让调整器失效。
      '[class*="EvIC1a_column"] { --dsh-chat-flow-gap: 12px !important; }',
      // 对话内容与输入区之间留出呼吸空间，避免正文贴着输入框。
      '[class*="EvIC1a_root"] { padding-bottom: 12px !important; }',
      // 工具行（ToolRow）等组件里有一类"仅供朗读"的隐藏元素：position: absolute、1×1、clip 到不可见，
      // 但底座 CSS 不给 top/left，其静态位置在个别情形下会落到会话内容末尾之外——运行中的工具调用、
      // 且展开其详情时即会触发——从而撑大滚动容器的可滚动区域。表现为输入框下方多出一段可以滚下去
      // 的空白，像"纸的底部下面还有纸"（用户 2026-09-27 反馈；监视器已记录到输入框因此上移 107px）。
      // 实测：把这样一个元素推到内容末尾之下 800px，滚动高度 +801；钉到包含块左上角后回到基线。
      // 这些元素已被 clip 裁成 1×1，位置对视觉与朗读均无影响，故一律钉住。
      '[class*="EvIC1a_column"] [class*="visuallyHidden"] { top: 0 !important; left: 0 !important; }',
      '[class*="EvIC1a_scroll"] { padding: 16px calc(var(--dsh-composer-side-clearance) + 16px) 30px !important; }',
      // 输入区形态（2026-09-27 三次定稿）：
      //   信息带合并为一行、全部左起：上下文 → 权限(仅图标) → 会话统计 → token 用量；模型仍在最右；
      //   输入框沉底、发送键入框内右侧垂直居中；输入框与窗口底部留出间距。
      // 底座结构：root(flex column) 直接子项 = card + dock；card 内 = overlay/attachments/scroll/row。
      // order 只在各自父容器内比较：root 层 dock=1、card=2；card 层 row=1、scroll=3。
      '[class*="uV2eYG_root"]:not([class*="uV2eYG_hero"]) [class*="uV2eYG_card"] { background: transparent !important; box-shadow: none !important; border-radius: 0 !important; gap: 4px !important; order: 2 !important; padding-top: 0 !important; }',
      '[class*="uV2eYG_root"]:not([class*="uV2eYG_hero"]) [class*="uV2eYG_row"] { align-items: center !important; gap: 8px !important; min-height: 28px !important; order: 1 !important; padding: 0 8px !important; }',
      '[class*="uV2eYG_root"]:not([class*="uV2eYG_hero"]) [class*="uV2eYG_scroll"] { background: var(--dsw-specific-input-major) !important; border-radius: 14px !important; box-shadow: var(--dsw-elevation-soft) !important; margin-right: 0 !important; order: 3 !important; }',
      // 加号是底座的"添加文件或调用指令"入口（aria-label 同名，实测为启用态）。这两项能力
      // 在输入框里直接输入 "/"（调用指令）与 "@"（引用文件）即可完成，属冗余入口，故删除。
      '[class*="uV2eYG_root"]:not([class*="uV2eYG_hero"]) [class*="uV2eYG_add"] { display: none !important; }',
      // 信息带左起第一格是权限触发器，不加任何让位：上下文计量器在新对话中不渲染，
      // 若把它放在最左、把权限推到其右侧，新对话的最左就会空出一截（用户 2026-09-27 反馈）。
      // 权限因此落在 row 自身内边距 8px 处，与输入框左缘齐平；上下文排在其右，见下。
      // 权限触发器仅显示图标：triggerLabel（"完全权限"等文字）与 chevron 收起，图标保留；
      // 弹出菜单在 portal 内，不受影响。
      '[class*="uV2eYG_root"]:not([class*="uV2eYG_hero"]) [class*="iWlSmW_trigger"] { gap: 0 !important; justify-content: center !important; padding: 0 4px !important; width: 28px !important; }',
      '[class*="uV2eYG_root"]:not([class*="uV2eYG_hero"]) [class*="iWlSmW_trigger"] [class*="iWlSmW_triggerLabel"], [class*="uV2eYG_root"]:not([class*="uV2eYG_hero"]) [class*="iWlSmW_trigger"] [class*="iWlSmW_chevron"] { display: none !important; }',
      // 信息带合并：上下文/统计在 dock（root 的直接子项）内，权限/模型在 card 内的 row 内，
      // 二者不同容器，无法用 flex 顺序排成一行。做法是把 dock 抽出文档流、按输入框的几何
      // 左右对齐，高度归零以免覆盖 row 拦掉权限/模型的点击，再把它的两个孩子绝对定位到 row
      // 那条线上（row 高 28px，故中线为 top: 14px）。card 因此成为唯一在流内的子项、上移 28px。
      // z-index 不可省：底座给 card 设了 position: relative，dock 与 card 同为定位元素时，
      // 绘制顺序改按 flex 的 order 走；若沿用原来的 order: 1（dock 在前），row 会盖住两个
      // 子元素，上下文与统计将点不开详情（实测 2026-09-27）。抬到 z-index: 2 即可压住 row。
      '[class*="uV2eYG_root"]:not([class*="uV2eYG_hero"]) { position: relative !important; }',
      // 会话正文滚到底会与信息带重叠：底座的 composerSeat 只在自己头 36px 内由透明渐变到
      // 不透明，而它的顶边**正好落在信息带那一行**，于是正文半透明地透到按钮上，字与图标糊在一起。
      // 这里把不透明段整段提到信息带起点，并在其上方补一段等长（36px）的渐隐，
      // 正文因此在到达按钮之前就淡出到界面底色，且不出现硬边。
      // 这是对底座外观的覆写，属适配层职责：第三层业务插件不参与，底座若改类名需同步此选择器。
      '[class*="wSkVaW_composerSeat"] { background: var(--dsw-alias-bg-base) !important; }',
      '[class*="wSkVaW_composerSeat"]::before { background: linear-gradient(180deg, color-mix(in srgb, var(--dsw-alias-bg-base) 0%, transparent) 0px, var(--dsw-alias-bg-base) 36px); content: ""; height: 36px; left: 0; pointer-events: none; position: absolute; right: 0; top: -36px; }',
      // 会话正文滚到底会与信息带重叠（上下文／权限／统计／模型），字直接压在图标上读不清。
      // 给这四个控件补一层半透明底色来压住身后的文字。底色取界面底色的六成：
      // 界面底色是平整的浅色，六成已足以把字压成浅痕，又不至于像一块贴上去的实心块
      //（九成时用户反馈"像出问题了"）。代价是压掉底座自身的
      // hover 底色（弹窗与光标不受影响）。backdrop-filter 一并保留，但**在当前底座上完全不生效**
      //（2026-09-27 实测：blur(6px) 与 blur(30px) 的渲染结果一模一样，全无模糊），
      // 真正起遮蔽作用的是底色；保留它是为了底座将来放开该能力时能自动接手。
      // 必须用精确词匹配 [class~=] 而非子串匹配 [class*=]：后者的子串会一并命中按钮内部的
      // `_7KE1Ra_triggerLabel`／`_7KE1Ra_triggerEffort`／`iWlSmW_triggerIcon`，
      // 使每一段文字各自多出一层圆角底色——表现为"Flash 与 High 之间有空隙、上下两层颜色"。
      '[class*="uV2eYG_root"]:not([class*="uV2eYG_hero"]) [class~="JObwrW_trigger"], [class*="uV2eYG_root"]:not([class*="uV2eYG_hero"]) [class~="iWlSmW_trigger"], [class*="uV2eYG_root"]:not([class*="uV2eYG_hero"]) [class~="_7KE1Ra_trigger"], [class*="uV2eYG_root"]:not([class*="uV2eYG_hero"]) [data-composer-stats] [class~="bOPqQW_pill"] { -webkit-backdrop-filter: blur(6px) !important; backdrop-filter: blur(6px) !important; border-radius: 999px !important; background-color: color-mix(in srgb, var(--dsw-alias-bg-base) 60%, transparent) !important; }',
      // 信息带（dock）必须与输入框卡片（card）同宽同左：dock 是 root 的绝对定位子项，
      // 而 card 是 root 的 flex 子项（宽度受列宽约束、并在 root 内水平居中）。
      // 此前用 `left: calc((100% - var(--dsh-composer-card-max-width)) / 2)` 反推位置，
      // 该变量含 680px 的 clamp 下限——窗口收窄（如右栏打开令中央列降到 677px）时，
      // 变量值(712px)大于 card 实际宽度(633px)，公式得出负偏移（实测 -23.5px），
      // dock 整体左移 39.5px，其内的上下文/统计落到权限触发器上，四个按钮重叠
      //（用户 2026-09-28 反馈"权限模式、上下文等四个按钮偏离原位且相互重叠"）。
      // 改为与 card 严格等价的横向几何：card 是 root 的 flex 子项、由 align-items:center
      // 在内容盒（content box）内居中，宽度为 min(内容盒宽, card-max-width)；
      // dock 是绝对定位子项，其百分比相对 root 的 padding box。因 root 左右内边距对称，
      // 「left:50% + translateX(-50%)」的中心与 card 的中心恒等；
      // 「width: 100% - 2×内边距」在窄窗等于内容盒宽、在宽窗被 max-width 收敛到与 card 同值。
      // 二者组合下，dock 的左右缘在任何窗口宽度都与 card 一致。
      '[class*="uV2eYG_root"]:not([class*="uV2eYG_hero"]) [class*="uV2eYG_dock"] { height: 0 !important; left: 50% !important; right: auto !important; transform: translateX(-50%) !important; width: calc(100% - 2 * var(--dsh-composer-side-clearance)) !important; max-width: var(--dsh-composer-card-max-width) !important; min-height: 0 !important; padding: 0 !important; position: absolute !important; top: 0 !important; z-index: 2 !important; }',
      // 上下文计量器接在权限触发器之后：8(row 内边距) + 28(权限) + 12(间距) = 48px。
      '[class*="uV2eYG_root"]:not([class*="uV2eYG_hero"]) [class*="uV2eYG_dock"] [class*="JObwrW_root"] { left: 48px !important; position: absolute !important; top: 14px !important; transform: translateY(-50%) !important; }',
      // 统计胶囊接在上下文之后：8 + 28(权限) + 12 + 22(上下文) + 12 = 82px。
      '[class*="uV2eYG_root"]:not([class*="uV2eYG_hero"]) [class*="uV2eYG_dock"] [data-composer-stats] { left: 82px !important; position: absolute !important; top: 14px !important; transform: translateY(-50%) !important; }',
      // 新对话没有上下文计量器，统计胶囊需整体左移补位，否则权限与统计之间会空出一格：
      // 8 + 28(权限) + 12 = 48px。
      '[class*="uV2eYG_root"]:not([class*="uV2eYG_hero"]) [class*="uV2eYG_dock"]:not(:has([class~="JObwrW_root"])) [data-composer-stats] { left: 48px !important; }',
      // "性能与用量"显示策略（定稿，无需"关闭"选项）：简洁档=彻底不显示（compact 的
      // 胶囊是纯 span，detailed 的是 button——用 :has(button) 区分）；详细档=仅显示图标，
      // 点开看详情（label 收起、图标保留，点击弹详情窗不受影响）。
      '[class*="uV2eYG_root"]:not([class*="uV2eYG_hero"]) [class*="uV2eYG_dock"] [data-composer-stats]:not(:has(button)) { display: none !important; }',
      '[class*="uV2eYG_root"]:not([class*="uV2eYG_hero"]) [data-composer-stats] button[class*="bOPqQW_pill"] { gap: 0 !important; padding: 2px 4px !important; }',
      '[class*="uV2eYG_root"]:not([class*="uV2eYG_hero"]) [data-composer-stats] button[class*="bOPqQW_pill"] [class*="bOPqQW_label"] { display: none !important; }',
      '[class*="uV2eYG_root"]:not([class*="uV2eYG_hero"]) [data-composer-stats] button[class*="bOPqQW_pill"] svg { height: 14px !important; width: 14px !important; }',
      // 上下文计量器仅图标：百分数是无类名的裸 span（紧跟 svg 之后），用
      // .JObwrW_trigger > svg + span 收起；图标（环形进度 svg）保留；详情弹窗不受影响。
      '[class*="uV2eYG_root"]:not([class*="uV2eYG_hero"]) [class*="JObwrW_trigger"] { gap: 0 !important; padding: 2px 4px !important; }',
      '[class*="uV2eYG_root"]:not([class*="uV2eYG_hero"]) [class*="JObwrW_trigger"] > svg + span { display: none !important; }',
      // 发送键与停止键都是底座的 primary 按钮（34×34、带 translateY(-2px)），同在 row 的 trailing 内。
      // Tooltip 不套壳，按钮即 trailing 的直接子项，故 trailing 的子项顺序恒为
      // [standardControls(模型), activity, 停止键?, 发送键]——发送键永远是最后一个。
      // 此前只按 aria-label="发送消息" 定位，停止键因此留在行内：运行态下它跑到信息带那一行、
      // 输入框里反而空了；而且它 34px 高把 row 从 28px 撑大，dock 里按 28px 定位的上下文与统计
      // 随之与流内的权限触发器错开（用户 2026-09-27 反馈"左侧四个按钮没对齐、发送键跑到对话框上面"）。
      // 改为按类名定位全部 primary 按钮，不依赖文案；两者同屏时（可继续的子代理会话）
      // 前一个即停止键左移让位，避免叠在同一点。
      '[class*="uV2eYG_root"]:not([class*="uV2eYG_hero"]) [class*="uV2eYG_input"] { min-height: 30px !important; padding: 6px 44px 8px 14px !important; }',
      '[class*="uV2eYG_root"]:not([class*="uV2eYG_hero"]) [class*="uV2eYG_placeholder"] { inset: 6px 44px auto 14px !important; }',
      '[class*="uV2eYG_root"]:not([class*="uV2eYG_hero"]) button[class*="uV2eYG_primary"] { bottom: 7px !important; height: 26px !important; margin: 0 !important; position: absolute !important; right: 10px !important; transform: none !important; width: 26px !important; z-index: 3 !important; }',
      '[class*="uV2eYG_root"]:not([class*="uV2eYG_hero"]) button[class*="uV2eYG_primary"] svg { height: 13px !important; width: 13px !important; }',
      // 两个 primary 同屏时，前一个（停止键）让位到左格；输入框文字区同步加宽，避免压字。
      '[class*="uV2eYG_root"]:not([class*="uV2eYG_hero"]) [class*="uV2eYG_trailing"] button[class*="uV2eYG_primary"]:not(:last-child) { right: 42px !important; }',
      '[class*="uV2eYG_root"]:not([class*="uV2eYG_hero"]):has([class*="uV2eYG_trailing"] button[class*="uV2eYG_primary"]:not(:last-child)) [class*="uV2eYG_input"] { padding-right: 74px !important; }',
      // 发送键与停止键都离场时，trailing 里只余 standardControls（模型），贴行右缘。
      '[class*="uV2eYG_root"]:not([class*="uV2eYG_hero"]) [class*="uV2eYG_trailing"] { margin-left: auto !important; }',
      // 输入框与窗口底部留出间距（此前 4px 太窄）。
      '[class*="uV2eYG_root"]:not([class*="uV2eYG_hero"]) { padding-bottom: 12px !important; }',
      // 对话框（输入框）高度上限：界面高度的三分之一，超出则在框内滚动。
      '[class*="uV2eYG_scroll"] { max-height: min(var(--dsh-composer-text-max-height, 336px), 33vh) !important; }',
      // 0.1.7 权限触发器从 dsh-client-ui-conversation 拆出到 dsh-client-ui-permission-presets，
      // 类名由 Sh0Q9G_trigger 变为 iWlSmW_trigger（旧类名在 0.1.7 已无引用）；
      // _7KE1Ra_trigger 仍是 dsh-client-ui-model-selection 的模型触发器，保留共用字号规则。
      '[class*="Sh0Q9G_trigger"], [class*="iWlSmW_trigger"], [class*="_7KE1Ra_trigger"] { font-size: calc(var(--dsh-content-font-size-secondary, 13px) - 1px) !important; }',
      // 新对话页与交付物卡片紧凑：大标题 26→22px、竖排间距 12→10px、底部留白 32→24px、
      // 交付物卡片上边距 16→12px。
      '[class*="pXSMma_headline"] { font-size: 22px !important; line-height: 28px !important; }',
      '[class*="pXSMma_stack"] { gap: 10px !important; }',
      '[class*="wSkVaW_composerHero"] { padding-bottom: 24px !important; }',
      // 0.1.7 把 deliverables 包拆分：原 ProducedFiles（P4kPIW_root，已不存在）的"变更文件卡片"
      // 职责落到 ChangedFiles.module.css 的 hz8-rW_card；另有 Deliverables 的 nyYjTG_root
      // （批量交付卡片栅格）与 ReviewTab 的 ZDDmpq_root（右侧栏对比页），均非同一节点。
      // 三者并列加入：margin-top 12px 对三类卡片都无害，同时保留旧类名以便回滚。
      '[class*="P4kPIW_root"], [class*="hz8-rW_card"], [class*="nyYjTG_root"], [class*="ZDDmpq_root"] { margin-top: 12px !important; }',
      '[class*="uV2eYG_scroll"] { overscroll-behavior-y: contain !important; max-width: 100% !important; }',
      // 0.1.7 的运行态文案改由 TurnProcessNodeView 渲染（TurnProcessNodeView.module.css 的 l_V-RG_label）；
      // 该 label 常驻、且运行态与完成态共用同一类名（0.1.7 的 data-phase 只剩 hero/settling/active，
      // 此处也没有仅运行态才有的 data-* 标记），纯类名匹配会连"已完成工作/用时 …"一起上色，
      // 故新分支改由 sweep() 给运行态节点打 data-lexflow-flowing 后再上色；旧分支原样保留以便回滚。
      '[data-chat-running], [data-chat-flow-kind="turn-process"] { background-color: transparent !important; background-image: linear-gradient(90deg, #c96547 0%, #da7756 40%, #f0c0ae 50%, #da7756 60%, #c96547 100%) !important; background-clip: text !important; -webkit-background-clip: text !important; color: transparent !important; -webkit-text-fill-color: transparent !important; }',
      // 运行态文案的替换不通过改写文本实现：该文案由 React 持有并每秒随用时重渲染，
      // 改写 textContent 会被覆盖回「深度求索中…」（0.1.5 时代的同类实现同样复现回退）。
      // 这里只让 sweep() 打 data-lexflow-flowing 标记，由 CSS 把原文收为零字号，
      // 用 ::after 呈现 Flowing...，React 如何重渲染都不影响显示。
      '[data-chat-running][data-lexflow-flowing="true"] { font-size: 0 !important; }',
      '[data-chat-running][data-lexflow-flowing="true"]::after { content: "Flowing..."; font-size: calc(var(--dsh-content-font-size-secondary, 13px) - 1px); line-height: calc(24px + var(--dsh-content-font-delta, 0px)); background-color: transparent !important; background-image: linear-gradient(90deg, #c96547 0%, #da7756 40%, #f0c0ae 50%, #da7756 60%, #c96547 100%) !important; background-clip: text !important; -webkit-background-clip: text !important; color: transparent !important; -webkit-text-fill-color: transparent !important; }',
      // 0.1.7 无独立计时元素：用时由 formatLiveRunDuration 拼进 label 文案（"深度求索中，用时{duration}"），
      // 不再有 _turnStatusClock 的对应节点，故此处只保留旧规则供 0.1.5 回滚。
      '[data-chat-running] [class*="visuallyHidden"], [data-chat-running] [class*="_turnStatusClock"] { background: none !important; color: #8b746c !important; -webkit-text-fill-color: #8b746c !important; }',
      // 过程条不显示下缘横线（运行态与完成态均不显示）。
      '[data-chat-running], [data-chat-flow-kind="turn-process"] { border-bottom: none !important; }',
      // 运行态过程条回到对话流内：它本身就是流里的一个节点（槽位 conversation.chat.node、
      // 键 turn-process，是消息列 EvIC1a_column 的直接子项），此前被 position:fixed 从流里
      // 拎出来、按输入区几何钉在左下，只要输入区形态一变就会错位。改为让它留在流内末尾：
      // order 推到最末，随内容滚动；上滚时随内容滚出视野（产品确认如此）。不再需要任何
      // 坐标变量与 sweep 里的几何计算。
      '[data-chat-running][data-lexflow-flowing="true"] { height: 24px !important; padding-bottom: 0 !important; width: auto !important; }',
      // 排序标记打在流节点外壳上（sweep 依据 :has 关系设置），比 :has 选择器更稳：
      // 无论该节点是消息列的直接子项，还是被折叠组包住，order 都能把它推到所在容器的末尾。
      '[data-chat-flow-kind="turn-process"][data-lexflow-flowing-order="true"] { order: 99 !important; }',
      // 鼠标点击过程条（含"用时"）不显示焦点框；键盘 Tab 到达时仍保留可见焦点。
      '[data-chat-running]:focus:not(:focus-visible) { outline: none !important; }',
      '#lexflow-window-drag-bar { -webkit-app-region: drag; height: 22px; left: 0; position: fixed; right: 0; top: 0; z-index: 5; }',
      'div[class*="logoRow"] button { -webkit-app-region: no-drag; }',
      // 0.1.5 把封面标题容纳类从 headlineText 改为 titleGroup（标题与“预览版”标签同层）。
      // 选择器同时保留旧类名，底座再次改动时不影响旧分支的可读性。
      'span[class*="headlineText"], span[class*="titleGroup"] > span:not([class*="previewBadge"]) { font-weight: 650; letter-spacing: .012em; }',
    ].join('\n')

    function installHostSurfaceCompatibility() {
      if (typeof document === 'undefined' || typeof window === 'undefined') return () => {}
      if (window.__LEXFLOW_HOST_SURFACE_COMPATIBILITY__) return () => {}
      if (!(window.__LEXFLOW_MODEL_VISIBILITY__ instanceof Set)) window.__LEXFLOW_MODEL_VISIBILITY__ = new Set()
      const style = document.createElement('style')
      style.dataset.lexflowHostCompatibility = 'true'
      style.dataset.pluginCss = HOST_SURFACE_STYLE_ID
      style.textContent = HOST_SURFACE_CSS
      document.head.appendChild(style)
      let pending = false
      const captures = new Map()
      const capture = (event) => { if (event.target?.matches?.('.lexflowFrame_handle, [class*="wSkVaW_widthHandle"]')) captures.set(event.pointerId, event.target) }
      const release = (event) => captures.delete(event.pointerId)
      document.addEventListener('gotpointercapture', capture, true)
      document.addEventListener('lostpointercapture', release, true)
      const updateSessionTitles = () => {
        for (const title of document.querySelectorAll('div[class*="sessionRow"] [class*="title"]')) {
          const text = title.textContent?.trim() ?? ''
          title.removeAttribute('data-lexflow-title')
          title.removeAttribute('data-lexflow-title-overflow')
          title.removeAttribute('title')
          title.style.removeProperty('--lexflow-title-shift')
          title.style.removeProperty('--lexflow-title-duration')
          if (!text || title.clientWidth <= 0) continue
          const overflow = title.scrollWidth - title.clientWidth
          if (overflow <= 1) continue
          title.setAttribute('data-lexflow-title', text)
          title.setAttribute('data-lexflow-title-overflow', 'true')
          title.setAttribute('title', text)
          title.style.setProperty('--lexflow-title-shift', `${-overflow}px`)
          title.style.setProperty('--lexflow-title-duration', `${Math.max(4.5, Math.min(12.5, 4.5 + overflow / 18))}s`)
        }
      }
      const sweep = () => {
        if (document.title !== 'LexFlow') document.title = 'LexFlow'
        const headline = document.querySelector('span[class*="headlineText"], span[class*="titleGroup"] > span:not([class*="previewBadge"])')
        if (headline && headline.textContent !== 'Everything is Workflow') headline.textContent = 'Everything is Workflow'
        for (const badge of document.querySelectorAll('span[class*="previewBadge"]')) badge.style.display = 'none'
        const flowing = document.querySelector('div[class*="_turnStatus"]:not([class*="_turnStatusClock"])')
        if (flowing) {
          for (const node of flowing.childNodes) {
            if (node.nodeType !== Node.TEXT_NODE || node.textContent?.trim() === '') continue
            if (node.textContent !== 'Flowing...') node.textContent = 'Flowing...'
            break
          }
        }
        // 运行态判定读根按钮内的可见 label 文案：运行态以 chat.deepDiving 系列开头
        // （"深度求索中"／"深度求索中，用时N秒"／"Deep diving…"），完成态为"已完成工作／用时 …"等。
        // 标记只用于把运行态与完成态区分开（上色、文案、排到流末）；位置完全交给 CSS 在流内解决，
        // 不再读取任何几何坐标——此前按输入区算坐标的做法会被输入区改版带偏。
        // 底座 0.2.0 的运行态条是带稳定数据属性 data-chat-running 的容器；0.1.7 用
        // data-chat-flow-kind="turn-process" 标识同一节点。两者都不是生成类名，
        // 因此不再随底座改名而失效；先清掉上一轮标记，避免完成态残留 Flowing 文案。
        for (const stale of document.querySelectorAll('[data-lexflow-flowing]')) {
          if (!stale.hasAttribute('data-chat-running') && stale.getAttribute('data-chat-flow-kind') !== 'turn-process') {
            stale.removeAttribute('data-lexflow-flowing')
          }
        }
        for (const root of document.querySelectorAll('[data-chat-running], [data-chat-flow-kind="turn-process"]')) {
          // 仅运行态保留标记：完成态的过程条不带 data-chat-running。
          const running = root.hasAttribute('data-chat-running')
          if (running) root.setAttribute('data-lexflow-flowing', 'true')
          else root.removeAttribute('data-lexflow-flowing')
          // 排序标记打在流节点外壳上：外壳是流容器的子项，order 才能生效；
          // 直接给按钮设 order 无效（它是外壳的子项，不参与流的排序）。
          const flowItem = root.closest('[data-chat-flow-kind]')
          if (flowItem !== null) {
            if (running) flowItem.setAttribute('data-lexflow-flowing-order', 'true')
            else flowItem.removeAttribute('data-lexflow-flowing-order')
          }
        }
        updateSessionTitles()
        // 设置-通用页的版本行由底座渲染为"当前版本：<DSH 版本>"。LexFlow 是用户可见的产品，
        // 该行改以 LexFlow 版本为主、DSH 版本备注在后；两个版本号在打包时注入。
        // 占位符未被注入时（如直接加载 src）不改写，避免写出错误版本号。
        if (LEXFLOW_PRODUCT_VERSION.startsWith('__LEXFLOW_') === false) {
          for (const row of document.querySelectorAll('div[class*="yIbyla_row"]')) {
            const label = `当前版本：${LEXFLOW_PRODUCT_VERSION}（底层 DeepSeek Harness ${LEXFLOW_DSH_VERSION}）`
            if (row.textContent !== label) row.textContent = label
          }
        }
        // 收起态安全区跟随开关按钮实际几何：右边界 + 28px 原有内边距 + 16px 间距，
        // 使返回箭头（占安全区最左 28px 槽位，见 ui-pages 的 [data-sidebar-collapsed] 规则）
        // 与侧栏开关之间留出可见间隙。展开态页面左边界即侧栏宽度，本身已避开交通灯，
        // 返回箭头保持页面内左缘 20px。
        const toggle = document.querySelector('.lexflowTopSidebarToggle')
        if (toggle) {
          const right = toggle.getBoundingClientRect().right
          const clearance = `${Math.round(right + 44)}px`
          const root = document.documentElement
          if (root.style.getPropertyValue('--lexflow-leading-clearance') !== clearance) root.style.setProperty('--lexflow-leading-clearance', clearance)
        }
        const modalOpen = Boolean(document.querySelector('[role="dialog"][aria-modal="true"], [data-shell-overlay][data-open="true"], [data-lexflow-modal="true"]'))
        if (document.documentElement.dataset.lexflowModalOpen !== String(modalOpen)) {
          document.documentElement.dataset.lexflowModalOpen = String(modalOpen)
          window.dispatchEvent(new CustomEvent('lexflow:modal-state', { detail: { open: modalOpen } }))
        }
        if (modalOpen) for (const [pointerId, handle] of captures) { if (handle.hasPointerCapture?.(pointerId)) handle.releasePointerCapture(pointerId); captures.delete(pointerId) }
        for (const handle of document.querySelectorAll('.lexflowFrame_handle, [class*="wSkVaW_widthHandle"]')) {
          if (modalOpen) {
            handle.style.setProperty('pointer-events', 'none', 'important')
            handle.style.setProperty('visibility', 'hidden', 'important')
          } else {
            handle.style.removeProperty('pointer-events')
            handle.style.removeProperty('visibility')
          }
        }
      }
      const observer = new MutationObserver(() => {
        if (pending) return
        pending = true
        requestAnimationFrame(() => {
          pending = false
          sweep()
        })
      })
      observer.observe(document.documentElement, { childList: true, subtree: true })
      const onSessionRowClick = (event) => {
        const target = event.target?.closest?.('div[class*="sessionRow"][role="treeitem"]')
        if (!target || event.target?.closest?.('button, input, select, textarea, [role="menuitem"]')) return
        window.dispatchEvent(new CustomEvent('lexflow:navigate', { detail: { page: 'conversation', source: 'session-row' } }))
      }
      document.addEventListener('click', onSessionRowClick, true)
      if (document.getElementById('lexflow-window-drag-bar') === null) {
        const bar = document.createElement('div')
        bar.id = 'lexflow-window-drag-bar'
        document.body.appendChild(bar)
      }
      sweep()
      window.addEventListener('resize', updateSessionTitles)
      const dispose = () => {
        observer.disconnect()
        document.removeEventListener('gotpointercapture', capture, true)
        document.removeEventListener('lostpointercapture', release, true)
        delete document.documentElement.dataset.lexflowModalOpen
        document.removeEventListener('click', onSessionRowClick, true)
        window.removeEventListener('resize', updateSessionTitles)
        style.remove()
        document.getElementById('lexflow-window-drag-bar')?.remove()
        delete window.__LEXFLOW_HOST_SURFACE_COMPATIBILITY__
      }
      window.__LEXFLOW_HOST_SURFACE_COMPATIBILITY__ = true
      return dispose
    }

    function contributionRegistry() {
      const entries = new Map()
      const listeners = new Map()
      const revisions = new Map()
      const notify = name => {
        revisions.set(name, (revisions.get(name) ?? 0) + 1)
        for (const listener of listeners.get(name) ?? []) listener()
      }
      return Object.freeze({
        register(name, contribution) {
          if (typeof name !== 'string' || name.length === 0 || contribution === null || typeof contribution !== 'object' || typeof contribution.id !== 'string' || contribution.id.length === 0 || typeof contribution.component !== 'function') throw new LexFlowError('invalid-contribution', 'LexFlow 界面贡献注册信息无效。')
          const bucket = entries.get(name) ?? new Map()
          if (bucket.has(contribution.id)) throw new LexFlowError('duplicate-contribution', `LexFlow 界面贡献已注册：${name}/${contribution.id}`)
          bucket.set(contribution.id, Object.freeze({ ...contribution, order: Number.isFinite(contribution.order) ? contribution.order : 0 }))
          entries.set(name, bucket)
          notify(name)
          return () => {
            if (!bucket.delete(contribution.id)) return
            if (bucket.size === 0) entries.delete(name)
            notify(name)
          }
        },
        list(name) {
          return [...(entries.get(name)?.values() ?? [])].sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
        },
        revision(name) {
          return revisions.get(name) ?? 0
        },
        subscribe(name, listener) {
          const bucket = listeners.get(name) ?? new Set()
          bucket.add(listener)
          listeners.set(name, bucket)
          return () => {
            bucket.delete(listener)
            if (bucket.size === 0) listeners.delete(name)
          }
        },
      })
    }

    function legacyRemoteResult(result, map = value => value) {
      return result.ok ? { result: { ok: true, value: map(result.value) } } : { result: { ok: false, error: result.error } }
    }

    function legacyModelApi(remote) {
      return Object.freeze({
        llm: Object.freeze({
          providers: async () => {
            const [registered, declared] = await Promise.all([remote.llm.listProviders(), remote.llm.listConfigurableProviders()])
            if (!registered.ok) return legacyRemoteResult(registered, () => ({ providers: [] }))
            if (!declared.ok) return legacyRemoteResult(declared, () => ({ providers: [] }))
            const active = new Set(registered.value.map(provider => provider.id))
            const declaredIds = new Set(declared.value.map(entry => entry.provider))
            const providers = declared.value.map(entry => ({
              provider: entry.provider,
              displayName: entry.displayName,
              settingsNs: entry.settingsNs,
              settingsPath: [...entry.settingsPath],
              active: active.has(entry.provider),
              ...(entry.declared === undefined ? {} : { declared: entry.declared }),
            }))
            for (const provider of registered.value) if (!declaredIds.has(provider.id)) providers.push({
              provider: provider.id,
              displayName: provider.name,
              settingsNs: '',
              settingsPath: [],
              active: true,
            })
            return { result: { ok: true, value: { providers } } }
          },
          models: async () => legacyRemoteResult(await remote.session.modelCatalog()),
          discoverModels: async ({ settingsNs, ...request }) => legacyRemoteResult(await remote.llm.discoverModels(settingsNs, request), models => ({ models })),
        }),
        credentials: Object.freeze({
          describe: async ({ refs }) => legacyRemoteResult(await remote.credentials.describe(refs), credentials => ({ credentials })),
          set: async ({ ref, value }) => legacyRemoteResult(await remote.credentials.set(ref, value)),
          unset: async ({ ref }) => legacyRemoteResult(await remote.credentials.unset(ref)),
        }),
        settings: Object.freeze({
          mutate: async ({ ns, ops, expectedRevision }) => legacyRemoteResult(await remote.settings.mutate(ns, ops, expectedRevision)),
        }),
      })
    }

    // Alpha 4 host composition stays at the versioned adapter boundary.
    const adapterExports = exports
    function mountHostShell(runtime, Page) {
    const layout = (() => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");
		let _lexflow_dsh_adapter = adapterExports;
		/** Viewport width below which the sidebar auto-collapses to the rail (deepsuite
		* LG breakpoint); a manual toggle below it re-expands over the squeezed center
		* (stores.ts narrowExpanded). */
		const SIDEBAR_AUTO_COLLAPSE = 1024;
		/**
		* Clamp a panel width into its contract range.
		* @param px - requested width.
		* @param min - range lower bound.
		* @param max - range upper bound.
		* @returns the clamped width.
		*/
		function clampWidth(px, min, max) {
			return Math.min(max, Math.max(min, Math.round(px)));
		}
		/**
		* Solve the three column widths for one viewport frame. Pure: no hysteresis —
		* the output is a function of (viewport, preferences) only, so recovery on
		* re-widening is automatic. Preferences re-clamp here because they cross the
		* store boundary and callers may still supply stale ranges.
		* The center column concedes width progressively: with the sidebar open it
		* keeps at least 400px on wide windows, but once that would zero the right
		* track (half-screen windows) it steps down to a 300px floor so the right
		* column stays resizable (down to 240px effective at tight viewports) until
		* the viewport truly cannot fit both (< ~800px). The 70%-of-viewport ceiling
		* still bounds the right track.
		* @param viewport - available frame width in px.
		* @param sidebar - sidebar width preference in px (0 = closed).
		* @param rightbar - right column width preference in px (0 = closed).
		* @returns resolved widths; rightbar 0 means the right track is closed, while a closed sidebar releases its full width to the center column.
		*/
		function computeColumns(viewport, sidebar, rightbar) {
			const s = sidebar === 0 ? 0 : clampWidth(sidebar, 240, 420);
			// 宽屏下中央列保 400px；挤不下时中央列让位到 300px，让右栏（最低 240px）仍可拖窄，
			// 而不是在半屏窗口直接把右栏解算为 0（拖手柄消失，用户无法缩小）。
			const tight = viewport - s - 300;
			const d0 = rightbar === 0 || tight < 240 ? 0 : Math.min(tight, clampWidth(rightbar, 300, Math.round(viewport * 0.7)));
			return {
				sidebar: s,
				center: Math.max(0, viewport - s - d0),
				rightbar: d0
			};
		}
		//#endregion
		//#region \0dsh-css:/home/runner/work/deepseek-harness/deepseek-harness/packages/client/ui-layout/src/client/AppFrame.module.css.mjs
		const css = ".lexflowFrame_frame{background:var(--dsw-alias-bg-base);height:100%;transition:grid-template-columns var(--ds-transition-duration-slow) var(--ds-ease-in-out);grid-template-rows:100%;display:grid;position:relative;overflow:hidden}.lexflowFrame_frame[data-dragging]{transition:none}@media (prefers-reduced-motion:reduce){.lexflowFrame_frame{transition:none}}.lexflowFrame_sidebarCol{background:var(--dsw-specific-sidebar-fill);border-right:1px solid var(--dsw-alias-border-l1);min-width:0;overflow:hidden}.lexflowFrame_centerCol{flex-direction:column;min-width:0;display:flex;overflow:hidden}.lexflowFrame_detailsCol{border-left:1px solid var(--dsw-alias-border-l2);min-width:0;overflow:hidden}.lexflowFrame_frame[data-details-collapsed] .lexflowFrame_detailsCol{border-left:none}.lexflowFrame_handle{cursor:col-resize;z-index:2;touch-action:none;width:8px;transition:left var(--ds-transition-duration-slow) var(--ds-ease-in-out);margin-left:-4px;position:absolute;top:0;bottom:0}.lexflowFrame_frame[data-dragging] .lexflowFrame_handle{transition:none}@media (prefers-reduced-motion:reduce){.lexflowFrame_handle{transition:none}}.lexflowFrame_handle[data-side=details]:after{content:\"\";box-sizing:border-box;background:var(--dsw-alias-button-floating-fill);border:1px solid var(--dsw-alias-border-l2-darkmode-thin);opacity:0;width:12px;height:32px;transition:opacity var(--ds-transition-duration-slow) var(--ds-ease-in-out), background var(--ds-transition-duration-slow) var(--ds-ease-in-out);border-radius:10px;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%)}.lexflowFrame_detailsCol:hover~.lexflowFrame_handle[data-side=details]:after,.lexflowFrame_handle[data-side=details]:hover:after,.lexflowFrame_handle[data-side=details][data-dragging=true]:after{opacity:1}.lexflowFrame_handle[data-side=details]:hover:after,.lexflowFrame_handle[data-side=details][data-dragging=true]:after{background:var(--dsw-alias-button-floating-hover);border-color:var(--dsw-alias-border-l3)}.lexflowFrame_overlayLayer{z-index:20;pointer-events:none;position:absolute;inset:0}.lexflowFrame_overlayLayer>*{pointer-events:auto}";
		const tagId = "@deepseek/ui-shell/AppFrame.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@deepseek/ui-shell";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var AppFrame_module_css_default = {
			"centerCol": "lexflowFrame_centerCol",
			"detailsCol": "lexflowFrame_detailsCol",
			"frame": "lexflowFrame_frame",
			"handle": "lexflowFrame_handle",
			"overlayLayer": "lexflowFrame_overlayLayer",
			"sidebarCol": "lexflowFrame_sidebarCol"
		};
		//#endregion
		//#region lib/types/client/AppFrame.js
		/**
		* Three-column shell frame, registered into the built-in 'root' slot (the web
		* shell renders only 'root'). Owns the grid tracks (sidebar | center |
		* details), the drag handles (pointer capture + rAF throttle), the concession
		* chain (columns.ts), and the child-slot render decisions: the sidebar slot
		* renders HERE with live parameters from the concession solve, and the
		* session-aware occupants render in fixed column positions; strict entries
		* gate themselves on current-session availability while session-maybe
		* entries retain identity. Pure component: everything arrives
		* through the three framework shares — zero cordis or framework imports,
		* zero self-made hooks.
		*/
		/** Center column grid item (session-body building block). */
		function CenterColumn(props) {
			return (0, react_jsx_runtime.jsx)("div", {
				className: AppFrame_module_css_default.centerCol,
				"data-lexflow-layout": "center",
				children: props.children
			});
		}
		/** Right column grid item; the base right Sidebar occupies it and owns its own presentation. */
		function RightbarColumn(props) {
			return (0, react_jsx_runtime.jsx)("div", {
				className: AppFrame_module_css_default.detailsCol,
				"data-lexflow-layout": "rightbar",
				children: props.children
			});
		}
		/**
		* One drag handle: pointer capture, rAF-throttled dx reports against the drag-start origin.
		* `side` keys the hover-reveal CSS to the owning column.
		*/
		function DragHandle(props) {
			const [dragging, setDragging] = (0, react.useState)(false);
			const origin = (0, react.useRef)(0);
			const latest = (0, react.useRef)(0);
			const frame = (0, react.useRef)(null);
			const callbacks = (0, react.useRef)({
				onStart: props.onStart,
				onDrag: props.onDrag,
				onEnd: props.onEnd
			});
			callbacks.current = {
				onStart: props.onStart,
				onDrag: props.onDrag,
				onEnd: props.onEnd
			};
			const onPointerDown = (0, react.useCallback)((e) => {
                if (document.documentElement.dataset.lexflowModalOpen === "true") return;
				e.preventDefault();
				e.currentTarget.setPointerCapture(e.pointerId);
				origin.current = e.clientX;
				latest.current = e.clientX;
				callbacks.current.onStart();
				setDragging(true);
			}, []);
			const onPointerMove = (0, react.useCallback)((e) => {
				if (document.documentElement.dataset.lexflowModalOpen === "true" || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
				latest.current = e.clientX;
				frame.current ??= requestAnimationFrame(() => {
					frame.current = null;
					if (document.documentElement.dataset.lexflowModalOpen !== "true") callbacks.current.onDrag(latest.current - origin.current);
				});
			}, []);
			const onPointerUp = (0, react.useCallback)((e) => {
				if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
				e.currentTarget.releasePointerCapture(e.pointerId);
				if (frame.current !== null) {
					cancelAnimationFrame(frame.current);
					frame.current = null;
				}
				callbacks.current.onDrag(latest.current - origin.current);
				setDragging(false);
				callbacks.current.onEnd();
			}, []);
			return (0, react_jsx_runtime.jsx)("div", {
				className: AppFrame_module_css_default.handle,
				style: { left: props.left },
				"data-side": props.side,
				"data-dragging": dragging || void 0,
				onPointerDown,
				onPointerMove,
                onLostPointerCapture: () => { if (frame.current !== null) { cancelAnimationFrame(frame.current); frame.current = null; } setDragging(false); callbacks.current.onEnd(); },
				onPointerUp
			});
		}
		/** The sole sidebar-control surface, placed beside the macOS traffic lights. */
		function TopSidebarToggle({ collapsed, fullScreen, onToggle }) {
			return (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				className: "lexflowTopSidebarToggle",
				"data-fullscreen": fullScreen || void 0,
				"aria-label": collapsed ? "展开侧边栏" : "收起侧边栏",
				title: collapsed ? "展开侧边栏" : "收起侧边栏",
				style: { left: fullScreen ? "18px" : "86px" },
				onClick: onToggle,
				children: (0, react_jsx_runtime.jsx)(_lexflow_dsh_adapter.IconPanelLeftOutline16, {
					size: 16,
					style: collapsed ? { transform: "scaleX(-1)" } : void 0
				})
			});
		}
				function LexFlowPlaceholder({ page, document }) {
					const WorkspacePage = pageRenderer;
					if (WorkspacePage && (page === "workflow" || page === "archive" || page === "workbench")) return (0, react_jsx_runtime.jsx)(WorkspacePage, { page, document });
				const titles = { workflow: "工作流", archive: "档案室", workbench: "工作台" };
			return (0, react_jsx_runtime.jsxs)("main", {
				style: { alignItems: "center", boxSizing: "border-box", color: "var(--dsw-alias-label-primary)", display: "flex", height: "100%", justifyContent: "center", padding: "48px" },
				children: [(0, react_jsx_runtime.jsx)("section", { style: { maxWidth: "520px", width: "100%" }, children: (0, react_jsx_runtime.jsxs)("div", { style: { background: "var(--dsw-alias-button-elevated-fill)", border: "1px solid var(--dsw-alias-border-l2)", borderRadius: "16px", padding: "28px" }, children: [(0, react_jsx_runtime.jsx)("p", { style: { color: "var(--dsw-alias-label-secondary)", fontSize: "13px", margin: "0 0 8px" }, children: "LexFlow" }), (0, react_jsx_runtime.jsx)("h1", { style: { fontSize: "24px", margin: "0 0 10px" }, children: titles[page] ?? "LexFlow" }), (0, react_jsx_runtime.jsx)("p", { style: { color: "var(--dsw-alias-label-secondary)", lineHeight: 1.6, margin: 0 }, children: "原生页面路由已接入。" })] }) })]
			});
		}
				function LexFlowWorkflowPage({ page = "workflow", document }) {
					const WorkspacePage = pageRenderer;
					return WorkspacePage ? (0, react_jsx_runtime.jsx)(WorkspacePage, { page, document }) : (0, react_jsx_runtime.jsx)(LexFlowPlaceholder, { page, document });
				}
		/** The three-column frame (see module doc). */
    function AppFrame({ useStore, useSessions, actions, renderSlot, SessionProvider, selectPanel, resetPanel }) {
			const [lexflowPage, setLexFlowPage] = (0, react.useState)("conversation");
			const [lexflowDocument, setLexFlowDocument] = (0, react.useState)(null);
			const [fullScreen, setFullScreen] = (0, react.useState)(() => Boolean(window.lexflowWindow?.isFullScreen?.()));
			(0, react.useEffect)(() => {
				const unsubscribe = window.lexflowWindow?.onFullScreenChange?.((value) => setFullScreen(Boolean(value)));
				return typeof unsubscribe === "function" ? unsubscribe : void 0;
			}, []);
			(0, react.useEffect)(() => {
				const onNavigate = (event) => {
					// 官方面板入口（如插件管理器）只带 panel，不带 page：
					// 交给面板路由统一处理，中心列随后按 main 键控条目渲染该面板。
					const panel = event.detail?.panel;
					if (typeof panel === "string" && panel !== "") {
						setLexFlowDocument(null);
						actions.closeRightbar();
						selectPanel(panel);
						return;
					}
					const page = event.detail?.page ?? "conversation";
						setLexFlowDocument(event.detail?.document ?? null);
					if (page !== "conversation") actions.closeRightbar();
					setLexFlowPage(page);
					// 页面导航（对话或 LexFlow 注册页）清除面板选中态；面板 id 的导航事件保留面板状态。
					if (typeof resetPanel === "function" && (page === "conversation" || (typeof pageRenderer === "function" && runtime.ui.pages.get(page) !== void 0))) resetPanel();
				};
				window.addEventListener("lexflow:navigate", onNavigate);
				return () => window.removeEventListener("lexflow:navigate", onNavigate);
			}, [actions]);
			const panels = useStore((s) => s);
			const currentSessionId = useSessions((s) => s.current);
			const lastSessionId = (0, react.useRef)(currentSessionId);
			(0, react.useEffect)(() => {
				if (currentSessionId === lastSessionId.current) return;
				lastSessionId.current = currentSessionId;
				if (currentSessionId !== void 0) window.dispatchEvent(new CustomEvent("lexflow:navigate", { detail: { page: "conversation", source: "session-change" } }));
			}, [currentSessionId]);
			const frameRef = (0, react.useRef)(null);
			const [viewport, setViewport] = (0, react.useState)(() => window.innerWidth);
			(0, react.useEffect)(() => {
				const el = frameRef.current;
				/* v8 ignore next -- the ref is always attached by effect time: the frame div renders unconditionally. */
				if (el === null) return;
				let raf = null;
				const observer = new ResizeObserver(() => {
					raf ??= requestAnimationFrame(() => {
						raf = null;
						const width = el.getBoundingClientRect().width;
						if (width > 0) setViewport(width);
					});
				});
				observer.observe(el);
				return () => {
					observer.disconnect();
					if (raf !== null) cancelAnimationFrame(raf);
				};
			}, []);
			const narrow = viewport < SIDEBAR_AUTO_COLLAPSE;
			(0, react.useEffect)(() => {
				actions.setNarrow(narrow);
			}, [actions, narrow]);
			const sidebarCollapsed = narrow ? !panels.narrowExpanded : panels.sidebar === 0;
			const sidebarPreference = sidebarCollapsed ? 0 : panels.sidebar === 0 ? 260 : panels.sidebar;
			const cols = computeColumns(viewport, sidebarPreference, panels.rightbar);
			// 右侧边栏的 canShow 是"能力"语义：若能显示右栏是否放得下，与底座 dsh-client-ui-layout 的
			// `canShow: normal.rightbar > 0` 一致（用偏好宽度求解，不看当前轨道）。若传当前轨道宽度
			// （关闭时恒为 0），底座右栏内部的 `if (shown && !fullscreen && !canShow) setExpanded(false)`
			// 会在用户点开开关的同一帧把展示撤销，表现为"点了没反应"。
			const RIGHTBAR_DEFAULT_PREFERENCE = 360;
			const rightbarPreference = panels.rightbar > 0 ? panels.rightbar : RIGHTBAR_DEFAULT_PREFERENCE;
			const rightbarCanShow = computeColumns(viewport, sidebarPreference, rightbarPreference).rightbar > 0;
			const colsRef = (0, react.useRef)(cols);
			colsRef.current = cols;
			const sidebarBase = (0, react.useRef)(0);
			const rightbarBase = (0, react.useRef)(0);
			const [dragging, setDragging] = (0, react.useState)(false);
			const onDragEnd = (0, react.useCallback)(() => {
				setDragging(false);
			}, []);
			const onSidebarStart = (0, react.useCallback)(() => {
				sidebarBase.current = colsRef.current.sidebar;
				setDragging(true);
			}, []);
			const onRightbarStart = (0, react.useCallback)(() => {
				rightbarBase.current = colsRef.current.rightbar;
				setDragging(true);
			}, []);
			const onSidebarDrag = (0, react.useCallback)((dx) => {
				actions.setSidebar(sidebarBase.current + dx);
			}, [actions]);
			const onRightbarDrag = (0, react.useCallback)((dx) => {
				actions.setRightbar(rightbarBase.current - dx);
			}, [actions]);
			return (0, react_jsx_runtime.jsxs)("div", {
				ref: frameRef,
				className: AppFrame_module_css_default.frame,
				"data-lexflow-layout": "frame",
				style: { gridTemplateColumns: `${cols.sidebar}px minmax(0, 1fr) ${cols.rightbar}px` },
				"data-sidebar-collapsed": sidebarCollapsed || void 0,
				"data-rightbar-collapsed": cols.rightbar === 0 || void 0,
				"data-dragging": dragging || void 0,
				children: [
					(0, react_jsx_runtime.jsx)(TopSidebarToggle, {
						collapsed: sidebarCollapsed,
						fullScreen,
						onToggle: () => actions.toggleSidebar()
					}),
					(0, react_jsx_runtime.jsx)("div", {
						className: AppFrame_module_css_default.sidebarCol,
						"data-lexflow-layout": "sidebar",
						children: renderSlot("sidebar", {
							collapsed: sidebarCollapsed,
							width: cols.sidebar
						})
					}),
                        (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)(CenterColumn, { children: lexflowPage !== "conversation" && typeof pageRenderer === "function" && runtime.ui.pages.get(lexflowPage) !== void 0 ? ((0, react_jsx_runtime.jsx)(LexFlowWorkflowPage, { page: lexflowPage, document: lexflowDocument })) : renderSlot("main", {}, lexflowPage === "conversation" ? { entryKey: "conversation" } : { entryKey: lexflowPage, fallback: renderSlot("main", {}, { entryKey: "conversation" }) }) }), lexflowPage === "conversation" && (0, react_jsx_runtime.jsx)(RightbarColumn, { children: renderSlot("rightbar", { width: cols.rightbar, viewportWidth: viewport, canShow: rightbarCanShow }) })] }),
					(0, react_jsx_runtime.jsx)("div", {
						className: AppFrame_module_css_default.overlayLayer,
						"data-shell-overlay": true,
						children: renderSlot("shell.overlay", {})
					}),
					!sidebarCollapsed && (0, react_jsx_runtime.jsx)(DragHandle, {
						side: "sidebar",
						left: cols.sidebar,
						onStart: onSidebarStart,
						onDrag: onSidebarDrag,
						onEnd: onDragEnd
					}),
					cols.rightbar > 0 && (0, react_jsx_runtime.jsx)(DragHandle, {
						side: "rightbar",
						left: viewport - cols.rightbar,
						onStart: onRightbarStart,
						onDrag: onRightbarDrag,
						onEnd: onDragEnd
					})
				]
			});
		}
		//#endregion
		//#region lib/types/client/stores.js
		/**
		* The root entry's transient layout store: panel geometry as plain widths in
		* px (0 = closed). Module level exports the factory only — a module-level
		* handle would pin the store's identity in the module
		* cache (a de-facto singleton surviving plugin reloads). register() receives
		* the factory (exclusive use: the framework instantiates per entry), AppFrame
		* derives its PropsStore share from the return type, and the service face
		* receives the bound actions through the registration's inject hook.
		*/
		/**
		* Create the layout panel store handle. The preference IS the width, so
		* closing a panel forgets its drag width — reopening restores the contract
		* default. Actions are the complete write set: drag writes clamp
		* into the panel's contract range and never cross the open/closed line;
		* open/close transitions write 0 / the default explicitly. Below the
		* auto-collapse breakpoint (AppFrame feeds setNarrow) the sidebar toggle
		* flips the narrowExpanded override instead of the preference.
		* @returns the store handle (spec + type + identity + factory in one).
		*/
		function createLayoutStore() {
			return (0, _lexflow_dsh_adapter.defineStore)({
				init: () => ({
					sidebar: 260,
					rightbar: 0,
					rightbarFullscreen: false,
					narrow: false,
					narrowExpanded: false
				}),
				actions: {
					setSidebar: (d, px) => {
						d.sidebar = clampWidth(px, 264, 420);
					},
					setRightbar: (d, px) => {
						d.rightbar = clampWidth(px, 300, 520);
					},
					toggleSidebar: (d) => {
						if (d.narrow) d.narrowExpanded = !d.narrowExpanded;
						else d.sidebar = d.sidebar === 0 ? 260 : 0;
					},
					setNarrow: (d, narrow) => {
						if (d.narrow === narrow) return;
						d.narrow = narrow;
						d.narrowExpanded = false;
					},
					openRightbar: (d, track, fullscreen) => {
						// 底座把 track 作为「是否为右栏保留一列」的信号传入：窄视口（<768px）下
						// 面板自动切换为全屏覆盖形态，track 为 false（见 dsh-client-ui-sidebar-right
						// 的 `const track = shown && !autoFullscreen`）。此时不得再保留列宽——
						// 否则半屏窗口里 360px 的右栏轨道会挤掉对话区（用户 2026-09-28 反馈：
						// 半屏时顶部标题栏与底部按钮错乱、右栏内容显示不全）。全屏覆盖形态下面板
						// 以 100vw 绘制（右栏列已改为 overflow:visible 放行），关掉列轨道不影响其显示。
						if (track === false) d.rightbar = 0;
						else if (d.rightbar === 0) d.rightbar = typeof track === "number" && track > 0 ? clampWidth(track, 300, 520) : 360;
						d.rightbarFullscreen = fullscreen === true;
					},
					closeRightbar: (d) => {
						d.rightbar = 0;
						d.rightbarFullscreen = false;
					}
				}
			});
		}
		//#endregion
		//#region lib/types/client/service.js
		/** Cross-plugin panel-action face (ctx.layout). */
		var LayoutController = class {
			#panels;
			#navigation;
			/**
			 * 当前选中的主面板。null 表示对话面板（底座以 activePanelId === null
			 * 表示"对话被选中"，右侧边栏据此判定是否渲染）。官方插件（如
			 * dsh-client-ui-plugin-manager）会订阅它来决定侧栏行的选中态，
			 * 因此这里必须是真实可观察值，不能像以前那样给出静态快照。
			 */
			#activePanelId = null;
			#panelListeners = new Set();
			/**
			 * 面板信息的可观察面（ctx.layout.panelInfo）。官方插件按
			 * `ctx.layout.panelInfo.getSnapshot()` 与 `.subscribe()` 使用它，
			 * 因此这里提供与方法同名的可观察对象，而不是原始快照。
			 */
			panelInfo = Object.freeze({
				getSnapshot: () => this.getPanelInfo(),
				subscribe: (listener) => this.subscribePanelInfo(listener),
			});
			/** @returns 当前面板信息快照。 */
			getPanelInfo() {
				return Object.freeze({ activePanelId: this.#activePanelId });
			}
			/**
			 * 订阅面板信息变化。
			 * @param listener - 变化回调。
			 * @returns 取消订阅的函数。
			 */
			subscribePanelInfo(listener) {
				this.#panelListeners.add(listener);
				return () => { this.#panelListeners.delete(listener) };
			}
			#setActivePanel(id) {
				const next = id === void 0 || id === null || id === "conversation" ? null : id;
				if (next === this.#activePanelId) return;
				this.#activePanelId = next;
				for (const listener of this.#panelListeners) {
					try { listener(this.getPanelInfo()) } catch { /* 订阅者异常不得中断导航 */ }
				}
			}
			/**
			* Adopt the root entry's bound store actions. Called from the root
			* registration's inject hook (a sanctioned assembly side effect), so the
			* face is live from the entry's first render; on entry re-register the
			* fresh actions overwrite the stale set.
			* @param actions - bound actions of the entry's layout store instance.
			*/
			attachPanels(actions) {
				this.#panels = actions;
			}
			/** Toggle the sidebar panel (closed ⟷ contract default width). */
			toggleSidebar() {
				this.#require().toggleSidebar();
			}
			/**
			* Report the right Sidebar's presentation. The base right Sidebar owns this call
			* (its seat syncs `{shown, track, fullscreen}` through ctx.layout), so the frame
			* sizes the right track from the occupant's report instead of guessing.
			* @param track - requested track (a width when numeric, otherwise the contract default).
			* @param fullscreen - whether the occupant covers the window instead of taking the track.
			*/
			openRightbar(track, fullscreen) {
				this.#require().openRightbar(track, fullscreen);
			}
			/** Close the right Sidebar. */
			closeRightbar() {
				this.#require().closeRightbar();
			}
			/** Write the right track width directly (drag). */
			setRightbar(px) {
				this.#require().setRightbar(px);
			}
			/**
			* 底座在切换面板或新建会话前调用，并要求返回一个"本次导航"的取消信号：
			* 0.1.5 的 dsh-client-ui-workspace 会执行
			* `AbortSignal.any([ctx.layout.beginNavigation(), lifetime.signal])`，
			* 用它判断这次导航是否已被更新的导航取代。返回空值会直接抛错并导致新建会话失败，
			* 因此这里必须返回信号，且每次调用都要中止上一次。
			* @returns 本次导航的取消信号。
			*/
			beginNavigation() {
				this.#navigation?.abort();
				this.#navigation = new AbortController();
				return this.#navigation.signal;
			}
			/**
			* 底座请求选择某个主面板。选中结果写入 panelInfo（供导航行判定选中态），
			* 并派发导航事件；中心列据此按当前页面渲染官方面板，
			* 未注册的 id 由中心列回落渲染对话页。
			* @param id - 已注册的主面板 id，或 null 表示回到对话。
			*/
			selectPanel(id) {
				const target = id === void 0 || id === null || id === "conversation" ? "conversation" : String(id)
				this.#setActivePanel(target)
				window.dispatchEvent(new CustomEvent("lexflow:navigate", { detail: { page: target } }));
			}
			/**
			* 静默复位面板选中态（页面导航离开面板时使用）。只改状态、不派发导航事件，
			* 避免与页面导航事件形成回环；panelInfo 的订阅方（底座会话列表、标题等）
			* 照常收到通知，不会残留“面板仍选中”的假状态。
			*/
			resetPanel() {
				this.#setActivePanel(null)
			}
			#require() {
				if (this.#panels === void 0) throw new Error("layout: panel actions not wired (root entry not mounted)");
				return this.#panels;
			}
		};
		//#endregion
		//#region lib/types/client/theme-presenter.js
		/** Body attribute selecting the dark base palette in the token stylesheets. */
		const DARK_ATTRIBUTE = "data-ds-dark-theme";
		/** Applies theme snapshots to the document; one instance per plugin fiber. */
		var ThemePresenter = class {
			/** Token names this presenter wrote in the last apply (its retraction set). */
			appliedTokens = [];
			/** The single metadata node this presenter inserts and removes. */
			themeColorMeta;
			/** Create the presenter-owned metadata node before the first snapshot arrives. */
			constructor() {
				this.themeColorMeta = document.createElement("meta");
				this.themeColorMeta.name = "theme-color";
			}
			/**
			* Project a snapshot onto the document: set root `color-scheme` and the body
			* palette attribute from `active.colorScheme` (never the id — `system` is
			* resolved upstream), then replace the previously applied token variables
			* with `active.tokens`. Browser theme-color metadata follows the computed
			* body background after those writes, so the rendered palette remains the
			* color authority.
			* @param snapshot - resolved theme snapshot from ctx.theme.
			*/
			apply(snapshot) {
				const scheme = snapshot.active.colorScheme;
				document.documentElement.style.colorScheme = scheme;
				const body = document.body;
				if (scheme === "dark") body.setAttribute(DARK_ATTRIBUTE, "");
				else body.removeAttribute(DARK_ATTRIBUTE);
				const fontSize = Number.isFinite(snapshot.fontSize) ? snapshot.fontSize : 14;
				body.style.setProperty("--dsh-content-font-size", `${fontSize}px`);
				body.style.setProperty("--lexflow-content-font-size", `${fontSize}px`);
				body.style.setProperty("--lexflow-content-font-delta", `${fontSize - 14}px`);
				for (const name of this.appliedTokens) body.style.removeProperty(name);
				this.appliedTokens = [];
				for (const [name, value] of Object.entries(snapshot.active.tokens)) {
					body.style.setProperty(name, value);
					this.appliedTokens.push(name);
				}
				this.themeColorMeta.content = getComputedStyle(body).backgroundColor;
				if (!this.themeColorMeta.isConnected) document.head.append(this.themeColorMeta);
			}
			/** Retract root color-scheme, the palette attribute, token variables, and the owned metadata node. */
			dispose() {
				document.documentElement.style.removeProperty("color-scheme");
				const body = document.body;
				body.removeAttribute(DARK_ATTRIBUTE);
				body.style.removeProperty("--dsh-content-font-size");
				body.style.removeProperty("--lexflow-content-font-size");
				body.style.removeProperty("--lexflow-content-font-delta");
				for (const name of this.appliedTokens) body.style.removeProperty(name);
				this.appliedTokens = [];
				this.themeColorMeta.remove();
			}
		};
		//#endregion
		//#region lib/types/client/index.js
		/** Required services (cordis fiber inject — the loader passes all module exports as an object plugin). */
		let pageRenderer;
      const inject = ["lexflow"];
		/**
		* Client plugin body: provide ctx.layout, then one register() call — AppFrame
		* into 'root' with the four child-slot declarations, the layout store seat,
		* and the inject hook that hands the store's bound actions to the service.
		* @param ctx - client root context.
		*/
      function apply(runtime) {
        const slots = runtime.ui.slots
        const theme = runtime.ui.theme
        const layout = new LayoutController();
				runtime.lifecycle.effect(() => {
					const disposeService = runtime.ui.provideLayout(layout);
					// 底座右侧边栏与官方面板行都读取 root 标准席位里的面板信息。
					// 底座以 activePanelId === null 表示"对话面板被选中"（见 0.1.5 的 RightbarRoot 判定），
					// 因此初始值必须是 null，否则右侧边栏整棵子树不渲染；选中官方面板后
					// 该值随 LayoutController 的真实状态变化，侧栏行据此显示选中态。
					const disposeRootHooks = runtime.ui.provideRootHooks({
						panelInfo: {
							getSnapshot: () => layout.getPanelInfo(),
							subscribe: (listener) => layout.subscribePanelInfo(listener)
						}
					});
            const disposeRegistration = slots.register({
					name: "root",
					children: {
						"sidebar": {
							kind: "single",
							scope: "root"
						},
						"main": {
							kind: "keyed",
							scope: "root"
						},
						"rightbar": {
							kind: "single",
							scope: "root"
						},
						"shell.overlay": {
							kind: "list",
							scope: "root"
						}
					},
					store: createLayoutStore,
					inject: (actions) => {
						layout.attachPanels(actions);
						// 面板路由由适配层的 LayoutController 提供，store 的动作集里没有它；
						// 这里显式注入，供 AppFrame 处理官方面板入口的导航与页面导航时的面板复位。
						return { selectPanel: (id) => layout.selectPanel(id), resetPanel: () => layout.resetPanel() };
					}
				}, AppFrame);
				return () => {
					disposeRegistration();
					disposeRootHooks();
					disposeService();
				};
			}, "ui-layout: service + root registration");
				runtime.lifecycle.effect(() => {
				const presenter = new ThemePresenter();
            presenter.apply(theme.getTheme());
				const off = runtime.lifecycle.on("theme/change", (snapshot) => {
					presenter.apply(snapshot);
				});
				return () => {
					off();
					presenter.dispose();
				};
			}, "ui-layout: theme presenter");
		}
		//#endregion
		exports.LayoutController = LayoutController;
		exports.apply = apply;
		exports.inject = inject;
		exports.setPageRenderer = (renderer) => { pageRenderer = renderer; };

      return module.exports
    })()
    const sidebar = (() => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");
		let _lexflow_dsh_adapter = adapterExports;
		//#region ../../../node_modules/.pnpm/clsx@2.1.1/node_modules/clsx/dist/clsx.mjs
		function r(e) {
			var t, f, n = "";
			if ("string" == typeof e || "number" == typeof e) n += e;
			else if ("object" == typeof e) if (Array.isArray(e)) {
				var o = e.length;
				for (t = 0; t < o; t++) e[t] && (f = r(e[t])) && (n && (n += " "), n += f);
			} else for (f in e) e[f] && (n && (n += " "), n += f);
			return n;
		}
		function clsx() {
			for (var e, t, f = 0, n = "", o = arguments.length; f < o; f++) (e = arguments[f]) && (t = r(e)) && (n && (n += " "), n += t);
			return n;
		}
		//#endregion
		//#region \0dsh-css:/home/runner/work/deepseek-harness/deepseek-harness/packages/client/ui-sidebar/src/client/SidebarRoot.module.css.mjs
const css = ".lexflowSidebar_root{--dsh-sidebar-inline-padding:12px;height:100%;padding:6px var(--dsh-sidebar-inline-padding);box-sizing:border-box;background:var(--dsw-specific-sidebar-fill);color:var(--dsw-alias-label-primary);--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2);flex-direction:column;font-size:14px;display:flex}.lexflowSidebar_root.lexflowSidebar_collapsed{padding:18px 10px 6px}.lexflowSidebar_root.lexflowSidebar_quietBars{--dsh-scrollbar-thumb:transparent;--dsh-scrollbar-thumb-hover:transparent}.lexflowSidebar_fading>*{opacity:0;transition:opacity .15s var(--ds-ease-in-out)}.lexflowSidebar_fading .lexflowSidebar_footArea{visibility:hidden}.lexflowSidebar_wide{animation:lexflowSidebar_wide-in .2s var(--ds-ease-in-out)}@keyframes lexflowSidebar_wide-in{0%{opacity:0}}.lexflowSidebar_railIn .lexflowSidebar_iconButton,.lexflowSidebar_railIn .lexflowSidebar_newSession,.lexflowSidebar_railIn .lexflowSidebar_regionArea{animation:lexflowSidebar_rail-in .15s var(--ds-ease-in-out) backwards}.lexflowSidebar_railIn .lexflowSidebar_footArea{animation:lexflowSidebar_rail-fade-in .15s var(--ds-ease-in-out) backwards}@keyframes lexflowSidebar_rail-in{0%{opacity:0;transform:translate(49px)}}@keyframes lexflowSidebar_rail-fade-in{0%{opacity:0}}.lexflowSidebar_logoRow{box-sizing:border-box;flex:none;justify-content:flex-end;align-items:center;gap:8px;height:60px;margin-bottom:8px;padding:8px 0 8px 4px;display:flex;overflow:hidden}.lexflowSidebar_collapsed .lexflowSidebar_logoRow{justify-content:flex-start;height:36px;margin-bottom:12px;padding:0}.lexflowSidebar_brand{min-width:0;color:inherit;cursor:pointer;background:0 0;border:none;flex:1;align-items:center;padding:0;display:inline-flex;overflow:hidden}.lexflowSidebar_brandIdentity{align-items:center;gap:8px;min-width:0;height:24px;display:inline-flex}.lexflowSidebar_brandMark{flex:none;justify-content:center;align-items:center;display:inline-flex}.lexflowSidebar_brandName{letter-spacing:.04em;align-items:center;gap:6px;min-width:0;height:24px;font-size:18px;font-weight:600;line-height:24px;display:inline-flex}.lexflowSidebar_fallbackBrandName{letter-spacing:0;white-space:nowrap;font-size:17px}.lexflowSidebar_iconButton{cursor:pointer;width:28px;height:28px;color:var(--dsw-alias-label-secondary);background:0 0;border:none;border-radius:50%;flex:none;justify-content:center;align-items:center;padding:0;display:inline-flex}.lexflowSidebar_iconButton:hover{background:var(--dsw-alias-interactive-bg-hover)}.lexflowSidebar_collapsed .lexflowSidebar_iconButton{width:36px;height:36px}.lexflowSidebar_collapsed .lexflowSidebar_toggle .lexflowSidebar_panelIcon{display:none}.lexflowSidebar_collapsed .lexflowSidebar_toggle:hover .lexflowSidebar_panelIcon{display:inline}.lexflowSidebar_collapsed .lexflowSidebar_toggle:hover .lexflowSidebar_railMark{display:none}.lexflowSidebar_railMark{justify-content:center;align-items:center;display:inline-flex}.lexflowSidebar_collapsed .lexflowSidebar_iconButton{color:var(--dsw-alias-label-primary)}.lexflowSidebar_buildRevision{height:16px;color:var(--dsw-alias-label-primary-inverted);background:var(--dsw-alias-label-primary);font-family:var(--ds-font-family-code);border-radius:3px;align-items:center;padding:0 4px;font-size:8px;font-weight:500;line-height:16px;display:inline-flex}.lexflowSidebar_newSession{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-button-elevated-fill);height:38px;color:var(--dsw-alias-label-primary);cursor:pointer;border-radius:12px;flex:none;justify-content:center;align-items:center;gap:6px;margin:0 2px 8px;padding:8px 16px;font-size:14px;font-weight:500;line-height:22px;display:flex;overflow:hidden}.lexflowSidebar_newSession:hover{background:var(--dsw-alias-button-floating-hover)}.lexflowSidebar_collapsed .lexflowSidebar_newSession{background:0 0;border-color:#0000;align-self:flex-start;gap:0;width:36px;height:36px;margin:0 0 12px;padding:0}.lexflowSidebar_collapsed .lexflowSidebar_newSession:hover{background:var(--dsw-alias-interactive-bg-hover)}.lexflowSidebar_newSessionLabel{white-space:nowrap;max-width:200px;overflow:hidden}.lexflowSidebar_collapsed .lexflowSidebar_newSessionLabel{max-width:0}.lexflowSidebar_regionArea{min-height:0;margin-left:-4px;margin-right:calc(-1 * var(--dsh-sidebar-inline-padding));flex-direction:column;flex:1;padding-left:4px;display:flex;overflow:hidden}.lexflowSidebar_collapsed .lexflowSidebar_regionArea{margin-left:0;margin-right:0;padding-left:0}.lexflowSidebar_footArea{flex-direction:column;flex:none;display:flex}.lexflowSidebar_settingsArea,.lexflowSidebar_footerActions{flex:none;width:100%;min-width:0}.lexflowSidebar_footerActions{display:flex}.lexflowSidebar_collapsed .lexflowSidebar_footArea{align-items:center}.lexflowSidebar_collapsed .lexflowSidebar_settingsArea,.lexflowSidebar_collapsed .lexflowSidebar_footerActions{justify-content:center;width:auto;display:flex}@media (prefers-reduced-motion:reduce){.lexflowSidebar_wide,.lexflowSidebar_fading>*,.lexflowSidebar_railIn .lexflowSidebar_iconButton,.lexflowSidebar_railIn .lexflowSidebar_newSession,.lexflowSidebar_railIn .lexflowSidebar_footArea,.lexflowSidebar_railIn .lexflowSidebar_regionArea{transition:none;animation:none}}";
		const tagId = "@deepseek/ui-shell/SidebarRoot.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@deepseek/ui-shell";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var SidebarRoot_module_css_default = {
			"brand": "lexflowSidebar_brand",
			"brandIdentity": "lexflowSidebar_brandIdentity",
			"brandMark": "lexflowSidebar_brandMark",
			"brandName": "lexflowSidebar_brandName",
			"buildRevision": "lexflowSidebar_buildRevision",
			"collapsed": "lexflowSidebar_collapsed",
			"fading": "lexflowSidebar_fading",
			"fallbackBrandName": "lexflowSidebar_fallbackBrandName",
			"footArea": "lexflowSidebar_footArea",
			"footerActions": "lexflowSidebar_footerActions",
			"iconButton": "lexflowSidebar_iconButton",
			"logoRow": "lexflowSidebar_logoRow",
			"newSession": "lexflowSidebar_newSession",
			"newSessionLabel": "lexflowSidebar_newSessionLabel",
			"panelIcon": "lexflowSidebar_panelIcon",
			"quietBars": "lexflowSidebar_quietBars",
			"rail-fade-in": "lexflowSidebar_rail-fade-in",
			"rail-in": "lexflowSidebar_rail-in",
			"railIn": "lexflowSidebar_railIn",
			"railMark": "lexflowSidebar_railMark",
			"regionArea": "lexflowSidebar_regionArea",
			"root": "lexflowSidebar_root",
			"settingsArea": "lexflowSidebar_settingsArea",
			"toggle": "lexflowSidebar_toggle",
			"wide": "lexflowSidebar_wide",
			"wide-in": "lexflowSidebar_wide-in"
		};
		//#endregion
		//#region lib/types/client/SidebarRoot.js
		/**
		* Sidebar shell: column geometry only. Collapse is a slide plus crossfade:
		* content freezes at its expanded width (inline style) and fades out in place
		* while the sliding column (AppFrame grid tracks) clips it — nothing reflows
		* mid-slide. At settle the wide-only content unmounts and the four upper
		* controls enter the 56px rail from the same horizontal offset (one icon each,
		* same top-down order) on one fade that ends with the slide. The bottom-pinned
		* settings control only fades. The workspace/session browsing region between
		* the New Session button and the foot is the `sidebar.workspaces` registrant's,
		* and the foot holds `sidebar.settings` plus `sidebar.footer.action`; the shell
		* hands them the wide flag (plus an expand request callback for the browser).
		*
		* The column also owns whether the scroll regions nested in it draw a
		* scrollbar at all: the shell tracks the pointer and rebinds ui-theme's
		* scrollbar indirection away while it is elsewhere, so a list the user is not
		* pointing at carries no bar.
		*/
		/** Wide-content unmount delay; matches the 150ms wide-content fade-out. */
		const COLLAPSE_SETTLE_MS = 150;
		/**
		* How long the column's scrollbars stay drawn after the pointer leaves it.
		* The bar is a pointer affordance here, and hiding it on the leave event
		* itself makes it blink out while the pointer is only crossing the column's
		* edge — on the way to the conversation, or around a portalled menu.
		*/
		const SCROLLBAR_LINGER_MS = 2e3;
		/**
		* Render the sidebar column shell.
		* @param props - composed slot props (runtime share + injected callbacks, contract/slots.ts).
		* @returns the sidebar element tree.
		*/
      /**
       * 官方面板行的图标。
       *
       * 先向官方 sidebar.panellist 席位索取（官方插件注册了就有官方图标）；
       * 席位没有该 id 时回退到官方插件图元；再拿不到就用官方图元的同名图形兜底。
       * 实现在这里而不是注入面：只有本作用域持有 renderSlot 与图元访问。
       * @param id - 面板 id。
       * @param ownerProps - 席位的尺寸与选中态。
       * @returns 图标元素。
       */
      const renderPanelIconImpl = (id, ownerProps, renderSlot) => {
        const owner = ownerProps ?? {};
        const rendered = typeof renderSlot === "function" ? renderSlot("sidebar.panellist", owner, { only: id }) : null;
        if (rendered !== null && rendered !== void 0 && rendered !== false) return rendered;
        const size = owner.size ?? 16;
        const PluginIcon = icon(id === "plugins" ? "IconPluginPinwheelOutlineRegular" : "IconWarningOutlineRegular");
        return (0, react_jsx_runtime.jsx)(PluginIcon, { size });
      };
		function SidebarRoot({ collapsed, width, startSession, toggleSidebar, useSidebarPanels, selectPanel, panelInfo, t, renderSlot, renderPanelIcon }) {
			const [settled, setSettled] = (0, react.useState)(collapsed);
			(0, react.useEffect)(() => {
				if (!collapsed) {
					setSettled(false);
					return;
				}
				const timer = window.setTimeout(() => {
					setSettled(true);
				}, COLLAPSE_SETTLE_MS);
				return () => {
					window.clearTimeout(timer);
				};
			}, [collapsed]);
			const wide = !collapsed || !settled;
			const lastWideWidth = (0, react.useRef)(width);
			if (!collapsed) lastWideWidth.current = width;
			const everWide = (0, react.useRef)(!collapsed);
			if (!collapsed) everWide.current = true;
			const column = (0, react.useRef)(null);
			const [pointerInside, setPointerInside] = (0, react.useState)(false);
			const lingerTimer = (0, react.useRef)(void 0);
			const armLinger = () => {
				if (lingerTimer.current !== void 0) return;
				lingerTimer.current = window.setTimeout(() => {
					lingerTimer.current = void 0;
					setPointerInside(false);
				}, SCROLLBAR_LINGER_MS);
			};
			const cancelLinger = () => {
				window.clearTimeout(lingerTimer.current);
				lingerTimer.current = void 0;
			};
			(0, react.useEffect)(() => {
				if (!pointerInside) return;
				const onMove = (event) => {
					const rect = column.current?.getBoundingClientRect();
					/* v8 ignore next -- the listener only exists while the column is mounted and revealed. */
					if (rect === void 0) return;
					if (event.clientX >= rect.left && event.clientX < rect.right && event.clientY >= rect.top && event.clientY < rect.bottom) cancelLinger();
					else armLinger();
				};
				document.addEventListener("pointermove", onMove);
				return () => {
					document.removeEventListener("pointermove", onMove);
					cancelLinger();
				};
			}, [pointerInside]);
			return (0, react_jsx_runtime.jsxs)("div", {
				ref: column,
				className: clsx("lexflowSidebarRoot", !wide && "lexflowSidebarCollapsed", SidebarRoot_module_css_default.root, !wide && SidebarRoot_module_css_default.collapsed, !wide && everWide.current && SidebarRoot_module_css_default.railIn, collapsed && wide && SidebarRoot_module_css_default.fading, !pointerInside && SidebarRoot_module_css_default.quietBars),
				style: wide ? { width: collapsed ? lastWideWidth.current : width } : void 0,
				onPointerEnter: () => {
					cancelLinger();
					setPointerInside(true);
				},
				onPointerLeave: () => {
					armLinger();
				},
				children: [
					(0, react_jsx_runtime.jsxs)("div", {
						className: SidebarRoot_module_css_default.logoRow,
						children: [wide && (0, react_jsx_runtime.jsx)("div", {
							className: clsx(SidebarRoot_module_css_default.brand, SidebarRoot_module_css_default.wide),
							"aria-label": "LexFlow",
							onClick: void 0,
							children: (0, react_jsx_runtime.jsxs)("span", {
								className: SidebarRoot_module_css_default.brandIdentity,
								"aria-hidden": "true",
								children: [false ? (0, react_jsx_runtime.jsx)("span", {
									className: SidebarRoot_module_css_default.brandMark,
									children: renderSlot("sidebar.brand.mark", { size: 24 }, { fallback: (0, react_jsx_runtime.jsx)(_lexflow_dsh_adapter.FishLogo, { size: 24 }) })
								}) : null, (0, react_jsx_runtime.jsx)("span", {
									className: SidebarRoot_module_css_default.brandName,
									children: renderSlot("sidebar.brand.name", {}, { fallback: (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)("span", {
										className: SidebarRoot_module_css_default.fallbackBrandName,
										children: "LexFlow"
									}), (0, react_jsx_runtime.jsx)("span", {
										className: SidebarRoot_module_css_default.buildRevision,
										children: ""
									})] }) })
								})]
							})
						})]
					}),
					(0, react_jsx_runtime.jsx)("div", {
						className: SidebarRoot_module_css_default.lexflowNavigation,
						children: renderSlot("sidebar.lexflow.nav", { wide, startSession, useSidebarPanels, selectPanel, panelInfo, renderPanelIcon: (id, ownerProps) => renderPanelIconImpl(id, ownerProps, renderSlot) })
					}), (0, react_jsx_runtime.jsx)("div", {
						className: SidebarRoot_module_css_default.regionArea,
						children: renderSlot("sidebar.workspaces", {
							wide,
							expandSidebar: () => {
								if (collapsed) toggleSidebar();
							}
						})
					}),
					(0, react_jsx_runtime.jsxs)("div", {
						className: SidebarRoot_module_css_default.footArea,
						children: [(0, react_jsx_runtime.jsx)("div", {
							className: SidebarRoot_module_css_default.footerActions,
							children: renderSlot("sidebar.footer.action", { wide })
						}), (0, react_jsx_runtime.jsx)("div", {
							className: SidebarRoot_module_css_default.settingsArea,
							children: collapsed ? null : renderSlot("sidebar.settings", { wide })
						})]
					})
				]
			});
		}
		//#endregion
		//#region lib/types/client/locales.js
		/** `sidebar` namespace dictionaries: shell controls (brand row, New Session, fold toggle). */
		/** Simplified Chinese dictionary (the key-set source of truth). */
		const zh = {
			"session.new": "新会话",
			"session.new.label": "新建会话",
			"toggle.open": "打开侧边栏",
			"toggle.collapse": "收起侧边栏"
		};
		/** English dictionary, checked complete against the zh key set. */
		const en = {
			"session.new": "New Session",
			"session.new.label": "New session",
			"toggle.open": "Open sidebar",
			"toggle.collapse": "Collapse sidebar"
		};
		//#endregion
		//#region lib/types/client/index.js
		/** Dictionary namespace owned by this plugin (shell controls copy). */
		const NS = "sidebar";
		/** Services required by the sidebar plugin. */
    const inject = ["lexflow"];
		/** Registers the sidebar shell and its service callbacks.
		* @param ctx - Client root context.
		*/
      function apply(runtime) {
        const slots = runtime.ui.slots
        const locale = runtime.ui.locale
        const layout = runtime.ui.layout()
        runtime.lifecycle.effect(() => locale.register(NS, {
				zh,
				en
			}), "ui-sidebar: dictionaries");
      const injectProps = () => ({
        startSession: (workspaceId) => {
          runtime.workspaces.startSession(workspaceId);
				window.dispatchEvent(new CustomEvent("lexflow:navigate", {
					detail: { page: "conversation" }
				}));
			},
			toggleSidebar: () => {
          layout.toggleSidebar();
			},
			// 一级导航的官方面板条目：条目来自 sidebar.panellist 席位（官方插件在此注册），
			// 选中态与切换走同一份 panelInfo 与 selectPanel，避免出现两个真相源。
			useSidebarPanels: (selector) => runtime.ui.sidebarPanelRows(selector),
			// 图标由侧栏模块实现并下传（那里才有 renderSlot 与官方席位通道）。
			renderPanelIcon: (id, ownerProps) => renderPanelIconImpl(id, ownerProps, renderSlot),
			selectPanel: (id) => layout.selectPanel(id),
			// 面板选中态的观察面（getSnapshot/subscribe）：导航行据此显示选中态，
			// 与 ctx.layout.panelInfo 是同一份状态，避免出现两个真相源。
			panelInfo: layout.panelInfo,
		});
        runtime.lifecycle.effect(() => slots.register({
				name: "sidebar",
				locale: NS,
				children: {
					"sidebar.brand.mark": {
						kind: "single",
						scope: "root"
					},
					"sidebar.brand.name": {
						kind: "single",
						scope: "root"
					},
					"sidebar.workspaces": {
						kind: "single",
						scope: "root"
					},
					"sidebar.lexflow.nav": {
						kind: "single",
						scope: "root"
					},
					// 官方面板席位：官方插件（如 ui-plugin-manager）在这里注册条目。
					// LexFlow 侧栏保持自有结构，但必须声明它：一级导航据此渲染面板入口，
					// 图标也经同一席位取官方图元。
					"sidebar.panellist": {
						kind: "list",
						scope: "root"
					},
					"sidebar.settings": {
						kind: "single",
						scope: "root"
					},
					"sidebar.footer.action": {
						kind: "list",
						scope: "root"
					}
				},
				inject: () => ({ ...injectProps(), renderPanelIcon: (id, ownerProps) => renderPanelIconImpl(id, ownerProps, undefined) })
			}, SidebarRoot), "ui-sidebar: slot registration");
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;

      return module.exports
    })()

      layout.setPageRenderer(Page)
      layout.apply(runtime)
      sidebar.apply(runtime)
    }

    function clientAdapter(ctx) {
      // 面板行的订阅钩子在本作用域内实现（它要读这里的 slotsService 与快照存储），
      // 因此本作用域需要自己的 React 绑定；上层的 react 绑定属于各模块内部作用域。
      const panelRowsReact = require("react")
      const connection = typeof ctx.get === 'function' ? ctx.get('connection') : ctx.connection
      const remote = typeof ctx.get === 'function' ? ctx.get('remote') : ctx.remote
      const nativeSessions = typeof ctx.get === 'function' ? ctx.get('sessions') : ctx.sessions
      const nativeWorkspaces = typeof ctx.get === 'function' ? ctx.get('workspaces') : ctx.workspaces
      // 工作区界面服务按需解析：0.1.5 的 dsh-client-ui-workspace 自身依赖 layout，
      // 若在此列为硬依赖会与适配层提供的 layout 形成循环等待，导致整棵插件树停在 pending。
      const uiWorkspace = () => (typeof ctx.get === 'function' ? ctx.get('uiWorkspace') : ctx.uiWorkspace)
      const slotsService = typeof ctx.get === 'function' ? ctx.get('slots') : ctx.slots
      const themeService = typeof ctx.get === 'function' ? ctx.get('theme') : ctx.theme
      const localeService = typeof ctx.get === 'function' ? ctx.get('locale') : ctx.locale
      const uiSession = typeof ctx.get === 'function' ? ctx.get('uiSession') : ctx.uiSession
      const conversation = typeof ctx.get === 'function' ? ctx.get('conversation') : ctx.conversation
      // DeepSeek Harness 0.1.7 把客户端设置服务 settingsScope 换成了 configForms
      // （dsh-client-ui-settings 的 ConfigForms，按条目 id 取 ConfigForm）；settingsSchema
      // 服务本身未变，保留。这里同时兼容两版：优先新服务，取不到再回退旧服务。
      const settingsScope = typeof ctx.get === 'function' ? ctx.get('configForms') : ctx.configForms
      const settingsSchema = typeof ctx.get === 'function' ? ctx.get('settingsSchema') : ctx.settingsSchema
      const commandUi = typeof ctx.get === 'function' ? ctx.get('commandUi') : ctx.commandUi
      const remoteSession = remote?.session
      const remoteLlm = remote?.llm
      /**
       * 官方面板行席位 `sidebar.panellist` 的条目快照。
       *
       * 官方侧边栏用自己的 slots 服务枚举该席位；LexFlow 侧栏是自有实现，
       * 因此在这里（slotsService 可用处）枚举一次并缓存，席位变动时刷新。
       * 标签解析优先用条目自身的 locale 标签，取不到时回退为条目 id；
       * 服务不支持枚举或没有任何条目时为空数组，侧栏据此不渲染面板区。
       */
      // 惰性建存储：底座服务缺席时（例如单元测试的桩上下文）不应在构造期就依赖它。
      /**
       * 把面板行快照存储适配成选择器钩子。
       *
       * 底座的 SnapshotStore 只提供 getSnapshot/subscribe，React 选择器钩子由
       * ui-renderer 合成；适配层不依赖那层合成，这里用 useSyncExternalStore 直接订阅。
       * @param store - 面板行快照存储。
       * @param selector - 从快照挑选所需值的纯函数。
       * @returns 选择器结果。
       */
      function useSidebarPanelRowsStore(store, selector) {
      	const empty = panelRowsReact.useRef([]);
      	return panelRowsReact.useSyncExternalStore(
            (listener) => store === undefined ? () => {} : store.subscribe(listener),
            () => store === undefined ? empty.current : selector(store.getSnapshot()),
            () => store === undefined ? empty.current : selector(store.getSnapshot())
      	);
      }

      let sidebarPanels
      const refreshSidebarPanels = () => {
        if (sidebarPanels === undefined) sidebarPanels = createSnapshotStore([])
        let next = []
        try {
          const entries = typeof slotsService?.entriesOfSlot === 'function' ? slotsService.entriesOfSlot('sidebar.panellist') ?? [] : []
          next = entries.map(({ options }) => {
            const id = typeof options?.id === 'string' ? options.id : undefined
            if (id === undefined) return undefined
            let label = id
            try {
              label = (typeof options.label === 'function' ? options.label() : options.label) ?? id
              if (typeof label !== 'string') label = String(label)
            } catch { label = id }
            return { id, order: typeof options.order === 'number' ? options.order : 0, label }
          }).filter(panel => panel !== undefined).sort((a, b) => a.order - b.order)
        } catch { next = [] }
        const previous = sidebarPanels.getSnapshot()
        if (previous.length !== next.length || previous.some((panel, index) => panel.id !== next[index].id || panel.label !== next[index].label)) sidebarPanels.set(next)
      }
      // 面板行只在底座 slots 服务可用时初始化：服务缺席（如单元测试的桩上下文）
      // 时整条通道保持为空，侧栏照常渲染其余部分。
      let disposeSidebarPanels = () => {}
      if (typeof slotsService?.entriesOfSlot === 'function') {
        refreshSidebarPanels()
        // 席位声明变动时刷新。订阅不可用时保留首次枚举结果，不影响侧栏渲染。
        if (typeof slotsService.subscribe === 'function') {
          try { disposeSidebarPanels = slotsService.subscribe('sidebar.panellist', refreshSidebarPanels) } catch { disposeSidebarPanels = () => {} }
        }
      }
      const pages = pageRegistry()
      const contributions = contributionRegistry()
      const documents = documentApi()
      const ui = Object.freeze({
        pages,
        // 官方面板行的枚举与订阅：存储建在 clientAdapter 作用域（slotsService 在此可用），
        // sidebar.apply 处于另一作用域，因此经稳定面暴露，避免跨作用域引用。
        sidebarPanelRows: store => useSidebarPanelRowsStore(sidebarPanels, store),
        mountShell: Page => mountHostShell(runtime, Page),
        contributions,
        compatibility: Object.freeze({
          installHostSurface: installHostSurfaceCompatibility,
        }),
        slots: slotFace(slotsService),
        // 底座右侧边栏等宿主组件通过 root 标准席位读取面板信息；
        // 适配层在此提供该席位，第三层不直接接触 slots.provideRoot。
        provideRootHooks: hooks => call(slotsService, 'provideRoot', [Object.freeze({ hooks })]),
        locale: Object.freeze({
          register: (...args) => call(localeService, 'register', args),
          bind: (...args) => call(localeService, 'bind', args),
        }),
        theme: Object.freeze({
          getTheme: (...args) => call(themeService, 'getTheme', args),
          overrideTokens: (name, tokens) => call(themeService, 'overrideTokens', [name, translateThemeTokens(tokens)]),
        }),
        settings: Object.freeze({
          bind: spec => bindSettings(settingsScope, spec),
          describe: (...args) => call(settingsScope, 'describe', args),
          schema: Object.freeze({
            getPath: (...args) => call(settingsSchema, 'getPath', args),
            hasPath: (...args) => call(settingsSchema, 'hasPath', args),
            setPath: (...args) => call(settingsSchema, 'setPath', args),
            deletePath: (...args) => call(settingsSchema, 'deletePath', args),
            nodeAtPath: (...args) => call(settingsSchema, 'nodeAtPath', args),
            rehydrate: (...args) => call(settingsSchema, 'rehydrate', args),
            validate: (...args) => call(settingsSchema, 'validate', args),
          }),
        }),
        // 只保留适配层外壳内部传递 LayoutController 的具名通道。
        // 原先的 service(name)／provideService(name, value) 可按任意名称读取或注入底座服务，
        // 第三层据此可绕过稳定面清单，故收敛为单一具名通道。
        layout: () => typeof ctx.get === 'function' ? ctx.get('layout') : ctx['layout'],
        provideLayout: value => provide(ctx, 'layout', value),
        withCommandPalette(register) {
          return ctx.inject(['commandUi', 'modelDirectories', 'sessions'], scope => register({
            commands: Object.freeze({
              register: (...args) => call(scope.get('commandUi'), 'register', args),
            }),
            models: Object.freeze({
              directoryFor: (...args) => call(scope.get('modelDirectories'), 'directoryFor', args),
            }),
            sessions: Object.freeze({
              subagentAddress: (...args) => call(scope.get('sessions'), 'subagentAddress', args),
            }),
            effect: (factory, label) => scope.effect(factory, label),
          }))
        },
        withSessionSlots(register) {
          return ctx.inject(['slots', 'modelDirectories', 'sessions'], scope => register({
            slots: slotFace(scope.get('slots')),
            models: Object.freeze({
              directoryFor: (...args) => call(scope.get('modelDirectories'), 'directoryFor', args),
            }),
            sessions: Object.freeze({
              subagentAddress: (...args) => call(scope.get('sessions'), 'subagentAddress', args),
            }),
            effect: (factory, label) => scope.effect(factory, label),
          }))
        },
        registerSlot(definition, component) {
          if (ctx.slots?.register === undefined) throw new LexFlowError('unsupported', '当前界面没有 Slot 注册能力。')
          return ctx.slots.register(definition, component)
        },
        injectSlot(name, callback) {
          if (ctx.slots?.inject === undefined) throw new LexFlowError('unsupported', '当前界面没有 Slot 注入能力。')
          return ctx.slots.inject(name, callback)
        },
        overrideTokens(name, tokens) {
          if (ctx.theme?.overrideTokens === undefined) return () => {}
          return ctx.theme.overrideTokens(name, translateThemeTokens(tokens))
        },
        navigate(page, document) {
          window.dispatchEvent(new CustomEvent('lexflow:navigate', { detail: { page, document: document ?? null } }))
        },
      })
      const events = Object.freeze({
        on(name, listener) {
          if ((name === 'connection/reset' || name === 'models.catalog.changed') && typeof ctx.on === 'function') return ctx.on(name, listener)
          if (remote?.$on === undefined) return () => {}
          return remote.$on(name, listener)
        },
      })
      const sessions = Object.freeze({
        list: nativeSessions?.list,
        currentId: () => uiSession?.adapter?.current?.getSnapshot?.()?.key,
        create: (...args) => call(nativeSessions, 'create', args),
        open: (...args) => call(nativeSessions, 'open', args),
        clear: (...args) => call(nativeSessions, 'clear', args),
        refresh: (...args) => call(nativeSessions, 'refresh', args),
        search: (...args) => call(nativeSessions, 'search', args),
        fork: (...args) => call(nativeSessions, 'fork', args),
        scope: id => nativeSessions?.scope?.(id),
        binding: id => nativeSessions?.binding?.(id),
        sessionOf: scoped => nativeSessions?.sessionOf?.(scoped),
        subagentAddress: id => nativeSessions?.subagentAddress?.(id),
        scopeOf: scoped => nativeSessions?.scopeOf?.(scoped),
        scopeEffect: (id, factory, label) => {
          const scope = nativeSessions?.scope?.(id)
          return call(scope, 'effect', [factory, label])
        },
        modelSelectionProjection: id => nativeSessions?.binding?.(id)?.session?.projections?.faceOf?.('modelSelection'),
      })
      const models = Object.freeze({
        catalog: (...args) => call(remoteSession, 'modelCatalog', args),
        providers: (...args) => call(remoteLlm, 'listProviders', args),
        configurableProviders: (...args) => call(remoteLlm, 'listConfigurableProviders', args),
        discover: (...args) => call(remoteLlm, 'discoverModels', args),
        select: (...args) => call(remoteSession, 'selectModel', args),
        directoryFor: (...args) => call(
          typeof ctx.get === 'function' ? ctx.get('modelDirectories') : ctx.modelDirectories,
          'directoryFor',
          args,
        ),
        legacy: legacyModelApi(remote),
      })
      const workspaces = Object.freeze({
        list: nativeWorkspaces?.list,
        create: (...args) => call(nativeWorkspaces, 'create', args),
        rename: (...args) => call(nativeWorkspaces, 'rename', args),
        delete: (...args) => call(nativeWorkspaces, 'delete', args),
        insertBefore: (...args) => call(nativeWorkspaces, 'insertBefore', args),
        insertSessionBefore: (...args) => call(nativeWorkspaces, 'insertSessionBefore', args),
        archiveSession: (...args) => call(nativeWorkspaces, 'archiveSession', args),
        startSession: (...args) => call(uiWorkspace(), 'startSession', args),
        pickDirectory: () => call(uiWorkspace(), 'pickDirectory', []),
        connectWorkspace: (...args) => call(uiWorkspace(), 'connectWorkspace', args),
        openPath: (path, signal) => call(remoteSession, 'openWorkspacePath', [{ path }, signal]),
      })
      const runtime = Object.freeze({
        contractVersion: CONTRACT_VERSION,
        dshVersion: '0.2.0-rc.2',
        lifecycle: Object.freeze({
          effect: (factory, label) => ctx.effect(factory, label),
          on: (name, listener) => typeof ctx.on === 'function' ? ctx.on(name, listener) : () => {},
          emit: (name, ...args) => typeof ctx.emit === 'function' ? ctx.emit(name, ...args) : undefined,
          plugin: (...args) => ctx.plugin(...args),
        }),
        documents,
        sessions,
        models,
        workspaces,
        events,
        ui,
        conversation: Object.freeze({
          sendTo(sessionId, text) {
            const scope = nativeSessions?.scope?.(sessionId)
            const scopedConversation = typeof scope?.get === 'function' ? scope.get('conversation') : scope?.conversation
            return call(scopedConversation, 'send', [text])
          },
          blocks: Object.freeze({
            set: (...args) => {
              const current = typeof ctx.get === 'function' ? ctx.get('conversation') : ctx.conversation
              if (current === undefined) return undefined
              return call(current.blocks, 'set', args)
            },
          }),
        }),
        capabilities: Object.freeze({ typedRemote: remote !== undefined, manualReconnect: false }),
      })
      return runtime
    }

    const SURFACE_EVENT_TYPES = new Set(['user/message', 'assistant/message', 'tool/result'])
    const KNOWN_FORMS = ['instructions', 'catalog', 'snapshot', 'notice', 'relay', 'recall']

    function isSurfaceEvent(event) { return SURFACE_EVENT_TYPES.has(event.type) && event.surfaceOp !== undefined }
    function isAppendSurfaceEvent(event) { return isSurfaceEvent(event) && event.surfaceOp === 'append' }
    function isReplacementSurfaceEvent(event) { return isSurfaceEvent(event) && event.surfaceOp !== 'append' }
    function conversationContextKey(kind, id) { return `${kind.length}:${kind}${id}` }

    function toAssistantBlock(block) {
      switch (block.type) {
        case 'text': return { kind: 'text', text: block.text }
        case 'reasoning': return { kind: 'reasoning', text: block.text }
        case 'image': return { kind: 'image', attachment: block.attachment }
        case 'tool-call': return { kind: 'tool-call', callId: String(block.id), name: block.name, argsRaw: block.arguments }
        default: return { kind: 'other', block }
      }
    }
    function toAssistantBlocks(content) { return content.map(toAssistantBlock) }
    function emptyAssistantBlock(blockType) {
      switch (blockType) {
        case 'text': return { kind: 'text', text: '' }
        case 'reasoning': return { kind: 'reasoning', text: '' }
        case 'tool-call': return { kind: 'tool-call', callId: '', name: '', argsRaw: '' }
        default: return { kind: 'other', block: null }
      }
    }
    function isTokenDelta(chunk) {
      switch (chunk.type) {
        case 'text-delta':
        case 'reasoning-delta': return chunk.text !== ''
        case 'tool-call-delta': return chunk.argumentsDelta !== '' || chunk.name !== undefined
        default: return false
      }
    }
    function workspaceTitleOf(cwd) { return cwd.replace(/[/\\]+$/u, '').split(/[/\\]/u).pop() ?? '' }
    function isWindowsStylePath(value) { return /^[A-Za-z]:[/\\]/u.test(value) || value.startsWith('\\\\') }
    function resolveWorkspacePath(cwd, value) {
      if (value.startsWith('/') || isWindowsStylePath(value)) return value
      if (cwd === undefined || cwd === '') return value
      return `${cwd.replace(/[/\\]+$/u, '')}/${value.replace(/^[/\\]+/u, '')}`
    }
    function asRecord(value) { return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : null }
    function readString(record, key) { const value = record[key]; return typeof value === 'string' && value.length > 0 ? value : null }
    function collect(source, member, field) {
      const list = source[member]
      if (!Array.isArray(list)) return []
      const seen = []
      for (const entry of list) {
        const record = asRecord(entry)
        const value = record === null ? null : readString(record, field)
        if (value !== null && !seen.includes(value)) seen.push(value)
      }
      return seen
    }
    function joined(names) { return names.length > 0 ? names.join(', ') : null }
    function sessionRecallLabels(source) {
      const record = asRecord(source)
      if (record === null || readString(record, 'kind') !== 'session-reference') return []
      return collect(record, 'references', 'label')
    }
    function contextProvenance(source) {
      const record = asRecord(source)
      const kind = record === null ? null : readString(record, 'kind')
      if (record === null || kind === null) return { role: 'inject', label: null }
      switch (kind) {
        case 'session-reference': return { role: 'recall', label: joined(collect(record, 'references', 'label')) ?? kind }
        case 'agent-instructions': return { role: 'inject', label: joined(collect(record, 'changes', 'path')) ?? kind }
        case 'plugin': return { role: 'inject', label: readString(record, 'plugin') ?? kind }
        case 'skill-invocation': return { role: 'inject', label: readString(record, 'name') ?? kind }
        default: return { role: 'inject', label: kind }
      }
    }
    function contextForm(source) {
      const record = asRecord(source)
      const form = record === null ? null : readString(record, 'form')
      return form !== null && KNOWN_FORMS.includes(form) ? form : null
    }
    function displayFailureMessage(failure) {
      if (failure === null || typeof failure !== 'object') return String(failure)
      if (failure.code === 'AUTH') return 'API key is invalid'
      return typeof failure.message === 'string' ? failure.message : JSON.stringify(failure)
    }

    // 逐个列出对外符号，不再展开 primitives／stores 整袋。
    // 展开整袋会把底座两个模块的全部导出（含 LexFlow 未使用的部分）暴露给第三层，
    // 违反三层架构「适配层不再对外导出原始对象集合」的边界要求。
    // 下方名单来自第 14—20 行的解构结果，与第三层实际消费的符号一致。
    Object.assign(exports, {
      Button,
      CodeBlock,
      DisclosureRow,
      FishLogo,
      IconApiOutline14,
      IconBranchOutline16,
      IconBrowseOutline16,
      IconCheckOutline16,
      IconChecklistOutline14,
      IconChevronDownOutline14,
      IconChevronRightOutline14,
      IconChevronUpOutline14,
      IconCloseOutline16,
      IconCopyOutline16,
      IconEditOutline16,
      IconFolderClose16,
      IconFolderOpen16,
      IconPanelLeftOutline16,
      IconPlusOutline16,
      IconQueueOutline14,
      IconSendOutline14,
      IconThinkOutline14,
      IconTrashOutline16,
      IconWarningOutline16,
      JsonBlock,
      MarkdownText,
      Menu,
      MessageText,
      Modal,
      RiskConfirmation,
      Service: cordis.Service,
      StateDot,
      Toast,
      Tooltip,
      createSnapshotStore,
      defineStore,
      resolveSlotLabel: slots.resolveSlotLabel,
      shallowEqual,
      writeClipboard,
      LexFlowError,
      contractVersion: CONTRACT_VERSION,
        inject: ['connection', 'remote', 'remote.llm', 'remote.session', 'remote.credentials', 'remote.settings', 'sessions', 'workspaces', 'slots', 'theme', 'locale', 'uiSession', 'configForms', 'settingsSchema', 'commandUi'],
      apply(ctx) {
        const adapter = clientAdapter(ctx)
        const dispose = provide(ctx, 'lexflow', adapter)
        return typeof dispose === 'function' ? dispose : undefined
      },
      conversationContextKey,
      contextForm,
      contextProvenance,
      displayFailureMessage,
      emptyAssistantBlock,
      isAppendSurfaceEvent,
      isReplacementSurfaceEvent,
      isTokenDelta,
      resolveWorkspacePath,
      sessionRecallLabels,
      toAssistantBlock,
      toAssistantBlocks,
      workspaceTitleOf,
    })
    return module.exports
  },
})
