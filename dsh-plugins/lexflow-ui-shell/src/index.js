// Host entry for LexFlow's unified shell plugin.
import { schemastery as z } from '@lexflow/dsh-adapter'

export const name = 'lexflow-ui-shell'

/**
 * LexFlow 自有界面偏好。
 *
 * 这两个字段是 volatile 配置：设置页保存后由加载器就地更新引用，客户端订阅
 * `lexflow-ui-shell` 配置表单即可即时换色、换密度，无需重载插件。
 */
export const Config = z.object({
  palette: z.union(['lexflow', 'deepseek']).default('lexflow').volatile(),
  density: z.union(['compact', 'comfortable']).default('compact').volatile(),
  // 左侧边栏宽度以窗口比例保存，避免更换窗口尺寸后仍固定占用一大段对话空间。
  sidebarRatio: z.number().min(0.12).max(0.5).default(0.2).volatile(),
  // Community bundles can remove the visible LexFlow brand without forking the
  // shell implementation. Internal identifiers keep their stable names.
  branding: z.union(['lexflow', 'official', 'none']).default('lexflow').volatile(),
})

/**
 * 产品界面偏好由 LexFlow 自绘的“界面偏好”行呈现；隐藏底座根据 Config
 * 自动生成的通用插件配置卡，避免同一设置出现两个入口。
 */
export function apply(ctx) {
  return ctx.inject(['settings'], scope => {
    if (typeof scope.settings?.configure !== 'function') return undefined
    let dispose
    try {
      dispose = scope.settings.configure({ auto: false }, ctx.fiber)
    } catch {
      dispose = undefined
    }
    return typeof dispose === 'function' ? dispose : undefined
  })
}
