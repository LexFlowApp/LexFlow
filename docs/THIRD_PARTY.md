# 第三方依赖清单

LexFlow 使用的主要第三方组件：

- `@deepseek-ai/dsh@0.1.7-alpha.1`：对话执行引擎及其官方配套组合包（MIT），遵循其随包许可证。
- Electron：桌面外壳运行时。
- React、React DOM：界面层。
- `@earendil-works/pi-ai`（MIT）：模型接入层，内置 DeepSeek、OpenAI、Moonshot AI（Kimi）、智谱等提供商。
- Electron Forge、Electron Vite、Vite、TypeScript：构建和打包工具链。

LexFlow 自有的 `dsh-plugins/lexflow-dsh-adapter`、`dsh-plugins/lexflow-ui-shell`、`dsh-plugins/lexflow-ui-pages`、`dsh-plugins/lexflow-archive`、`dsh-plugins/lexflow-workbench` 和 `dsh-plugins/lexflow-workflow` 不是第三方依赖；它们在 `dsh-plugins/manifest.json` 中作为自有插件装配。工作流插件内部保留当前 DeepSeek Harness 版本的兼容实现，但不覆盖 DSH 的包名。

完整依赖版本记录在 `package.json` 与 `pnpm-lock.yaml`。上游许可证随依赖包保留；本项目源代码沿用 MIT 许可证声明。
