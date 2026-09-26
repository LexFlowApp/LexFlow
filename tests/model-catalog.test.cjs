const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const root = path.resolve(__dirname, '..')

async function catalogModule() {
  return import(pathToFileURL(path.join(root, 'dsh-plugins/lexflow-codex-connect/src/model-catalog.js')).href)
}

test('model catalog keeps API and Codex Astra routes separate and deduplicates provider/id', async () => {
  const { mergeModelCatalog } = await catalogModule()
  const entries = mergeModelCatalog({
    bundled: [{ provider: 'openai-codex', id: 'gpt-6-astra', name: 'GPT-6 Astra', input: ['text', 'image'], efforts: ['low', 'medium', 'high', 'xhigh', 'max'], contextWindow: 272000, maxOutputTokens: 32000, transport: 'codex-responses' }],
    api: [{ provider: 'openai', id: 'gpt-6-astra', name: 'GPT-6 Astra', input: ['text', 'image'], efforts: ['low', 'medium', 'high', 'xhigh', 'max'], contextWindow: 1050000, maxInputTokens: 922000, maxOutputTokens: 128000 }],
    codex: [{ provider: 'openai-codex', id: 'gpt-6-astra', name: 'GPT-6 Astra', efforts: ['low', 'medium', 'high', 'xhigh', 'max'], contextWindow: 272000, maxOutputTokens: 32000, transport: 'codex-responses' }]
  })
  assert.equal(entries.filter((entry) => entry.id === 'gpt-6-astra').length, 2)
  assert.deepEqual(entries.find((entry) => entry.provider === 'openai').input, ['text', 'image'])
  assert.equal(entries.find((entry) => entry.provider === 'openai-codex').contextWindow, 272000)
})

test('model catalog single-flight refresh retains the last successful snapshot on failure', async () => {
  const { ModelCatalogStore } = await catalogModule()
  let now = 100000
  let calls = 0
  let rejectNext = false
  const store = new ModelCatalogStore({
    bundled: [{ provider: 'openai', id: 'gpt-6-astra', name: 'GPT-6 Astra', input: ['text', 'image'], efforts: ['low'], contextWindow: 1050000, maxOutputTokens: 128000 }],
    discoverApi: async () => { calls += 1; if (rejectNext) throw Object.assign(new Error('offline'), { code: 'OFFLINE' }); return [{ provider: 'openai', id: 'gpt-new', name: 'New', input: ['text'], efforts: ['low'] }] },
    now: () => now
  })
  const [first, second] = await Promise.all([store.refresh({ force: true }), store.refresh({ force: true })])
  assert.equal(calls, 1)
  assert.equal(first.revision, second.revision)
  assert.equal(store.getSnapshot().entries.some((entry) => entry.id === 'gpt-new'), true)
  now += 31000
  rejectNext = true
  const failed = await store.refresh({ force: true })
  assert.equal(failed.status, 'stale')
  assert.equal(failed.entries.some((entry) => entry.id === 'gpt-new'), true)
})

function fakeProcess(reply) {
 const {EventEmitter}=require('node:events'), {PassThrough,Writable}=require('node:stream')
 const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.exitCode=null;child.killed=false
 child.stdin=new Writable({write(chunk,_enc,done){ const req=JSON.parse(String(chunk));queueMicrotask(()=>reply(req,child));done() }})
 child.kill=()=>{child.killed=true;child.exitCode=0;child.stdout.end();child.stderr.end();child.emit('exit',0)}
 return child
}
test('Codex discovery reads official effort objects, paginates, and kills only its child',async()=>{
 const {discoverCodexModels}=await import(pathToFileURL(path.join(root,'dsh-plugins/lexflow-codex-connect/src/codex-model-discovery.js')))
 const calls=[];const child=fakeProcess((req,c)=>{calls.push(req.method);if(req.method==='initialized')return; const result=req.method==='initialize'?{}:{data:[{id:'ui-id',model:req.params.cursor?'gpt-6-astra':'gpt-first',supportedReasoningEfforts:[{reasoningEffort:'max'}],inputModalities:['text','image']}],nextCursor:req.params.cursor?null:'next'};c.stdout.write(JSON.stringify({id:req.id,result})+'\n')})
 const models=await discoverCodexModels({executable:process.execPath,spawnImpl:()=>child})
 assert.deepEqual(calls,['initialize','initialized','model/list','model/list']);assert.equal(models[1].id,'gpt-6-astra');assert.deepEqual(models[1].efforts,['max']);assert.equal(child.killed,true)
})
test('Codex discovery timeout and early exit reject without uncaught exceptions',async()=>{
 const {discoverCodexModels}=await import(pathToFileURL(path.join(root,'dsh-plugins/lexflow-codex-connect/src/codex-model-discovery.js')))
 const silent=fakeProcess(()=>{});await assert.rejects(discoverCodexModels({executable:process.execPath,spawnImpl:()=>silent,timeoutMs:10}),{code:'DISCOVERY_TIMEOUT'});assert.equal(silent.killed,true)
 const early=fakeProcess((_req,c)=>c.emit('exit',1));await assert.rejects(discoverCodexModels({executable:process.execPath,spawnImpl:()=>early}),{code:'DISCOVERY_CLOSED'})
})
