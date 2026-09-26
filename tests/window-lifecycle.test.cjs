const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')

test('macOS window lifecycle has hidden-close, activation restore and shared creation guards', () => {
  const source = fs.readFileSync(path.join(root, 'src/main/index.ts'), 'utf8')
  assert.match(source, /windowCreationPromise/)
  assert.match(source, /app\.on\('activate'/)
  assert.match(source, /event\.preventDefault\(\)\s*\n\s*win\.hide\(\)/)
  assert.match(source, /if \(win\.isMinimized\(\)\) win\.restore\(\)/)
  assert.match(source, /isQuitting = true/)
  assert.match(source, /dshStartPromise/)
  assert.match(source, /pruneStaleDshAuthCookies/)
  assert.match(source, /\^dsh-auth-/)
})
