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

// 官方账号与余额页面的原生桥接。
//
// 官方账号插件用 `globalThis.dshPlatform` 的存在与否决定是否注册充值／余额界面
// （AccountPlatformHost），并以三个方法驱动一个内嵌的原生子窗口：
//   open(page, bounds) → Promise，页面加载完成时兑现，失败时 reject（官方转为「加载失败」）；
//   setBounds(bounds)   → Promise，官方在容器尺寸变化时同步子窗口位置；
//   close()             → Promise，关闭并销毁子窗口。
// bounds 为渲染进程内容坐标（{ x, y, width, height }），由主进程换算为窗口坐标。
//
// 充值页面由官方 Platform 站点提供，LexFlow 不代理其请求、不持有其凭据：
// 子窗口只加载官方地址，凭据由官方页面自行处理。
contextBridge.exposeInMainWorld('dshPlatform', {
  open: (page: string, bounds: { x: number; y: number; width: number; height: number }): Promise<void> =>
    ipcRenderer.invoke('lexflow:platform-open', page, bounds),
  setBounds: (bounds: { x: number; y: number; width: number; height: number }): Promise<void> =>
    ipcRenderer.invoke('lexflow:platform-set-bounds', bounds),
  close: (): Promise<void> => ipcRenderer.invoke('lexflow:platform-close'),
})
