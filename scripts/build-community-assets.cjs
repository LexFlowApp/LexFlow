const fs = require('node:fs/promises')
const path = require('node:path')

const root = path.join(__dirname, '..')
const target = path.join(root, 'dist', 'community', 'assets')
const fontSource = path.join(root, 'resources', 'fonts')
const ocrSource = path.join(root, 'resources', 'ocr')

async function main() {
  await fs.mkdir(target, { recursive: true })
  await fs.cp(fontSource, path.join(target, 'fonts'), { recursive: true, force: true })
  try {
    await fs.cp(ocrSource, path.join(target, 'ocr'), { recursive: true, force: true })
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  const manifest = {
    name: '@lexflow/community-assets',
    version: '0.1.0-alpha.1',
    description: 'Font and optional OCR assets for the LexFlow community extension',
    license: 'MIT',
    files: ['fonts', 'ocr'],
  }
  await fs.writeFile(path.join(target, 'package.json'), JSON.stringify(manifest, null, 2) + '\n')
  console.log(`Built community assets at ${target}`)
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
