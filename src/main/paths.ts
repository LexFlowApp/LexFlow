import { app } from 'electron'
import path from 'node:path'

export interface LexFlowPaths {
  workspaceRoot: string
  archiveRoot: string
  appDataRoot: string
  runtimeRoot: string
  settingsRoot: string
  draftsRoot: string
  historyRoot: string
  trashRoot: string
  oldDataRoot: string
  defaultKnowledgeBaseRoot: string
  knowledgeBaseStatePath: string
  knowledgeBaseIndexRoot: string
  workflowSettingsPath: string
  legacyCleanupStatePath: string
  userAgentPath: string
  legacyStandardsRoot: string
  invocationStatePath: string
}

/**
 * 在模块加载时（app ready 之前）应用数据根覆盖。
 *
 * Chromium 自身的状态——缓存、Cookie、blob、会话存储——都写在 Electron 的
 * userData 下，只换 LexFlow 自己的目录并不构成隔离。setPath 必须早于 app ready，
 * 因此这一步放在模块顶层执行，而不是等 getPaths 被调用。
 * @returns 覆盖后的数据根；未设置环境变量时返回 undefined。
 */
function applyDataRootOverride(): string | undefined {
  const raw = process.env.LEXFLOW_DATA_ROOT?.trim()
  if (raw === undefined || raw === '') return undefined
  const resolved = path.resolve(raw)
  if (app.getPath('userData') !== resolved) app.setPath('userData', resolved)
  return resolved
}

const dataRootOverride = applyDataRootOverride()

export function getPaths(): LexFlowPaths {
  const workspaceRoot = path.join(app.getPath('home'), 'Documents', 'LexFlow')
  const appDataRoot = dataRootOverride ?? app.getPath('userData')
  return {
    workspaceRoot,
    archiveRoot: path.join(workspaceRoot, '档案室'),
    appDataRoot,
    runtimeRoot: path.join(appDataRoot, 'runtime'),
    settingsRoot: path.join(appDataRoot, 'settings'),
    draftsRoot: path.join(appDataRoot, 'drafts'),
    historyRoot: path.join(appDataRoot, 'history'),
    trashRoot: path.join(appDataRoot, 'trash'),
    oldDataRoot: path.join(appDataRoot, 'old-data'),
    defaultKnowledgeBaseRoot: path.join(app.getPath('home'), 'Documents', 'LexFlow 知识库'),
    knowledgeBaseStatePath: path.join(appDataRoot, 'settings', 'knowledge-base.json'),
    knowledgeBaseIndexRoot: path.join(appDataRoot, 'knowledge-index'),
    workflowSettingsPath: path.join(appDataRoot, 'settings', 'workflow-settings.json'),
    legacyCleanupStatePath: path.join(appDataRoot, 'settings', 'legacy-cleanup.json'),
    userAgentPath: path.join(workspaceRoot, 'AGENT.md'),
    legacyStandardsRoot: path.join(workspaceRoot, '标准规范'),
    invocationStatePath: path.join(appDataRoot, 'settings', 'invocation-state.json'),
  }
}
