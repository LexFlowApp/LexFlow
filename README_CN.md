<h4 align="right"><a href="README.md">English</a> | <strong>简体中文</strong></h4>

<p align="center">
  <img src="assets/lexflow.svg" alt="LexFlow" width="138" />
</p>

<h1 align="center">LexFlow</h1>

<p align="center"><strong>Everything is Workflow</strong></p>

<p align="center">
  <a href="https://lexflow.tech">官方网站</a> ·
  <a href="#安装">安装</a> ·
  <a href="#开发">开发</a> ·
  <a href="#许可证">许可证</a>
</p>

<p align="center">
  一个以 DeepSeek Harness 为底层执行引擎、面向法律工作流程的独立 macOS 桌面应用。
</p>

![LexFlow](assets/lexflow-master.png)

## 特性

- 🧭 **四个工作模块**：对话、标准规范、档案室和工作台统一在一个窗口中。
- 🏠 **本地优先**：标准规范和 Markdown 文件保存在用户可见的 LexFlow 工作目录。
- 🔒 **仅限本机**：只监听 `127.0.0.1` 的空闲端口，并显式关闭遥测。
- 🔌 **模型自选**：DeepSeek、GPT、Kimi、GLM 官方接口填 Key 即用，也支持自定义 OpenAI 兼容端点。

## 安装

### 下载安装包（推荐）

从 [lexflow.tech](https://lexflow.tech) 下载最新 DMG，拖入「应用程序」。首次打开如遇安全提示，前往「系统设置 → 隐私与安全性」放行（当前版本为 ad-hoc 签名）。

### 从源码构建

环境要求：macOS、Node.js 22.12 或更高版本、pnpm 10，以及 Xcode Command Line Tools。

```bash
git clone https://github.com/LexFlowApp/LexFlow.git
cd LexFlow
pnpm install --frozen-lockfile --config.block-exotic-subdeps=false
pnpm package
```

构建产物位于 `dist/forge/LexFlow-darwin-arm64/LexFlow.app`。

## 开发

```bash
pnpm dev
pnpm test
pnpm package
```

LexFlow 使用独立的运行数据目录（`~/Library/Application Support/LexFlow`），不读取现有 DeepSeek Harness 的用户目录与凭据。

DeepSeek Harness 目前仍处于开发者预览阶段，可能出现破坏性变更，因此本项目在 `package.json` 中锁定了其版本。

## 许可证

[MIT](LICENSE)。DeepSeek Harness 及其资源仍受各自的上游许可证和商标政策约束。
