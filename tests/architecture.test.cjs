const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { isPluginReleaseFile } = require('../scripts/plugin-release-files.cjs')
const root = path.resolve(__dirname, '..')

test('release policy excludes nested authoring files and preserves licenses', () => {
  for (const f of ['p/src/client.js', 'p/README.md', 'p/INSTALL.md', 'p/lib/client.js.map']) assert.equal(isPluginReleaseFile(f), false)
  for (const f of ['manifest.json', 'p/lib/client.js', 'p/lib/EDITOR-LICENSES.txt', 'p/LICENSE', 'p/NOTICE', 'p/package.json']) assert.equal(isPluginReleaseFile(f), true)
  const ignore = require('../forge.config.cjs').packagerConfig.ignore
  assert.equal(ignore('/dsh-plugins/p/src'), true)
  assert.equal(ignore('/dsh-plugins/p/NOTICE'), false)
})

test('product source does not import harness packages or consume harness theme names', () => {
  const forbidden = /(?:require\s*\(\s*|from\s*)["']@deepseek-ai\//u
  assert.equal(forbidden.test('require("@deepseek-ai/dsh-client-ui-slots")'), true)
  assert.equal(forbidden.test("from '@deepseek-ai/cordis'"), true)
  for (const p of fs.readdirSync(path.join(root, 'dsh-plugins'))) {
    if (p === 'lexflow-dsh-adapter' || p === 'lexflow-presets') continue
    const dir = path.join(root, 'dsh-plugins', p, 'src')
    if (!fs.existsSync(dir)) continue
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.js'))) {
      const text = fs.readFileSync(path.join(dir, f), 'utf8')
      assert.doesNotMatch(text, forbidden, p + '/' + f)
      assert.doesNotMatch(text, /--(?:dsw|dsh|ds)-[\w-]+/u, p + '/' + f)
    }
  }
})

test('adapter exposes bounded runtime and translates product palette', () => {
  let exported, runtime, received
  const source = fs.readFileSync(path.join(root, 'dsh-plugins/lexflow-dsh-adapter/src/client.js'), 'utf8')
  vm.runInNewContext(source, { window: { __ModuleLoader__: { load: ({ factory }) => { exported = factory(() => ({})) } } } })
  exported.apply({ get: name => name === 'theme' ? { overrideTokens: (...args) => { received = args; return () => {} } } : {}, provide: (_name, value) => { runtime = value } })
  assert.equal(Object.hasOwn(runtime, 'framework'), false)
  runtime.ui.theme.overrideTokens('test', { '--lexflow-dsw-alias-bg-base': { light: '#fff', dark: '#000' } })
  assert.equal(received[1]['--dsw-alias-bg-base'].light, '#fff')
  assert.equal(typeof runtime.ui.mountShell, 'function')
  // 外壳内部的布局通道保留，但不得再提供按任意名称访问底座服务的无界入口。
  assert.equal(typeof runtime.ui.provideLayout, 'function')
  assert.equal(typeof runtime.ui.layout, 'function')
  assert.equal(Object.hasOwn(runtime.ui, 'service'), false)
  assert.equal(Object.hasOwn(runtime.ui, 'provideService'), false)
})

test('adapter does not re-export raw harness module namespaces', () => {
  // 底座模块返回带唯一标记的对象袋：适配层若把整袋展开到对外导出，标记就会外泄。
  // 该断言针对的是模块级 exports，此前的用例只检查 runtime 对象，无法覆盖这条路径。
  let exported
  const source = fs.readFileSync(path.join(root, 'dsh-plugins/lexflow-dsh-adapter/src/client.js'), 'utf8')
  const rawNamespace = { __lexflowRawNamespaceMarker: true, RawNamespaceOnlyExport: () => {} }
  const requireStub = name => /@deepseek-ai\/(?:dsh-client-ui-primitives|dsh-client-store)$/u.test(name) ? rawNamespace : {}
  vm.runInNewContext(source, { window: { __ModuleLoader__: { load: ({ factory }) => { exported = factory(requireStub) } } } })
  for (const leaked of Object.keys(rawNamespace)) {
    assert.equal(Object.hasOwn(exported, leaked), false, 'raw harness namespace exported: ' + leaked)
  }
})
