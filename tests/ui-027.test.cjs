const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path')
const React=require('react'),Renderer=require('react-test-renderer')
const root=path.resolve(__dirname,'..'),flush=()=>new Promise(resolve=>setImmediate(resolve))
function pages(){let exported;const document={querySelector:()=>true,addEventListener(){},removeEventListener(){},documentElement:{style:{setProperty(){}}},createElement:()=>({style:{},addEventListener(){},click(){},remove(){}}),body:null};const window={__ModuleLoader__:{load:({factory})=>{exported=factory(id=>id==='@lexflow/workbench-editor'?{createWorkbenchEditor:()=>{throw Error('requires DOM')}}:require(id))}},addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name),setTimeout,clearTimeout,innerWidth:1180,innerHeight:760,document};const listeners=new Map();vm.runInNewContext(fs.readFileSync(path.join(root,'dsh-plugins/lexflow-ui-pages/src/client.js'),'utf8'),{window,document,console,setTimeout,clearTimeout,CustomEvent:class{}});return {...exported,listeners}}
const clickEvent={preventDefault(){},stopPropagation(){},detail:1}
test('UI: file click selects without read; double click previews; Agent edit retains builtin kind',async()=>{
 const ui=pages(),calls=[],navigation=[];const entry={name:'文件.md',kind:'file',relativePath:'工作流/文件.md',type:'workflow',updatedAt:new Date().toISOString()}
 ui.configure({request:async(action,payload)=>{calls.push([action,payload]);if(action==='workflow.status')return{configured:true,knowledgeBases:[{id:'kb',active:true}]};if(action==='workflow.list')return{nodes:[entry]};if(action==='workflow.read')return{item:entry,content:'正文',revision:'v1'};return{}},navigate:(...args)=>navigation.push(args)})
 let view;await Renderer.act(async()=>{view=Renderer.create(React.createElement(ui.pages.Workflow));await flush()})
 const row=view.root.findByProps({className:'lexflowWorkflowRow'})
 await Renderer.act(async()=>row.props.onClick(clickEvent));assert.equal(calls.some(([a])=>a==='workflow.read'),false);assert.equal(row.props['data-selected'],true)
 await Renderer.act(async()=>row.props.onDoubleClick(clickEvent));assert.equal(navigation.length,1);assert.equal(navigation[0][0],'workflow');assert.equal(navigation[0][1].mode,'preview')
 await Renderer.act(async()=>view.unmount())
 const doc={kind:'agent',mode:'preview',id:'builtin:agent',item:{name:'AGENT.md',type:'agent'},content:'规则',revision:'v1'}
 await Renderer.act(async()=>{view=Renderer.create(React.createElement(ui.pages.Workflow,{document:doc}));await flush()})
 await Renderer.act(async()=>view.root.findByProps({'aria-label':'编辑'}).props.onClick())
 assert.equal(navigation.at(-1)[1].kind,'agent');await Renderer.act(async()=>view.unmount())
})
test('UI: new save fetches fresh folders; cancelling picker performs zero writes; default title does not focus input',async()=>{
 const ui=pages(),calls=[];ui.configure({request:async(action,payload)=>{calls.push([action,payload]);return{nodes:[]}}})
 let view;const doc={kind:'archive',mode:'new',draftId:'unique-draft',knowledgeBaseId:'kb',item:{title:'未命名文件'},content:'',targetFolder:'.'}
 await Renderer.act(async()=>{view=Renderer.create(React.createElement(ui.pages.Workbench,{document:doc}));await flush()})
 assert.equal(view.root.findAllByType('input').length,0)
 await Renderer.act(async()=>view.root.findByProps({'aria-label':'保存'}).props.onClick())
 assert.ok(calls.some(([a,p])=>a==='archive.list'&&p.knowledgeBaseId==='kb'))
 const cancel=view.root.findAllByType('button').find(n=>n.children.join('')==='取消')
 await Renderer.act(async()=>cancel.props.onClick());assert.equal(calls.some(([a])=>/commitDocument|createMarkdown|\.save$/.test(a)),false)
 await Renderer.act(async()=>view.unmount())
})
test('UI: F2 opens name editor and Escape does not rename or navigate',async()=>{
 const ui=pages(),calls=[],navigation=[];ui.configure({request:async(a,p)=>{calls.push([a,p]);return a==='workflow.status'?{configured:true}:a==='archive.list'?{nodes:[{name:'文件.md',relativePath:'文件.md',kind:'file'}]}:{}},navigate:(...a)=>navigation.push(a)})
 let view;await Renderer.act(async()=>{view=Renderer.create(React.createElement(ui.pages.Archive));await flush()})
 const row=view.root.findByProps({className:'lexflowWorkflowRow'});const target={}
 await Renderer.act(async()=>row.props.onKeyDown({...clickEvent,key:'F2',target,currentTarget:target}))
 await Renderer.act(async()=>view.root.findByProps({'aria-label':'编辑名称'}).props.onKeyDown({...clickEvent,key:'Escape'}))
 assert.equal(calls.some(([a])=>a==='archive.move'),false);assert.equal(navigation.length,0);await Renderer.act(async()=>view.unmount())
})
