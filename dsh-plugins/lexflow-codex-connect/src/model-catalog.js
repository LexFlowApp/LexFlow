const SCHEMA_VERSION = 1
const SIX_HOURS = 6 * 60 * 60 * 1000

export const GPT_6_ASTRA_API_PROFILE = Object.freeze({
  provider: 'openai',
  id: 'gpt-6-astra',
  name: 'GPT-6 Astra',
  source: 'bundled',
  input: ['text', 'image'],
  efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
  defaultEffort: 'medium',
  contextWindow: 1_050_000,
  maxInputTokens: 922_000,
  maxOutputTokens: 128_000,
  transport: 'responses',
  status: 'ready',
  access: 'unverified',
})

export const GPT_6_ASTRA_CODEX_PROFILE = Object.freeze({
  provider: 'openai-codex',
  id: 'gpt-6-astra',
  name: 'GPT-6 Astra',
  source: 'bundled',
  input: ['text', 'image'],
  efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
  defaultEffort: 'medium',
  contextWindow: 272_000,
  maxInputTokens: 240_000,
  maxOutputTokens: 32_000,
  transport: 'codex-responses',
  status: 'ready',
  access: 'unverified',
})

function record(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : null }
function string(value, fallback = '') { return typeof value === 'string' && value.trim() ? value.trim() : fallback }
function positive(value) { return Number.isSafeInteger(value) && value > 0 ? value : undefined }
function uniqueStrings(value, fallback = []) { return Array.isArray(value) ? [...new Set(value.filter((item) => typeof item === 'string' && item.length > 0))] : fallback }
function key(entry) { return `${entry.provider}:${entry.id}` }
function clone(entry) { return { ...entry, input: [...entry.input], efforts: [...entry.efforts] } }

export function knownModelProfile(provider, id) {
  if (provider === 'openai' && id === GPT_6_ASTRA_API_PROFILE.id) return clone(GPT_6_ASTRA_API_PROFILE)
  if (provider === 'openai-codex' && id === GPT_6_ASTRA_CODEX_PROFILE.id) return clone(GPT_6_ASTRA_CODEX_PROFILE)
  return undefined
}

export function normalizeModel(raw, defaults = {}) {
  const value = record(raw)
  if (!value) return undefined
  const provider = string(value.provider, defaults.provider)
  const id = string(value.model ?? value.id)
  if (!provider || !id) return undefined
  const profile = knownModelProfile(provider, id)
  const input = uniqueStrings(value.input ?? value.inputModalities, profile?.input ?? ['text'])
  const efforts = uniqueStrings((value.efforts ?? value.supportedReasoningEfforts)?.map((entry) => typeof entry === 'string' ? entry : entry?.reasoningEffort), profile?.efforts ?? [])
  const contextWindow = positive(value.contextWindow) ?? profile?.contextWindow
  const maxInputTokens = positive(value.maxInputTokens) ?? profile?.maxInputTokens
  const maxOutputTokens = positive(value.maxOutputTokens) ?? profile?.maxOutputTokens
  return {
    provider,
    id,
    name: string(value.name ?? value.displayName, profile?.name ?? id),
    source: string(value.source, defaults.source ?? 'api-discovery'),
    input,
    efforts,
    ...(string(value.defaultEffort ?? value.defaultReasoningEffort, profile?.defaultEffort) ? { defaultEffort: string(value.defaultEffort ?? value.defaultReasoningEffort, profile?.defaultEffort) } : {}),
    ...(contextWindow === undefined ? {} : { contextWindow }),
    ...(maxInputTokens === undefined ? {} : { maxInputTokens }),
    ...(maxOutputTokens === undefined ? {} : { maxOutputTokens }),
    transport: value.transport === 'codex-responses' || defaults.transport === 'codex-responses' ? 'codex-responses' : 'responses',
    status: profile?.status ?? (contextWindow !== undefined && efforts.length > 0 ? 'ready' : 'needs-profile'),
    access: 'unverified',
  }
}

export function mergeModelCatalog({ bundled = [], api = [], codex = [] } = {}) {
  const merged = new Map()
  for (const raw of [...bundled, ...api.map((entry) => ({ ...entry, source: entry.source ?? 'api-discovery' })), ...codex.map((entry) => ({ ...entry, source: entry.source ?? 'codex-app-server' }))]) {
    const value = normalizeModel(raw, raw?.transport === 'codex-responses' ? { transport: 'codex-responses', source: raw.source } : { source: raw?.source })
    if (!value) continue
    const previous = merged.get(key(value))
    merged.set(key(value), previous ? {
      ...previous,
      ...value,
      name: value.name || previous.name,
      input: value.input.length > 0 ? value.input : previous.input,
      efforts: value.efforts.length > 0 ? value.efforts : previous.efforts,
      contextWindow: value.contextWindow ?? previous.contextWindow,
      maxInputTokens: value.maxInputTokens ?? previous.maxInputTokens,
      maxOutputTokens: value.maxOutputTokens ?? previous.maxOutputTokens,
      status: value.status === 'ready' || previous.status !== 'ready' ? value.status : previous.status,
    } : value)
  }
  return [...merged.values()].sort((left, right) => left.provider.localeCompare(right.provider) || left.name.localeCompare(right.name, 'en') || left.id.localeCompare(right.id))
}

