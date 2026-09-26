# 从旧独立插件迁移到 LexFlow 内置 Codex 桥接

LexFlow 现在以 `@lexflow/codex-connect` 作为唯一的 Codex 接入包。旧的 `dsh-codex` 或 `dsh-codex-connect` 只作为迁移来源，不应与 LexFlow 同时加载；同一个 `openai-codex` 提供方不能由两个插件重复注册。

## 迁移步骤

1. 退出旧的 DeepSeek Harness 和 LexFlow 进程，保留现有用户数据。
2. 由 LexFlow 应用整体更新并启动。应用会生成 `web` profile 的本地配置，并从应用内插件清单加载 `@lexflow/codex-connect`。
3. 确认 profile 中只有一个 `llm-openai-codex` 条目，且其来源为 `@lexflow/codex-connect`。
4. 保留原有 `$DSH_HOME/.openai-codex-auth.json`；LexFlow 使用同一文件，不需要重新登录。
5. 仅在需要删除凭据时，才运行 `lexflow-codex-connect logout`。卸载或重装 LexFlow 不会自动删除该文件。
6. 检查默认模型和全局搜索路由仍为迁移前的值；Codex 桥接默认不会替换它们。

旧的 `dsh-codex-connect` 命令别名仍保留在包清单中，便于过渡；新的文档和诊断命令统一使用 `lexflow-codex-connect`。旧的 profile 条目和旧的桥接包本身仍应移除，不能因为命令别名保留而继续加载。

## 历史搜索记录修复

Alpha 4.10 曾写入 `web/openai-codex-search-llm-request` 私有 Session 事件。由于新版 DeepSeek Harness 不再加载该事件定义，旧记录可能无法恢复。迁移命令默认只预检：

```sh
dsh plugin --profile web exec lexflow-codex-connect migrate-history --json
```

如果预检发现记录，停止所有会写入该 Session 根目录的 DeepSeek Harness 进程，再明确应用修复：

```sh
dsh plugin --profile web exec lexflow-codex-connect migrate-history --apply --confirm-stopped --json
```

该操作只给目标事件增加 `ignorable: true`，并在同目录创建 `session.jsonl.zstd.pre-codex-search-history-migration` 备份；不会改变事件数据、序列号或时间。确认修复后的会话可以正常打开后，再保留或另行处理备份。
