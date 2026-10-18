declare global {
  type LexFlowIdentity = 'lexflow' | 'deepseek'

  interface LexFlowWindowBridge {
    isFullScreen(): boolean
    onFullScreenChange(listener: (fullScreen: boolean) => void): () => void
    getIdentity(): Promise<LexFlowIdentity>
    setIdentity(identity: LexFlowIdentity): Promise<{ identity: LexFlowIdentity; name: string }>
  }

  interface Window {
    lexflowWindow?: LexFlowWindowBridge
  }
}

export {}
