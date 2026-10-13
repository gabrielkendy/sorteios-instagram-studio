/**
 * NOME_DA_SUA_MARCA Sorteios - small dependency-free Node.js server.
 * Fetches comments through Apify's documented Instagram Comments Scraper API.
 * Bind localhost by default. To expose externally, configure HOST + PANEL_PASSWORD.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(root, 'public');
// Opcional: configuração local privada, criada pelo CONFIGURAR-API.bat.
// Variáveis definidas no ambiente têm prioridade.
try {
  const localConfig = fs.readFileSync(path.join(root, '.env.local'),'utf8');
  for(const line of localConfig.split(/\r?\n/)) {
    const match=line.match(/^\s*(APIFY_TOKEN|PORT|HOST|PANEL_PASSWORD)\s*=\s*(.*?)\s*$/);
    if(match && !Object.hasOwn(process.env,match[1])) {
      let val=match[2];
      if((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val=val.slice(1,-1);
      process.env[match[1]]=val;
    }
  }
} catch(e) { if(e?.code!=='ENOENT') console.error('Aviso: não foi possível ler .env.local.'); }
const PORT = Number(process.env.PORT || 3214);
const HOST = process.env.HOST || '127.0.0.1';
if (!['127.0.0.1','localhost','::1'].includes(HOST) && !process.env.PANEL_PASSWORD) {
  console.error('Por segurança, defina PANEL_PASSWORD antes de expor o painel na rede.');
  process.exit(1);
}
const PANEL_PASSWORD = process.env.PANEL_PASSWORD || '';
const envToken = process.env.APIFY_TOKEN || '';
const officialLogo = process.env.MARCA_LOGO_URL || '';  // opcional: URL publica do logo da marca
// Fotos de perfil baixadas localmente: o link do Instagram expira em horas.
const fotoDir = path.join(root, 'public', 'fotos');
const postPreviewDir = path.join(root, 'public', 'post');
fs.mkdirSync(fotoDir, { recursive: true });
fs.mkdirSync(postPreviewDir, { recursive: true });
function nomeFoto(username){ return crypto.createHash('sha1').update(String(username)).digest('hex').slice(0,16) + '.jpg'; }
async function baixarFoto(username, url){
  if(!username || !url) return '';
  const nome = nomeFoto(username);
  const dest = path.join(fotoDir, nome);
  try { if(fs.statSync(dest).size > 900) return nome; } catch(e) {}
  try {
    const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36' } });
    if(r.ok){
      const buf = Buffer.from(await r.arrayBuffer());
      if(buf.length > 900){ fs.writeFileSync(dest, buf); return nome; }
    }
  } catch(e) {}
  return '';
}
// Detalhes do post via Apify (o Instagram bloqueia acesso anonimo com parede de login).
const postCacheDir = path.join(root, 'cache');
fs.mkdirSync(postCacheDir, { recursive: true });
async function detalhesDoPost(shortcode){
  const cache = path.join(postCacheDir, 'post-' + shortcode + '.json');
  try {
    const st = fs.statSync(cache);
    if(Date.now() - st.mtimeMs < 6 * 3600 * 1000) return JSON.parse(fs.readFileSync(cache,'utf8'));
  } catch(e) {}
  const vazio = { legenda:'', capaUrl:'', curtidas:'', comentarios:'', autor:'', tipo:'', ehVideo:false };
  const token = process.env.APIFY_TOKEN || envToken;
  if(!token) return vazio;
  try{
    const url = `https://www.instagram.com/p/${shortcode}/`;
    const runR = await fetch(`https://api.apify.com/v2/acts/apify~instagram-scraper/runs?token=${token}`,{
      method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ directUrls:[url], resultsType:'details', resultsLimit:1 })
    });
    const run = await runR.json();
    if(!run?.data?.id) return vazio;
    const runId = run.data.id;
    for(let i=0;i<24;i++){
      await new Promise(r=>setTimeout(r,2500));
      const stR = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${token}`);
      const st = await stR.json();
      const status = st?.data?.status;
      if(['SUCCEEDED','FAILED','TIMED-OUT','ABORTED'].includes(status)){
        if(status !== 'SUCCEEDED') return vazio;
        const ds = st.data.defaultDatasetId;
        const itR = await fetch(`https://api.apify.com/v2/datasets/${ds}/items?token=${token}&clean=true`);
        const itens = await itR.json();
        if(!Array.isArray(itens) || !itens.length) return vazio;
        const it = itens[0];
        const meta = {
          legenda: String(it.caption || it.alt || '').slice(0,1500),
          capaUrl: String(it.displayUrl || it.display_url || '').slice(0,900),
          curtidas: String(it.likesCount ?? ''),
          comentarios: String(it.commentsCount ?? ''),
          autor: String(it.ownerUsername ? '@' + it.ownerUsername : (it.ownerFullName || '')).slice(0,80),
          tipo: String(it.type || ''),
          ehVideo: /video|reel/i.test(String(it.type || ''))
        };
        try { fs.writeFileSync(cache, JSON.stringify(meta)); } catch(e) {}
        return meta;
      }
    }
    return vazio;
  }catch(e){ return vazio; }
}
async function baixarTodasFotos(itens){
  const alvos = new Map();
  for(const it of itens){ if(it.ownerUsername && !alvos.has(it.ownerUsername)) alvos.set(it.ownerUsername, it._fotoOrigem || ''); }
  const lista = [...alvos.entries()].filter(([u,f])=>f);
  let i = 0;
  const workers = Array.from({length: 8}, async () => {
    while(i < lista.length){
      const [u, f] = lista[i++];
      const nome = await baixarFoto(u, f);
      if(nome){
        for(const it of itens){ if(it.ownerUsername === u) it.ownerProfilePic = nome; }
      }
    }
  });
  await Promise.all(workers);
  return itens;
}
// Coletor principal: devolve o post inteiro (417/419 medidos no post da sua marca).
// O coletor antigo (apify~instagram-comment-scraper) cortava em 15 comentarios.
const actor = process.env.APIFY_ACTOR || 'xtracto~instagram-post-comments-scraper';
// Coletor oficial da Apify: usado como reserva quando o principal falha.
const fallbackActor = 'apify~instagram-comment-scraper';
const apifyBase = process.env.APIFY_BASE_URL || 'https://api.apify.com';
const jobs = new Map();
const counters = new Map();
let logoCached = null;

const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.ico':'image/x-icon','.json':'application/json; charset=utf-8','.csv':'text/csv; charset=utf-8'};

function json(res, code, value) {
  const payload = JSON.stringify(value);
  res.writeHead(code, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store','X-Content-Type-Options':'nosniff' });
  res.end(payload);
}
function error(res, code, message) { json(res, code, {error:message}); }
function validUrl(value) {
  if (typeof value !== 'string' || value.length > 600) return null;
  try {
    const u = new URL(value);
    if (!['https:'].includes(u.protocol) || !['instagram.com','www.instagram.com'].includes(u.hostname.toLowerCase())) return null;
    const parts = u.pathname.split('/').filter(Boolean);
    if (!['p','reel'].includes(parts[0]) || !/^[A-Za-z0-9_-]{5,40}$/.test(parts[1]||'') || parts.length > 2) return null;
    return `https://www.instagram.com/${parts[0]}/${parts[1]}/`;
  } catch { return null; }
}
function auth(res, req) {
  if (!PANEL_PASSWORD) return true;
  const provided = (req.headers.authorization || '').replace(/^Basic /i, '');
  let pass = '';
  try { pass = Buffer.from(provided,'base64').toString('utf8').split(':').slice(1).join(':'); } catch {}
  const a = Buffer.from(pass), b = Buffer.from(PANEL_PASSWORD);
  if (a.length===b.length && crypto.timingSafeEqual(a,b)) return true;
  res.writeHead(401, {'WWW-Authenticate':'Basic realm="NOME_DA_SUA_MARCA Sorteios"', 'Content-Type':'text/plain; charset=utf-8'});
  res.end('Senha necessaria'); return false;
}
function rateLimit(req) {
  const ip = req.socket.remoteAddress||'local';
  const now = Date.now();
  const item = counters.get(ip)||{n:0,t:now};
  if (now-item.t>10*60*1000) {item.n=0;item.t=now;}
  item.n++; counters.set(ip,item);
  return item.n<=20;
}
function cleanupJobs() {
  const now = Date.now();
  for(const [id,j] of jobs) if(now-j.created>35*60*1000) jobs.delete(id);
}
async function readJson(req, maxBytes=32_000) {
  let chunks=[], n=0;
  for await(const part of req) {
    n+=part.length; if(n>maxBytes) throw new Error('Requisição grande demais.');
    chunks.push(part);
  }
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new Error('JSON inválido.');}
}
async function apiFetch(url, token, opts={}) {
  const controller = new AbortController();
  const timeout = setTimeout(()=>controller.abort(), 27_000);
  try {
    const response = await fetch(url,{...opts, signal:controller.signal,headers:{'Authorization':`Bearer ${token}`,'Content-Type':'application/json', ...(opts.headers||{})}});
    const content=await response.text();
    let data; try {data=JSON.parse(content);} catch {data={message:content.slice(0,250)};}
    if(!response.ok) throw new Error(`Apify HTTP ${response.status}: ${data?.error?.message || data?.message || 'Falha na integração'}`);
    return data;
  }finally{clearTimeout(timeout);}
}
async function serveLogo(res) {
  try {
    if (!logoCached) {
      const controller = new AbortController();
      const to=setTimeout(()=>controller.abort(),10_000);
      try {
        const resp=await fetch(officialLogo, {signal:controller.signal,headers:{'User-Agent':'Mozilla/5.0'}});
        if(!resp.ok) throw Error('Não foi possível carregar logo pública');
        const buffer=Buffer.from(await resp.arrayBuffer());
        if(buffer.length>2_500_000 || buffer.length<100) throw Error('Arquivo inválido');
        logoCached={buffer, mime: resp.headers.get('content-type')?.startsWith('image/') ? resp.headers.get('content-type'):'image/png'};
      }finally{clearTimeout(to);}
    }
    res.writeHead(200,{'Content-Type':logoCached.mime,'Cache-Control':'public, max-age=86400', 'X-Content-Type-Options':'nosniff'});
    res.end(logoCached.buffer);
  } catch {
    const buffer=fs.readFileSync(path.join(publicDir,'assets/logo-fallback.svg'));
    res.writeHead(200,{'Content-Type':'image/svg+xml','Cache-Control':'no-store'});res.end(buffer);
  }
}
function serveStatic(req,res,u) {
  let pathname;
  try{pathname=decodeURIComponent(u.pathname);}catch{return error(res,400,'Endereço inválido');}
  if(pathname==='/') pathname='/index.html';
  const file=path.resolve(publicDir, '.'+pathname);
  if(file!==publicDir && !file.startsWith(publicDir+path.sep))return error(res,403,'Arquivo não permitido');
  try{
    const stat=fs.statSync(file);
    if(!stat.isFile()) return error(res,404,'Não encontrado');
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':'no-cache'});
    fs.createReadStream(file).pipe(res);
  }catch{return error(res,404,'Não encontrado');}
}

const server=http.createServer(async(req,res)=>{
  if(!auth(res,req)) return;
  if(req.method==='POST') {
    // Bloqueia requisições cross-site para reduzir abuso da API paga via navegador.
    const origin = req.headers.origin;
    if (origin) {
      try { const o=new URL(origin); const host=(req.headers.host||'').toLowerCase(); if(o.host.toLowerCase()!==host) return error(res,403,'Origem não permitida.'); }
      catch {return error(res,403,'Origem não permitida.');}
    }
    if (req.headers['x-marca-client'] !== '1' || !(req.headers['content-type']||'').startsWith('application/json')) return error(res,403,'Requisição não autorizada.');
  }
  const u=new URL(req.url||'/',`http://${req.headers.host||'127.0.0.1'}`);
  if(req.method==='GET' && u.pathname==='/api/health') return json(res,200,{ok:true,version:'1.0.0',urlImport:true,serverToken:!!envToken});
  // Capa/miniatura do post, baixada uma vez e guardada em disco (link do Instagram expira).
  if(req.method==='GET' && u.pathname==='/api/post-preview'){
    try{
      const alvo=String(u.searchParams.get('url')||'');
      const m=alvo.match(/instagram\.com\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]{5,40})/);
      if(!m) return error(res,400,'Link do Instagram inválido.');
      const sc=m[1];
      const dest=path.join(postPreviewDir, sc + '.jpg');
      if(fs.existsSync(dest) && fs.statSync(dest).size>2000){
        const buf=fs.readFileSync(dest);
        res.writeHead(200,{'content-type':'image/jpeg','cache-control':'public, max-age=86400','content-length':buf.length});
        return res.end(buf);
      }
      const meta=await detalhesDoPost(sc);
      if(!meta.capaUrl) return error(res,404,'Não foi possível ler a capa desse post.');
      const img=await fetch(meta.capaUrl,{headers:{'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36'}});
      if(!img.ok) return error(res,502,'O Instagram recusou a capa agora.');
      const buf=Buffer.from(await img.arrayBuffer());
      if(buf.length>2000) fs.writeFileSync(dest,buf);
      res.writeHead(200,{'content-type':img.headers.get('content-type')||'image/jpeg','cache-control':'public, max-age=86400','content-length':buf.length,'x-nio-video':meta.ehVideo?'1':'0'});
      return res.end(buf);
    }catch(e){ return error(res,502,e.message||'Falha ao buscar a capa do post.'); }
  }
  // Detalhes do post (legenda, curtidas, contagem de comentários) para exibir na tela.
  if(req.method==='GET' && u.pathname==='/api/post-info'){
    try{
      const alvo=String(u.searchParams.get('url')||'');
      const m=alvo.match(/instagram\.com\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]{5,40})/);
      if(!m) return error(res,400,'Link do Instagram inválido.');
      const meta=await detalhesDoPost(m[1]);
      return json(res,200,{
        shortcode:m[1],
        legenda:meta.legenda,
        capa:!!meta.capaUrl,
        curtidas:meta.curtidas,
        comentarios:meta.comentarios,
        autor:meta.autor,
        tipo:meta.tipo
      });
    }catch(e){ return error(res,502,e.message||'Falha ao ler o post.'); }
  }
  if(req.method==='GET' && u.pathname==='/api/brand-logo') return serveLogo(res);
  if(req.method==='POST' && u.pathname==='/api/jobs') {
    if(!rateLimit(req)) return error(res,429,'Muitas importações. Aguarde alguns minutos.');
    try{
      const body=await readJson(req);
      const url=validUrl(body.url);
      if(!url)return error(res,400,'Cole a URL de um post (/p/) ou Reel (/reel/) público do Instagram.');
      const token = envToken || String(req.headers['x-apify-token']||'').trim();
      if(!token || token.length>300) return error(res,400,'Configure o token da Apify para importar pela URL.');
      const limit= Math.max(1, Math.min(20000, Math.trunc(Number(body.limit)||5000)));
      const replies = body.includeReplies === true;
      const primaryPayload={posts:[url],maxComments:limit,includeReplies:replies};
      const legacyPayload={directUrls:[url],resultsLimit:limit,includeNestedComments:replies};
      let response,data,usedActor=actor,legacyUsed=false;
      try {
        response=await apiFetch(`${apifyBase}/v2/acts/${actor}/runs`,token,{method:'POST',body:JSON.stringify(primaryPayload)});
        data=response.data||{};
        if(!data.id) data={};
      } catch(e) {
        // Reserva: o coletor oficial da Apify (cobre menos comentarios, mas nao falha).
        response=await apiFetch(`${apifyBase}/v2/acts/${fallbackActor}/runs`,token,{method:'POST',body:JSON.stringify(legacyPayload)});
        data=response.data||{}; usedActor=fallbackActor; legacyUsed=true;
      }
      if(!data.id)return error(res,502,'A Apify não forneceu ID da importação.');
      cleanupJobs();jobs.set(data.id,{created:Date.now(),token,url,limit,replies,loaded:null,usedActor,legacyUsed});
      return json(res,200,{id:data.id,status:data.status,url,limit,replies,actor:usedActor});
    }catch(e){return error(res,502,e.message||'Falha ao iniciar importação');}
  }
  const match = u.pathname.match(/^\/api\/jobs\/([A-Za-z0-9_-]{5,90})$/);
  if(req.method==='GET' && match) {
    const job=jobs.get(match[1]);
    if(!job)return error(res,404,'Importação não encontrada ou expirada.');
    try {
      if(job.loaded)return json(res,200,{status:'SUCCEEDED',items:job.loaded,url:job.url,limit:job.limit,replies:job.replies});
      const response=await apiFetch(`${apifyBase}/v2/actor-runs/${encodeURIComponent(match[1])}`,job.token);
      const d=response.data||{};
      const status=d.status||'RUNNING';
      if(status==='SUCCEEDED'){
        const datasetId = d.defaultDatasetId;
        if(!datasetId) return error(res,502,'A importação terminou sem dataset.');
        const datasetLimit = Math.min(100000, job.replies ? job.limit*5 : job.limit);
        const items=await apiFetch(`${apifyBase}/v2/datasets/${encodeURIComponent(datasetId)}/items?format=json&clean=true&limit=${datasetLimit}`,job.token);
        if(!Array.isArray(items))return error(res,502,'Os dados retornados não são uma lista de comentários.');
        const sanitized=items.map(v=>({
          id:String(v?.id || v?.commentId || ''),
          ownerUsername:String(v?.ownerUsername || v?.owner?.username || v?.username || v?.user?.username || '').slice(0,80),
          ownerId:String(v?.ownerId || v?.owner?.id || v?.user?.id || '').slice(0,100),
          text:String(v?.text || v?.comment || '').slice(0,1500),
          timestamp:String(v?.timestamp || (v?.createdAt ? (Number.isFinite(Number(v.createdAt)) ? new Date(Number(v.createdAt)*1000).toISOString() : v.createdAt) : '')).slice(0,100),
          commentUrl:String(v?.commentUrl || '').slice(0,500),
          parentCommentUrl:String(v?.parentCommentUrl || '').slice(0,500),
          parentCommentId:String(v?.parentCommentId || v?.parentId || '').slice(0,100),
          isReply:Boolean(v?.isReply || v?.type==='reply' || v?.parentCommentId || v?.parentCommentUrl),
          ownerProfilePicUrl:String(v?.ownerProfilePicUrl || v?.user?.profilePicUrl || '').slice(0,700),
          _fotoOrigem:String(v?.ownerProfilePicUrl || v?.user?.profilePicUrl || '').slice(0,700),
          erro: String(v?.error || v?.errorDescription || '').slice(0,400)
        })).filter(v=>v.ownerUsername||v.erro);
        await baixarTodasFotos(sanitized);
        const limpos = sanitized.map(({_fotoOrigem, ...resto}) => resto);
        job.loaded = limpos;
        const comFoto = limpos.filter(i=>i.ownerProfilePic).length;
        return json(res,200,{status,items:limpos,url:job.url,limit:job.limit,replies:job.replies,actor:job.usedActor||actor,partial:!!job.legacyUsed,comFoto});
      }
      if(['FAILED','TIMED-OUT','ABORTED'].includes(status)) return json(res,200,{status,message:d.statusMessage||'A importação não foi concluída.'});
      return json(res,200,{status,progress:d.stats||null});
    } catch(e) { return error(res,502,e.message||'Erro ao consultar importação'); }
  }
  if(req.method==='GET'||req.method==='HEAD') return serveStatic(req,res,u);
  return error(res,405,'Método não permitido');
});
server.listen(PORT,HOST,()=>console.log(`\nNOME_DA_SUA_MARCA SORTEIOS\nAbra: http://${HOST}:${PORT}\nModo automático: ${envToken?'token configurado no servidor':'cole seu token Apify no painel'}\n`));
