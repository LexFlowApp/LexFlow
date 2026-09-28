window.__ModuleLoader__.load({
  id: '@lexflow/ui-shell',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    const { jsx } = require('react/jsx-runtime')
    const ui = (() => {
    var module = { exports: {} }
    var exports = module.exports
    const React = require('react')
    const { jsx, jsxs } = require('react/jsx-runtime')
    const button = { background: 'var(--lexflow-dsw-alias-button-elevated-fill)', border: '1px solid var(--lexflow-dsw-alias-border-l2)', borderRadius: '7px', color: 'var(--lexflow-dsw-alias-label-primary)', cursor: 'pointer', padding: '7px 10px' }
    const toolButton = { ...button, borderRadius: '6px', fontSize: '12px', lineHeight: 1.3, padding: '4px 8px' }
    const input = { background: 'var(--lexflow-dsw-alias-bg-base)', border: '1px solid var(--lexflow-dsw-alias-border-l2)', borderRadius: '7px', color: 'var(--lexflow-dsw-alias-label-primary)', padding: '8px 10px' }
    const pages = [['conversation', '新对话'], ['workflow', '工作流'], ['archive', '档案室'], ['workbench', '工作台']]
    const LEXFLOW_TOKENS = {
      '--lexflow-dsw-alias-bg-base': { light: '#faf9f6', dark: '#262523' },
      '--lexflow-dsw-alias-bg-layer-1': { light: '#ffffff', dark: '#2b2a27' },
      '--lexflow-dsw-alias-bg-layer-2': { light: '#ffffff', dark: '#30302d' },
      '--lexflow-dsw-alias-bg-layer-3': { light: '#ffffff', dark: '#30302d' },
      '--lexflow-dsw-alias-bg-module-platform': { light: '#f1ede4', dark: '#353430' },
      '--lexflow-dsw-alias-bg-multi-select': { light: '#f1ede4', dark: '#35332f' },
      '--lexflow-dsw-alias-bg-overlay': { light: '#ece7dd', dark: '#43403a' },
      '--lexflow-dsw-specific-sidebar-fill': { light: '#f2efe8', dark: '#1f1e1c' },
      '--lexflow-dsw-specific-sidebar-nav-item-active': { light: '#e9e3d7', dark: '#37342e' },
      '--lexflow-dsw-specific-sidebar-nav-item-active-accent': { light: '#e6ddd0', dark: '#3b372f' },
      '--lexflow-dsw-specific-sidebar-nav-item-hover': { light: '#f0ebe1', dark: '#302e29' },
      '--lexflow-dsw-specific-bubble': { light: '#f3ece1', dark: '#383431' },
      '--lexflow-dsw-specific-bubble-highlight': { light: '#e7d9c9', dark: '#4a443e' },
      '--lexflow-dsw-specific-input-major': { light: '#ffffff', dark: '#33312d' },
      '--lexflow-dsw-specific-selector': { light: '#f1ede4', dark: '#3a3831' },
      '--lexflow-dsw-specific-tip': { light: '#f1ede4', dark: '#353430' },
      // 覆盖底座交付文件与右侧标签仍使用的冷色底层令牌，统一到 LexFlow 暖色调。
      '--lexflow-dsw-alias-link': { light: '#a86e56', dark: '#c79a80' },
      '--lexflow-dsw-alias-markdown-tag': { light: '#f1ede4', dark: '#3a3831' },
      '--lexflow-dsw-static-neutral-50': { light: '#f7f4ed', dark: '#f7f4ed' },
      '--lexflow-dsw-static-neutral-100': { light: '#f1ece1', dark: '#f1ece1' },
      '--lexflow-dsw-static-neutral-800': { light: '#f1ece1', dark: '#2c2925' },
      '--lexflow-dsw-static-neutral-850': { light: '#f7f4ed', dark: '#232120' },
      // 文件类型图标与生成中状态直接引用 deepseek 静态色，需同步改为暖色。
      '--lexflow-dsw-static-deepseek-200': { light: '#f0e4da', dark: '#6b5346' },
      '--lexflow-dsw-static-deepseek-450': { light: '#ab6a4e', dark: '#bd8a70' },
      '--lexflow-dsw-static-deepseek-500': { light: '#a86e56', dark: '#bd8a70' },
      '--lexflow-dsw-alias-label-primary': { light: '#29261f', dark: '#ebe9e2' },
      '--lexflow-dsw-alias-label-secondary': { light: '#6f695d', dark: '#a3a09a' },
      '--lexflow-dsw-alias-label-tertiary': { light: '#8a8378', dark: '#9a958c' },
      '--lexflow-dsw-alias-label-caption': { light: '#b0a99d', dark: '#7d7870' },
      '--lexflow-dsw-alias-label-dimmed': { light: '#d5cfc4', dark: '#4a463f' },
      '--lexflow-dsw-alias-label-primary-bluish': { light: '#29261f', dark: '#ebe9e2' },
      '--lexflow-dsw-alias-border-l1': { light: '#e9e6df', dark: '#3a3835' },
      '--lexflow-dsw-alias-border-l2': { light: '#dcd8cf', dark: '#474540' },
      '--lexflow-dsw-alias-border-l3': { light: '#cfc9be', dark: '#54504a' },
      // 0.1.5 右侧边栏引用的令牌：取值取自本表既有色阶，保持 LexFlow 暖色调一致
      '--lexflow-dsw-alias-border-l4': { light: '#c4bcae', dark: '#5c564d' },
      '--lexflow-dsw-static-neutral-200': { light: '#e9e6df', dark: '#3a3835' },
      '--lexflow-dsw-static-neutral-700': { light: '#8a8378', dark: '#9a958c' },
      '--lexflow-dsw-alias-interactive-bg-hover': { light: '#eae6dd', dark: '#353330' },
      '--lexflow-dsw-alias-interactive-bg-hover-solid': { light: '#efe9de', dark: '#3a3831' },
      '--lexflow-dsw-alias-button-elevated-fill': { light: '#ffffff', dark: '#30302d' },
      '--lexflow-dsw-alias-button-floating-fill': { light: '#ffffff', dark: '#30302d' },
      '--lexflow-dsw-alias-button-floating-hover': { light: '#f4f1ea', dark: '#3a3935' },
      '--lexflow-dsw-alias-button-info-fill': { light: '#cf8163', dark: '#d2886c' },
      '--lexflow-dsw-alias-button-info-hover': { light: '#bf7154', dark: '#dfa189' },
      '--lexflow-dsw-alias-brand-primary-new-colorprimary-new-color': { light: '#cf8163', dark: '#d2886c' },
      // 底座 Switch 原语（设置页开发者工具开关等）以 brand-primary 上色，底座默认近黑；
      // LexFlow 统一映射为暖橙主题色，使全站开关与产品配色一致。
      '--lexflow-dsw-alias-brand-primary': { light: '#cf8163', dark: '#d2886c' },
      '--lexflow-dsw-alias-state-business-primary': { light: '#cf8163', dark: '#d2886c' },
      '--lexflow-dsw-alias-state-business-primary-hover': { light: '#bf7154', dark: '#dfa189' },
      '--lexflow-dsw-alias-state-business-tertiary': { light: '#f2e8e2', dark: '#453832' },
      '--lexflow-dsw-alias-button-primary-fill': { light: '#cf8163', dark: '#d2886c' },
      '--lexflow-dsw-alias-markdown-code-block': { light: '#f3f0ea', dark: '#1f1e1c' },
      '--lexflow-dsw-alias-markdown-code-block-banner': { light: '#eae6dd', dark: '#2a2926' },
      '--lexflow-dsw-alias-markdown-inline-code': { light: '#efece5', dark: '#30302d' },
      '--lexflow-dsw-alias-scrollbar-bg-l1': { light: '#d8d2c6', dark: '#4a463f' },
      '--lexflow-dsw-alias-scrollbar-bg-l2': { light: '#c4bcae', dark: '#5c564d' },
      '--lexflow-dsw-alias-scrollbar-hover-l1': { light: '#c4bcae', dark: '#5c564d' },
      '--lexflow-dsw-alias-scrollbar-hover-l2': { light: '#b3aa9a', dark: '#6b6459' },
      '--lexflow-dsw-alias-toast-bg': { light: '#3a372f', dark: '#3f3b35' },
      '--lexflow-dsw-alias-tooltip-bg': { light: '#3a372f', dark: '#3f3b35' }
    }
    const LEXFLOW_DENSITY_CSS = [
      '@font-face { font-display: swap; font-family: "LexFlow Source Han Serif SC"; font-style: normal; font-weight: 400; src: url("/lexflow-assets/fonts/SourceHanSerifSC-Regular.otf") format("opentype"); }',
      '@font-face { font-display: swap; font-family: "LexFlow Source Han Serif SC"; font-style: normal; font-weight: 600; src: url("/lexflow-assets/fonts/SourceHanSerifSC-SemiBold.otf") format("opentype"); }',
      ':root { --lexflow-font-ui: "LexFlow Source Han Serif SC", "Songti SC", serif; --lexflow-font-code: "SF Mono", "SFMono-Regular", Menlo, monospace; --lexflow-dsw-font-family: var(--lexflow-font-ui); --lexflow-dsw-font-mono: var(--lexflow-font-code); --lexflow-ds-font-family-code: var(--lexflow-font-code); }',
      'html, body, button, input, textarea, select { font-family: var(--lexflow-font-ui) !important; }',
      'pre, code, kbd, samp, [class*="code-block"], [class*="codeBlock"], [class*="inline-code"], [class*="monospace"], [class*="terminal"], [class*="command"] { font-family: var(--lexflow-font-code) !important; }',
      '.lexflowSidebarRoot { position: relative; z-index: 2; font-weight: 600 !important; }',
      '.lexflowSidebarRoot time, .lexflowSidebarRoot [class*="time"] { font-weight: 400 !important; }',
      '.lexflowSidebarRoot:not(.lexflowSidebarCollapsed) .lexflowSidebar_logoRow { -webkit-app-region: drag; height: 48px !important; justify-content: flex-start !important; margin-bottom: 4px !important; margin-top: 44px !important; padding-left: 12px !important; }',
      '.lexflowSidebarRoot:not(.lexflowSidebarCollapsed) .lexflowSidebar_brand, .lexflowSidebarRoot:not(.lexflowSidebarCollapsed) .lexflowSidebar_brandIdentity { justify-content: flex-start !important; text-align: left !important; }',
      '.lexflowSidebarRoot.lexflowSidebarCollapsed { padding-top: 6px !important; }',
      '.lexflowSidebarRoot.lexflowSidebarCollapsed .lexflowSidebar_logoRow { margin-top: 44px !important; position: relative; z-index: 1; }',
      '.lexflowSidebarRoot .lexflowSidebar_logoRow button { -webkit-app-region: no-drag; }',
      '.lexflowSidebarRoot > * { position: relative; z-index: 1; }',
      '[data-lexflow-layout="sidebar"] { background: linear-gradient(180deg, var(--lexflow-dsw-alias-bg-base) 0px, var(--lexflow-dsw-specific-sidebar-fill) 96px) !important; border-right: none !important; overflow: hidden !important; position: relative !important; z-index: 3 !important; }',
      '[data-lexflow-layout="sidebar"]::after { background: linear-gradient(180deg, transparent 0px, var(--lexflow-dsw-alias-border-l1) 96px); bottom: 0; content: ""; pointer-events: none; position: absolute; right: 0; top: 0; width: 1px; z-index: 0; }',
      '[data-lexflow-layout="frame"] { isolation: isolate; min-height: 0; min-width: 0; position: relative; }',
      '[data-lexflow-layout="center"] { min-height: 0; min-width: 0; overflow: hidden !important; position: relative; }',
      // 右栏列不得裁切：底座的右侧边栏在窄视口（<768px）切换为全屏形态，
      // 面板按 100vw 绘制并覆盖全界面（dsh-client-ui-sidebar-right 的 autoFullscreen）。
      // 底座自身的右栏列就是 overflow:visible（pI_x6G_rightbarCol），LexFlow 此前
      // 沿用了中央列的 overflow:hidden，把全屏面板剪成只剩一列宽的右边缘窄缝，
      // 左部内容全部不可见（用户 2026-09-28 反馈"横屏电影在竖屏手机上只看到右侧竖边"）。
      '[data-lexflow-layout="rightbar"] { min-height: 0; min-width: 0; overflow: visible !important; position: relative; }',
      '[data-lexflow-layout="rightbar"] { background: var(--lexflow-dsw-alias-bg-base); z-index: 1; }',
      '[data-lexflow-layout="center"] > *, [data-lexflow-layout="center"] [data-slot="conversation.session"] { max-width: 100%; min-width: 0; }',
      '[data-shell-overlay] { isolation: isolate; z-index: 1000 !important; }',
      '.lexflowHeaderWorkspace { align-items: center; background: var(--lexflow-dsw-alias-interactive-bg-hover); border-radius: 999px; color: var(--lexflow-dsw-alias-label-secondary); display: inline-flex; flex: 0 1 auto; font-size: 11px; font-weight: 500; line-height: 20px; margin: 0; max-width: 220px; overflow: hidden; padding: 1px 10px; text-overflow: ellipsis; white-space: nowrap; }',
      '.lexflowTopSidebarToggle { -webkit-app-region: no-drag; align-items: center; background: transparent; border: 0; border-radius: 7px; color: var(--lexflow-dsw-alias-label-secondary); cursor: pointer; display: inline-flex; height: 28px; justify-content: center; left: 86px; padding: 0; position: fixed; top: 20px; width: 28px; z-index: 30; }',
      '.lexflowTopSidebarToggle:hover { background: var(--lexflow-dsw-alias-interactive-bg-hover); color: var(--lexflow-dsw-alias-label-primary); }',
      '.lexflowModelHeadRight { align-items: center; display: inline-flex; gap: 9px; }',
      '.lexflowModelStatusMark { align-items: center; border: 1.5px solid var(--lexflow-dsw-alias-state-business-primary); border-radius: 50%; box-sizing: border-box; color: var(--lexflow-dsw-alias-state-business-primary); display: inline-flex; height: 16px; justify-content: center; width: 16px; }',
      '.lexflowModelStatusMark svg { display: block; height: 9px; width: 9px; }',
      '.lexflowGptSettings { display: flex; flex-direction: column; gap: 12px; min-width: 0; }',
      '.lexflowGptSettings > * { min-width: 0; }',
    ].join('\n')
    const LEXFLOW_MOTION_CSS = [
      'button, input, textarea, select, summary { transition: background-color .18s ease, border-color .18s ease, color .18s ease, box-shadow .18s ease, opacity .18s ease }',
      'button:not(:disabled):hover { filter: brightness(.965) }',
      'button:active { transform: scale(.98) }',
      '@keyframes lexflowRise { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }',
      '.lexflowDialogPanel { animation: lexflowRise .18s ease }',
      '.lexflowPageMain { animation: lexflowRise .18s ease }',
      '.lexflowPageMain h1 { font-size: 20px; font-weight: 650; letter-spacing: .01em }',
      '.lexflowTreeRow .lexflowTreeActions { opacity: 0; transition: opacity .15s ease }',
      '.lexflowTreeRow:hover > details > summary, .lexflowTreeRow:hover > div { background: var(--lexflow-dsw-alias-interactive-bg-hover) }',
      '.lexflowTreeRow:hover .lexflowTreeActions, .lexflowTreeRow:focus-within .lexflowTreeActions { opacity: 1 }',
      '.lexflowTreeRow summary::-webkit-details-marker { display: none }',
      '.lexflowDialogPanel { box-shadow: 0 24px 64px rgba(15,14,12,.24), 0 2px 8px rgba(15,14,12,.08) }',
      '.lexflowToolbarSep { background: var(--lexflow-dsw-alias-border-l2); border-radius: 1px; height: 16px; margin: 0 3px; width: 1px }',
      '.lexflowMarkdownPreview mark, .lexflowHighlightMark { background: color-mix(in srgb, var(--lexflow-highlight-color, #9b8bc0) 32%, transparent); color: inherit; padding: 0 2px; border-radius: 3px }',
      '.lexflowStdCard { transition: border-color .15s ease, box-shadow .15s ease }',
      '.lexflowStdCard:hover { border-color: var(--lexflow-dsw-alias-border-l3); box-shadow: 0 1px 4px rgba(15,14,12,.06) }',
      '.lexflowSecondaryBtn { color: var(--lexflow-dsw-alias-label-secondary) }',
      '.lexflowDashboard { border: 1px solid var(--lexflow-dsw-alias-border-l1); border-radius: 14px; margin: 0 0 18px; overflow: hidden }',
      '.lexflowDashboardBar { align-items: center; color: var(--lexflow-dsw-alias-label-secondary); display: flex; font-size: 12px; font-weight: 600; justify-content: space-between; padding: 11px 16px }',
      '.lexflowDashSwitch { align-items: center; background: transparent; border: 0; color: var(--lexflow-dsw-alias-label-secondary); cursor: pointer; display: inline-flex; font: inherit; gap: 7px; padding: 0 }',
      '.lexflowDashSwitch > span { background: var(--lexflow-dsw-alias-border-l3); border-radius: 999px; display: block; height: 18px; position: relative; width: 30px }',
      '.lexflowDashSwitch > span::after { background: var(--lexflow-dsw-alias-bg-base); border-radius: inherit; box-shadow: 0 1px 2px rgba(15,14,12,.16); content: ""; height: 14px; left: 2px; position: absolute; top: 2px; transition: transform .16s ease; width: 14px }',
      '.lexflowDashSwitch > span.isOn { background: var(--lexflow-dsw-alias-state-business-primary) }',
      '.lexflowDashSwitch > span.isOn::after { transform: translateX(12px) }',
      '.lexflowDashboardBody { background: color-mix(in srgb, var(--lexflow-dsw-alias-bg-layer-1) 72%, var(--lexflow-dsw-alias-bg-base)); border-top: 1px solid var(--lexflow-dsw-alias-border-l1); padding: 12px }',
      '.lexflowDashTop { display: grid; gap: 12px; grid-template-columns: 1fr 1fr 1.05fr; margin-bottom: 12px }',
      '.lexflowDashCard { background: var(--lexflow-dsw-alias-bg-layer-1); border: 1px solid var(--lexflow-dsw-alias-border-l1); border-radius: 11px; min-width: 0; padding: 14px 16px }',
      '.lexflowDashCard > p { color: var(--lexflow-dsw-alias-label-secondary); font-size: 12px; margin: 0 0 11px }',
      '.lexflowDashCount > strong { display: block; font-size: 29px; font-weight: 650; letter-spacing: -.03em; line-height: 1.05; margin-bottom: 9px }',
      '.lexflowDashCount > strong small { color: var(--lexflow-dsw-alias-label-secondary); font-size: 12px; font-weight: 500; letter-spacing: 0; margin-left: 5px }',
      '.lexflowDashCount > div { color: var(--lexflow-dsw-alias-label-secondary); display: flex; font-size: 12px; gap: 13px }',
      '.lexflowDashCount b { color: var(--lexflow-dsw-alias-state-business-primary); font-weight: 600 }',
      '.lexflowDashRateRow { align-items: center; display: flex; gap: 14px }',
      '.lexflowDashRing { align-items: center; border-radius: 50%; display: flex; flex: none; height: 58px; justify-content: center; position: relative; width: 58px }',
      '.lexflowDashRing::before { background: var(--lexflow-dsw-alias-bg-layer-1); border-radius: inherit; content: ""; inset: 7px; position: absolute }',
      '.lexflowDashRing span { font-size: 11px; font-weight: 650; position: relative }',
      '.lexflowDashRateRow strong { display: block; font-size: 24px; letter-spacing: -.02em; line-height: 1.05 }',
      '.lexflowDashRateRow small { color: var(--lexflow-dsw-alias-label-secondary); display: block; font-size: 11px; margin-top: 4px }',
      '.lexflowDashHealthRow { align-items: center; display: grid; gap: 7px; grid-template-columns: 8px 1fr auto; min-height: 22px }',
      '.lexflowDashHealthRow span { font-size: 12px }',
      '.lexflowDashHealthRow small { color: var(--lexflow-dsw-alias-label-secondary); font-size: 11px }',
      '.lexflowDashDot { background: var(--lexflow-dsw-alias-label-caption); border-radius: 50%; height: 7px; width: 7px }',
      '.lexflowDashDot.good { background: #4ca76a } .lexflowDashDot.warn { background: #d9a441 } .lexflowDashDot.muted { background: var(--lexflow-dsw-alias-label-caption) }',
      '.lexflowDashDistribution { margin-bottom: 12px }',
      '.lexflowDashBarRow { align-items: center; display: grid; gap: 10px; grid-template-columns: 155px 1fr 54px; min-height: 33px }',
      '.lexflowDashBarRow > span { font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }',
      '.lexflowDashBarRow small { font-size: 11px; text-align: right }',
      '.lexflowDashTrack { background: var(--lexflow-dsw-alias-bg-overlay); border-radius: 5px; height: 10px; overflow: hidden }',
      '.lexflowDashTrack i { background: var(--lexflow-dsw-alias-state-business-primary); display: block; height: 100% }',
      '.lexflowDashRecentRow { align-items: center; border-top: 1px solid var(--lexflow-dsw-alias-border-l1); display: grid; gap: 9px; grid-template-columns: 34px minmax(0, 1fr) auto; min-height: 31px }',
      '.lexflowDashRecentRow:first-child { border-top: 0 }',
      '.lexflowDashRecentRow > span { background: var(--lexflow-dsw-alias-state-business-tertiary); border-radius: 4px; color: var(--lexflow-dsw-alias-state-business-primary); font-size: 10px; padding: 2px 4px; text-align: center }',
      '.lexflowDashRecentRow > strong { font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }',
      '.lexflowDashRecentRow time { color: var(--lexflow-dsw-alias-label-secondary); font-size: 11px }',
      '.lexflowPlainButton { background: transparent !important; border: 0 !important; box-shadow: none !important; color: var(--lexflow-dsw-alias-label-primary); cursor: pointer; font: inherit; padding: 6px 9px; border-radius: 7px }',
      '.lexflowPlainButton:not(:disabled):hover, .lexflowPlainButton:not(:disabled):focus-visible { background: transparent !important; color: var(--lexflow-dsw-alias-state-business-primary); outline: none }',
      '.lexflowPlainButton:disabled { cursor: default; opacity: .5 }',
      '.lexflowNavItemActive { font-weight: 600; position: relative }',
      '.lexflowNavItemActive::before { background: var(--lexflow-dsw-alias-state-business-primary); border-radius: 999px; bottom: 7px; content: ""; left: 3px; position: absolute; top: 7px; width: 3px }',
      '.lexflowModelCard { background: var(--lexflow-dsw-alias-bg-layer-1); border: 1px solid var(--lexflow-dsw-alias-border-l2); border-radius: 14px; margin-bottom: 10px; overflow: hidden }',
      // 双栏各自独立滚动：选中左栏底部服务商时右栏配置不被顶出视野；右栏切换后由组件复位到顶部。
      '.lexflowModelLayout { align-items: stretch; display: grid; gap: 18px; grid-template-columns: minmax(170px, 218px) minmax(0, 1fr); height: min(560px, calc(100vh - 260px)); min-height: 280px }',
      '.lexflowModelNav { display: flex; flex-direction: column; gap: 2px; min-width: 0; min-height: 0; overflow-y: auto; padding-right: 4px }',
      '.lexflowModelNavItem { align-items: center; background: transparent; border: 0; border-radius: 8px; color: var(--lexflow-dsw-alias-label-primary); cursor: pointer; display: flex; font: inherit; font-size: 13px; gap: 8px; justify-content: space-between; min-height: 34px; padding: 6px 10px; text-align: left; width: 100% }',
      '.lexflowModelNavItem:hover, .lexflowModelNavItem:focus-visible { background: var(--lexflow-dsw-alias-interactive-bg-hover); outline: none }',
      '.lexflowModelNavItem[data-selected="true"] { background: var(--lexflow-dsw-alias-state-business-tertiary); color: var(--lexflow-dsw-alias-state-business-primary); font-weight: 600 }',
      '.lexflowModelNavName { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }',
      '.lexflowModelNavAdd { align-items: center; background: transparent; border: 0; border-radius: 8px; color: var(--lexflow-dsw-alias-label-secondary); cursor: pointer; display: flex; font: inherit; font-size: 12px; gap: 8px; justify-content: flex-start; margin-top: 8px; min-height: 32px; padding: 6px 10px; text-align: left; width: 100% }',
      '.lexflowModelNavAdd:hover, .lexflowModelNavAdd:focus-visible { background: var(--lexflow-dsw-alias-interactive-bg-hover); color: var(--lexflow-dsw-alias-label-primary); outline: none }',
      '.lexflowModelNavAdd[data-selected="true"] { background: var(--lexflow-dsw-alias-state-business-tertiary); color: var(--lexflow-dsw-alias-state-business-primary); font-weight: 600 }',
      '.lexflowModelPane { background: var(--lexflow-dsw-alias-bg-base); border: 1px solid var(--lexflow-dsw-alias-border-l1); border-radius: 12px; min-width: 0; min-height: 0; overflow-y: auto; padding: 16px 18px 18px }',
      '.lexflowModelPaneHead { align-items: center; display: flex; gap: 10px; justify-content: space-between; margin-bottom: 12px }',
      '.lexflowModelPaneHead strong { font-size: 15px; font-weight: 650 }',
      '.lexflowModelPaneBody { min-width: 0 }',
      '@media (max-width: 720px) { .lexflowModelLayout { grid-template-columns: minmax(0, 1fr) } .lexflowModelNav { flex-direction: row; flex-wrap: wrap; position: static } .lexflowModelNavItem, .lexflowModelNavAdd { width: auto } }',
      '.lexflowModelCardHead { align-items: center; background: none; border: 0; color: var(--lexflow-dsw-alias-label-primary); cursor: pointer; display: flex; font: inherit; gap: 12px; justify-content: space-between; padding: 14px 16px; text-align: left; width: 100% }',
      '.lexflowModelCardHead:hover { background: var(--lexflow-dsw-alias-interactive-bg-hover) }',
      '.lexflowModelCardHead strong { font-size: 15px; font-weight: 650 }',
      '.lexflowModelStatus { color: var(--lexflow-dsw-alias-label-secondary); font-size: 12px }',
      '.lexflowModelChevron { color: var(--lexflow-dsw-alias-state-business-primary); font-size: 12px; flex: none }',
      '.lexflowModelCardBody { border-top: 1px solid var(--lexflow-dsw-alias-border-l1); padding: 14px 16px 16px }',
      '.lexflowModelModes { display: flex; gap: 6px; margin-bottom: 12px }',
      '.lexflowModelModes button, .lexflowModelModeActive { background: var(--lexflow-dsw-alias-interactive-bg-hover); border: 1px solid var(--lexflow-dsw-alias-border-l2); border-radius: 999px; color: var(--lexflow-dsw-alias-label-secondary); cursor: pointer; font: inherit; font-size: 12px; padding: 5px 12px }',
      '.lexflowModelModes .lexflowModelModeActive { background: var(--lexflow-dsw-alias-state-business-tertiary); border-color: var(--lexflow-dsw-alias-state-business-primary); color: var(--lexflow-dsw-alias-state-business-primary); font-weight: 600 }',
      '.lexflowModelCodex, .lexflowModelPlaceholder { background: var(--lexflow-dsw-alias-bg-module-platform); border-radius: 10px; color: var(--lexflow-dsw-alias-label-secondary); padding: 12px 14px }',
      '.lexflowModelCodex p { font-size: 13px; line-height: 1.6; margin: 0 0 10px }',
      '.lexflowModelPrimary, .lexflowModelSecondary { border-radius: 999px; cursor: pointer; font: inherit; font-size: 12px; padding: 7px 13px }',
      '.lexflowModelPrimary { background: var(--lexflow-dsw-alias-state-business-primary); border: 0; color: #fff }',
      '.lexflowModelSecondary { background: none; border: 1px solid var(--lexflow-dsw-alias-border-l2); color: var(--lexflow-dsw-alias-label-primary); margin-top: 10px }',
      '.lexflowModelCustomSelect { display: flex; flex-direction: column; gap: 12px }',
      '.lexflowModelSelect { background: var(--lexflow-dsw-alias-bg-layer-1); border: 1px solid var(--lexflow-dsw-alias-border-l2); border-radius: 8px; color: var(--lexflow-dsw-alias-label-primary); height: 34px; padding: 0 10px }',
      '.lexflowModelHint { color: var(--lexflow-dsw-alias-label-tertiary); font-size: 12px; line-height: 1.6; margin: 0 }',
      'input[type="checkbox"] { accent-color: var(--lexflow-dsw-alias-state-business-primary) }',
      '::selection { background: color-mix(in srgb, var(--lexflow-dsw-alias-state-business-primary) 26%, transparent) }',
      ':focus-visible { outline: 2px solid color-mix(in srgb, var(--lexflow-dsw-alias-state-business-primary) 62%, transparent); outline-offset: 2px }',
      'input[type="checkbox"]:focus-visible, button:focus-visible, input:not([type="checkbox"]):focus-visible, textarea:focus-visible, select:focus-visible { outline: none }',
      'input[type="checkbox"]:focus-visible { box-shadow: 0 0 0 3px color-mix(in srgb, var(--lexflow-dsw-alias-state-business-primary) 30%, transparent) }',
      'button:focus-visible, input:not([type="checkbox"]):focus-visible, textarea:focus-visible, select:focus-visible { box-shadow: 0 0 0 3px color-mix(in srgb, var(--lexflow-dsw-alias-state-business-primary) 24%, transparent) }',
      '::-webkit-scrollbar { width: 10px; height: 10px }',
      '::-webkit-scrollbar-thumb { background: var(--lexflow-dsw-alias-scrollbar-bg-l1); border: 3px solid transparent; border-radius: 999px; background-clip: content-box; min-height: 32px }',
      '::-webkit-scrollbar-thumb:hover { background-color: var(--lexflow-dsw-alias-scrollbar-hover-l1) }',
      '::-webkit-scrollbar-track, ::-webkit-scrollbar-corner { background: transparent }',
      '@media (prefers-reduced-motion: reduce) { button:active { transform: none } .lexflowDialogPanel, .lexflowPageMain { animation: none } button, input, textarea, select, summary { transition-duration: 0s } }'
    ].join('\n')
    const LEXFLOW_TYPOGRAPHY_CSS = [
      ':root { --lexflow-content-font-size: var(--lexflow-dsh-content-font-size, 14px); --lexflow-content-font-delta: var(--lexflow-dsh-content-font-delta, 0px); }',
      '.lexflowPageMain { max-width: 860px; margin: 0 auto; width: 100%; font-size: var(--lexflow-content-font-size); line-height: calc(24px + var(--lexflow-content-font-delta)); }',
      '.lexflowPageMain p, .lexflowPageMain li { line-height: 1.7 }',
      '@media (max-width: 860px) { .lexflowDashTop { grid-template-columns: 1fr } .lexflowDashBarRow { grid-template-columns: 120px 1fr 48px } }'
    ].join('\n')
    const LEXFLOW_INTERACTION_CSS = [
      '.lexflowModelCardHead { -webkit-appearance: none; appearance: none; border-radius: 13px; overflow: hidden; transform: none !important; }',
      '.lexflowModelCard:has(.lexflowModelCardBody) .lexflowModelCardHead { border-radius: 13px 13px 0 0; }',
      '.lexflowModelCardHead:active { background: var(--lexflow-dsw-alias-interactive-bg-hover) !important; transform: none !important; }',
      '.lexflowModelCardHead:focus-visible { box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--lexflow-dsw-alias-state-business-primary) 44%, transparent) !important; }',
      // 对话区工具调用行的报错文字：底座的红色（state-error-primary）在 LexFlow 暖色界面里过于刺眼，
      // 统一改为主题色。只覆盖工具行文本（errorSummary 类与 ioText[data-error]），
      // 删除按钮、凭证红点等真正的错误指示保持红色不变。哈希类名前缀随构建变化，故用后缀匹配。
      '[class*="errorSummary"] { color: var(--lexflow-dsw-alias-state-business-primary) !important; }',
      '[class*="ioText"][data-error] { color: var(--lexflow-dsw-alias-state-business-primary) !important; }'
    ].join('\n')
    async function api(action, payload = {}) {
      const response = await fetch('/lexflow-api', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, ...payload }) })
      const data = await response.json()
      if (!response.ok || !data.ok) throw new Error(data.error || '操作失败。')
      return data.value
    }
        function LexFlowMark({ size }) { return jsx('img', { alt: 'LexFlow', src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAASNklEQVR42tWbeZxcVZXHv+e+raq39JLurIQEAoQtENZAIKAoxgAaBHEUBhiHkRlFET4YBnQWB50xMh9cUEBFMSCyj+AgwjCASGQTshjJSoAQguklCel0dy3vvXvmj1dVXb2mutPx49QnS3V1vffuPed3zvmd5UoYhhRfAij/P16VrlVEUNVBrxXA7O0iKn/pKK/re7mU/Sgy2Jqk73NUh1yJFgUg/aRSyUKH0oCU/R1KXDoaQQ7ypUH2hpbdXStAidt/QUO9rxR+WokmZYTXjPK7lZiJGTUadV+YyV7cqwgHHZmwzL52ADpaiQxju0N4u1FJ3FQm3b3T7qhQIGOJnQoEoKPYge4Du/1zhM9hTUCGCStjqW0ZFPXaN2ZrX1OQfYmAobU1Mv2NBhVqFWstjuNijMHGcdmOZUyQJEPcY48+YF/DV1XxfA/f98l2d2HjCD8IACWOImIbY+N4AJsbJY8aKJhyKvznftk4xnEc2rf9qfHmb3x1+/rX/oDrp/jQOefyN1dcNUAn+VwOMQYZQwcp+zoXGOqecRQRpFIAXH7+Qn33989w8qRabBzz8vY8s8/6JLMOOwzH9Zg6/QAOPeoYaWqZgKoShSFizNDhcwQCqhgB0o/I6SiZl7UWYwyu67Kzo507b/2OPnn3j7h4PwcbxbwVeeQwPL+th+58hAEc16WxeQLvO3sRF19xjdTVN5DP5TCOM7YI2Fc2Xv7e933CfJ5H7/uZ/vy2b/PuO1uY1lTHpxq6eXxXipXdLrWuknIdLIVMTiGKQro6dzHz8NnccNtdB0+dPmNjLpfFcdy/LAGoKmptkmkZg+M4mDK4rl21Qn9267d55blnsHFiBrnIMqc6JLTwWsbFF1AR1GqCZhFQxXMdOnftYsqMmdx098Ne88RJUaVIkCGSMDOGOycuODU/CAiCAM/zyGZ66Gjdxta3N09/Y8P601cvf5kglaJxfDOu6xJHMS6WFV0ur2cdXBRbEmLyHlUUJfRrqGueyNY3X+faT38i3PLmpkM93+8Nm0NymcFNU8cKAUkMd3Ach57uLpY//5yueOE53li3ho62bXTv7iSfy2FtjOt6ZHq6EQHX9VDVRBMiidbVJn6sQIcFMI5DPpvhrd0RDYGhuSZNLgyZfeI8Fv/Hd6paJk3KhGE4MDpU4BBLAiivnIwkGtg4xg8Cctksj9x9hz56z1Le3rSBOI5xPQ/XdTHGwZjeKoEYA9qbuxc3a0QKGreICMY4xNbS1fke+8+cxalnLuTI4+bS0DKBhqbmul07d5z5+EP3PnjKBxdw9InzpJdAScWp+PAIGEaCAsSFza9dtVxv+so1rFv5CqmqKvwglWhDk5KEau+9NNl5n6iiqogRpOD0VBXXdRPUABd+9irOv/Ryqamr67OGZx9/VK84/xxOX7iQ7973qAwbHocqiMhwTGkY+BQ3//SjD+uSxVeQz2VpaGomjiNsHJfgWJJDvxRXC6iTIt4LiNAC5HO5HEG6in+++XaOP+V0sbEll82WkKpqOW3B2XLGRxfpRz55SfI5OuJ8wdUKy1zab/NBEPDMrx7RG668jMAPqK6pJYp6zam3JjfwelUtIUTLcVn43MYxiPBvty5lztx5ks1kcFw3MRPHwXWT0Lfy5Re0eeJk5i84W6IowhhnxGh2K+HL2s/hBUHAuj+s0CWLryCVSuG43gBPTJk++tQcjcEpLKQYMssRZxyH93bu4NNXX99380AQBFhrWbvyVV3x0vNsWvsal11z/UQjQhzHw8N/KFMeURQoSDGfy/H5jy/UtzaspaqmhjiKSlpP4DnweapKmM8ThnniOMYYg+/7+Kl0WQYoxDamqraOHz/6rNQ3NRGFIa7nYYzhgTt+oE88dC9NzS28/5yPcfpZiyQIAgaNAJWawEjDnR8E3PW9m3T96hU0jm8mKgiwGEG05Ox6vbuqIo7DlBkHMnX/A6gf30ymu4u3Nq7j7TdeJ5fpoaa2Dtdz6Xqvk+Pmv5/G5mZy2SyulzjD6z9zkXbv7uRzX7mBOXNPkaIphvn8iB3foAKQ8mKnDJW2+mzbuqXx4btup3ZcfUnz5XQ3+blo/MnvjOMw9YCDmDHzEJpaJjBp2nRmzZ5z1v4zD36sdeuWgx684wcbHn/w50m2J8KMg2aVDE/E4bq/+7hW1dRy010PCUCYzyf3NU7fzRfXMQI0uAPsXIaO9+J5PHb/3dt3tLdS39hU8vbWJnG7v+cvhjhUeXvjOtavepUoDBM/kk7/6tCjjuXSKxfzxa8ukTM+cp7e+I9XsnbVqzQ1TwCEIJXivttv0R3t7XzrZ7+QKIpKbFMGc3DlD5bKigSm0sqB63nksll++8Sj+EEKtckXM5keXN8vxW+1tqy0lbhBtRYRqK6po76xicbxzaTTVaxd+QpXX7iIm/7pS3rksSfIkjvunzhh8jQymW4AunZ38st7lrL4G98uRR+nwPvVWjSO0ChCbYzGUZkgKqzmyGAVIRma6m5at0a3vrmJVDqNVUt3127OWHQBDU0tpRBYHuZMORQVtFDdsQXPX11TQ31jEw/8+Ba+ed0XddLU/VqvvfFmdrS3AfDSs0/p/jMP5vA5x0k+l0s2r4rGMY7v4wUpvFQq+T9IgTFl/QGtiM8ONIHBOjeaLHjDH1eRzfSQrq5mZ0c7i2/8PnEU8dh9d9HQ2ISNIlR6G3e2zDFKGfkpkn0bJ78f3zKBh++8naNPPEXPXHS+5HI5BViz8lU+cM55pU2pjXG8ACOwe+tbtC3/rXa+uQ5VpeGQo9nvfYtEPA8t8IhKaL1bWVk3+fDtNzbiuC67du7gssX/wjnnni8XLZiv6XS6lAKDgCR2X3p4aTFlWlEpQbbgE7j3hzdz2oKzOXH++yWXyxGFIcecPF9sQTOenyKzvY3Xbv+avv3kA2R3tCEKtkCeJs9boKcuuVecqurERAvRaDgiZEZSDdrZ0U737k7mLfgIl3zms/LIDVfpzp078H2/pKXEBKXMiwu9y+htnapqSRzWWtLpKja/vo6Na1ZrbV0d21u3TZlx8KHUNzYSZjP4QYr2VS/q//7tabrh3u8R57OkxjUR1DeRrm+kevxEtj77OBt/8RN1HBe1cUVEyFSy8aJ3797dSVV1NVf86zerNj/yE21bvwrrBKi1ZXDvvbo3CvRdh6IFp927KGMMYS7HO29uQlXp6uqae8zJ84+ycUSQrmLrssf1N58/i+5tbxM0tmAcF2vjxK9EERpHuFU+7St+W0CdGZrWloVtd7iMr7/t9HR3Me/Mc5g8oSXzq/tvY1zjNIIgQ67bYlzTeyvt16yWMresBRQIJZgWc4CipxcRJk6Z8lAqCDCOy9bnfq3Lrv0EIoKXrsZGYcnJFh2uSCLEfOfOZB1mD819LUaBCkhDkehU19Qxf+Eiop1tdGx4jYl1VUyash/5fD4hJf2gkwhECo/Q4h+Ka5MyaVlrcVyP5omTAUgVaPK7Lz6lz1/3qWTDnofGUWJExSyyRMGTf4zr91PCMAMMqiMriR102BFMO3gW721aqzayRO1bOOMDHyQXhhhjSuga0OIqw395E7eoReM4xFHI+ImTOPjIoyQO8/jpKlpfXaa/u/YTqFqM50GBcPUhQKXcQ9A4JtU0ocQ9hp2kKCZfVDhnAzD7+JOoH9/idbW9gxs4tK5ZwQkHTuXkD5/L9rZteL7f+7xyG9c+Qi+bUUkW73kenbveY+EFF1Hf0IDj+bQuX6bLvnQ+Nszj+EHvTQsIihCymrhbMYWcw8aMO+DQgQY8DMorE4AxWGuZddTR0tTYFOW6dmMAFYfX7/8+1y/5jhx05DFsb2vFdd2EqorBmILGJeGE2t8PieB6Hh1trcw+YR4XfPrvBYR3n39Sn7v6Y8T5DI6fQm1cahPaglPdHHuJgBOvilqL4/mMP3LunlupZY7QVDILlOQClqqqGgLXIG5CfYPacbzz4lO0P/ZTvfnhp+TkMz7Ee9s7yGV6Ets3DqZQFjfGYBxTKp46rkscx3S0buPI407ka7fdKdW1dWz65VJd9qWPY6McjheAFqpLBb9V7cCa0Mcq1IjFFjx+nM9Svd9Mmo44QWJr+yVJg/kBKUaBgmPeUzGk6LWBqpYpGM8HG5Gqb+Llby3m1PGT9JtLH5THH7xH/2vpD9m09jXyuWyCCNctmINgbUyxBtEyaTIXXPY5Lr36OjE25pWbFuvGe76LV1Wd1AhsL6OzCjVGWZ0P2Jz3OKumm5wVRC3iuISZbiadchZ+dQ1hLov0aZiUheJ+5jBoQUSGoMZqLa7vs3vrZv7n4rlKlANJihlhLsucL3yDwy66UgCWv7BMX33uad5cv4Yd7W1kenowxlBbX8+0Aw5i9txTOenMs6W2KkXry8/oiu99mR1/fIlgXGPiM9QWIJ88vsqFlRmflzIB59f1UCsxUdnerLV84I7fScOBhxKHYZIX9HGCMijUhxeADjI/p4pxXJ7+7ALtWP4sTlVtUrtXS8/u95g8byGHX3INE447rc/jooK9lTud1pee0jX33kLr879GALe6FmwS5mxhY0HhgmWZNCt6PM4b18MUNyKnglFFXI/MznYOPO9yTvzyLRLmckj/TtEw6fEeSmIDr9Q4wgtSrH/wR/ry1y+nprGZHWHC+yd6yq7OTtS4NBwym6Yj5lJ/0BFUT5yGm6oi7uli99Y32LF2BR1/fJHuzRtQtXjV45KegO2t6zsorhG2RQ6/6UrRFgnnjsswzY3IxOAYEDFEUYhTVceZS5+XqpbJ2Cjqq/2R9gWkT+gctLiHGEPU08UTF5+smbYteH7AyqyHQTk6HeFg6enJJB1cEcT1EGMK+XvC4pxUGsdPF0hQjCA4Aq4kz+yIDKuzPqsyPnVOzNnjskxwYrIqOL38mczO7Zz073dzwIf/anDtD+XUZC+ao0UUbPrvu/TFf76EVP14sDHLMinezRuOqw6Z7sdUOUl5LLZagrSWFU9FLS6aUFqUbjW0Rg6bci4bcx49Fo6siji9NkdgLTlbxiJdj0xHK7MuWcyxVy8pbX6kMw576AwNOc0Eqjiez3PXflK3PHk/6YZmPEL+kPH5XZePb2CGFzLFt9Q7MWksvijGJEKxClkVutWwM3Zoix225oT2yEFFmOrHHJ/OcYAfEdnipgqsz/XIbm9j+sILOenrd4qNo15+K2M5ITKYALQYEi3GMeQ7d/H0P3xIOzetxq9rILAhu6zwSo/PuqxHjxU8gWpjqXLAKZTJYoRuK/TEkNeEJFUZZYofc2g6ZoYX4aolr8VkKbF5ROjZ0c70D3+Kk2/4qSQM0A5t93sYd+1tjo5kKKoQVlRjXD+ga+tmfvOFc7TrrbX49eORKI8rSpc6vBM6bMk7dMSGrtgQasIKjYCHkjaWBkeZ6MVMDSxNJsZFyVvB0pusiOMSh3nC7k4OufCLzLnqRlG1hYKsGVjw2FNhtL8AhhsqGHY4Oo5xg4Cetnd54fq/1rbfP41f34SKwdgI30m0GyJkrJBTwRayOV8gJYpvFAeIFSIFWwiXgiQ0HMjv3olf18icLyzhwEWXShSGvSW2ETZ2RtwZGmq6osTtbYzjB9h8jtW3flU33HszcT6ThDfXReMYQTHlBdtCImRVUTFgDIKiVjHGJFHDxoQ9XQBMPvUsZl/xdamfMYswnyuZQ5/JbRn5UOdAAejoRjK1wL9d16Vj9cu6Zul/su2FJ4h6duMEaRw/wLheqQYoZVpRJGmPC8T5PFEui0Y5vHQtLcfOZ+YFn2PKKQtEgag81A1B1AZoeUznBIcTUKEv4AUBANvXLGfLkw9o6++fZveWTUQ9nWVNVOlTdRYRHNfDrRlH7f6HMOH405l62kel8fBjESAK84VKj9lrZe3zKbFiMcL1/WTx+ZCud16n86312r31TbIdfyLXtQusxbgefm096ZbJ1Ew9kLrph0jV5Ok4hQJLHIaJgIwzNpvud/2oBFAx2bA2Wbzj4bhOReu2UCpyImavGp97pMFFAYzlhOig9yqWyAZ0a2QgPy2Myoz4vMAQGV9FjZGxPIczaBZZ1jjdJy8tDPbLwLXt1Zmhwc4K6Eg6KX+eQx99Kt17mn6XvT0zJIzBgYlRHzmrHJY62gMTQ53Bq/TGujdSlH1/ilP3BgGytxrTv7yDRWavIokM7LWNWkvCmB+Kkn1xbnBQIVTi4XUfH5wcwcnXPQpARrgX2WeHB3VMZSiVRoGxNO29d+9jSxf6r+T/AAe3Lydcx9Y0AAAAAElFTkSuQmCC', style: { height: size + 'px', objectFit: 'contain', width: size + 'px' } }) }
    function EmptyAgentPreset() { return null }
    function LexFlowName() { return jsx('span', { style: { letterSpacing: '.04em' }, children: 'LexFlow' }) }
    const NAV_ICONS = {
      conversation: jsx('svg', { fill: 'none', viewBox: '0 0 16 16', xmlns: 'http://www.w3.org/2000/svg', children: jsx('path', { d: 'M8 3.2v9.6M3.2 8h9.6', stroke: 'currentColor', strokeLinecap: 'round', strokeWidth: '1.5' }) }),
      workflow: jsxs('svg', { fill: 'none', viewBox: '0 0 18 18', xmlns: 'http://www.w3.org/2000/svg', children: [jsx('rect', { x: 2.5, y: 2.5, width: 5, height: 5, rx: 1.2, stroke: 'currentColor', strokeWidth: '1.25' }), jsx('rect', { x: 10.5, y: 10.5, width: 5, height: 5, rx: 1.2, stroke: 'currentColor', strokeWidth: '1.25' }), jsx('path', { d: 'M7.5 5H11a2 2 0 0 1 2 2v3.5M5 7.5V13h5.5', stroke: 'currentColor', strokeLinecap: 'round', strokeWidth: '1.25' })] }),
      archive: jsx('svg', { fill: 'none', viewBox: '0 0 16 16', xmlns: 'http://www.w3.org/2000/svg', children: jsx('path', { d: 'M2.6 4.6c0-.9.7-1.6 1.6-1.6h2.2l1.4 1.7h4c.9 0 1.6.7 1.6 1.6v5.1c0 .9-.7 1.6-1.6 1.6H4.2c-.9 0-1.6-.7-1.6-1.6V4.6z', stroke: 'currentColor', strokeLinejoin: 'round', strokeWidth: '1.4' }) }),
      workbench: jsx('svg', { fill: 'none', viewBox: '0 0 16 16', xmlns: 'http://www.w3.org/2000/svg', children: jsx('path', { d: 'M13.2 4.6a3.6 3.6 0 0 1-4.9 4.3l-4 4a1.35 1.35 0 0 1-1.9-1.9l4-4a3.6 3.6 0 0 1 4.3-4.9L8.9 4.9l2.2 2.2 2.1-2.5z', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: '1.35' }) })
    }
    function LexFlowNavigation({ wide, startSession }) {
      const [active, setActive] = React.useState('conversation')
      React.useEffect(() => { const listener = (event) => setActive(event.detail?.page || 'conversation'); window.addEventListener('lexflow:navigate', listener); return () => window.removeEventListener('lexflow:navigate', listener) }, [])
      if (!wide) return null
      return jsx('nav', { 'aria-label': 'LexFlow 一级导航', style: { display: 'grid', gap: '2px', margin: '2px 2px 9px' }, children: pages.map(([page, pageLabel]) => jsxs('button', { type: 'button', title: pageLabel, className: active === page ? 'lexflowNavItemActive' : undefined, onClick: () => { if (page === 'conversation' && typeof startSession === 'function') { const event = new CustomEvent('lexflow:navigate', { cancelable: true, detail: { page, startNew: true, afterNavigate: startSession } }); if (window.dispatchEvent(event)) startSession(); return } window.dispatchEvent(new CustomEvent('lexflow:navigate', { detail: { page } })) }, style: { alignItems: 'center', background: active === page ? 'var(--lexflow-dsw-alias-interactive-bg-hover, rgba(0,0,0,.06))' : 'transparent', border: 0, borderRadius: '7px', color: 'var(--lexflow-dsw-alias-label-primary, inherit)', cursor: 'pointer', display: 'flex', font: 'inherit', fontSize: '14px', gap: '9px', justifyContent: 'flex-start', minHeight: '30px', padding: '0 10px', textAlign: 'left', whiteSpace: 'nowrap', width: '100%' }, children: [jsx('span', { className: 'lexflowNavIcon', style: { color: active === page ? 'var(--lexflow-dsw-alias-state-business-primary)' : 'var(--lexflow-dsw-alias-label-tertiary)', display: 'flex', flex: 'none', height: '16px', width: '16px' }, children: NAV_ICONS[page] }), pageLabel] }, page)) })
    }
    function goWorkbench(document) { window.dispatchEvent(new CustomEvent('lexflow:navigate', { detail: { page: 'workbench', document } })) }

    // "性能与用量"的显示策略（2026-09-27 定稿）：不再另设"关闭"开关。
    // 简洁档 = 输入区不显示统计；详细档 = 仅显示图标（点开看详情）。
    // 由适配层按底座设置 performanceUsage 的值直接处理，此处无需任何界面。

      const inject = ['lexflow']
      function apply(runtime) {
        const slots = runtime.ui.slots
        const theme = runtime.ui.theme
        const disposeHostSurface = runtime.ui.compatibility.installHostSurface()
        runtime.lifecycle.effect(() => {
          const disposeOverride = theme.overrideTokens('lexflow-appearance', LEXFLOW_TOKENS)
          const style = document.createElement('style')
          style.dataset.lexflowAppearance = 'true'
          style.textContent = LEXFLOW_MOTION_CSS + '\n' + LEXFLOW_DENSITY_CSS + '\n' + LEXFLOW_TYPOGRAPHY_CSS + '\n' + LEXFLOW_INTERACTION_CSS
          document.head.appendChild(style)
          return () => { disposeOverride(); style.remove(); disposeHostSurface() }
        }, 'lexflow-ui-shell: palette and interaction')
        slots.inject('sidebar.brand.mark', () => slots.inject('sidebar.brand.name', () => slots.inject('conversation.hero.brand.mark', () => slots.inject('conversation.hero.agentPreset', () => slots.inject('sidebar.lexflow.nav', function* () {
          yield slots.register({ name: 'sidebar.brand.mark' }, LexFlowMark)
          yield slots.register({ name: 'sidebar.brand.name' }, LexFlowName)
          yield slots.register({ name: 'conversation.hero.brand.mark' }, LexFlowMark)
          yield slots.register({ name: 'conversation.hero.agentPreset', priority: -1 }, EmptyAgentPreset)
          yield slots.register({ name: 'sidebar.lexflow.nav' }, LexFlowNavigation)
        })))))
      }
      return { apply, inject }
    })()
    const inject = ['lexflow']
    function apply(ctx) {
      const adapter = ctx.get('lexflow')
      const WorkspacePage = ({ page, document }) => {
        const Page = adapter.ui.pages.get(page)
        return Page ? jsx(Page, { page, document }) : null
      }
      adapter.ui.mountShell(WorkspacePage)
      ui.apply(adapter)
    }
    exports.inject = inject
    exports.apply = apply
    return module.exports
  },
})
