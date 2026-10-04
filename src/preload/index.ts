import { contextBridge, ipcRenderer } from 'electron'

type FullScreenListener = (fullScreen: boolean) => void

contextBridge.exposeInMainWorld('lexflowWindow', {
  isFullScreen: (): boolean => ipcRenderer.sendSync('lexflow:window-is-fullscreen') === true,
  onFullScreenChange: (listener: FullScreenListener): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, fullScreen: boolean): void => {
      listener(Boolean(fullScreen))
    }
    ipcRenderer.on('lexflow:fullscreen-changed', handler)
    return () => ipcRenderer.removeListener('lexflow:fullscreen-changed', handler)
  },
})

// 官方桌面宿主标记。
//
// 官方账号登录插件（@deepseek-ai/dsh-client-ui-settings-account）以
// `("dshDesktop" in globalThis)` 作为「运行在桌面宿主」的唯一判据，不满足即静默
// 跳过全部界面注册。LexFlow 用自有壳层启动底座，不注入官方 preload，此前该判据
// 恒为假，官方登录入口（侧栏账号行、账号与余额设置分区、模型页登录入口）全部
// 未注册——功能代码本已装配，只因缺少宿主身份而不显示。
//
// 这里只声明宿主身份，不声明 protocolVersion：官方更新通道与浏览器侧栏均以
// protocolVersion === 1 为启用条件，不声明即保持关闭，符合产品基线「用户侧不
// 显示更新与兼容性」。deviceInfo 未提供时官方回退为浏览器 UA，不影响登录。
contextBridge.exposeInMainWorld('dshDesktop', {})
