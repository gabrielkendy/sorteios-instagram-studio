import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
let mock,processServer,base,requests=[];

const fakeRows=[
  {id:'c001', ownerUsername:'maria.silva',text:'Eu quero participar!',timestamp:'2026-10-11T10:00:00Z',commentUrl:'https://www.instagram.com/p/Dabc1234/?comment_id=c001'},
  {id:'c002',ownerUsername:'joao_melo',text:'Que sorteio legal @maria.silva!',timestamp:'2026-10-11T11:00:00Z'},
  {id:'c003',ownerUsername:'carla.faria',text:'Eu também',parentCommentId:'c001',type:'reply'},
  {error:'Erro temporário de comentário'}
];
function serverFactory(handler) {return createServer(handler);}
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
async function freePort() {const s=serverFactory((_,res)=>res.end());await new Promise(r=>s.listen(0,'127.0.0.1',r));const port=s.address().port;await new Promise(r=>s.close(r));return port;}
async function call(pathname,{method='GET',body,headers={}}={}) {
 const r=await fetch(base+pathname,{method,headers: {'X-Marca-Client':'1',...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined});
 return {status:r.status,data:await r.json()};
}
before(async()=>{
 mock=serverFactory(async(req,res)=>{
  const data=[];for await(const c of req)data.push(c);
  let body={};try{body=JSON.parse(Buffer.concat(data).toString('utf8'));}catch{}
  requests.push({url:req.url,body,authorization:req.headers.authorization});
  res.setHeader('Content-Type','application/json');
  if(req.url.includes('/v2/acts/'))return res.end(JSON.stringify({data:{id:'mockRun12345',status:'READY'}}));
  if(req.url.includes('/v2/actor-runs/'))return res.end(JSON.stringify({data:{id:'mockRun12345',status:'SUCCEEDED',defaultDatasetId:'mockDataset987'}}));
  if(req.url.includes('/v2/datasets/'))return res.end(JSON.stringify(fakeRows));
  res.statusCode=404;res.end(JSON.stringify({error:{message:'Not found'}}));
 });
 await new Promise(resolve=>mock.listen(0,'127.0.0.1',resolve));
 const port=await freePort();base=`http://127.0.0.1:${port}`;
 const env={...process.env,PORT:String(port),HOST:'127.0.0.1',APIFY_TOKEN:'apify_api_testtoken000',APIFY_BASE_URL:`http://127.0.0.1:${mock.address().port}`};
 processServer=spawn(process.execPath,[path.join(root,'server.mjs')],{cwd:root,env,stdio:'ignore'});
 let healthy=false;
 for(let i=0;i<60;i++) {try{const r=await fetch(base+'/api/health');if(r.ok){healthy=true;break;}}catch{}await sleep(100);}
 if(!healthy) throw Error('Test server did not start');
});
after(async()=>{
 processServer?.kill();
 await new Promise(resolve=>mock?.close(resolve));
});
test('responde estado saudável e não revela o segredo',{concurrency:false},async()=>{
 const r=await call('/api/health');assert.equal(r.status,200);
 assert.equal(r.data.serverToken,true);assert.ok(!JSON.stringify(r.data).includes('apify_api_'));
});
test('recusa URL diferente do Instagram',{concurrency:false},async()=>{
 const r=await call('/api/jobs',{method:'POST',body:{url:'https://attacker.test/p/codigo/',limit:10}});
 assert.equal(r.status,400);assert.match(r.data.error,/Instagram/);
});
test('recusa chamada cross-site',{concurrency:false},async()=>{
 const r=await call('/api/jobs',{method:'POST',headers:{Origin:'https://site-malicioso.example'},body:{url:'https://www.instagram.com/p/Dabc1234/',limit:10}});
 assert.equal(r.status,403);
});
test('importa pelo link, pagina via dataset e preserva usernames',{concurrency:false},async()=>{
 const start=await call('/api/jobs',{method:'POST',body:{url:'https://www.instagram.com/p/Dabc1234/?igsh=abc',limit:100,includeReplies:true}});
 assert.equal(start.status,200);assert.equal(start.data.id,'mockRun12345');
 const input=requests.find(r=>r.url.includes('/v2/acts/'));
 assert.deepEqual(input.body.posts,['https://www.instagram.com/p/Dabc1234/']);
 assert.equal(input.body.maxComments,100);assert.equal(input.body.includeReplies,true);
 assert.equal(input.authorization,'Bearer apify_api_testtoken000');
 const result=await call('/api/jobs/mockRun12345');
 assert.equal(result.status,200);assert.equal(result.data.status,'SUCCEEDED');
 assert.equal(result.data.items.length,4);
 assert.equal(result.data.items[0].ownerUsername,'maria.silva');
 assert.equal(result.data.items[2].isReply,true);
 assert.equal(result.data.items[3].erro,'Erro temporário de comentário');
 const cached=await call('/api/jobs/mockRun12345');assert.equal(cached.status,200);assert.equal(cached.data.items.length,4);
 assert.equal(requests.filter(r=>r.url.includes('/v2/datasets/')).length,1);
});
test('não expõe o código do servidor publicamente',{concurrency:false},async()=>{
 const r=await fetch(base+'/server.mjs');assert.equal(r.status,404);
});
test('rejeita caminhos inválidos com status apropriado',{concurrency:false},async()=>{
 const r=await call('/api/jobs/xxxxxxxxxxxxxxxxxxx');assert.equal(r.status,404);
});
