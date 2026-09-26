const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const manifestPath = path.join(root, 'dsh-plugins', 'manifest.json')
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
const expectedRuntime = '@deepseek-ai/dsh@' + JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).dependencies['@deepseek-ai/dsh']

assert.equal(manifest.schemaVersion, 1)
assert.ok(Array.isArray(manifest.packages) && manifest.packages.length > 0)

const seenSources = new Set()
const seenTargets = new Set()
for (const plugin of manifest.packages) {
  assert.equal(plugin.compatibleWith, expectedRuntime, `${plugin.source}: incompatible runtime declaration`)
  assert.match(plugin.source, /^[A-Za-z0-9_-]+$/u)
  assert.match(plugin.target, /^@[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/u)
  assert.ok(plugin.kind === 'lexflow-owned' || plugin.kind === 'upstream-override')
  assert.equal(seenSources.has(plugin.source), false, `duplicate plugin source: ${plugin.source}`)
  assert.equal(seenTargets.has(plugin.target), false, `duplicate plugin target: ${plugin.target}`)
  seenSources.add(plugin.source)
  seenTargets.add(plugin.target)

  const packageRoot = path.join(root, 'dsh-plugins', plugin.source)
  const packagePath = path.join(packageRoot, 'package.json')
  assert.ok(fs.existsSync(packagePath), `${plugin.source}: package.json is missing`)
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
  assert.equal(packageJson.name, plugin.target, `${plugin.source}: package name does not match manifest target`)
  for (const entrypoint of plugin.entrypoints) {
    assert.match(entrypoint, /^(?:[^/]+\/)*[^/]+$/u)
    assert.ok(fs.existsSync(path.join(packageRoot, entrypoint)), `${plugin.source}: missing ${entrypoint}`)
    const runtimePath = path.join(packageRoot, entrypoint)
    if (entrypoint.endsWith('.js')) {
      const runtimeSource = fs.readFileSync(runtimePath, 'utf8')
      const sourceMap = runtimeSource.match(/sourceMappingURL=([^\s]+)$/mu)?.[1]
      if (sourceMap) assert.ok(fs.existsSync(path.join(path.dirname(runtimePath), sourceMap)), `${plugin.source}: missing ${sourceMap}`)
    }
  }
  if (plugin.kind === 'lexflow-owned') {
    assert.equal(plugin.sourceDir, 'src', `${plugin.source}: sourceDir must be src`)
    for (const entrypoint of plugin.entrypoints) {
      const sourcePath = entrypoint.replace(/^lib\//u, 'src/')
      assert.ok(fs.existsSync(path.join(packageRoot, sourcePath)), `${plugin.source}: missing source ${sourcePath}`)
    }
  }
}

// 适配层在运行时契约中声明它所对应的底座版本（架构规范第二节「版本隔离」）。
// 该声明是断言而非派生值：客户端侧是浏览器 bundle，无法读取文件系统，
// 因此在此统一校验它与工程锁定的底座版本一致，避免底座升级后声明静默滞后。
const adapterSourceRoot = path.join(root, 'dsh-plugins', 'lexflow-dsh-adapter', 'src')
for (const filename of ['index.js', 'client.js']) {
  const adapterSource = fs.readFileSync(path.join(adapterSourceRoot, filename), 'utf8')
  const declared = adapterSource.match(/dshVersion:\s*'([^']+)'/u)
  assert.ok(declared, `lexflow-dsh-adapter/${filename}: 未找到 dshVersion 声明`)
  assert.equal(
    declared[1],
    expectedRuntime.replace(/^@deepseek-ai\/dsh@/u, ''),
    `lexflow-dsh-adapter/${filename}: dshVersion 与工程锁定的底座版本不一致`,
  )
}

console.log(`Verified ${manifest.packages.length} bundled DeepSeek Harness plugin packages.`)
