const path = require('node:path')
const { isPluginReleaseFile } = require('./scripts/plugin-release-files.cjs')

const ignoreDevelopmentFiles = /^\/(?!(?:dsh-plugins|node_modules|out|resources)(?:\/|$)|package\.json$|LICENSE$).*/u

// node_modules/.bin 只存放开发工具的链接（build、typecheck、打包器等），目标包属于
// 开发依赖、不随应用分发，复制过去就是一批断链，既无用又会让 codesign --verify 失败。
// 应用运行不经过这些链接，直接排除。
const ignoreDevelopmentLinks = /^\/node_modules\/\.bin(?:\/|$)/u

// pnpm 的安装记录文件会写入开发机的绝对路径（pnpm store 位置、工程目录），
// 出厂分发包不得携带。主进程不读取这些文件，排除后应用照常运行。
const pnpmResidue = [
  '/node_modules/.modules.yaml',
  '/node_modules/.pnpm-workspace-state-v1.json',
  '/node_modules/.package-map.json',
]
const ignorePnpmResidue = (filename) => pnpmResidue.includes(filename) || filename.startsWith('/node_modules/.pnpm_patches')

module.exports = {
  outDir: 'dist/forge',
  packagerConfig: {
    name: 'LexFlow',
    appBundleId: 'com.lexflow.desktop',
    // Electron 44 起 Chromium 不再支持 macOS 12，二进制 minos 为 13.0，
    // 因此应用包的下限必须与二进制一致，否则 macOS 12 上会启动即崩。
    // 该值另由 scripts/fix-app-icon.cjs 在打包后强制写回并校验。
    LSMinimumSystemVersion: '13.0',
    asar: false,
    icon: 'assets/lexflow',
    ignore: (filename) => {
      if (ignoreDevelopmentFiles.test(filename)) return true
      if (ignoreDevelopmentLinks.test(filename)) return true
      if (ignorePnpmResidue(filename)) return true
      const relative = filename.replace(/^\/dsh-plugins\//u, '')
      if (relative === filename) return false
      const segments = relative.split('/')
      if (segments.length === 1) return false
      if (segments.length === 2 && segments[1] === 'lib') return false
      return !isPluginReleaseFile(relative)
    },
  },
}
