import { existsSync, readFileSync } from 'node:fs'
import z from '@deepseek-ai/schemastery'
const PRESET_SECTION_NAME = 'lexflow:preset-guidance'
const PRESET_SECTION_ORDER = 20
const USER_RULES_SECTION_NAME = 'lexflow:user-rules'
const USER_RULES_SECTION_ORDER = 30

const PRESET_GUIDANCE = `LexFlow 预设内容：

输出与执行约束：直接回答当前问题，简单问答默认只给必要结论；不要重复题目、过程或无意义的进展叙述。执行工具或修改文件后，核对关键结果和错误状态；检查失败必须处理或明确报告，未验证不得声称完成。用户直接指令、系统规则和开发者规则优先于本段内容。

工作流和长期记忆是当前 LexFlow 知识库中已创建、已导入或已声明类型的 Markdown 文件。用户明确指定文件时，使用 LexFlow 知识库读取工具读取指定文件；处理相关任务时，可以先搜索知识库，并在只有一至两个明显适用文件时自动读取。询问用户仅适用于模型自行搜索发现的候选：当用户指令与用户规则（如 AGENT.md）都未明确指定要读取的文件，而模型搜索后发现三个或以上适用文件、或存在多个相近候选时，先询问用户再读取。凡用户明确指令或用户规则已点名要求读取的文件，无论数量多少都直接读取，不得因数量达到三个而回头询问。没有明确适用内容时不要读取。不要向工具传入新的知识库根目录或绝对路径，不建立工作流与长期记忆之间的永久关联。在 LexFlow 知识库工作流目录中写入新 Markdown 文件时，必须在文件头写入类型声明（frontmatter 的 “type: workflow” 或 “type: memory”），否则该文件不会被 LexFlow 收录。
`

function readUserRules(filename) {
  if (!filename || !existsSync(filename)) return ''
  try {
    const content = readFileSync(filename, 'utf8').trim()
    return content ? `用户全局规则（AGENT.md）：\n\n${content}` : ''
  } catch {
    return ''
  }
}

export const Config = z.object({ userAgentPath: z.string().default('') })

export const inject = ['lexflow']

export function apply(ctx, config = {}) {
  const host = ctx.get('lexflow').host
  const disposeGuidance = host.registerPrompt((prompt) => prompt.section({
    name: PRESET_SECTION_NAME,
    order: PRESET_SECTION_ORDER,
    text: PRESET_GUIDANCE,
  }))
  const disposeUserRules = host.registerPrompt((prompt) => prompt.section({
    name: USER_RULES_SECTION_NAME,
    order: USER_RULES_SECTION_ORDER,
    text: () => readUserRules(config.userAgentPath),
  }))
  return () => { disposeGuidance?.(); disposeUserRules?.() }
}
