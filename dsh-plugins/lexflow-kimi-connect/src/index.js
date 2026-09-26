export const inject = ['lexflow']

/** 底层模型库中 Kimi 套餐（Kimi For Coding）的提供方标识。 */
const PROVIDER_ID = 'kimi-coding'
const AUTH_BASE = '/plugins/lexflow-kimi/auth'

function json(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body) })
  res.end(body)
}

/**
 * Kimi 套餐登录入口。
 *
 * kimi-coding 是底层模型库自带的服务商：授权流程（设备码）与凭证存储都由模型层提供，
 * 登录成功后凭证写入共享凭证存储，模型目录随即把 K3 等套餐模型加入选择器。
 * 因此本插件只承担三件事：把登录流程暴露给界面、转述设备码、读取登录状态与退出。
 * 流程本身由适配层的 providerAuth 驱动，本插件不接触底座服务，也不自建凭据文件。
 */
export function apply(ctx) {
  const host = ctx.get('lexflow').host
  const auth = host.providerAuth

  const route = (name, method, handler) => ctx.effect(() => host.registerRoute({
    kind: 'exact',
    path: `${AUTH_BASE}/${name}`,
    handler: async (req, res) => {
      if (req.method !== method) return json(res, 405, { ok: false, error: 'method not allowed' })
      try { json(res, 200, { ok: true, value: await handler() }) }
      catch (error) { json(res, 500, { ok: false, error: error instanceof Error ? error.message : '操作失败。' }) }
    },
  }), `lexflow-kimi-connect: auth ${name}`)

  route('status', 'GET', () => auth.status(PROVIDER_ID))
  route('login', 'POST', () => auth.login(PROVIDER_ID, 'oauth'))
  route('cancel', 'POST', () => auth.cancel(PROVIDER_ID))
  route('logout', 'POST', () => auth.logout(PROVIDER_ID))
}
