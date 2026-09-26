window.__ModuleLoader__.load({
  id: '@lexflow/archive',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    const pages = require('@lexflow/ui-pages/client')

    const inject = ['lexflow']

    async function waitForCurrentSession(adapter) {
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const sessionId = adapter.sessions.currentId()
        if (sessionId) return sessionId
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
      return undefined
    }

    function apply(ctx) {
      const adapter = ctx.get('lexflow')
      const useFile = async (file) => {
        let sessionId = adapter.sessions.currentId()
        if (!sessionId) {
          adapter.workspaces.startSession()
          sessionId = await waitForCurrentSession(adapter)
        }
        if (!sessionId) throw new Error('请先选择一个工作区，再使用工作流或长期记忆。')
        await adapter.documents.request('workflow.activate', { sessionId, relativePath: file.relativePath })
        adapter.ui.navigate('conversation')
      }
      pages.configure({ request: adapter.documents.request, navigate: adapter.ui.navigate, pickDirectory: adapter.workspaces.pickDirectory, useFile, currentSessionId: () => adapter.sessions.currentId() })
      const disposeWorkflow = adapter.ui.pages.register('workflow', pages.pages.Workflow)
      const disposeArchive = adapter.ui.pages.register('archive', pages.pages.Archive)
      return () => { disposeArchive(); disposeWorkflow() }
    }

    exports.inject = inject
    exports.apply = apply
    return module.exports
  },
})
