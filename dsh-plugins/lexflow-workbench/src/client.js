window.__ModuleLoader__.load({
  id: '@lexflow/workbench',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    const pages = require('@lexflow/ui-pages/client')

    const inject = ['lexflow']

    function apply(ctx) {
      const adapter = ctx.get('lexflow')
      pages.configure({ request: adapter.documents.request, navigate: adapter.ui.navigate })
      return adapter.ui.pages.register('workbench', pages.pages.Workbench)
    }

    exports.inject = inject
    exports.apply = apply
    return module.exports
  },
})
