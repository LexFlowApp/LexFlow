window.__ModuleLoader__.load({
  id: '@lexflow/workflow',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    const modelSelection = (() => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let _lexflow_dsh_adapter = require("@lexflow/dsh-adapter");
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");
		const EMPTY_WORKSPACES = Object.freeze({ items: [] });
		function workspaceSnapshot(workspaces) {
			const snapshot = workspaces?.getSnapshot?.();
			return snapshot !== null && typeof snapshot === "object" && Array.isArray(snapshot.items) ? snapshot : EMPTY_WORKSPACES;
		}
		function workspaceTitleFor(snapshot, sessionId) {
			const workspace = snapshot.items.find((item) => Array.isArray(item?.sessionIds) && item.sessionIds.includes(sessionId));
			return typeof workspace?.title === "string" ? workspace.title.trim() : "";
		}
		function WorkspaceHeader({ sessionId, workspaces }) {
			const snapshot = react.useSyncExternalStore((listener) => typeof workspaces?.subscribe === "function" ? workspaces.subscribe(listener) : () => {}, () => workspaceSnapshot(workspaces), () => EMPTY_WORKSPACES);
			const title = workspaceTitleFor(snapshot, sessionId);
			if (title === "") return null;
			return react_jsx_runtime.jsx("span", { className: "lexflowHeaderWorkspace", title, children: title });
		}
		/** Product-owned order and labels for the two ZAI routes. */
		const MODEL_GROUP_ORDER = Object.freeze(["zai-coding-cn", "zai"]);
		const MODEL_GROUP_LABELS = Object.freeze({
			"zai-coding-cn": "智谱国内 API",
			"zai": "智谱国际 API"
		});
		function cleanModelDisplayName(value) {
			return typeof value === "string" ? value.replace(/\s*[（(][^）)]*[）)]\s*$/u, "").trim() : value;
		}
		function normalizeModelGroup(group) {
			if (!Array.isArray(group.models)) return group;
			const seen = new Set();
			const models = group.models.filter((model) => {
				if (model === null || typeof model !== "object" || typeof model.id !== "string" || seen.has(model.id)) return false;
				seen.add(model.id);
				return true;
			}).map((model) => group.id === "zai-coding-cn" || group.id === "zai" ? {
				...model,
				...typeof model.name === "string" ? { name: cleanModelDisplayName(model.name) } : {}
			} : model);
			return { ...group, models };
		}
		/** Prefer one Codex route for identical GPT model ids when both catalog groups are exposed. */
		function removeDuplicateCodexModels(groups, routableProviders) {
			const routable = new Set(Array.isArray(routableProviders) ? routableProviders : []);
			const preferred = routable.has("openai-codex") ? "openai-codex" : routable.has("openai") ? "openai" : "openai-codex";
			const preferredGroup = groups.find((group) => group.id === preferred);
			if (preferredGroup === void 0) return groups;
			const duplicateIds = new Set(preferredGroup.models.map((model) => model.id));
			return groups.map((group) => {
				if (group.id !== "openai" && group.id !== "openai-codex") return group;
				if (group.id === preferred) return group;
				return { ...group, models: group.models.filter((model) => !duplicateIds.has(model.id)) };
			}).filter((group) => group.models.length > 0);
		}
		function modelGroupRank(group) {
			const index = MODEL_GROUP_ORDER.indexOf(group.id);
			return index === -1 ? MODEL_GROUP_ORDER.length : index;
		}
		/** Put domestic ZAI first while retaining the host's order for other routes. */
		function presentModelGroups(groups, routableProviders = []) {
			const normalized = groups.map(normalizeModelGroup);
			const deduplicated = removeDuplicateCodexModels(normalized, routableProviders);
			return deduplicated.map((group, index) => ({ group, index })).sort((left, right) => modelGroupRank(left.group) - modelGroupRank(right.group) || left.index - right.index).map(({ group }) => {
				const name = MODEL_GROUP_LABELS[group.id];
				return name === void 0 ? group : { ...group, name };
			});
		}
		//#region lib/types/client/directory.js
		/** One session's shared directory controller; disposed with the session scope. */
		var ModelDirectory = class {
			sessions;
			sessionId;
			available;
			runtime;
			projected;
			/** The shared snapshot both entries render from (uSES-safe store). */
			store = (0, _lexflow_dsh_adapter.createSnapshotStore)({
				current: null,
				routable: null,
				groups: [],
				failures: [],
				status: "idle",
				error: null
			});
			/** Latest operation wins; an older response never overwrites a newer one. */
			generation = 0;
			disposed = false;
			/**
			* @param sessions - the session wire face (captured from the plugin's root connection).
			* @param sessionId - the owning session.
			* @param available - whether this session may use Agent-bound model RPCs.
			*/
			constructor(sessions, sessionId, available, projected) {
				this.sessions = sessions;
				this.sessionId = sessionId;
				this.available = available;
				this.projected = projected;
			}
			/**
			* Refresh the advisory directory (both entries call this on open).
			* Failure preserves the last good groups and current selection.
			* @returns the fresh directory value.
			*/
			async load() {
				this.assertAvailable();
				const generation = ++this.generation;
				this.store.update((s) => {
					s.status = "loading";
					s.error = null;
				});
				const result = await this.sessions.catalog();
				if (this.disposed || generation !== this.generation) {
					if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
					return result.value;
				}
				if (!result.ok) {
					this.store.update((s) => {
						s.status = "error";
						s.error = `${result.error.code}: ${result.error.message}`;
					});
					throw new Error(`models.catalog failed: ${result.error.code}: ${result.error.message}`);
				}
					const current = this.projected?.getSnapshot()?.next ?? result.value.default;
					const routable = result.value.routableProviders.includes(current.provider);
					const { groups, failures } = result.value;
					const arrangedGroups = presentModelGroups(groups, result.value.routableProviders);
					const allowed = typeof window !== "undefined" && window.__LEXFLOW_MODEL_VISIBILITY__ instanceof Set ? window.__LEXFLOW_MODEL_VISIBILITY__ : null;
					const visibleGroups = allowed === null || allowed.size === 0 ? arrangedGroups : arrangedGroups.filter((group) => allowed.has(group.id));
					this.store.update((s) => {
						s.current = current;
						s.routable = routable;
						s.groups = visibleGroups;
						s.failures = failures;
						s.status = "ready";
						s.error = null;
					});
					return { ...result.value, groups: visibleGroups };
			}
			/**
			* Select the complete provider/model/reasoning selection (both entries submit through here). Success
			* updates the shared current; failure surfaces on the store and throws so
			* each entry's own retry surface engages.
			* @param selection - provider, provider-owned model id, and optional adapter-owned effort.
			*/
			async select(selection) {
				this.assertAvailable();
				const generation = ++this.generation;
				this.store.update((s) => {
					s.status = "selecting";
					s.error = null;
				});
				const result = await this.sessions.select({
					sessionId: this.sessionId,
					provider: selection.provider,
					model: selection.model,
					...selection.reasoningEffort === void 0 ? {} : { reasoningEffort: selection.reasoningEffort }
				});
				if (this.disposed || generation !== this.generation) {
					if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
					return;
				}
				if (!result.ok) {
					this.store.update((s) => {
						s.status = "error";
						s.error = `${result.error.code}: ${result.error.message}`;
					});
					throw new Error(`models.select failed: ${result.error.code}: ${result.error.message}`);
				}
				this.store.update((s) => {
					s.current = result.value.selected;
					s.routable = true;
					s.status = "ready";
					s.error = null;
				});
			}
			/**
			* Drop the previous Host generation's projection and repull it. Clearing
			* first prevents an unconsumed process-local selection from being displayed
			* while the restarted Host has restored the last logged model selection.
			*/
			resetConnected() {
				if (this.disposed) return;
				++this.generation;
				this.store.update((s) => {
					s.current = null;
					s.routable = null;
					s.groups = [];
					s.failures = [];
					s.status = "idle";
					s.error = null;
				});
				if (!this.available()) return;
				this.load().catch(() => {});
			}
			/** Scope teardown: late settlements lose write access to the store. */
			dispose() {
				this.disposed = true;
			}
			assertAvailable() {
				if (!this.available()) throw new Error("model selection is unavailable for addressed subagent sessions");
			}
		};
		//#endregion
		//#region lib/types/client/service.js
		/**
		* ModelDirectoryResolver (`ctx.modelDirectories`): the root owner of per-session
		* {@link ModelDirectory} instances. Both selection entries (the /model popup
		* and the composer model seat) resolve their session's directory through
		* this service, which is what makes the dual entry one shared state.
		*
		* Per-session storage follows the client service pattern (InputTriggerService /
		* CommandUiRuntime): a lazy service-internal map whose entry is deleted by the
		* owning scope's disposer. The host `dsh-scope` ScopedLayers registry does
		* does not belong here: it derives scope from the host carrier mechanism
		* (object-keyed), while client scopes tag contexts with branded SessionId
		* strings, and it models global+shadow named registries — this is a
		* per-session singleton with no global layer to merge.
		*/
		/** The `ctx.modelDirectories` session model-selection service. */
			var ModelDirectoryResolver = class extends _lexflow_dsh_adapter.Service {
			static inject = ["lexflow"];
			live = { directories: /* @__PURE__ */ new Map() };
			/** Localized composer-block copy; this plugin owns the string it raises. */
			blockReason;
			/**
			* @param ctx - owning root context (the service registers itself as `models`).
			* @param config - the bound translator for this plugin's own dictionary.
			*/
			constructor(ctx, config) {
				super(ctx, "modelDirectories");
				this.blockReason = config.blockReason;
				this.runtime = config.runtime;
				const runtime = this.runtime;
				runtime.events.on("connection/reset", () => {
					for (const directory of this.live.directories.values()) directory.resetConnected();
				});
				const refresh = () => {
					for (const directory of this.live.directories.values()) directory.load().catch(() => void 0);
				};
				runtime.events.on("llm/adapters-updated", refresh);
				runtime.events.on("settings/document-updated", refresh);
				runtime.events.on("models.catalog.changed", refresh);
			}
			/**
			* Resolve the per-session shared directory (lazy; the scope disposer
			* removes and disposes it). Unknown sessions fail loud.
			* @param sessionId - the owning session.
			* @returns the resident directory both entries share.
			*/
			directoryFor(sessionId) {
				const { live } = this;
				const existing = live.directories.get(sessionId);
				if (existing !== void 0) return existing;
				const runtime = this.runtime;
				const sessions = runtime.sessions;
				const directory = new ModelDirectory(runtime.models, sessionId, () => sessions.subagentAddress(sessionId) === void 0, sessions.modelSelectionProjection(sessionId));
				live.directories.set(sessionId, directory);
				const conversation = runtime.conversation;
				if (conversation !== void 0) {
					const publish = () => {
						conversation.blocks.set(sessionId, directory.store.getSnapshot().routable === false ? { reason: this.blockReason() } : void 0);
					};
					publish();
					sessions.scopeEffect(sessionId, () => {
						const stop = directory.store.subscribe(publish);
						return () => {
							stop();
							conversation.blocks.set(sessionId, void 0);
						};
					}, "ui-model-selection: composer block");
				}
					sessions.scopeEffect(sessionId, () => () => {
					directory.dispose();
					live.directories.delete(sessionId);
				}, "ui-model-selection: session directory");
				return directory;
			}
		};
		//#endregion
		//#region ../../../node_modules/.pnpm/clsx@2.1.1/node_modules/clsx/dist/clsx.mjs
		function r(e) {
			var t, f, n = "";
			if ("string" == typeof e || "number" == typeof e) n += e;
			else if ("object" == typeof e) if (Array.isArray(e)) {
				var o = e.length;
				for (t = 0; t < o; t++) e[t] && (f = r(e[t])) && (n && (n += " "), n += f);
			} else for (f in e) e[f] && (n && (n += " "), n += f);
			return n;
		}
		function clsx() {
			for (var e, t, f = 0, n = "", o = arguments.length; f < o; f++) (e = arguments[f]) && (t = r(e)) && (n && (n += " "), n += t);
			return n;
		}
		//#endregion
		//#region \0dsh-css:/home/runner/work/deepseek-harness/deepseek-harness/packages/client/ui-model-selection/src/client/ModelSelect.module.css.mjs
		// 模型选择器尺寸按 LexFlow 的紧凑要求调整（在底座 0.1.5 原样基础上收紧）：
		// 菜单更窄、选项更矮、字号减小，减少遮挡对话内容的面积。
		const css = "._7KE1Ra_root{min-width:0;position:relative}._7KE1Ra_trigger{min-width:0;max-width:min(360px,45cqw);height:28px;color:var(--lexflow-dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;border-radius:24px;outline:none;align-items:center;gap:4px;padding:0 4px 0 8px;font-size:13px;font-weight:500;line-height:20px;display:flex}._7KE1Ra_trigger:hover:not(:disabled){background:var(--lexflow-dsw-alias-interactive-bg-hover)}._7KE1Ra_trigger:focus-visible{box-shadow:0 0 0 2px var(--lexflow-dsw-alias-border-l3)}._7KE1Ra_trigger:disabled{color:var(--lexflow-dsw-alias-label-dimmed);cursor:default}._7KE1Ra_triggerLabel{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden}._7KE1Ra_triggerEffort{color:var(--lexflow-dsw-alias-label-caption);flex:none}._7KE1Ra_chevron{color:var(--lexflow-dsw-alias-label-caption);flex:none;transition:transform .12s}._7KE1Ra_chevronOpen{transform:rotate(180deg)}._7KE1Ra_menu{z-index:20;border:1px solid var(--lexflow-dsw-alias-border-inverted);background:color-mix(in srgb,var(--lexflow-dsw-alias-bg-base) 86%,transparent);backdrop-filter:blur(22px) saturate(1.5);-webkit-backdrop-filter:blur(22px) saturate(1.5);width:max-content;min-width:min(200px,100vw - 32px);max-width:min(300px,100vw - 32px);max-height:min(300px,100vh - 96px);box-shadow:var(--lexflow-dsw-shadow-lv3);color:var(--lexflow-dsw-alias-label-primary);--lexflow-dsh-scrollbar-thumb:var(--lexflow-dsw-alias-scrollbar-bg-l2);--lexflow-dsh-scrollbar-thumb-hover:var(--lexflow-dsw-alias-scrollbar-hover-l2);border-radius:10px;flex-direction:column;padding:3px;display:flex;position:absolute;bottom:calc(100% + 8px);right:0;overflow:hidden}._7KE1Ra_status,._7KE1Ra_empty{color:var(--lexflow-dsw-alias-label-tertiary);padding:8px;font-size:12px;line-height:18px}._7KE1Ra_error,._7KE1Ra_warning{background:var(--lexflow-dsw-alias-interactive-bg-hover-danger);color:var(--lexflow-dsw-alias-state-error-primary);border-radius:8px;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:4px;padding:6px 8px;font-size:12px;line-height:18px;display:flex}._7KE1Ra_warning{background:var(--lexflow-dsw-alias-bg-module-platform);color:var(--lexflow-dsw-alias-state-warn-label)}._7KE1Ra_retry{color:inherit;font:inherit;cursor:pointer;background:0 0;border:none;flex:none;padding:0;font-weight:600}._7KE1Ra_groups{min-height:0;overflow-y:auto}._7KE1Ra_group+._7KE1Ra_group{margin-top:2px}._7KE1Ra_groupTitle{z-index:1;background:color-mix(in srgb,var(--lexflow-dsw-alias-bg-base) 96%,transparent);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);color:var(--lexflow-dsw-alias-label-tertiary);padding:4px 6px 2px;font-size:11px;font-weight:500;line-height:16px;position:sticky;top:0}._7KE1Ra_option{box-sizing:border-box;width:auto;min-width:100%;min-height:28px;color:inherit;text-align:left;cursor:pointer;background:0 0;border:none;border-radius:8px;outline:none;align-items:center;gap:6px;padding:4px 6px;display:flex}._7KE1Ra_option:hover:not(:disabled),._7KE1Ra_option:focus-visible{background:var(--lexflow-dsw-alias-interactive-bg-hover)}._7KE1Ra_selected{background:0 0}._7KE1Ra_option:disabled{color:var(--lexflow-dsw-alias-label-dimmed);cursor:default}._7KE1Ra_optionCopy{flex-direction:column;flex:1;min-width:0;display:flex}._7KE1Ra_modelName{color:inherit;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:500;line-height:18px;overflow:hidden}._7KE1Ra_description{color:var(--lexflow-dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap;font-size:11px;line-height:16px;overflow:hidden}._7KE1Ra_check{color:var(--lexflow-dsw-alias-label-primary);flex:0 0 16px;place-items:center;display:grid}._7KE1Ra_cell{box-sizing:border-box;width:auto;min-width:100%;height:30px;color:var(--lexflow-dsw-alias-label-primary);cursor:pointer;text-align:left;background:0 0;border:none;border-radius:8px;align-items:center;gap:6px;padding:0 6px;font-size:13px;line-height:18px;display:flex}._7KE1Ra_cell:hover{background:var(--lexflow-dsw-alias-interactive-bg-hover)}._7KE1Ra_cellLabel{white-space:nowrap;flex:none}._7KE1Ra_cellValue{text-overflow:ellipsis;white-space:nowrap;text-align:right;min-width:0;color:var(--lexflow-dsw-alias-label-tertiary);flex:auto;overflow:hidden}._7KE1Ra_cellChevron{color:var(--lexflow-dsw-alias-label-tertiary);flex:none}";
		const tagId = "@deepseek-ai/dsh-client-ui-model-selection/ModelSelect.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-model-selection";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var ModelSelect_module_css_default = {
			"cell": "_7KE1Ra_cell",
			"cellChevron": "_7KE1Ra_cellChevron",
			"cellLabel": "_7KE1Ra_cellLabel",
			"cellValue": "_7KE1Ra_cellValue",
			"check": "_7KE1Ra_check",
			"chevron": "_7KE1Ra_chevron",
			"chevronOpen": "_7KE1Ra_chevronOpen",
			"description": "_7KE1Ra_description",
			"empty": "_7KE1Ra_empty",
			"error": "_7KE1Ra_error",
			"group": "_7KE1Ra_group",
			"groupTitle": "_7KE1Ra_groupTitle",
			"groups": "_7KE1Ra_groups",
			"menu": "_7KE1Ra_menu",
			"modelName": "_7KE1Ra_modelName",
			"option": "_7KE1Ra_option",
			"optionCopy": "_7KE1Ra_optionCopy",
			"retry": "_7KE1Ra_retry",
			"root": "_7KE1Ra_root",
			"selected": "_7KE1Ra_selected",
			"status": "_7KE1Ra_status",
			"trigger": "_7KE1Ra_trigger",
			"triggerEffort": "_7KE1Ra_triggerEffort",
			"triggerLabel": "_7KE1Ra_triggerLabel",
			"warning": "_7KE1Ra_warning"
		};
		//#endregion
		//#region lib/types/client/ModelSelect.js
		/**
		* ModelSelect: the composer's named model seat (`conversation.input.model`).
		* Two-level selection per figma 496:26454's MenuDropdown: the root menu is
		* the Model / Effort row pair (label + current value + a right chevron),
		* each drilling into its own list — the provider-grouped model list over
		* the shared directory, and the effort levels. The trigger (313:14108's
		* ToggleButton) shows both: model name + effort in the caption tone.
		* Data and submission ride the SAME per-session ModelDirectory as the
		* /model popup; exact-model reasoning metadata and the selected effort come
		* from the Host rather than a client-owned vocabulary. A rejected selection
		* announces through the shared transient Toast anchored to the composer
		* card; the in-menu strip with Retry remains the catalog-load surface.
		*/
		/**
		* Render the composer model seat.
		* @param props - owner share (locked) + injected face (shared directory
		* store/verbs) + the standard locale seat.
		* @returns the trigger and, while open, the two-level menu.
		*/
		function ModelSelect({ locked, available, directory, load, select, t }) {
			const state = (0, react.useSyncExternalStore)((fn) => directory.subscribe(fn), () => directory.getSnapshot());
			const [open, setOpen] = (0, react.useState)(false);
			const [pane, setPane] = (0, react.useState)("root");
			const lastActionRef = (0, react.useRef)("load");
			const [toast, setToast] = (0, react.useState)(null);
			const toastSeq = (0, react.useRef)(0);
			const rootRef = (0, react.useRef)(null);
			const triggerRef = (0, react.useRef)(null);
			const itemRefs = (0, react.useRef)([]);
			const id = (0, react.useId)();
			const choices = (0, react.useMemo)(() => state.groups.flatMap((group) => group.models.map((model) => ({
				group,
				model,
				selection: {
					provider: group.id,
					model: model.id,
					...model.reasoning?.defaultEffort === void 0 ? {} : { reasoningEffort: model.reasoning.defaultEffort }
				}
			}))), [state.groups]);
			const currentChoice = choices[state.current === null ? -1 : choices.findIndex((c) => c.selection.provider === state.current?.provider && c.selection.model === state.current.model)];
			const reasoning = currentChoice?.model.reasoning;
			const effectiveEffort = state.current?.reasoningEffort ?? reasoning?.defaultEffort;
			const effortLabel = reasoning === void 0 ? void 0 : effectiveEffort === void 0 ? t("effort.providerDefault") : reasoning.efforts.find((level) => level.id === effectiveEffort)?.name ?? effectiveEffort;
			const effortChoices = (0, react.useMemo)(() => reasoning === void 0 ? [] : [...reasoning.defaultEffort === void 0 ? [{
				key: "provider-default",
				effort: void 0,
				label: t("effort.providerDefault")
			}] : [], ...reasoning.efforts.map((effort) => ({
				key: `effort:${effort.id}`,
				effort: effort.id,
				label: effort.name,
				...effort.description === void 0 ? {} : { description: effort.description }
			}))], [reasoning, t]);
			const busy = state.status === "selecting";
			const reload = () => {
				lastActionRef.current = "load";
				load();
			};
			(0, react.useEffect)(() => {
				if (available) {
					lastActionRef.current = "load";
					load();
				}
			}, [available, load]);
			(0, react.useEffect)(() => {
				if (!open) return;
				const closeOutside = (event) => {
					if (!rootRef.current?.contains(event.target)) setOpen(false);
				};
				document.addEventListener("mousedown", closeOutside);
				return () => {
					document.removeEventListener("mousedown", closeOutside);
				};
			}, [open]);
			if (!available) return null;
			const show = () => {
				setPane("root");
				setOpen(true);
				reload();
			};
			const close = (restoreFocus = false) => {
				setOpen(false);
				setPane("root");
				if (restoreFocus) queueMicrotask(() => {
					triggerRef.current?.focus();
				});
			};
			const moveFocus = (offset) => {
				const items = itemRefs.current.filter((item) => item !== null);
				if (items.length === 0) return;
				const active = items.findIndex((item) => item === document.activeElement);
				items[(Math.max(active, 0) + offset + items.length) % items.length]?.focus();
			};
			const onRootKeyDown = (event) => {
				if (event.key === "Escape" && open) {
					event.preventDefault();
					if (pane !== "root") setPane("root");
					else close(true);
					return;
				}
				if (!open) return;
				if (event.key === "ArrowDown" || event.key === "ArrowUp") {
					event.preventDefault();
					moveFocus(event.key === "ArrowDown" ? 1 : -1);
				}
			};
			const onBlur = (event) => {
				if (event.relatedTarget instanceof Node && rootRef.current?.contains(event.relatedTarget)) return;
				close();
			};
			const settleSelection = (accepted) => {
				if (accepted) {
					if (rootRef.current !== null) close(true);
					return;
				}
				const message = directory.getSnapshot().error;
				if (message !== null) {
					toastSeq.current += 1;
					setToast({
						seq: toastSeq.current,
						text: t("error.action", { message })
					});
				}
			};
			const choose = (selection) => {
				if (state.current?.provider === selection.provider && state.current.model === selection.model) {
					close(true);
					return;
				}
				lastActionRef.current = "select";
				select(selection).then(settleSelection);
			};
			const chooseEffort = (effort) => {
				if (state.current === null) return;
				if (effectiveEffort === effort) {
					close(true);
					return;
				}
				const selection = {
					provider: state.current.provider,
					model: state.current.model,
					...effort === void 0 ? {} : { reasoningEffort: effort }
				};
				lastActionRef.current = "select";
				select(selection).then(settleSelection);
			};
			const modelLabel = currentChoice?.model.name ?? t("trigger.fallback");
			const triggerLabel = effortLabel === void 0 ? modelLabel : `${modelLabel} · ${effortLabel}`;
			const triggerAria = currentChoice === void 0 ? t("trigger.selectAria") : effortLabel === void 0 ? t("trigger.aria", { model: modelLabel }) : t("trigger.ariaEffort", {
				model: modelLabel,
				effort: effortLabel
			});
			itemRefs.current = [];
			let itemIndex = 0;
			const itemRef = () => {
				const at = itemIndex++;
				return (node) => {
					itemRefs.current[at] = node;
				};
			};
			return (0, react_jsx_runtime.jsxs)("div", {
				ref: rootRef,
				className: ModelSelect_module_css_default.root,
				onKeyDown: onRootKeyDown,
				onBlur,
				children: [
					(0, react_jsx_runtime.jsxs)("button", {
						ref: triggerRef,
						type: "button",
						className: ModelSelect_module_css_default.trigger,
						"aria-label": triggerAria,
						"aria-haspopup": "menu",
						"aria-expanded": open,
						"aria-controls": open ? `${id}-menu` : void 0,
						title: triggerLabel,
						disabled: locked,
						onClick: () => {
							if (open) close();
							else show();
						},
						children: [
							(0, react_jsx_runtime.jsx)("span", {
								className: ModelSelect_module_css_default.triggerLabel,
								children: modelLabel
							}),
							effortLabel !== void 0 && (0, react_jsx_runtime.jsx)("span", {
								className: ModelSelect_module_css_default.triggerEffort,
								children: effortLabel
							}),
							(0, react_jsx_runtime.jsx)(_lexflow_dsh_adapter.IconChevronDownOutline14, { className: clsx(ModelSelect_module_css_default.chevron, open && ModelSelect_module_css_default.chevronOpen) })
						]
					}),
					open && (0, react_jsx_runtime.jsxs)("div", {
						id: `${id}-menu`,
						className: ModelSelect_module_css_default.menu,
						role: "menu",
						"aria-label": t("menu.aria"),
						"aria-busy": state.status === "loading" || busy,
						children: [
							pane === "root" && (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsxs)("button", {
								ref: itemRef(),
								type: "button",
								role: "menuitem",
								className: ModelSelect_module_css_default.cell,
								onClick: () => {
									setPane("model");
								},
								children: [
									(0, react_jsx_runtime.jsx)("span", {
										className: ModelSelect_module_css_default.cellLabel,
										children: t("menu.model")
									}),
									(0, react_jsx_runtime.jsx)("span", {
										className: ModelSelect_module_css_default.cellValue,
										children: modelLabel
									}),
									(0, react_jsx_runtime.jsx)(_lexflow_dsh_adapter.IconChevronRightOutline14, { className: ModelSelect_module_css_default.cellChevron })
								]
							}), reasoning !== void 0 && (0, react_jsx_runtime.jsxs)("button", {
								ref: itemRef(),
								type: "button",
								role: "menuitem",
								className: ModelSelect_module_css_default.cell,
								onClick: () => {
									setPane("effort");
								},
								children: [
									(0, react_jsx_runtime.jsx)("span", {
										className: ModelSelect_module_css_default.cellLabel,
										children: t("menu.effort")
									}),
									(0, react_jsx_runtime.jsx)("span", {
										className: ModelSelect_module_css_default.cellValue,
										children: effortLabel
									}),
									(0, react_jsx_runtime.jsx)(_lexflow_dsh_adapter.IconChevronRightOutline14, { className: ModelSelect_module_css_default.cellChevron })
								]
							})] }),
							pane === "model" && (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
								state.status === "loading" && (0, react_jsx_runtime.jsx)("div", {
									className: ModelSelect_module_css_default.status,
									children: t("status.loading")
								}),
								state.error !== null && lastActionRef.current === "load" && (0, react_jsx_runtime.jsxs)("div", {
									className: ModelSelect_module_css_default.error,
									children: [(0, react_jsx_runtime.jsx)("span", { children: t("error.action", { message: state.error }) }), (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: ModelSelect_module_css_default.retry,
										onClick: reload,
										children: t("retry")
									})]
								}),
								state.failures.map((failure) => (0, react_jsx_runtime.jsxs)("div", {
									className: ModelSelect_module_css_default.warning,
									children: [(0, react_jsx_runtime.jsx)("span", { children: t("warning.groupLoad", {
										name: failure.name,
										message: failure.message
									}) }), (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: ModelSelect_module_css_default.retry,
										onClick: reload,
										children: t("retry")
									})]
								}, failure.id)),
								(0, react_jsx_runtime.jsx)("div", {
									className: clsx(ModelSelect_module_css_default.groups, "scrollable"),
									children: state.groups.map((group) => {
										const headingId = `${id}-${group.id}`;
										return (0, react_jsx_runtime.jsxs)("section", {
											role: "group",
											"aria-labelledby": headingId,
											className: ModelSelect_module_css_default.group,
											children: [(0, react_jsx_runtime.jsx)("div", {
												className: ModelSelect_module_css_default.groupTitle,
												id: headingId,
												children: group.name
											}), group.models.map((model) => {
												const selected = state.current?.provider === group.id && state.current.model === model.id;
												return (0, react_jsx_runtime.jsxs)("button", {
													ref: itemRef(),
													type: "button",
													role: "menuitemradio",
													"aria-checked": selected,
													className: clsx(ModelSelect_module_css_default.option, selected && ModelSelect_module_css_default.selected),
													title: model.name,
													disabled: busy,
													onClick: () => {
														choose({
															provider: group.id,
															model: model.id
														});
													},
													children: [(0, react_jsx_runtime.jsxs)("span", {
														className: ModelSelect_module_css_default.optionCopy,
														children: [(0, react_jsx_runtime.jsx)("span", {
															className: ModelSelect_module_css_default.modelName,
															children: model.name
														}), model.description !== void 0 && (0, react_jsx_runtime.jsx)("span", {
															className: ModelSelect_module_css_default.description,
															children: model.description
														})]
													}), (0, react_jsx_runtime.jsx)("span", {
														className: ModelSelect_module_css_default.check,
														children: selected ? (0, react_jsx_runtime.jsx)(_lexflow_dsh_adapter.IconCheckOutline16, {}) : null
													})]
												}, model.id);
											})]
										}, group.id);
									})
								}),
								state.status === "ready" && choices.length === 0 && (0, react_jsx_runtime.jsx)("div", {
									className: ModelSelect_module_css_default.empty,
									children: t("empty.models")
								})
							] }),
							pane === "effort" && (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [state.error !== null && lastActionRef.current === "load" && (0, react_jsx_runtime.jsxs)("div", {
								className: ModelSelect_module_css_default.error,
								children: [(0, react_jsx_runtime.jsx)("span", { children: t("error.action", { message: state.error }) }), (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: ModelSelect_module_css_default.retry,
									onClick: reload,
									children: t("action.reload")
								})]
							}), effortChoices.length === 0 ? (0, react_jsx_runtime.jsx)("div", {
								className: ModelSelect_module_css_default.empty,
								children: t("empty.efforts")
							}) : effortChoices.map((level) => (0, react_jsx_runtime.jsxs)("button", {
								ref: itemRef(),
								type: "button",
								role: "menuitemradio",
								"aria-checked": effectiveEffort === level.effort,
								className: clsx(ModelSelect_module_css_default.option, effectiveEffort === level.effort && ModelSelect_module_css_default.selected),
								disabled: busy,
								onClick: () => {
									chooseEffort(level.effort);
								},
								children: [(0, react_jsx_runtime.jsxs)("span", {
									className: ModelSelect_module_css_default.optionCopy,
									children: [(0, react_jsx_runtime.jsx)("span", {
										className: ModelSelect_module_css_default.modelName,
										children: level.label
									}), level.description !== void 0 && (0, react_jsx_runtime.jsx)("span", {
										className: ModelSelect_module_css_default.description,
										children: level.description
									})]
								}), (0, react_jsx_runtime.jsx)("span", {
									className: ModelSelect_module_css_default.check,
									children: effectiveEffort === level.effort ? (0, react_jsx_runtime.jsx)(_lexflow_dsh_adapter.IconCheckOutline16, {}) : null
								})]
							}, level.key))] })
						]
					}),
					toast !== null && (0, react_jsx_runtime.jsx)(_lexflow_dsh_adapter.Toast, {
						text: toast.text,
						icon: (0, react_jsx_runtime.jsx)(_lexflow_dsh_adapter.IconWarningOutline16, {}),
						anchor: rootRef.current?.closest("[data-composer-card]") ?? null,
						onDone: () => {
							setToast(null);
						}
					}, toast.seq)
				]
			});
		}
		//#endregion
		//#region lib/types/client/locales.js
		/**
		* `model` namespace dictionaries.
		*
		* `trigger.selectAria` reads identically to `trigger.fallback` today and is
		* still a separate key: the visible fallback label and the accessible name of
		* an unset trigger are free to diverge per locale, and folding it into
		* `trigger.aria` would announce the degenerate "Select model, current Select
		* model".
		*/
		/** Simplified Chinese dictionary (the key-set source of truth). */
		const zh = {
			"command.description": "选择本会话使用的模型",
			"option.loadError": "目录加载失败：{message}",
			"trigger.fallback": "选择模型",
			"trigger.selectAria": "选择模型",
			"trigger.aria": "选择模型，当前 {model}",
			"trigger.ariaEffort": "选择模型，当前 {model}，推理等级 {effort}",
			"menu.aria": "模型与推理等级",
			"menu.model": "模型",
			"menu.effort": "推理等级",
			"effort.providerDefault": "Default",
			"status.loading": "正在刷新模型列表…",
			"error.action": "模型操作失败：{message}",
			"action.reload": "重新加载",
			"warning.groupLoad": "{name} 加载失败：{message}",
			"empty.models": "没有可用的模型。",
			"blocked.composer": "当前模型不可用，请先选择模型",
			"empty.efforts": "当前模型未提供推理等级。"
		};
		/** English dictionary, checked complete against the zh key set. */
		const en = {
			"command.description": "Select the model for this conversation",
			"option.loadError": "Catalog failed to load: {message}",
			"trigger.fallback": "Select model",
			"trigger.selectAria": "Select model",
			"trigger.aria": "Select model, current {model}",
			"trigger.ariaEffort": "Select model, current {model}, reasoning effort {effort}",
			"menu.aria": "Model and reasoning effort",
			"menu.model": "Model",
			"menu.effort": "Effort",
			"effort.providerDefault": "Default",
			"status.loading": "Refreshing model list…",
			"error.action": "Model operation failed: {message}",
			"action.reload": "Reload",
			"warning.groupLoad": "{name} failed to load: {message}",
			"empty.models": "No models available.",
			"blocked.composer": "This model is unavailable — select one to continue",
			"empty.efforts": "This model provides no reasoning effort levels."
		};
		//#endregion
		//#region lib/types/client/index.js
		/** One selectable row's id: an opaque row key (resolved by lookup, never parsed). */
		function rowId(providerId, modelId) {
			return `${providerId}/${modelId}`;
		}
		/** Flatten the directory into popup rows; failure rows are listed for visibility but never selectable. */
		function optionsOf(directory, t) {
			const rows = [];
			for (const group of directory.groups) for (const model of group.models) rows.push({
				id: rowId(group.id, model.id),
				label: model.name,
				detail: model.description !== void 0 ? `${group.name} · ${model.description}` : group.name,
				...directory.current.provider === group.id && directory.current.model === model.id ? { active: true } : {}
			});
			for (const failure of directory.failures) rows.push({
				id: `failure/${failure.id}`,
				label: failure.name,
				detail: t("option.loadError", { message: failure.message })
			});
			return rows;
		}
		/**
		* Resolve a picked row back to its model selection by matching against the loaded
		* groups (the same data the rows were built from — ids stay opaque).
		* @param state - the session's directory snapshot.
		* @param id - the picked row id.
		* @returns the row's model selection, or undefined for failure rows / stale ids.
		*/
		function selectionOf(state, id) {
			for (const group of state.groups) for (const model of group.models) {
				if (rowId(group.id, model.id) !== id) continue;
				const reasoningEffort = state.current?.provider === group.id && state.current.model === model.id ? state.current?.reasoningEffort ?? model.reasoning?.defaultEffort : model.reasoning?.defaultEffort;
				return {
					provider: group.id,
					model: model.id,
					...reasoningEffort === void 0 ? {} : { reasoningEffort }
				};
			}
		}
		/** Dictionary namespace owned by this plugin. */
		const NS = "model";
		/** Required services: the contribution registry, the seat's slot registry, locale, and the service's own faces. */
		const inject = ["lexflow"];
		/**
		* Client plugin body: mount ModelDirectoryResolver, register the `model` dictionaries,
		* then register the /model popup contribution and the composer model seat
		* over the service.
		* @param ctx - client root context.
		*/
			function apply(ctx) {
				const runtime = ctx.get("lexflow");
				const locale = runtime.ui.locale;
				runtime.lifecycle.effect(() => locale.register(NS, {
					zh,
					en
				}), "ui-model-selection: dictionaries");
				const t = locale.bind(NS);
				runtime.ui.withSessionSlots((scope) => {
					scope.slots.inject("conversation.session.header.actions", () => scope.slots.register({
						name: "conversation.session.header.actions",
						id: "workspace-title",
						order: -10,
						inject: (sessionId) => ({ sessionId, workspaces: runtime.workspaces.list })
					}, WorkspaceHeader));
				});
				runtime.lifecycle.plugin(ModelDirectoryResolver, { blockReason: () => t("blocked.composer"), runtime });
			runtime.ui.withCommandPalette((scope) => {
				const command = scope.commands;
				const models = scope.models;
				const sessions = scope.sessions;
				scope.effect(() => command.register({
					name: "model",
					description: t("command.description"),
					available: (session) => sessions.subagentAddress(session.sessionId) === void 0,
					ui: {
						kind: "popupSelect",
						options: async (session) => {
							if (sessions.subagentAddress(session.sessionId) !== void 0) throw new Error("model selection is unavailable for addressed subagent sessions");
							return optionsOf(await models.directoryFor(session.sessionId).load(), t);
						},
						onSelect: async (option, session) => {
							if (sessions.subagentAddress(session.sessionId) !== void 0) throw new Error("model selection is unavailable for addressed subagent sessions");
							const directory = models.directoryFor(session.sessionId);
							const selection = selectionOf(directory.store.getSnapshot(), option.id);
							if (selection === void 0) throw new Error("this provider's catalog failed to load — pick a model from a loaded group");
							await directory.select(selection);
						}
					}
				}), "ui-model-selection: /model contribution");
			});
			runtime.ui.withSessionSlots((scope) => {
				const models = scope.models;
				const sessions = scope.sessions;
				scope.slots.inject("conversation.input.model", () => scope.slots.register({
					name: "conversation.input.model",
					locale: NS,
					inject: (sessionId) => {
						const directory = models.directoryFor(sessionId);
						const available = sessions.subagentAddress(sessionId) === void 0;
						return {
							available,
							directory: directory.store,
							load: () => {
								if (available) directory.load().catch(() => {});
							},
							select: (selection) => available ? directory.select(selection).then(() => true, () => false) : Promise.resolve(false)
						};
					}
				}, ModelSelect));
			});
		}
		//#endregion
		exports.ModelDirectory = ModelDirectory;
		exports.ModelDirectoryResolver = ModelDirectoryResolver;
		exports.apply = apply;
		exports.inject = inject;

      return module.exports
    })()
    const workflowIndicatorReact = require('react')
    const workflowIndicatorJsx = require('react/jsx-runtime')
    function WorkflowAppliedIndicator({ sessionId }) {
      const React = workflowIndicatorReact
      const { jsx } = workflowIndicatorJsx
      const [state, setState] = React.useState({ applied: [] })
      const [open, setOpen] = React.useState(false)
      const [selected, setSelected] = React.useState([])
      const [error, setError] = React.useState('')
      const request = async (action, payload = {}) => {
        const response = await fetch('/lexflow-api', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, sessionId: String(sessionId), ...payload }) })
        const data = await response.json()
        if (!data.ok) throw new Error(data.error)
        return data.value
      }
      React.useEffect(() => {
        let mounted = true
        const load = async () => { try { const value = await request('workflow.session.state'); if (mounted) setState(value) } catch {} }
        void load(); const timer = window.setInterval(load, 1500)
        return () => { mounted = false; window.clearInterval(timer) }
      }, [sessionId])
      React.useEffect(() => { setSelected([]); if (state.choice) setOpen(true) }, [state.choice?.id])
      const act = async (action, payload) => { try { await request(action, payload); setState(await request('workflow.session.state')); setError('') } catch (cause) { setError(cause.message) } }
      if (!state.applied.length && !state.choice) return null
      const button = { background: 'transparent', border: 0, color: 'inherit', cursor: 'pointer', font: 'inherit', padding: '6px 8px' }
      return jsx('div', { style: { position: 'relative', fontSize: '12px' }, children: [
        jsx('button', { type: 'button', 'data-lexflow-header-action': 'applied', style: { ...button, color: 'var(--lexflow-dsw-alias-state-business-primary)' }, onClick: () => setOpen(!open), children: state.choice ? '选择工作流' : '已应用 ' + state.applied.length }),
        open && jsx('div', { style: { position: 'absolute', top: '36px', right: 0, width: '320px', maxHeight: '420px', overflow: 'auto', padding: '16px', border: '1px solid var(--lexflow-dsw-alias-border-l1)', borderRadius: '10px', background: 'var(--lexflow-dsw-alias-bg-base)', boxShadow: '0 8px 30px #0002', zIndex: 50 }, children: [
          jsx('strong', { children: state.choice ? '请选择本次工作流' : '当前会话工作流' }),
          jsx('p', { style: { color: 'var(--lexflow-dsw-alias-label-tertiary)', lineHeight: 1.6 }, children: state.choice ? '有多个相近结果，选择后开始回答。' : '停止应用影响后续请求，已有回答仍保留。' }),
          ...(state.choice?.candidates ?? []).map((item) => jsx('label', { style: { display: 'flex', gap: '8px', padding: '10px 0' }, children: [jsx('input', { type: 'checkbox', checked: selected.includes(item.fileId), onChange: (event) => setSelected(event.target.checked ? [...selected, item.fileId] : selected.filter((id) => id !== item.fileId)) }), item.name] }, item.fileId)),
          state.choice && jsx('div', { children: [jsx('button', { type: 'button', style: button, onClick: () => act('workflow.session.choose', { choiceId: state.choice.id, fileIds: selected }), children: '应用选择并继续' }), jsx('button', { type: 'button', style: button, onClick: () => act('workflow.session.choose', { choiceId: state.choice.id, fileIds: [] }), children: '本次不使用' })] }),
          ...state.applied.map((item) => jsx('div', { style: { borderTop: '1px solid var(--lexflow-dsw-alias-border-l1)', padding: '10px 0' }, children: [jsx('div', { style: { overflowWrap: 'anywhere' }, children: item.relativePath }), jsx('small', { children: (item.reason || '') + ' · ' + String(item.revision ?? '').slice(0, 8) + (item.detached ? ' · 文件已不在知识库，上下文保留' : '') }), jsx('button', { type: 'button', style: button, onClick: () => act('workflow.session.stop', { fileId: item.fileId }), children: '停止应用' })] }, item.fileId)),
          error && jsx('p', { role: 'alert', children: error }),
          jsx('button', { type: 'button', style: button, onClick: () => setOpen(false), children: '关闭' }),
        ] }),
      ] })
    }
    function SessionLogExport({ sessionId, exportLog }) {
      const React = workflowIndicatorReact
      const { jsx, jsxs } = workflowIndicatorJsx
      const [open, setOpen] = React.useState(false)
      const [state, setState] = React.useState('closed')
      const [error, setError] = React.useState('')
      const selectedSession = React.useRef('')
      const controller = React.useRef(null)
      const { createPortal } = require('react-dom')
      React.useEffect(() => () => controller.current?.abort(), [])
      React.useEffect(() => { if (!open) return; const key = (event) => { if (event.key === 'Escape') { event.preventDefault(); controller.current?.abort(); setOpen(false); setState('closed') } }; document.addEventListener('keydown', key, true); return () => document.removeEventListener('keydown', key, true) }, [open])
      const close = () => { controller.current?.abort(); setOpen(false); setState('closed'); setError('') }
      const begin = () => { selectedSession.current = String(sessionId ?? ''); setError(''); setState('confirm'); setOpen(true) }
      const exportNow = async () => {
        if (controller.current && !controller.current.signal.aborted) return
        const operation = new AbortController(); controller.current = operation
        setState('preparing'); setError('')
        try {
          const result = await exportLog(selectedSession.current, operation.signal)
          if (operation.signal.aborted) return
          const link = document.createElement('a')
          link.href = result.url
          link.download = result.filename
          link.rel = 'noopener'
          document.body.appendChild(link)
          link.click()
          link.remove()
          setState('handed-off')
        } catch (cause) { if (!operation.signal.aborted) { setError(cause instanceof Error ? cause.message : String(cause)); setState('error') } } finally { if (controller.current === operation) controller.current = null }
      }
      return jsxs('span', { style: { position: 'relative', fontSize: '12px' }, children: [
        jsx('button', { type: 'button', 'data-lexflow-header-action': 'log', style: { background: 'transparent', border: 0, boxShadow: 'none', color: 'inherit', cursor: 'pointer', font: 'inherit', padding: '6px 8px' }, onClick: begin, children: '日志' }),
        open && createPortal(jsx('div', { role: 'presentation', 'data-lexflow-modal': 'true', style: { alignItems: 'center', background: 'rgba(15,18,25,.38)', display: 'flex', inset: 0, justifyContent: 'center', position: 'fixed', zIndex: 2147483001 }, onClick: (event) => { if (event.target === event.currentTarget) close() }, children: jsx('section', { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'lexflow-session-export-title', style: { background: 'var(--lexflow-dsw-alias-bg-base)', border: '1px solid var(--lexflow-dsw-alias-border-l2)', borderRadius: '14px', boxShadow: '0 18px 48px rgba(15,14,12,.24)', maxWidth: '440px', padding: '22px', width: 'calc(100% - 36px)' }, children: [
          jsx('h2', { id: 'lexflow-session-export-title', style: { fontSize: '18px', margin: '0 0 8px' }, children: '导出会话' }),
          jsx('p', { style: { color: 'var(--lexflow-dsw-alias-label-secondary)', fontSize: '14px', lineHeight: 1.6, margin: '0 0 18px' }, children: 'LexFlow 将以 ZIP 格式导出本次的会话记录。' }),
          error && jsx('p', { role: 'alert', style: { color: 'var(--lexflow-dsw-alias-state-error-primary, #b42318)', fontSize: '12px' }, children: error }),
          state === 'handed-off' && jsx('p', { role: 'status', style: { color: 'var(--lexflow-dsw-alias-label-secondary)', fontSize: '12px' }, children: '已交给系统保存对话框处理。' }),
          jsxs('div', { style: { display: 'flex', gap: '8px', justifyContent: 'flex-end' }, children: [
            jsx('button', { type: 'button', className: 'lexflowPlainButton', disabled: state === 'preparing' || state === 'handed-off', onClick: exportNow, children: state === 'preparing' ? '准备中…' : '导出' }),
            jsx('button', { type: 'button', className: 'lexflowPlainButton', onClick: close, children: '关闭' }),
          ] }),
        ] }) }), document.body),
      ] })
    }
    const inject = [
      'lexflow',
    ]
    function apply(ctx) {
      modelSelection.apply(ctx)
      const runtime = ctx.get('lexflow')
      runtime.ui.withSessionSlots((scope) => scope.slots.inject('conversation.session.header.utilities', () => scope.slots.register({
        name: 'conversation.session.header.utilities',
        id: 'workflow-applied',
        order: 20,
        inject: (sessionId) => ({ sessionId }),
      }, WorkflowAppliedIndicator)))
      runtime.ui.withSessionSlots((scope) => scope.slots.inject('conversation.session.header.utilities', () => scope.slots.register({
        name: 'conversation.session.header.utilities',
        id: 'lexflow-session-log',
        order: 30,
        inject: (sessionId) => ({ sessionId, exportLog: runtime.documents.exportSessionLog }),
      }, SessionLogExport)))
    }
    exports.inject = inject
    exports.apply = apply
    return module.exports
  },
})
