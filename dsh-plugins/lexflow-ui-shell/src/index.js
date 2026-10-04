// Host entry for LexFlow's unified shell plugin.
import { schemastery as z } from '@lexflow/dsh-adapter'

/**
 * 配色方案。
 *
 * 字段声明在此即成为本插件在底座设置文档中的一段；渲染侧经适配层 settings.bind
 * 以同一命名空间读写。取 'lexflow' 时应用 LexFlow 暖色令牌覆盖，取 'deepseek' 时
 * 不覆盖，让底座原生蓝白配色透出。字体不随此切换。
 */
export const Config = z.object({
  palette: z.union(['lexflow', 'deepseek']).default('lexflow'),
})

export function apply() {}