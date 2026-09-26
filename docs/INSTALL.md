# LexFlow 安装与回滚说明

## 安装

在项目目录执行：

```bash
pnpm install --frozen-lockfile --config.block-exotic-subdeps=false
pnpm package
```

构建产物位于 `dist/forge/LexFlow-darwin-arm64/LexFlow.app`，可将其拖入「应用程序」文件夹。

LexFlow 第一次启动会在自己的运行目录中初始化底层执行引擎，并在对话页中完成模型登录。LexFlow 不读取现有 DeepSeek Harness 的凭据。

覆盖安装前可自行备份当前应用；如需自动化备份脚本，可参考仓库内 `install.sh` 的做法（将当前应用压缩为 ZIP 并保留最近三个备份，ZIP 不会被 Launchpad 识别为应用）。

## 数据目录

| 内容 | 路径 |
| --- | --- |
| Markdown 工作目录 | `~/Documents/LexFlow` |
| LexFlow 运行数据 | `~/Library/Application Support/LexFlow` |
| 应用（若拖入用户级目录） | `~/Applications/LexFlow.app` |

## 回滚

关闭 LexFlow 后，删除或移走应用本体即可回退。`~/Documents/LexFlow` 和 `~/Library/Application Support/LexFlow` 保存用户数据，回退应用时不会删除。

现有 DeepSeek Harness 的应用、源代码和 `~/.dsh` 不属于 LexFlow 的运行依赖，回滚 LexFlow 不会操作它们。
