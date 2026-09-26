const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const ENTRY = path.join(__dirname, '..', 'dsh-plugins', 'lexflow-kimi-connect', 'src', 'index.js')

function fakeResponse() {
  return {
    status: 0,
    body: null,
    writeHead(status) { this.status = status },
    end(payload) { this.body = JSON.parse(payload) },
  }
}

/** 用假的宿主桥挂载插件，记录路由与调用。overrides 可替换任一桥方法以验证失败路径。 */
async function mount(overrides = {}) {
  const plugin = await import(pathToFileURL(ENTRY).href)
  const routes = new Map()
  const calls = []
  const auth = {
    status: async (provider) => {
      calls.push(['status', provider])
      return { available: true, configured: false, inFlight: false, methods: [{ id: 'oauth', label: 'Sign in with Kimi Code' }], notice: null, error: null }
    },
    login: (provider, method, displayName) => {
      calls.push(['login', provider, method, displayName])
      return { started: true, notice: null }
    },
    cancel: (provider) => {
      calls.push(['cancel', provider])
      return { ok: true }
    },
    logout: async (provider) => {
      calls.push(['logout', provider])
      return { ok: true }
    },
    ensureProviderRoute: async (provider, displayName) => {
      calls.push(['ensure', provider, displayName])
      return false
    },
    ...overrides,
  }
  const ctx = {
    get: (name) => name === 'lexflow' ? { host: { providerAuth: auth, registerRoute: (route) => { routes.set(route.path, route); return () => {} } } } : undefined,
    effect: (factory) => { factory(); return () => {} },
  }
  plugin.apply(ctx)
  return { routes, calls }
}

test('kimi-connect mounts the four device-code auth routes', async () => {
  const { routes } = await mount()
  assert.deepEqual([...routes.keys()].sort(), [
    '/plugins/lexflow-kimi/auth/cancel',
    '/plugins/lexflow-kimi/auth/login',
    '/plugins/lexflow-kimi/auth/logout',
    '/plugins/lexflow-kimi/auth/status',
  ])
})

test('kimi-connect drives the catalog provider through the adapter bridge', async () => {
  const { routes, calls } = await mount()
  // 状态查询：走 providerAuth.status，并带上底层服务商标识。
  const status = fakeResponse()
  await routes.get('/plugins/lexflow-kimi/auth/status').handler({ method: 'GET' }, status)
  assert.equal(status.status, 200)
  assert.equal(status.body.ok, true)
  assert.equal(status.body.value.available, true)
  assert.ok(calls.some((call) => call[0] === 'status' && call[1] === 'kimi-coding'))
  // 登录：套餐必须用 oauth（设备码）方式，不走 API Key；并带上界面展示名。
  await routes.get('/plugins/lexflow-kimi/auth/login').handler({ method: 'POST' }, fakeResponse())
  assert.ok(calls.some((call) => call[0] === 'login' && call[1] === 'kimi-coding' && call[2] === 'oauth' && call[3] === 'Kimi'))
  // 取消与退出同样落到同一服务商。
  await routes.get('/plugins/lexflow-kimi/auth/cancel').handler({ method: 'POST' }, fakeResponse())
  assert.ok(calls.some((call) => call[0] === 'cancel' && call[1] === 'kimi-coding'))
  await routes.get('/plugins/lexflow-kimi/auth/logout').handler({ method: 'POST' }, fakeResponse())
  assert.ok(calls.some((call) => call[0] === 'logout' && call[1] === 'kimi-coding'))
})

test('kimi-connect declares the catalog route once the account is signed in', async () => {
  // 已登录（含升级前就已登录）时，挂载与状态查询都应补一次路由声明，模型才会出现。
  const signedIn = { status: async () => ({ available: true, configured: true, inFlight: false, methods: [], notice: null, error: null }) }
  const { routes, calls } = await mount(signedIn)
  await routes.get('/plugins/lexflow-kimi/auth/status').handler({ method: 'GET' }, fakeResponse())
  assert.ok(calls.some((call) => call[0] === 'ensure' && call[1] === 'kimi-coding' && call[2] === 'Kimi'))
})

test('kimi-connect rejects a wrong method', async () => {
  const { routes } = await mount()
  const res = fakeResponse()
  await routes.get('/plugins/lexflow-kimi/auth/login').handler({ method: 'GET' }, res)
  assert.equal(res.status, 405)
  assert.equal(res.body.ok, false)
})

test('kimi-connect turns bridge failures into a bare 500', async () => {
  const { routes } = await mount({ status: async () => { throw new Error('桥不可用') } })
  const res = fakeResponse()
  await routes.get('/plugins/lexflow-kimi/auth/status').handler({ method: 'GET' }, res)
  assert.equal(res.status, 500)
  assert.equal(res.body.ok, false)
  assert.equal(res.body.error, '桥不可用')
  assert.equal(JSON.stringify(res.body).includes('at '), false)
})