export function catalogSnapshot(entries = [], revision = 0, status = 'ready', fetchedAt = null, errorCode) {
  return {
    schemaVersion: SCHEMA_VERSION,
    revision,
    fetchedAt,
    status,
    entries: entries.map(clone),
    ...(errorCode ? { errorCode } : {}),
  }
}

export class ModelCatalogStore {
  constructor({ bundled = [], discoverApi, discoverCodex, now = () => Date.now(), cache } = {}) {
    this.now = now
    this.discoverApi = discoverApi
    this.discoverCodex = discoverCodex
    this.cache = cache
    this.bundled = mergeModelCatalog({ bundled })
    this.snapshot = catalogSnapshot(this.bundled, 0, 'idle', null)
    this.listeners = new Set()
    this.inFlight = undefined
    this.lastFailureAt = 0
    this.failureCount = 0
    this.nextRefreshAt = 0
    this.lastManualAt = -Infinity
  }
  getSnapshot = () => catalogSnapshot(this.snapshot.entries, this.snapshot.revision, this.snapshot.status, this.snapshot.fetchedAt, this.snapshot.errorCode)
  subscribe = (listener) => { this.listeners.add(listener); return () => this.listeners.delete(listener) }
  publish(next) { this.snapshot = next; for (const listener of this.listeners) listener(this.getSnapshot()) }
  isStale(maxAgeMs = SIX_HOURS) { return !this.snapshot.fetchedAt || this.now() - Date.parse(this.snapshot.fetchedAt) >= maxAgeMs }
  async loadCached() {
    const value = await this.cache?.load?.()
    if (!value || value.schemaVersion !== SCHEMA_VERSION || !Array.isArray(value.entries)) return false
    const entries = mergeModelCatalog({ bundled: this.bundled, api: value.entries })
    this.publish(catalogSnapshot(entries, Number.isSafeInteger(value.revision) ? value.revision : 0, 'stale', typeof value.fetchedAt === 'string' ? value.fetchedAt : null))
    return true
  }
  async refresh({ force = false } = {}) {
    if (this.inFlight) return this.inFlight
    if (force && this.now() - this.lastManualAt < 30_000) return this.getSnapshot()
    if (!force && (this.now() < this.nextRefreshAt || !this.isStale())) return this.getSnapshot()
    if (force) this.lastManualAt = this.now()
    this.publish(catalogSnapshot(this.snapshot.entries, this.snapshot.revision, 'refreshing', this.snapshot.fetchedAt))
    this.inFlight = (async () => {
      try {
        const [api, codex] = await Promise.all([
          this.discoverApi ? this.discoverApi() : [],
          this.discoverCodex ? this.discoverCodex() : [],
        ])
        if ((this.discoverApi && !api?.length) || (this.discoverCodex && !codex?.length)) throw Object.assign(new Error('目录为空'), { code: 'DISCOVERY_EMPTY' })
        const entries = mergeModelCatalog({ bundled: this.bundled, api: api ?? [], codex: codex ?? [] })
        this.failureCount = 0; this.nextRefreshAt = 0
        const next = catalogSnapshot(entries, this.snapshot.revision + 1, 'ready', new Date(this.now()).toISOString())
        this.publish(next)
        await this.cache?.save?.(next)
        return this.getSnapshot()
      } catch (error) {
        this.lastFailureAt = this.now()
        this.nextRefreshAt = this.now() + [60_000, 300_000, 1_800_000][Math.min(this.failureCount++, 2)]
        const next = catalogSnapshot(this.snapshot.entries, this.snapshot.revision, this.snapshot.entries.length ? 'stale' : 'error', this.snapshot.fetchedAt, error?.code || 'DISCOVERY_FAILED')
        this.publish(next)
        return this.getSnapshot()
      } finally { this.inFlight = undefined }
    })()
    return this.inFlight
  }
  entry(provider, id) { return this.snapshot.entries.find((item) => item.provider === provider && item.id === id) }
}

export { SCHEMA_VERSION, SIX_HOURS }
