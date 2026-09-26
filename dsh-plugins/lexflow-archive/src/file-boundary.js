import { randomUUID } from 'node:crypto'
import { existsSync, realpathSync } from 'node:fs'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

const within = (root, target) => target === root || target.startsWith(`${root}${path.sep}`)

export const safeName = (value, extension = '') => {
  const name = String(value ?? '').trim().replace(/[\\/:*?"<>|]/gu, '－').replace(/\s+/gu, ' ')
  if (!name || name === '.' || name === '..') throw new Error('名称不能为空。')
  return `${name.slice(0, 90)}${extension && !name.endsWith(extension) ? extension : ''}`
}
export const safeRelative = (value = '.') => {
  const text = String(value)
  const normalized = path.normalize(text || '.')
  if (path.isAbsolute(text) || normalized === '..' || normalized.startsWith(`..${path.sep}`) || text.includes('\0')) throw new Error('路径不在 LexFlow 工作空间内。')
  return normalized
}

function nearestExistingPath(target) {
  let current = target
  while (!existsSync(current)) {
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }
  return current
}

// Resolve the existing portion of a path before accepting it. Lexical checks
// alone allow a symlink inside the workspace to point outside the boundary.
export const inside = (root, relative) => {
  const target = path.resolve(root, safeRelative(relative))
  const base = realpathSync(root)
  const existing = nearestExistingPath(target)
  const resolvedExisting = realpathSync(existing)
  if (!within(base, resolvedExisting)) throw new Error('路径不在 LexFlow 工作空间内。')
  return target
}

export async function atomicWrite(filename, content) {
  await mkdir(path.dirname(filename), { recursive: true })
  const temporary = `${filename}.${randomUUID()}.tmp`
  await writeFile(temporary, content, 'utf8')
  await rename(temporary, filename)
}
