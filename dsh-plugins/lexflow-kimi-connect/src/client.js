window.__ModuleLoader__.load({
  id: '@lexflow/kimi-connect',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    const React = require('react')
    const { jsx, jsxs } = require('react/jsx-runtime')

    const AUTH_BASE = '/plugins/lexflow-kimi/auth'
    // 链接沿用 LexFlow 的主题强调色与界面字体：浏览器默认的蓝色加下划线在暖色界面里过于突兀。
    const LINK_STYLE = {
      color: 'var(--lexflow-dsw-alias-state-business-primary, inherit)',
      fontFamily: 'inherit',
      fontSize: 'inherit',
      wordBreak: 'break-all',
      textDecoration: 'underline',
      textUnderlineOffset: '2px'
    }
    /** 界面贡献位：与 GPT 的 models.gpt.subscription 同构，由工作流插件的模型页渲染。 */
    const CONTRIBUTION = 'models.kimi.subscription'
    /** 等待授权期间的轮询间隔。设备码在浏览器侧完成，应用侧只能轮询确认。 */
    const POLL_MS = 2000

    async function request(action, method, signal) {
      const response = await fetch(`${AUTH_BASE}/${action}`, { method, signal })
      const data = await response.json().catch(() => null)
      if (!response.ok || data?.ok !== true) throw new Error(data?.error ?? '请求失败。')
      return data.value
    }

    /**
     * Kimi 套餐登录卡片。
     *
     * 套餐走设备码授权：点「登录」后这里显示一次性用户码与验证网址，
     * 用户在浏览器完成授权，应用侧轮询到凭证落盘即显示已登录。
     * 登录成功后套餐模型由模型目录自动带出，此处不再需要任何模型配置。
     */
    function KimiSubscription() {
      const [state, setState] = React.useState({ phase: 'loading', notice: null, error: null })
      const [busy, setBusy] = React.useState(false)
      const read = React.useCallback(async (signal) => {
        try {
          const value = await request('status', 'GET', signal)
          if (signal.aborted) return
          setState({
            phase: value.configured === true ? 'signed-in' : value.notice ? 'awaiting' : 'idle',
            notice: value.notice ?? null,
            error: value.error ?? null
          })
        } catch (error) {
          if (signal.aborted) return
          setState({ phase: 'error', notice: null, error: error instanceof Error ? error.message : '状态读取失败。' })
        }
      }, [])
      React.useEffect(() => {
        const controller = new AbortController()
        void read(controller.signal)
        return () => controller.abort()
      }, [read])
      // 只在等待授权时轮询：已登录与未登录都是稳定态，继续请求没有意义。
      React.useEffect(() => {
        if (state.phase !== 'awaiting') return undefined
        const controller = new AbortController()
        const timer = setInterval(() => { void read(controller.signal) }, POLL_MS)
        return () => { controller.abort(); clearInterval(timer) }
      }, [state.phase, read])
      const act = React.useCallback(async (action) => {
        setBusy(true)
        try {
          await request(action, 'POST')
          await read()
        } catch (error) {
          setState((current) => ({ ...current, phase: 'error', error: error instanceof Error ? error.message : '操作失败。' }))
        } finally {
          setBusy(false)
        }
      }, [read])

      if (state.phase === 'loading') {
        return jsx('div', { className: 'lexflowModelCodex', children: jsx('p', { className: 'lexflowModelHint', children: '正在读取 Kimi 登录状态…' }) })
      }
      if (state.phase === 'signed-in') {
        return jsxs('div', { className: 'lexflowModelCodex', children: [
          jsx('p', { children: '已登录 Kimi 账号。Kimi K3 等套餐模型已加入模型选择器，可直接选用。' }),
          jsx('button', { type: 'button', className: 'lexflowModelSecondary', disabled: busy, onClick: () => { void act('logout') }, children: busy ? '正在退出…' : '退出登录' })
        ] })
      }
      if (state.phase === 'awaiting' && state.notice) {
        return jsxs('div', { className: 'lexflowModelCodex', children: [
          jsx('p', { children: '请在浏览器中打开下面的网址并输入用户码完成授权。授权完成后本页会自动更新。' }),
          state.notice.url ? jsxs('p', { children: ['验证网址：', jsx('a', { href: state.notice.url, target: '_blank', rel: 'noreferrer', style: LINK_STYLE, children: state.notice.url })] }) : null,
          state.notice.code ? jsx('p', { children: ['用户码：', jsx('strong', { children: state.notice.code })] }) : null,
          jsx('button', { type: 'button', className: 'lexflowModelSecondary', disabled: busy, onClick: () => { void act('cancel') }, children: busy ? '正在取消…' : '取消登录' })
        ] })
      }
      return jsxs('div', { className: 'lexflowModelCodex', children: [
        jsx('p', { children: '使用 Kimi 套餐（Kimi For Coding）：点击登录后，在浏览器中完成 Kimi 账号授权即可。登录后套餐模型自动出现在模型选择器中，无需填写密钥。' }),
        state.error ? jsx('p', { className: 'lexflowModelHint', children: state.error }) : null,
        jsx('button', { type: 'button', className: 'lexflowModelPrimary', disabled: busy, onClick: () => { void act('login') }, children: busy ? '正在发起…' : '登录 Kimi 账号' })
      ] })
    }

    const inject = ['lexflow']
    function apply(ctx) {
      const runtime = ctx.get('lexflow')
      const contributions = runtime?.ui?.contributions
      if (contributions === undefined) return undefined
      return contributions.register(CONTRIBUTION, {
        id: 'kimi-subscription',
        order: 10,
        component: KimiSubscription
      })
    }

    exports.inject = inject
    exports.apply = apply
    return module.exports
  },
})
