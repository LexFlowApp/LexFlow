declare global {
  interface LexFlowWindowBridge {
    isFullScreen(): boolean
    onFullScreenChange(listener: (fullScreen: boolean) => void): () => void
  }

  interface Window {
    lexflowWindow?: LexFlowWindowBridge
  }
}

export {}
