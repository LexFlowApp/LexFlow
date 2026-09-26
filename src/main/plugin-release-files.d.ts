// scripts/plugin-release-files.cjs 是插件发布白名单的唯一实现。
// 该文件为 CommonJS 且位于 src 之外，tsconfig 未开启 allowJs，故在此声明其形状，
// 供主进程在构建期内联使用（scripts/ 不随应用分发包发布）。
declare module '*/plugin-release-files.cjs' {
  export function isPluginReleaseFile(relative: string): boolean
  export function verifyPluginRelease(root: string): void
}
