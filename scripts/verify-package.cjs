const assert = require('node:assert/strict')
const { existsSync, readFileSync, readdirSync } = require('node:fs')
const { join } = require('node:path')

const appModules = join(
  __dirname,
  '..',
  'dist',
  'forge',
  `LexFlow-darwin-${process.arch}`,
  'LexFlow.app',
  'Contents',
  'Resources',
  'app',
  'node_modules',
)
const appRoot = join(appModules, '..')
require('./plugin-release-files.cjs').verifyPluginRelease(join(appRoot, 'dsh-plugins'))

function manifests(directory) {
  const found = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const path = join(directory, entry.name)
    if (entry.name.startsWith('@')) {
      for (const child of readdirSync(path)) found.push(join(path, child, 'package.json'))
    } else {
      found.push(join(path, 'package.json'))
    }
  }
  return found.filter(existsSync)
}

const missing = []
for (const manifest of manifests(appModules)) {
  const pkg = JSON.parse(readFileSync(manifest, 'utf8'))
  for (const peer of Object.keys(pkg.peerDependencies ?? {})) {
    if (pkg.peerDependenciesMeta?.[peer]?.optional === true) continue
    if (!existsSync(join(appModules, peer, 'package.json'))) missing.push(`${pkg.name} -> ${peer}`)
  }
}

assert.deepEqual(missing, [], `Packaged app is missing runtime peer dependencies:\n${missing.join('\n')}`)

const forbidden = ['.git', '.claude', '.playwright-mcp', 'src', 'docs', 'tests', 'qa', 'work', 'LexFlow 设计预览.html']
const leaked = forbidden.filter((entry) => existsSync(join(appRoot, entry)))
assert.deepEqual(leaked, [], `Packaged app contains development-only files:\n${leaked.join('\n')}`)
assert.ok(existsSync(join(appRoot, 'dsh-plugins', 'manifest.json')), 'Packaged app is missing dsh-plugins/manifest.json')
assert.ok(existsSync(join(appRoot, 'dsh-plugins', 'lexflow-presets', 'package.json')), 'Packaged app is missing the LexFlow preset plugin')
assert.equal(existsSync(join(appRoot, 'resources', 'agent-template.md')), false, 'Packaged app still contains the removed agent template')
assert.equal(existsSync(join(appRoot, 'resources', 'official-standards')), false, 'Packaged app still contains the removed standard resources')

console.log('Packaged runtime dependencies verified.')
