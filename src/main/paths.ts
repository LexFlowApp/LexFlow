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

export function getPaths(): LexFlowPaths {
  const workspaceRoot = path.join(app.getPath('home'), 'Documents', 'LexFlow')
  const appDataRoot = app.getPath('userData')
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
