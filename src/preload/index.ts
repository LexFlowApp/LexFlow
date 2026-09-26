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
