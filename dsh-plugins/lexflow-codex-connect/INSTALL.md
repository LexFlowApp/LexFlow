# LexFlow Codex bridge installation and validation

The current bridge is bundled inside LexFlow as `@lexflow/codex-connect` version `0.1.0-alpha.4.23-lexflow.1` and is verified with DeepSeek Harness `0.1.2-alpha.4` and `@earendil-works/pi-ai` `0.84.4`. The LexFlow desktop application writes the local profile entry and copies the application-owned plugin bundle at startup. Do not install the old standalone package into the profile.

## Safety requirements

- Never read, print, copy, move, or modify `~/.codex/auth.json`.
- Never print or inspect `$DSH_HOME/.openai-codex-auth.json`; `doctor` may inspect pathname metadata only.
- Never add OAuth URLs, codes, tokens, account identifiers, or generated profile state to Git.
- Preserve every unrelated profile dependency and patch row.
- Do not start login unless the user explicitly asks to authenticate.

## Build and validate

### Fixed compatibility pair

The application build uses one exact pair:

| Installed DeepSeek Harness version | LexFlow bridge |
| --- | --- |
| `0.1.2-alpha.4` | `@lexflow/codex-connect@0.1.0-alpha.4.23-lexflow.1` |

If the installed DeepSeek Harness version is not `0.1.2-alpha.4`, stop the LexFlow update and verify a new combination first. Do not infer support for a future Harness version from this row.

The verified contract is the DeepSeek Harness Alpha 4 plugin API set, `@earendil-works/pi-ai` `^0.84.2` resolved as `0.84.4`, and Node.js `^22.19.0 || >=24.0.0`. Updating DeepSeek Harness is a separate decision and requires a new isolated compatibility check before the bridge is changed.

These values reflect the repository's existing verification record. They are not a claim that a future DeepSeek Harness release is compatible.

### Application loading and validation

1. Build LexFlow with `pnpm run package`. The build copies the source plugin artifacts, verifies the seven-package LexFlow manifest, runs tests and type checks, packages the application, and checks the final application contents.
2. Confirm the generated profile contains exactly one `llm-openai-codex` row loading `@lexflow/codex-connect`.
3. Confirm the effective `agent-default-model` and `web.searchProvider` values are unchanged from before the bridge was loaded.
4. Run secret-free diagnostics from the application-owned package when a CLI check is needed:

   ```sh
   dsh plugin --profile web exec lexflow-codex-connect doctor
   ```

5. If the user explicitly requests login, open **Settings → Plugins → Plugin configuration → Codex Connect**, or check `status` and then use `login` or `login --device-code`. OAuth approval belongs to the user.

   Alpha 4.23 offers the same account actions in **Settings → Models → Openai-Codex**, plus a shared **More settings** dialog for model visibility, proxy, search, image, and context-budget controls. The original Plugin settings entry remains available; neither entry automatically starts login or changes model/search defaults.

   When signed out, select **Authorize**. When signed in, use **Sign out** or **View quota**; use **More settings** for plugin options. If authorization is abandoned, use **Reopen authorization** or **Cancel sign-in** and retry; cancellation does not delete an existing account. Pending authorization expires after 10 minutes by default (`oauthTimeoutMs` in plugin configuration, applied on load).

### Remote browser access

The default Web OAuth boundary is loopback-only. When DSH runs on one device and you open it from another device on a trusted network through an IP address or domain, run the following on the device that runs DSH with the exact origin from the browser address bar:

```sh
dsh plugin --profile web exec lexflow-codex-connect trust-origin http://192.168.1.20:3080
dsh plugin --profile web exec lexflow-codex-connect trusted-origins
```

The value is a full `http://` or `https://` origin including its port, not a bare device IP and not a path/query/fragment. Use `untrust-origin <origin>` to remove it. Restrict this to a trusted network and never expose the route publicly; use an SSH tunnel when that is safer. The Web client does not edit this list.

## Optional configuration

Use **Settings → Plugins → Plugin configuration → Codex Connect** for live, staged Save/Discard edits. The same card controls `enableSearch`, `enableImageTool`, and `enableImageGeneration`; all three default to `false`. Enabling image generation uses the image generation capability included with the current GPT subscription and saves results as DSH attachments. Enabling search registers a provider but does not select it; selecting `web.searchProvider: openai-codex` is a second explicit profile change. Setting `agent-default-model` to `openai-codex` is also a separate explicit change.

Apply only requested choices and preserve unrelated keys:

```yaml
- id: llm-openai-codex
  config:
    enableSearch: true
    enableImageTool: false
    enableImageGeneration: false
    searchMode: live

- id: web
  config:
    searchProvider: openai-codex

- id: agent-default-model
  config:
    provider: openai-codex
    model: gpt-5.6-sol
```

Do not add the last two rows unless the user separately requested those routing changes.

## Conflict handling

`openai-codex` can have only one adapter. If startup reports a collision, inspect the effective config and remove only the old `dsh-codex` bundle or manual `openai-codex` provider row after confirming it is the conflicting owner. Do not delete auth files or unrelated providers.

## Update and removal

Update the LexFlow desktop application as a whole. It replaces the application-owned bridge only after the DeepSeek Harness version, package build, isolated profile, and final application checks pass. Do not run a separate package update or remove the bridge from the generated profile.

Removing or reinstalling LexFlow does not delete the separate OAuth state. Run `dsh plugin --profile web exec lexflow-codex-connect logout` only when credential deletion is explicitly intended.

## Completion report

Report the profile, installed version, effective default model, effective search route, enabled optional capabilities, signed-in/signed-out state only if checked, and Web client detection. Never report OAuth URLs, codes, token timestamps, account ids, or auth-file contents.
