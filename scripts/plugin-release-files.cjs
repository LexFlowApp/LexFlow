const fs = require('node:fs')
const path = require('node:path')

// Runtime assets and license notices are release material; authoring files are not.
function isPluginReleaseFile(relative) {
  const parts = relative.split(/[\\/]/u)
  if (parts.length === 1) return parts[0] === 'manifest.json'
  if (parts.length === 2) return ['package.json', 'LICENSE', 'NOTICE', 'compatibility.json', 'cordis.patch.yml'].includes(parts[1])
  return parts[1] === 'lib' && !relative.endsWith('.map')
}

function verifyPluginRelease(root) {
  const visit = (directory, prefix = '') => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const relative = prefix ? prefix + '/' + entry.name : entry.name
      if (entry.isDirectory()) visit(path.join(directory, entry.name), relative)
      else if (!isPluginReleaseFile(relative)) throw new Error('Non-runtime plugin file: ' + relative)
    }
  }
  visit(root)
}
module.exports = { isPluginReleaseFile, verifyPluginRelease }
