const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const root = path.join(__dirname, '..')
const app = path.join(root, 'dist', 'forge', 'LexFlow-darwin-arm64', 'LexFlow.app')
const resources = path.join(app, 'Contents', 'Resources')
const info = path.join(app, 'Contents', 'Info.plist')
const source = path.join(root, 'assets', 'lexflow.icns')
const destination = path.join(resources, 'lexflow.icns')

if (!fs.existsSync(app) || !fs.existsSync(source)) throw new Error('LexFlow 应用包或图标不存在。')
fs.copyFileSync(source, destination)
execFileSync('/usr/bin/plutil', ['-replace', 'CFBundleIconFile', '-string', 'lexflow.icns', info])

// 应用包的系统下限必须与 Electron 二进制一致：Electron 44 起 Chromium 不再支持
// macOS 12，二进制 minos 为 13.0；若 plist 仍声明 12.0，macOS 12 上会启动即崩。
const minimumSystemVersion = '13.0'
execFileSync('/usr/bin/plutil', ['-replace', 'LSMinimumSystemVersion', '-string', minimumSystemVersion, info])
const declared = execFileSync('/usr/bin/plutil', ['-extract', 'LSMinimumSystemVersion', 'raw', info], { encoding: 'utf8' }).trim()
if (declared !== minimumSystemVersion) throw new Error(`应用包系统下限不正确：${declared}`)

// 图标必须只含 PNG 条目：iconutil 会写入 ic04/ic05/info 三条旧式条目，而满幅或含
// 旧式条目的图标在 macOS 26 以前的系统上会显示为纯方块。
const icns = fs.readFileSync(destination)
const declaredSize = icns.readUInt32BE(4)
const legacy = ['ic04', 'ic05', 'info']
const kinds = []
for (let offset = 8; offset < Math.min(declaredSize, icns.length);) {
  const kind = icns.toString('latin1', offset, offset + 4)
  kinds.push(kind)
  if (legacy.includes(kind)) throw new Error(`图标含旧式条目 ${kind}，会在旧系统上显示异常。`)
  if (icns.toString('latin1', offset + 8, offset + 12) !== '\u0089PNG') throw new Error(`图标条目 ${kind} 不是 PNG。`)
  offset += icns.readUInt32BE(offset + 4)
}
if (!kinds.includes('ic10')) throw new Error(`图标缺少 1024 条目：${kinds.join(',')}`)
console.log(`LexFlow application icon installed (LSMinimumSystemVersion ${declared}, ${kinds.length} PNG entries).`)
