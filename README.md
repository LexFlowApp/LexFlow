<h4 align="right"><strong>English</strong> | <a href="README_CN.md">简体中文</a></h4>

<p align="center"><img src="assets/lexflow.svg" alt="LexFlow" width="138" /></p>

<h1 align="center">LexFlow</h1>

<p align="center"><strong>Everything is Workflow</strong></p>

<p align="center">
  <a href="https://lexflow.tech">Website</a> ·
  <a href="#install">Install</a> ·
  <a href="#development">Development</a> ·
  <a href="#license">License</a>
</p>

LexFlow is a local-first macOS desktop application for legal work. It combines conversation, standards, an archive, and a Markdown workbench in one independent application while using [DeepSeek Harness](https://www.npmjs.com/package/@deepseek-ai/dsh) as an isolated execution engine.

![LexFlow](assets/lexflow-master.png)

## Features

- **Four work modules** — conversation, standards, archive, and Markdown workbench in one window.
- **Local-first** — standards and Markdown files live in a user-visible workspace folder.
- **Private by design** — only listens on `127.0.0.1` on an idle port; telemetry explicitly disabled.
- **Model choice** — DeepSeek, GPT, Kimi, GLM via API key; bring your own OpenAI-compatible endpoint.

## Install

### Download the prebuilt app (recommended)

Grab the latest DMG from [lexflow.tech](https://lexflow.tech), drag LexFlow into Applications, and allow it in **System Settings → Privacy & Security** on first launch (the app is currently ad-hoc signed).

### Build from source

Requirements: macOS, Node.js 22.12 or newer, pnpm 10, and Xcode Command Line Tools.

```bash
git clone https://github.com/LexFlowApp/LexFlow.git
cd LexFlow
pnpm install --frozen-lockfile --config.block-exotic-subdeps=false
pnpm package
```

The packaged app is written to `dist/forge/LexFlow-darwin-arm64/LexFlow.app`.

## Development

```bash
pnpm dev
pnpm test
pnpm package
```

The application keeps its own runtime data under `~/Library/Application Support/LexFlow` and does not read the existing DeepSeek Harness user directory.

## License

[MIT](LICENSE). DeepSeek Harness and its dependencies retain their respective upstream licenses.
