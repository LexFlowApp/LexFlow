const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const pluginRoot = path.join(root, 'dsh-plugins')
const manifest = JSON.parse(fs.readFileSync(path.join(pluginRoot, 'manifest.json'), 'utf8'))

// 设置-通用页版本行需要产品版本与底座版本。两者从工程真实依赖读取后注入到适配层产物，
// 避免在源码里硬编码版本号而在后续升级中失效。
const productVersion = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version
const dshVersion = JSON.parse(fs.readFileSync(path.join(root, 'node_modules/@deepseek-ai/dsh/package.json'), 'utf8')).version
const versionInjections = [
  ['__LEXFLOW_PRODUCT_VERSION__', productVersion],
  ['__LEXFLOW_DSH_VERSION__', dshVersion]
]

for (const plugin of manifest.packages) {
  if (plugin.kind !== 'lexflow-owned') continue
  assert.equal(plugin.sourceDir, 'src', `${plugin.source}: sourceDir must be src`)
  const packageRoot = path.join(pluginRoot, plugin.source)
  for (const entrypoint of plugin.entrypoints) {
    assert.match(entrypoint, /^lib\/(?:[^/]+\/)*[^/]+$/u)
    const relativeSource = entrypoint.replace(/^lib\//u, 'src/')
    const source = path.join(packageRoot, relativeSource)
    const target = path.join(packageRoot, entrypoint)
    assert.ok(fs.existsSync(source), `${plugin.source}: missing ${relativeSource}`)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    const text = fs.readFileSync(source, 'utf8')
    if (text.includes('__LEXFLOW_PRODUCT_VERSION__') || text.includes('__LEXFLOW_DSH_VERSION__')) {
      let injected = text
      for (const [token, value] of versionInjections) injected = injected.split(`'${token}'`).join(JSON.stringify(value))
      assert.ok(!injected.includes('__LEXFLOW_PRODUCT_VERSION__') && !injected.includes('__LEXFLOW_DSH_VERSION__'), `${plugin.source}: version tokens must be single-quoted string literals`)
      fs.writeFileSync(target, injected)
    } else {
      fs.copyFileSync(source, target)
    }
  }
}

console.log('Built LexFlow-owned plugin runtime artifacts from src/.')

// The host module loader supplies React. Bundle the editing engine exactly once
// inside the page factory, rather than loading a second framework/runtime.
const editorBuild = require('esbuild').buildSync({
  entryPoints: [path.join(pluginRoot, 'lexflow-ui-pages', 'src', 'workbench-editor.js')],
  bundle: true, write: false, format: 'cjs', platform: 'browser', target: 'chrome120',
  external: ['react', 'react-dom', 'react/jsx-runtime'], loader: { '.css': 'text' },
  minify: true, legalComments: 'inline', metafile: true,
})
const pageSource = path.join(pluginRoot, 'lexflow-ui-pages', 'src', 'client.js')
const pageTarget = path.join(pluginRoot, 'lexflow-ui-pages', 'lib', 'client.js')
const marker = "require('@lexflow/workbench-editor')"
const page = fs.readFileSync(pageSource, 'utf8')
const sourceFingerprint = require('node:crypto').createHash('sha256').update(page).update(fs.readFileSync(path.join(pluginRoot, 'lexflow-ui-pages', 'src', 'workbench-editor.js'))).update(fs.readFileSync(path.join(root, 'pnpm-lock.yaml'))).digest('hex')
assert.equal(page.split(marker).length, 2, 'workbench editor bundle must be mounted once')
fs.writeFileSync(pageTarget, page.replace(marker, () => `(() => { const module = { exports: {} }; const exports = module.exports; ${editorBuild.outputFiles[0].text}\nreturn module.exports })()`) + `\n// lexflow-editor-source:${sourceFingerprint}\n`)
const packages = new Map()
for (const input of Object.keys(editorBuild.metafile.inputs)) {
  if (!input.includes('node_modules/')) continue
  let current = path.dirname(path.resolve(root, input))
  while (current !== path.dirname(current) && !fs.existsSync(path.join(current, 'package.json'))) current = path.dirname(current)
  const manifest = path.join(current, 'package.json')
  if (!fs.existsSync(manifest)) continue
  const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'))
  if (packages.has(pkg.name)) continue
  const license = fs.readdirSync(current).find((name) => /^licen[cs]e(?:\.|$)/i.test(name))
  assert.ok(license, `Bundled dependency ${pkg.name} must include a license`)
  packages.set(pkg.name, `${pkg.name} ${pkg.version}\n${fs.readFileSync(path.join(current, license), 'utf8')}`)
}
fs.writeFileSync(path.join(pluginRoot, 'lexflow-ui-pages', 'lib', 'EDITOR-LICENSES.txt'), [...packages.values()].join('\n\n----------------\n\n'))
console.log(`Bundled one workbench editor with ${packages.size} dependency license notices.`)
