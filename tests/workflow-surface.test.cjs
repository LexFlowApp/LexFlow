const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')

/**
 * 会话格式 v4 要求表面的第一个节点是系统消息（受保护的头）。
 * 引擎的执行顺序是「先跑 agent/pre-step 钩子，再提交系统消息」，
 * 因此插件在该钩子里直接 surface.append 会把工作流上下文写成首节点，
 * 使日志在下次读取时被判为损坏（表现为「历史加载失败」）。
 *
 * 新节点必须交给引擎经 decision.messages 追加——引擎在系统消息之后才写入这些消息，
 * 顺序天然合法。更新与移除仍可用 surface.replace：那时系统消息已存在。
 *
 * 这两条断言是防回归闸门：一旦有人改回直接写表面，测试立即失败。
 */
test('the workflow plugin hands new context to the engine instead of the surface', () => {
  const source = fs.readFileSync(path.join(root, 'dsh-plugins', 'lexflow-workflow', 'src', 'index.js'), 'utf8')
  assert.doesNotMatch(source, /surface\.append\s*\(/u, '新增工作流上下文不得直接写入会话表面')
  assert.match(source, /decision\.messages\s*=/u, '新增工作流上下文必须经 decision.messages 交给引擎追加')
})

test('the built workflow plugin carries the same write path', () => {
  const built = path.join(root, 'dsh-plugins', 'lexflow-workflow', 'lib', 'index.js')
  const source = fs.readFileSync(built, 'utf8')
  assert.doesNotMatch(source, /surface\.append\s*\(/u, '构建产物不得直接写入会话表面')
  assert.match(source, /decision\.messages/u, '构建产物必须保留交给引擎的写入')
})
