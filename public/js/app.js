/* NOME_DA_SUA_MARCA Sorteios Studio — client side. Sem bibliotecas e sem dados de exemplo no sorteio real. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const ids = ['postUrl','maxComments','includeReplies','importUrl','apiProgress','progressLabel','importNotice','countImported','countEligible','liveEligible','statusResult','sourceLabel','importMeta','dataInsight','limitWarning','confirmLimit','drawButton','drawLabel','drawFootnote','winnerBox','winnerHandle','winnerProfile','winnerInitials','downloadProof','downloadParticipants','resetDraw','posterCanvas','posterState','exportPoster','prizeName','keyword','minMentions','excludedHandles','dedupeUsers','topLevelOnly','formatStory','formatFeed','uploadLogo','logoInput','modeUrl','modeCsv','urlBox','csvBox','csvInput','dropzone','openToken','tokenDialog','tokenInput','saveToken','connectionStatus','helpButton','helpDialog','closeHelp','closeHelpOk','eligibleDialog','eligibleList','eligibleMessage','seeEligible','closeEligible','winnerQty','wqMais','wqMenos','spinButton','spinLabel','drawBriefQty','postCard','postThumb','postCaption','postPill','postCount','postOpen','postRetry','postVideoBadge','postCardError','toast'];
  const el = Object.fromEntries(ids.map(id => [id, $(id)]));
  const fmtNum = new Intl.NumberFormat('pt-BR');
  let sessionStore;
  try {sessionStore = window.sessionStorage;} catch {sessionStore = null;}
  const state = {
    comments: [], eligible: [], mode: 'url', source: '', postUrl: '',
    format: 'story', logo: null, token: sessionStore?.getItem('marca_apify_token') || '',
    serverToken: false, limit: 5000, limitReached: false, busy: false, rolling: false,
    currentJob: null, winner: null, proof: null, isDemo: false, logoObjectUrl: '',
    winnerPhoto: null      // HTMLImageElement da foto do ganhador (entra na arte)
  };
  let toastTimer = 0;

  function toast(message) {
    el.toast.textContent = message;
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('show'), 4200);
  }
  function notice(message, type = 'info') {
    el.importNotice.textContent = message;
    el.importNotice.className = `message-banner ${type}`;
  }
  function hideNotice() { el.importNotice.className = 'message-banner hidden'; }
  function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
  function nf(n) { return fmtNum.format(n || 0); }
  function safeUsername(raw) {
    let s = String(raw ?? '').trim().replace(/^@+/, '');
    const url = s.match(/^https?:\/\/(?:www\.)?instagram\.com\/([\w.]+)\/?/i);
    if (url) s = url[1];
    if (s.startsWith('@')) s = s.slice(1);
    if (!/^[a-zA-Z0-9_.]{1,30}$/.test(s)) return '';
    return s.toLowerCase();
  }
  function cleanComment(raw, n = 0) {
    if (typeof raw === 'string') {
      const username = safeUsername(raw);
      return username ? {username, id: `lista-${n}`, text: '', timestamp: '', isReply: false, source: 'lista'} : null;
    }
    if (!raw || typeof raw !== 'object') return null;
    const username = safeUsername(raw.ownerUsername ?? raw.username ?? raw.handle ?? raw.usuario ?? raw.user_name ?? raw.user?.username ?? raw.owner?.username ?? raw.from?.username ?? '');
    if (!username) return null;
    const id = String(raw.id ?? raw.commentId ?? raw.comment_id ?? raw.pk ?? `registro-${n}`).slice(0, 130);
    const text = String(raw.text ?? raw.comment ?? raw.content ?? raw.comentario ?? raw.conteudo ?? '').slice(0, 3500);
    const timestamp = String(raw.timestamp ?? raw.createdAt ?? raw.created_at ?? '').slice(0, 100);
    const isReply = Boolean(raw.isReply || raw.type === 'reply' || raw.parentCommentId || raw.parentId || raw.parentCommentUrl || raw.inReplyTo);
    // Foto do perfil: a roleta mostra a cara do ganhador. Guardamos o nome do arquivo local.
    const pic = String(raw.ownerProfilePic ?? raw.profilePic ?? raw.profilePicUrl ?? raw.user?.profilePic ?? raw.user?.profilePicUrl ?? raw.owner?.profilePicUrl ?? '').slice(0, 700);
    return { username, id, text, timestamp, isReply, ownerProfilePic: pic, source: 'comentario' };
  }
  function cleanAll(items) {
    if (!Array.isArray(items)) throw new Error('A lista importada não tem o formato esperado.');
    const seenIDs = new Set();
    const clean = [];
    for (let i = 0; i < items.length; i++) {
      const raw = items[i];
      if (raw?.error || raw?.errorDescription) continue;
      const comment = cleanComment(raw, i);
      if (!comment) continue;
      // Evita cobrar duas entradas pelo mesmo identificador. Comentários sem ID recebem sequenciais.
      if (!/^(registro|lista)-/.test(comment.id)) {
        if (seenIDs.has(comment.id)) continue;
        seenIDs.add(comment.id);
      }
      clean.push(comment);
      if (raw && Array.isArray(raw.replies)) {
        for (const [j, reply] of raw.replies.entries()) {
          const child = cleanComment({...reply, isReply: true, parentCommentId: comment.id}, `${i}-r${j}`);
          if (child && !seenIDs.has(child.id)) { seenIDs.add(child.id); clean.push(child); }
        }
      }
    }
    return clean;
  }
  function normalize(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
  function currentRules() {
    const excluded = el.excludedHandles.value.split(/[,;\s]+/).map(safeUsername).filter(Boolean);
    return {
      prize: el.prizeName.value.trim() || 'PRÊMIO OFICIAL',
      keyword: el.keyword.value.trim(),
      minMentions: Number(el.minMentions.value),
      excludedHandles: [...new Set(excluded)],
      onePerProfile: el.dedupeUsers.checked,
      topLevelOnly: el.topLevelOnly.checked
    };
  }
  function mentionCount(text, username) {
    const tags = [...String(text || '').matchAll(/(?:^|[^\w.])@([a-zA-Z0-9_.]{1,30})/g)]
      .map(m => m[1].toLowerCase()).filter(x => x !== username);
    return new Set(tags).size;
  }
  function buildEligible() {
    const rules = currentRules();
    const excluded = new Set(rules.excludedHandles);
    const seen = new Set();
    const eligible = [];
    for (const c of state.comments) {
      if (excluded.has(c.username) || (rules.topLevelOnly && c.isReply)) continue;
      if (rules.keyword && !normalize(c.text).includes(normalize(rules.keyword))) continue;
      if (mentionCount(c.text, c.username) < rules.minMentions) continue;
      if (rules.onePerProfile && seen.has(c.username)) continue;
      seen.add(c.username);
      eligible.push(c);
    }
    return eligible;
  }
  function resetWinner(silent = false) {
    if (state.rolling) return;
    state.winner = null;
    state.proof = null;
    el.winnerBox.classList.add('hidden');
    el.downloadProof.disabled = true;
    el.resetDraw.disabled = true;
    el.exportPoster.disabled = true;
    el.posterState.textContent = 'PRÉVIA · GANHADOR AINDA NÃO DEFINIDO';
    el.statusResult.innerHTML = '<i></i> Aguardando sorteio';
    if (!silent) toast('Resultado anterior removido do painel. Se necessário, guarde o comprovante.');
    drawPoster();
    updateButton();
  }
  function updateButton() {
    const ready = state.eligible.length && !state.busy && !state.rolling && (!state.limitReached || el.confirmLimit.checked);
    el.drawButton.disabled = !ready || !!state.winner;
    if (state.busy) el.drawFootnote.textContent = 'Importação em andamento. Aguarde a conclusão.';
    else if (!state.comments.length) el.drawFootnote.textContent = 'Importe participantes reais para habilitar o sorteio.';
    else if (!state.eligible.length) el.drawFootnote.textContent = 'Não há perfis elegíveis após aplicar as regras.';
    else if (state.limitReached && !el.confirmLimit.checked) el.drawFootnote.textContent = 'Confirme a cobertura da coleta para continuar.';
    else if (state.winner) el.drawFootnote.textContent = 'Resultado definido. Baixe a imagem e o comprovante.';
    else el.drawFootnote.textContent = `${nf(state.eligible.length)} participações válidas · chance igual para cada entrada.`;
    const q=el.winnerQty?Math.max(1,Math.min(50,parseInt(el.winnerQty.value,10)||1)):1;
    el.drawLabel.textContent = state.rolling ? 'SORTEANDO...' : state.winner ? 'SORTEIO CONCLUÍDO' : (q>1?`SORTEAR ${q} GANHADORES`:`SORTEAR ${q} GANHADOR`);
    if(el.drawBriefQty) el.drawBriefQty.textContent = q>1?`${q} vencedores`:`${q} vencedor`;
    if(el.spinButton) el.spinButton.classList.toggle('hidden', !state.eligible.length);
  }
  function refreshEligibles(rulesChanged = false) {
    if (state.rolling) return;
    if (rulesChanged && state.winner) resetWinner(true);
    state.eligible = buildEligible();
    el.countEligible.textContent = nf(state.eligible.length).padStart(2, '0');
    el.liveEligible.textContent = state.comments.length ? nf(state.eligible.length) : '—';
    updateButton();
    if (rulesChanged) drawPoster();
  }
  function setComments(items, opts = {}) {
    const comments = cleanAll(items);
    if (!comments.length) {
      notice('Nenhum comentário válido com nome de usuário foi encontrado. Confira se a publicação é pública ou experimente outra forma de importação.', 'error');
      return false;
    }
    state.comments = comments;
    state.source = opts.source || 'Importação';
    state.postUrl = opts.postUrl || '';
    state.isDemo = !!opts.demo;
    state.limit = opts.limit || 5000;
    state.limitReached = !!opts.limitReached;
    el.confirmLimit.checked = false;
    el.limitWarning.classList.toggle('hidden', !state.limitReached);
    el.countImported.textContent = nf(comments.length).padStart(2,'0');
    el.sourceLabel.textContent = state.source;
    el.importMeta.textContent = `${nf(comments.length)} comentários válidos importados${state.isDemo ? ' · TESTE DEMONSTRATIVO' : ''}`;
    el.dataInsight.classList.remove('hidden');
    resetWinner(true);
    refreshEligibles(false);
    notice(state.isDemo ? 'Modo demonstração: participantes fictícios. Nunca use como sorteio verdadeiro.' : `${nf(comments.length)} comentários carregados. Confira as regras e a quantidade exibida pelo Instagram. A captura pública pode ser incompleta.`, state.isDemo ? 'info' : 'success');
    drawPoster();
    return true;
  }
  function setBusy(busy) {
    state.busy = busy;
    el.importUrl.disabled = busy;
    el.apiProgress.classList.toggle('hidden', !busy);
    updateButton();
  }
  function normalizedPostUrl(s) {
    try {
      const u = new URL(s.trim());
      if (!['instagram.com', 'www.instagram.com'].includes(u.hostname.toLowerCase()) || u.protocol !== 'https:') return '';
      const path = u.pathname.split('/').filter(Boolean);
      if (!['p','reel'].includes(path[0]) || !/^[\w-]{5,40}$/.test(path[1] || '') || path.length !== 2) return '';
      return `https://www.instagram.com/${path[0]}/${path[1]}/`;
    } catch { return ''; }
  }
  async function fetchJson(url, opts = {}) {
    const resp = await fetch(url, opts);
    let data;
    try { data = await resp.json(); } catch { throw new Error('O servidor retornou uma resposta inesperada.'); }
    if (!resp.ok) throw new Error(data?.error || `Falha HTTP ${resp.status}`);
    return data;
  }
  async function importFromUrl() {
    if (state.busy || state.rolling) return;
    const url = normalizedPostUrl(el.postUrl.value);
    if (!url) {notice('Cole um link HTTPS completo de post ou Reel do Instagram, como https://www.instagram.com/p/XXXXXXXX/','error');return;}
    if (!state.serverToken && !state.token) { openTokenDialog(); notice('É preciso conectar a conta Apify apenas na primeira utilização para importar pela URL.','info'); return; }
    const limit = Number(el.maxComments.value);
    const includeReplies = el.includeReplies.checked;
    setBusy(true); hideNotice();
    let jobId = null;
    try {
      el.progressLabel.textContent = 'Enviando o post para a Apify...';
      const json = await fetchJson('/api/jobs', {
        method: 'POST', headers: {
          'Content-Type':'application/json', 'X-Panel-Client': '1',
          ...(state.serverToken ? {} : {'X-Apify-Token': state.token})
        }, body: JSON.stringify({url, limit, includeReplies})
      });
      jobId = json.id;
      state.currentJob = jobId;
      el.progressLabel.textContent = 'Lendo comentários reais da publicação...';
      for (let i=0; i<500; i++) {
        if (state.currentJob !== jobId) return;
        const response = await fetchJson(`/api/jobs/${encodeURIComponent(jobId)}`);
        if (response.status === 'SUCCEEDED') {
          const raw = response.items || [];
          const flaggedErrors = raw.filter(c => c?.error).length;
          const topLevelCount = raw.filter(c=>!c.isReply && !c.error && c.ownerUsername).length;
          const reached = topLevelCount >= limit || flaggedErrors > 0;
          const ok = setComments(raw, {source:'Link do Instagram · Apify',postUrl:url,limit,limitReached:reached});
          if (ok && flaggedErrors) notice(`Atenção: ${flaggedErrors} erro(s) detectado(s). Confira a publicação antes de sortear.`, 'error');
          if (ok && reached && !flaggedErrors) notice(`Importados ${nf(raw.length)} registros. O limite solicitado de ${nf(limit)} comentários pode ter sido atingido. Confirme a cobertura antes do sorteio.`, 'info');
          return;
        }
        if (['FAILED','TIMED-OUT','ABORTED'].includes(response.status)) {
          throw new Error(`A extração foi interrompida (${response.status}). ${response.message || 'Se incluiu respostas, essa função pode exigir plano pago.'}`);
        }
        el.progressLabel.textContent = i < 5 ? 'Conectando ao Instagram...' : `Extraindo comentários... ${Math.floor(i*2.5)}s`;
        await delay(2500);
      }
      throw new Error('O tempo limite de espera foi excedido. Confira os runs na sua conta Apify.');
    } catch (err) {
      console.error('Falha na importação:', err);
      notice(`${err.message || 'Falha ao importar.'} Sua lista anterior foi preservada.`, 'error');
    } finally {
      setBusy(false);
      if (state.currentJob === jobId) state.currentJob = null;
    }
  }

  function detectDelimiter(text) {
    const header = text.slice(0,1500).split(/\r?\n/)[0] || '';
    const options = [',',';','\t'];
    let best = ',', score = -1;
    for (const delimiter of options) {
      let inQuotes = false, count = 0;
      for (const c of header) {
        if (c === '"') inQuotes = !inQuotes;
        if (!inQuotes && c === delimiter) count++;
      }
      if (count > score) {best = delimiter;score=count;}
    }
    return best;
  }
  function parseDelimited(text, delimiter) {
    const rows = [];
    let row=[],field='',quote=false;
    for (let i=0;i<text.length;i++) {
      const c = text[i];
      if (c === '"') {
        if (quote && text[i+1] === '"') {field+='"';i++;}
        else quote=!quote;
      } else if (!quote && c===delimiter) {row.push(field);field='';}
      else if (!quote && (c==='\n'||c==='\r')) {
        if (c==='\r' && text[i+1]==='\n') i++;
        row.push(field);field='';
        if (row.some(x=>x.trim())) rows.push(row);
        row=[];
      } else field+=c;
    }
    row.push(field);
    if (row.some(x=>x.trim())) rows.push(row);
    return rows;
  }
  function parseCSV(text) {
    const rows = parseDelimited(text.replace(/^\uFEFF/, ''), detectDelimiter(text));
    if (!rows.length) return [];
    const columns = rows[0].map(c=>normalize(c).replace(/[^a-z0-9]/g,''));
    const aliases = {
      ownerUsername:['ownerusername','username','usuario','perfil','user','handle','insta','userhandle','user_name','fromusername'],
      id:['id','commentid','comment_id','pk'],
      text:['text','comment','comentario','conteudo','content','mensagem'],
      timestamp:['timestamp','createdat','created_at','data','date'],
      parentCommentId:['parentcommentid','parentcommenturl','parentid','replyto'],
      type:['type','tipo'],
      ownerProfilePic:['ownerprofilepic','profilepicurl','profilepic','fotoperfil','foto','avatar','picture','profile_pic_url']
    };
    const mapping = {};
    for (const [key, names] of Object.entries(aliases)) {
      const index = columns.findIndex(c=>names.some(n=>c===normalize(n).replace(/[^a-z0-9]/g,'')));
      if (index>=0) mapping[key]=index;
    }
    const hasHeader = Object.keys(mapping).length && (mapping.ownerUsername !== undefined || mapping.text !== undefined);
    return rows.slice(hasHeader ? 1 : 0).map((row,index)=> {
      if (!hasHeader) return row.length===1 ? row[0] : ({ownerUsername:row[0],text:row[1],id:`csv-${index}`});
      const object={};
      for(const [key,i] of Object.entries(mapping)) object[key]=row[i]||'';
      return object;
    });
  }
  async function importFile(file) {
    if (!file) return;
    if (file.size>15_000_000) {notice('Arquivo acima de 15 MB. Envie um arquivo menor.','error');return;}
    const name=file.name.toLowerCase();
    if (!/\.(csv|tsv|txt|json)$/.test(name)) {notice('Use CSV, TSV, TXT ou JSON.','error');return;}
    try {
      const content=await file.text();
      let items=[];
      if(name.endsWith('.json')) {
        const raw=JSON.parse(content);
        items=Array.isArray(raw) ? raw : (raw.comments || raw.items || raw.data || []);
      } else if(name.endsWith('.txt')) {
        items=content.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
      } else {
        items=parseCSV(content);
      }
      state.currentJob=null;
      setComments(items, {source:`Arquivo · ${file.name}`,postUrl:normalizedPostUrl(el.postUrl.value),limit:items.length,limitReached:false});
    } catch (err) {notice(`Não foi possível ler o arquivo: ${err.message}`,'error');}
  }

  function csvCell(v) { const s=String(v ?? ''); return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s; }
  function downloadBlob(blob, filename) {
    const url=URL.createObjectURL(blob);
    const anchor=document.createElement('a');anchor.href=url;anchor.download=filename;
    document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);
  }
  function downloadParticipants() {
    if (!state.comments.length) return;
    const lines=[['username','comment_id','texto','data','resposta'].map(csvCell).join(',')];
    for(const c of state.comments) lines.push([c.username,c.id,c.text,c.timestamp,c.isReply?'sim':'nao'].map(csvCell).join(','));
    downloadBlob(new Blob(['\ufeff'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'}), `participantes__${new Date().toISOString().slice(0,10)}.csv`);
  }

  function fairRandomIndex(size) {
    if (!Number.isSafeInteger(size) || size<1 || size>0xffffffff) throw new Error('Quantidade inválida de participantes.');
    const max = 0x100000000;
    const bound = max - (max % size);
    const b = new Uint32Array(1);
    let r;
    do { crypto.getRandomValues(b); r=b[0]; } while (r>=bound);
    return {index: r % size, randomUint32:r, acceptedBound:bound};
  }
  // SHA-256 FIPS 180-4. WebCrypto no localhost/HTTPS; fallback puro JS para prévias offline.
  function sha256Fallback(bytes) {
    const K = [
      0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
      0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
      0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
      0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
      0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
      0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
      0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
      0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
    ];
    const H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
    const total=Math.ceil((bytes.length+9)/64)*64;
    const buf=new Uint8Array(total);buf.set(bytes);buf[bytes.length]=0x80;
    const len=bytes.length*8;
    const dv=new DataView(buf.buffer);
    dv.setUint32(total-8,Math.floor(len/0x100000000));dv.setUint32(total-4,len>>>0);
    const rotr=(x,n)=>(x>>>n)|(x<<(32-n));
    const W=new Uint32Array(64);
    for(let offset=0;offset<total;offset+=64){
      for(let i=0;i<16;i++)W[i]=dv.getUint32(offset+i*4);
      for(let i=16;i<64;i++){
        const s0=rotr(W[i-15],7)^rotr(W[i-15],18)^(W[i-15]>>>3);
        const s1=rotr(W[i-2],17)^rotr(W[i-2],19)^(W[i-2]>>>10);
        W[i]=(W[i-16]+s0+W[i-7]+s1)>>>0;
      }
      let [a,b,c,d,e,f,g,h]=H;
      for(let i=0;i<64;i++){
        const s1=rotr(e,6)^rotr(e,11)^rotr(e,25);
        const ch=(e&f)^(~e&g);
        const t1=(h+s1+ch+K[i]+W[i])>>>0;
        const s0=rotr(a,2)^rotr(a,13)^rotr(a,22);
        const maj=(a&b)^(a&c)^(b&c);
        const t2=(s0+maj)>>>0;
        h=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;
      }
      [a,b,c,d,e,f,g,h].forEach((x,i)=>H[i]=(H[i]+x)>>>0);
    }
    return H.map(x=>x.toString(16).padStart(8,'0')).join('');
  }
  async function sha256(value) {
    const bytes=new TextEncoder().encode(value);
    if (!crypto.subtle?.digest) return sha256Fallback(bytes);
    const digest=await crypto.subtle.digest('SHA-256',bytes);
    return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
  }
  async function drawWinner() {
    if (state.busy || state.rolling || state.winner || !state.eligible.length || (state.limitReached && !el.confirmLimit.checked)) return;
    state.rolling=true;
    updateButton();
    const snapshot=[...state.eligible];
    const config=currentRules();
    const r=fairRandomIndex(snapshot.length);
    const winner=snapshot[r.index];
    const timestamp=new Date().toISOString();
    const participants=snapshot.map(v=>({username:v.username,commentId:v.id,text:v.text}));
    const hash=await sha256(JSON.stringify(participants));
    const start=Date.now();
    while (Date.now()-start<1950) {
      const name=snapshot[Math.floor(Math.random()*snapshot.length)].username;
      el.drawLabel.textContent=`@${name}`.slice(0,24);
      await delay(Math.max(40,130 - (Date.now()-start)/19));
    }
    state.winner=winner;
    state.proof={
      application:'NOME_DA_SUA_MARCA Sorteios Studio', version:'1.0.0',
      explanation:'O registro é um comprovante de execução local, não uma certificação independente. Verifique cobertura dos comentários e regras divulgadas.',
      timestampUTC:timestamp, postUrl:state.postUrl || null, origin:state.source,
      demonstration:state.isDemo, commentsCollected:state.comments.length,
      entriesEligible:snapshot.length, uniqueProfiles:new Set(snapshot.map(c=>c.username)).size,
      rules:config, hashAlgorithm:'SHA-256', eligibleEntriesSha256:hash,
      randomness:'Web Crypto getRandomValues, UINT32 rejection sampling sem viés de módulo',
      randomUint32:r.randomUint32, acceptedBound:r.acceptedBound,
      winnerIndexZeroBased:r.index,
      winnerUsername:winner.username, winnerCommentId:winner.id,
      winnerCommentText:winner.text,
      eligibleEntries:participants
    };
    state.rolling=false;
    el.winnerBox.classList.remove('hidden');
    el.winnerHandle.textContent='@'+winner.username;
    el.winnerProfile.href=`https://www.instagram.com/${encodeURIComponent(winner.username)}/`;
    el.winnerInitials.textContent=winner.username.slice(0,1).toUpperCase();
    el.downloadProof.disabled=false;el.resetDraw.disabled=false;el.exportPoster.disabled=false;
    el.posterState.textContent=state.isDemo?'DEMONSTRAÇÃO · NÃO É SORTEIO REAL':'ARTE OFICIAL · RESULTADO PRONTO PARA POSTAR';
    el.statusResult.innerHTML='<i style="background:#d3fd61"></i> Ganhador definido';
    drawPoster(); updateButton();
    toast(`Ganhador sorteado: @${winner.username}`);
    el.winnerBox.scrollIntoView({behavior:'smooth',block:'nearest'});
  }
  // ---- Ponte para a ROLETA (js/roleta.js): sorteio de N ganhadores, com foto ----
  window.MarcaDraw = {
    getEligible(){ return [...state.eligible]; },
    getWinnerQty(){ return el.winnerQty ? Math.max(1, Math.min(50, parseInt(el.winnerQty.value,10) || 1)) : 1; },
    isReady(){ return !state.busy && !state.rolling && !state.winner && state.eligible.length > 0 && (!state.limitReached || el.confirmLimit.checked); },
    avatarUrl(c){ return c.ownerProfilePic ? '/fotos/'+c.ownerProfilePic : ''; },
    draw(n){
      const pool=[...state.eligible];
      if(!pool.length) return [];
      const qty=Math.max(1,Math.min(n||1,pool.length));
      const out=[];
      // Sorteio sem repeticao, usando o mesmo CSPRNG sem vies de modulo do sorteio oficial.
      const usados=new Set();
      let guarda=0;
      while(out.length<qty && guarda<pool.length*20){
        guarda++;
        const r=fairRandomIndex(pool.length);
        if(usados.has(r.index)) continue;
        usados.add(r.index);
        out.push(pool[r.index]);
      }
      return out;
    }
  };
  // ---- Abre a ROLETA em tela cheia com os elegiveis e revela N ganhadores ----
  function abrirRoleta() {
    if (!window.MarcaRoleta || typeof window.MarcaRoleta.abrir !== 'function') {
      toast('A roleta ainda nao carregou. Recarregue a pagina.');
      return;
    }
    if (!window.MarcaDraw || !window.MarcaDraw.isReady()) {
      toast('Importe os comentarios antes de abrir a roleta.');
      return;
    }
    const pool = window.MarcaDraw.getEligible();
    const qtd = window.MarcaDraw.getWinnerQty();
    const pessoas = pool.map(c => ({ handle: '@' + c.username, nome: c.username, foto: window.MarcaDraw.avatarUrl(c) }));
    window.MarcaRoleta.aoBaixar = function (vencedores) {
      if (!vencedores || !vencedores.length) return;
      const list = vencedores.map(v => String(v.nome || v.handle || '').replace(/^@/, '')).filter(Boolean);
      if (!list.length) return;
      const primeiro = list[0];
      state.winner = { username: primeiro };
      state.proof = {
        application: 'NOME_DA_SUA_MARCA Sorteios Studio', version: '1.0.0', modo: 'roleta',
        explanation: 'O registro é um comprovante de execução local, não uma certificação independente.',
        timestampUTC: new Date().toISOString(), postUrl: state.postUrl || null,
        commentsCollected: state.comments.length, entriesEligible: pool.length,
        uniqueProfiles: new Set(pool.map(c => c.username)).size,
        quantity: qtd, winners: list, winnersCount: list.length,
        randomness: 'Web Crypto getRandomValues (na roleta) com embaralhamento uniforme'
      };
      // O ganhador volta pro painel por baixo: se fechar a arte, o painel ja esta pronto.
      el.winnerBox.classList.remove('hidden');
      el.winnerHandle.textContent = '@' + primeiro;
      el.winnerProfile.href = `https://www.instagram.com/${encodeURIComponent(primeiro)}/`;
      el.winnerInitials.textContent = primeiro.slice(0, 1).toUpperCase();
      el.downloadProof.disabled = false; el.resetDraw.disabled = false; el.exportPoster.disabled = false;
      el.posterState.textContent = 'ARTE OFICIAL · RESULTADO PRONTO PARA POSTAR';
      el.statusResult.innerHTML = `<i style="background:#d3fd61"></i> ${list.length > 1 ? list.length + ' ganhadores definidos' : 'Ganhador definido'}`;
      el.drawFootnote.textContent = 'Resultado da roleta pronto. Baixe a imagem e o comprovante.';
      drawPoster(); updateButton();
    };

    // ARTE DO GANHADOR — monta o PNG 1080x1920 (story) e entrega o arquivo.
    // Chamada pelo botao BAIXAR A ARTE na tela do resultado.
    window.MarcaRoleta.baixarArte = async function (vencedores) {
      if (!vencedores || !vencedores.length) return false;
      const nome = String(vencedores[0].nome || vencedores[0].handle || '').replace(/^@/, '');
      if (!nome) return false;
      state.winner = { username: nome };
      if (state.format !== 'story') setFormat('story');
      // Carrega a FOTO do ganhador (vem da roleta) antes de desenhar a arte.
      const foto = vencedores[0].foto || '';
      await carregaFotoGanha(foto);
      drawPoster();
      const canvas = el.posterCanvas;
      if (!canvas) return false;
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png', 1));
      if (!blob) return false;
      downloadBlob(blob, `GANHADOR__${nome}.png`);
      return true;
    };
    // TOTAL da corrida = a contagem que aparece no cartao do post (419 na etiqueta).
    // Cai para o numero de comentarios importados se o cartao nao estiver pronto.
    const contagem = parseInt(String(el.postCount ? el.postCount.textContent : '').replace(/\D/g, ''), 10);
    const total = (contagem > 0) ? contagem : state.comments.length;
    window.MarcaRoleta.abrir(pessoas, qtd, {
      premio: el.prizeName.value.trim() || 'PREMIO OFICIAL',
      total: total
    });
  }
  function downloadProof() {
    if (!state.proof) return;
    downloadBlob(new Blob([JSON.stringify(state.proof,null,2)],{type:'application/json;charset=utf-8'}),`comprovante_${state.winner.username}_${new Date().toISOString().slice(0,10)}.json`);
  }

  // Material publicitário gerado ao vivo a 1080px de largura.
  // Todo o texto do resultado vem exclusivamente da entrada sorteada.
  function rounded(ctx,x,y,w,h,r=16) {
    const rr=Math.min(r,w/2,h/2);
    ctx.beginPath();ctx.moveTo(x+rr,y);ctx.arcTo(x+w,y,x+w,y+h,rr);
    ctx.arcTo(x+w,y+h,x,y+h,rr);ctx.arcTo(x,y+h,x,y,rr);
    ctx.arcTo(x,y,x+w,y,rr);ctx.closePath();
  }
  function canvasText(ctx,text,x,y,size,opts={}) {
    const family=opts.family||'Montserrat, Arial, sans-serif';
    ctx.font=`${opts.weight||'800'} ${size}px ${family}`;
    ctx.textAlign=opts.align||'center';
    ctx.textBaseline=opts.baseline||'alphabetic';
    ctx.fillStyle=opts.color||'#ffffff';
    if (opts.spacing && 'letterSpacing' in ctx) ctx.letterSpacing=opts.spacing;
    ctx.fillText(text,x,y,opts.maxWidth||undefined);
    if (opts.spacing && 'letterSpacing' in ctx) ctx.letterSpacing='0px';
  }
  function wrappedPrize(ctx, raw, x,y,maxWidth, maxLines=2) {
    const clean=String(raw||'PRÊMIO OFICIAL').trim().toUpperCase();
    const words=clean.split(/\s+/);let lines=[],current='';
    const size=38;
    ctx.font=`800 ${size}px Montserrat, Arial, sans-serif`;
    for(const w of words){ const tentative=current?`${current} ${w}`:w; if(ctx.measureText(tentative).width>maxWidth && current) {lines.push(current);current=w;}else current=tentative; }
    if(current) lines.push(current);
    if(lines.length>maxLines) {lines=lines.slice(0,maxLines);let line=lines[maxLines-1];while(ctx.measureText(`${line}...`).width>maxWidth && line.length>1)line=line.slice(0,-1);lines[maxLines-1]=`${line}...`;}
    lines.forEach((line,i)=>canvasText(ctx,line,x,y+i*54,size,{weight:'800',color:'#fff5ee',maxWidth}));
  }
  function drawLogo(ctx,h,topEnd) {
    if (state.logo?.complete && state.logo.naturalWidth>0) {
      const w=370, maxH=Math.min(260,topEnd*.67);
      const ratio=state.logo.naturalWidth/state.logo.naturalHeight;
      const drawW=Math.min(w,maxH*ratio), drawH=drawW/ratio;
      ctx.drawImage(state.logo,(1080-drawW)/2,topEnd*.08,drawW,drawH);
    } else {
      canvasText(ctx,'MARCA',540,topEnd*.49,114,{weight:'900',color:'#851347',maxWidth:710});
      ctx.beginPath();ctx.arc(840,topEnd*.27,32,0,Math.PI*2);ctx.fillStyle='#c5f03e';ctx.fill();
    }
    canvasText(ctx,'S O R T E I O    O F I C I A L',540,topEnd-42,23,{weight:'800',color:'#7d2350',maxWidth:790});
  }
  // Carrega a foto do ganhador como imagem (entra na arte). Nao quebra se falhar.
  function carregaFotoGanha(src) {
    return new Promise(resolve => {
      if (!src) { state.winnerPhoto = null; return resolve(null); }
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => { state.winnerPhoto = img; resolve(img); };
      img.onerror = () => { state.winnerPhoto = null; resolve(null); };
      img.src = src;
      setTimeout(() => { if (state.winnerPhoto !== img) { state.winnerPhoto = null; resolve(null); } }, 4000);
    });
  }

  // MODELO oficial do dono (ChatGPT Image 13/10/2026): arte 9:16 com o circulo
  // do ganhador e a caixa do nome ja desenhados. Medido no pixel:
  //   circulo centro (470,744) raio 166  |  caixa x 102..837  y 1005..1090
  // Proporcao do arquivo 941x1672 = mesmo 9:16 do canvas 1080x1920.
  const MODELO_SRC = 'arte/MODELO-GANHADOR.png';
  const MODELO = { cx:470, cy:744, r:166, bx0:102, by0:1005, bx1:837, by1:1090, w:941, h:1672 };
  let modeloImg = null, modeloPronto = false;
  (function carregaModelo(){
    const im = new Image();
    im.onload = () => { modeloImg = im; modeloPronto = true; drawPoster(); };
    im.onerror = () => { modeloImg = null; modeloPronto = false; };
    im.src = MODELO_SRC;
  })();

  function drawPoster() {
    const canvas=el.posterCanvas;
    if(!canvas) return;
    const ctx=canvas.getContext('2d');
    if(!ctx)return;
    const w=1080, story=state.format==='story',h=story?1920:1350;
    if(canvas.width!==w || canvas.height!==h){canvas.width=w;canvas.height=h;}
    // ===== ARTE SOBRE O MODELO DO DONO (quando disponivel) =====
    if (modeloPronto && modeloImg && story) {
      const esc = w / MODELO.w;                 // 1080 / 941
      ctx.clearRect(0,0,w,h);
      ctx.drawImage(modeloImg, 0, 0, w, MODELO.h*esc);
      // FOTO dentro do circulo do modelo
      const cx=MODELO.cx*esc, cy=MODELO.cy*esc, rr=MODELO.r*esc;
      const f=state.winnerPhoto;
      if (f && f.complete && f.naturalWidth>0) {
        ctx.save();
        ctx.beginPath();ctx.arc(cx,cy,rr,0,Math.PI*2);ctx.closePath();ctx.clip();
        const lado=Math.min(f.naturalWidth,f.naturalHeight);
        ctx.drawImage(f,(f.naturalWidth-lado)/2,(f.naturalHeight-lado)*0.42,
                       lado,lado, cx-rr, cy-rr, rr*2, rr*2);
        ctx.restore();
      }
      // NOME na caixa do modelo
      const handle = state.winner ? '@'+state.winner.username : '';
      if (handle) {
        const bx0=MODELO.bx0*esc, bx1=MODELO.bx1*esc, by0=MODELO.by0*esc, by1=MODELO.by1*esc;
        let fs=Math.round((by1-by0)*0.62);
        ctx.textAlign='center'; ctx.textBaseline='middle';
        do {
          ctx.font='900 '+fs+'px "Arial Black","Arial Bold",Arial,sans-serif';
          if (ctx.measureText(handle).width <= (bx1-bx0)-40) break;
          fs-=2;
        } while (fs>18);
        ctx.fillStyle='#fff8f1';
        ctx.fillText(handle,(bx0+bx1)/2,(by0+by1)/2+2);
      }
      if(state.isDemo){
        ctx.save();ctx.translate(540,h*.5);ctx.rotate(-.35);
        canvasText(ctx,'DEMONSTRAÇÃO',0,0,105,{weight:'900',color:'#eaff6e77',maxWidth:980});ctx.restore();
      }
      return;                                    // modelo pronto: nao desenha o layout antigo
    }
    // ===== LAYOUT ANTIGO (fallback se o modelo nao carregar) =====
    const wine='#50072d',wineDeep='#28071e',cream='#f7f2ed',lime='#d3ff67';
    ctx.clearRect(0,0,w,h);
    ctx.fillStyle=cream;ctx.fillRect(0,0,w,h);
    const topEnd=story?446:286;
    // Faixa editorial branca com logo centralizada; contraste bom para a marca oficial.
    ctx.fillStyle=cream;ctx.fillRect(0,0,w,topEnd);
    ctx.fillStyle=wine;ctx.fillRect(0,0,13,topEnd);
    drawLogo(ctx,h,topEnd);
    // Fundo de luxo vinho, luz suave, círculos e tipografia editorial.
    const field=ctx.createLinearGradient(0,topEnd,w,h);
    field.addColorStop(0,'#7c1048');field.addColorStop(.47,wine);field.addColorStop(1,wineDeep);
    ctx.fillStyle=field;ctx.fillRect(0,topEnd,w,h-topEnd);
    const glow=ctx.createRadialGradient(870,topEnd+220,55,860,topEnd+340,680);
    glow.addColorStop(0,'#bb2a6677');glow.addColorStop(1,'#6b0d3b00');
    ctx.fillStyle=glow;ctx.fillRect(0,topEnd,w,h-topEnd);
    ctx.save();ctx.strokeStyle='#ffffff22';ctx.lineWidth=2;
    for(let i=0;i<4;i++){ctx.beginPath();ctx.arc(990,topEnd+300,185+i*85,-Math.PI*.86,Math.PI*.9);ctx.stroke();}
    ctx.restore();
    ctx.fillStyle=lime;ctx.fillRect(80,topEnd+56,62,5);
    canvasText(ctx,'RESULTADO DO SORTEIO',158,topEnd+68,18,{align:'left',weight:'800',color:'#fae4f0'});
    const first=topEnd+(story?225:197);
    canvasText(ctx,'TEMOS UM',540,first,story?88:76,{weight:'800',color:'#fff8f1',maxWidth:900});
    canvasText(ctx,'GANHADOR!',540,first+(story?118:105),story?116:105,{weight:'900',color:lime,maxWidth:955});
    // Ornamentação em forma de três pequenos marcadores; não depende de ícones.
    ctx.fillStyle=lime;
    [[454, first+(story?179:151)],[540,first+(story?179:151)],[626,first+(story?179:151)]].forEach(([cx,cy],i)=>{
      ctx.beginPath();ctx.arc(cx,cy,i===1?7:4,0,Math.PI*2);ctx.fill();
    });
    const panelY=story?topEnd+570:topEnd+425;
    const panelH=story?316:245;
    // FOTO DO GANHADOR — moldura circular com anel verde, acima do cartao do nome.
    // Se a foto nao carregar, cai nas iniciais e a arte continua valida.
    const fotoR = story?112:100;
    const fotoCX = 540;
    const fotoCY = panelY - fotoR - (story?26:22);
    if (state.winnerPhoto && state.winnerPhoto.complete && state.winnerPhoto.naturalWidth>0) {
      ctx.save();
      ctx.beginPath();ctx.arc(fotoCX,fotoCY,fotoR,0,Math.PI*2);ctx.closePath();
      ctx.fillStyle='#fffaf6';ctx.fill();
      ctx.clip();
      const im=state.winnerPhoto;
      const lado=Math.min(im.naturalWidth,im.naturalHeight);
      ctx.drawImage(im,(im.naturalWidth-lado)/2,(im.naturalHeight-lado)/2,lado,lado,
                    fotoCX-fotoR,fotoCY-fotoR,fotoR*2,fotoR*2);
      ctx.restore();
      ctx.beginPath();ctx.arc(fotoCX,fotoCY,fotoR+7,0,Math.PI*2);
      ctx.strokeStyle=lime;ctx.lineWidth=9;ctx.stroke();
      ctx.beginPath();ctx.arc(fotoCX,fotoCY,fotoR+15,0,Math.PI*2);
      ctx.strokeStyle='#ffffff44';ctx.lineWidth=3;ctx.stroke();
    } else {
      // Sem foto: circulo com a inicial do perfil (mantem a arte bonita).
      ctx.beginPath();ctx.arc(fotoCX,fotoCY,fotoR,0,Math.PI*2);ctx.closePath();
      ctx.fillStyle='#fffaf6';ctx.fill();
      ctx.strokeStyle=lime;ctx.lineWidth=9;ctx.stroke();
      const ini=(state.winner?state.winner.username:'').slice(0,1).toUpperCase()||'N';
      canvasText(ctx,ini,fotoCX,fotoCY+(story?46:40),story?132:116,{weight:'900',color:wine});
    }
    ctx.shadowColor='#13000b6a';ctx.shadowBlur=35;ctx.shadowOffsetY=17;
    rounded(ctx,80,panelY,920,panelH,30);ctx.fillStyle='#fffaf6';ctx.fill();
    ctx.shadowColor='transparent';ctx.shadowBlur=0;ctx.shadowOffsetY=0;
    ctx.fillStyle=wine;ctx.fillRect(115,panelY+46,48,5);
    canvasText(ctx,'PARTICIPANTE SORTEADO',540,panelY+(story?104:80),23,{weight:'800',color:'#8c6378',maxWidth:850});
    const handle=state.winner?'@'+state.winner.username:'@seu_ganhador';
    const fs=story?77:72;
    canvasText(ctx,handle,540,panelY+(story?205:159),fs,{weight:'900',color:wine,maxWidth:826});
    ctx.strokeStyle='#ceafbc';ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(318,panelY+panelH-53);ctx.lineTo(762,panelY+panelH-53);ctx.stroke();
    canvasText(ctx,'PARABÉNS!',540,panelY+panelH-22,21,{weight:'800',color:'#854f6b'});
    const prizeLabelY=story?topEnd+1039:topEnd+791;
    canvasText(ctx,'P R Ê M I O',540,prizeLabelY,21,{weight:'700',color:lime,maxWidth:790});
    wrappedPrize(ctx,currentRules().prize,540,prizeLabelY+73,880,2);
    // Rodapé tipográfico com data do sorteio, marca e linha de acabamento.
    const footerY=h-(story?180:137);
    ctx.strokeStyle='#e6c4d755';ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(82,footerY);ctx.lineTo(998,footerY);ctx.stroke();
    const dt=state.proof?.timestampUTC ? new Date(state.proof.timestampUTC) : new Date();
    const dateLabel=new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'America/Sao_Paulo'}).format(dt);
    canvasText(ctx,'MARCA  /  SORTEIOS',84,footerY+64,24,{align:'left',weight:'800',color:'#fff4ef'});
    canvasText(ctx,dateLabel,996,footerY+64,24,{align:'right',weight:'700',color:'#d6b3c5'});
    canvasText(ctx,'PARTICIPE  •  CELEBRE  •  COMPARTILHE',540,h-44,18,{weight:'600',color:'#e3c4d2',maxWidth:880});
    if(state.isDemo){
      ctx.save();ctx.translate(540,h*.5);ctx.rotate(-.35);ctx.fillStyle='#eaff6e48';
      canvasText(ctx,'DEMONSTRAÇÃO',0,0,105,{weight:'900',color:'#eaff6e77',maxWidth:980});ctx.restore();
    } else if (!state.winner){
      rounded(ctx,317,story?h-100:h-95,445,49,24);
      ctx.fillStyle='#deff8249';ctx.fill();
      canvasText(ctx,'MODELO  •  AGUARDANDO SORTEIO',540,story?h-67:h-63,16,{weight:'800',color:'#f4ffcd'});
    }
  }
  async function exportPNG() {
    if(!state.winner) return toast('Realize um sorteio primeiro para baixar a imagem.');
    drawPoster();
    const canvas=el.posterCanvas;
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png',1));
    if(blob) downloadBlob(blob,`GANHADOR__${state.winner.username}_${state.format.toUpperCase()}.png`);
    else toast('Não foi possível exportar o PNG. Experimente outro navegador.');
  }
  function setFormat(format) {
    state.format=format;
    el.formatStory.classList.toggle('active',format==='story');
    el.formatFeed.classList.toggle('active',format==='feed');
    el.formatStory.setAttribute('aria-pressed',String(format==='story'));
    el.formatFeed.setAttribute('aria-pressed',String(format==='feed'));
    drawPoster();
  }
  function loadLogo(src, useFallback=false) {
    const img = new Image();
    img.onload = () => {state.logo=img;drawPoster();};
    img.onerror = () => {if(!useFallback)loadLogo('/assets/logo-fallback.svg',true);};
    img.src=src;
  }
  function openTokenDialog() {el.tokenInput.value=state.token;el.tokenDialog.showModal();}
  function setMode(mode) {
    state.mode=mode;
    el.modeUrl.classList.toggle('active',mode==='url');
    el.modeCsv.classList.toggle('active',mode==='csv');
    el.modeUrl.setAttribute('aria-selected',String(mode==='url'));
    el.modeCsv.setAttribute('aria-selected',String(mode==='csv'));
    el.urlBox.classList.toggle('hidden',mode!=='url');
    el.csvBox.classList.toggle('hidden',mode!=='csv');
  }
  function showEligible() {
    el.eligibleList.replaceChildren();
    el.eligibleMessage.textContent=`${nf(state.eligible.length)} perfis de ${nf(state.comments.length)} comentários carregados. Mostrando os primeiros 300.`;
    for(const c of state.eligible.slice(0,300)) {
      const row=document.createElement('div');row.className='eligible-row';
      const av=document.createElement('span');av.className='eligible-avatar';
      if(c.ownerProfilePic) {
        const im=document.createElement('img');im.loading='lazy';im.alt='';im.src='/fotos/'+c.ownerProfilePic;
        im.addEventListener('error',()=>{im.remove();av.textContent=c.username.slice(0,1).toUpperCase();});
        av.append(im);
      } else av.textContent=c.username.slice(0,1).toUpperCase();
      const box=document.createElement('div');box.className='eligible-text';
      const strong=document.createElement('strong');strong.textContent='@'+c.username;
      const meta=document.createElement('small');meta.textContent=(c.text||'sem texto').replace(/\s+/g,' ').slice(0,110);
      box.append(strong,meta);
      row.append(av,box);el.eligibleList.append(row);
    }
    el.eligibleDialog.showModal();
  }
  // ---- Cartão do post: puxa a capa e mostra na tela ----
  function postShortcode(valor){
    const m=String(valor||'').match(/instagram\.com\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]{5,40})/);
    return m?m[1]:'';
  }
  let postBuscaTimer=null;
  function agendaBuscaPost(){
    clearTimeout(postBuscaTimer);
    const sc=postShortcode(el.postUrl.value);
    if(!sc){ escondePost(); return; }
    postBuscaTimer=setTimeout(()=>carregaPost(sc),700);
  }
  function escondePost(){
    el.postCard.classList.add('hidden');
    el.postCardError.classList.add('hidden');
  }
  async function carregaPost(sc){
    const sc2=sc||postShortcode(el.postUrl.value);
    if(!sc2) return;
    const urlPost=`https://www.instagram.com/p/${sc2}/`;
    el.postCardError.classList.add('hidden');
    el.postCaption.textContent='Lendo a publicação...';
    el.postCount.textContent='—';
    el.postCard.classList.remove('hidden');
    el.postThumb.removeAttribute('src');
    el.postThumb.src=`/api/post-preview?url=${encodeURIComponent(urlPost)}`;
    el.postOpen.href=urlPost;
    try {
      const r=await fetch(`/api/post-info?url=${encodeURIComponent(urlPost)}`);
      const d=await r.json();
      if(d.error) throw new Error(d.error);
      el.postPill.textContent=d.comentarios?`${nf(Number(d.comentarios))} COMENTÁRIOS`:'PUBLICAÇÃO';
      const partes=[];
      if(d.autor) partes.push(d.autor);
      if(d.curtidas) partes.push(nf(Number(d.curtidas))+' curtidas');
      el.postCount.textContent=partes.join(' · ')||'—';
      const texto=(d.legenda||'').replace(/\s+/g,' ').trim();
      el.postCaption.textContent=texto?texto.slice(0,320):'Sem legenda pública neste post.';
    } catch(e) {
      el.postCaption.textContent='Não consegui ler os dados agora. A capa continua na tela.';
    }
  }
  function loadDemo() {
    const names = ['maria.silva','bruno_costa','lara.araujo','daniel.santos','aline.martins','paulo_ferreira','mariana.lima','isa.ribeiro','carol.pereira','julia.alves','beatriz.souza','rafaela.costa','tati.mendes','edu.prado','joao.silveira','luiza.faria','pedro.nunes','rafa.moraes','renata.dias','felipe.lopes'];
    const items=names.flatMap((username,i)=>[
      {id:`demo-${i}`,ownerUsername:username,text:`Quero participar! Eu amo essa marca! @amiga${i} @amigo${i}`,timestamp:new Date().toISOString()},
      ...(i%3===0?[{id:`demo-r-${i}`,ownerUsername:username,text:'Boa sorte!',timestamp:new Date().toISOString()}]:[])
    ]);
    setComments(items,{source:'DEMONSTRAÇÃO (dados fictícios)',postUrl:'',limit:items.length,demo:true});
  }
  function bind() {
    el.importUrl.addEventListener('click',importFromUrl);
    el.postUrl.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();importFromUrl();}});
    el.modeUrl.addEventListener('click',()=>setMode('url'));
    el.modeCsv.addEventListener('click',()=>setMode('csv'));
    el.csvInput.addEventListener('change',e=>importFile(e.target.files[0]));
    el.dropzone.addEventListener('dragover',e=>{e.preventDefault();el.dropzone.classList.add('dragging');});
    el.dropzone.addEventListener('dragleave',()=>el.dropzone.classList.remove('dragging'));
    el.dropzone.addEventListener('drop',e=>{e.preventDefault();el.dropzone.classList.remove('dragging');importFile(e.dataTransfer?.files?.[0]);});
    for(const id of ['prizeName','keyword','minMentions','excludedHandles','dedupeUsers','topLevelOnly']) {
      el[id].addEventListener(['dedupeUsers','topLevelOnly','minMentions'].includes(id)?'change':'input',()=>refreshEligibles(true));
    }
    el.confirmLimit.addEventListener('change',updateButton);
    el.drawButton.addEventListener('click',drawWinner);
    if(el.wqMais) el.wqMais.addEventListener('click',()=>{const n=Math.min(50,(parseInt(el.winnerQty.value,10)||1)+1);el.winnerQty.value=n;updateButton();});
    if(el.wqMenos) el.wqMenos.addEventListener('click',()=>{const n=Math.max(1,(parseInt(el.winnerQty.value,10)||1)-1);el.winnerQty.value=n;updateButton();});
    if(el.winnerQty) el.winnerQty.addEventListener('input',()=>{let n=parseInt(el.winnerQty.value,10);if(isNaN(n)||n<1)n=1;if(n>50)n=50;el.winnerQty.value=n;updateButton();});
    if(el.spinButton) el.spinButton.addEventListener('click',abrirRoleta);
    el.downloadProof.addEventListener('click',downloadProof);
    el.downloadParticipants.addEventListener('click',downloadParticipants);
    el.resetDraw.addEventListener('click',()=>{if(confirm('Realizar outro sorteio? Salve o comprovante do resultado anterior antes de prosseguir.'))resetWinner();});
    el.exportPoster.addEventListener('click',exportPNG);
    el.formatStory.addEventListener('click',()=>setFormat('story'));
    el.formatFeed.addEventListener('click',()=>setFormat('feed'));
    el.uploadLogo.addEventListener('click',()=>el.logoInput.click());
    el.logoInput.addEventListener('change', e=>{
      const file=e.target.files?.[0];if(!file)return;
      if(file.size>5_000_000 || !/^image\//.test(file.type))return toast('Envie uma imagem de até 5 MB.');
      if(state.logoObjectUrl)URL.revokeObjectURL(state.logoObjectUrl);
      state.logoObjectUrl=URL.createObjectURL(file);
      loadLogo(state.logoObjectUrl);
      toast('Logo personalizada aplicada à arte.');
    });
    el.openToken.addEventListener('click',openTokenDialog);
    el.saveToken.addEventListener('click',()=>{
      const token=el.tokenInput.value.trim();
      if(!/^apify_api_[a-zA-Z0-9_-]{8,}$/.test(token)) {toast('Cole o token Apify completo, iniciado por apify_api_.');return;}
      state.token=token;sessionStore?.setItem('marca_apify_token',token);el.tokenDialog.close();
      el.connectionStatus.textContent='Apify configurada'; toast('Token salvo somente nesta sessão. Agora cole a URL e importe.');
    });
    el.helpButton.addEventListener('click',()=>el.helpDialog.showModal());
    el.closeHelp.addEventListener('click',()=>el.helpDialog.close());
    el.closeHelpOk.addEventListener('click',()=>el.helpDialog.close());
    el.seeEligible.addEventListener('click',showEligible);
    el.closeEligible.addEventListener('click',()=>el.eligibleDialog.close());
    el.postUrl.addEventListener('input',agendaBuscaPost);
    el.postUrl.addEventListener('change',agendaBuscaPost);
    el.postUrl.addEventListener('paste',()=>setTimeout(agendaBuscaPost,60));
    el.postRetry.addEventListener('click',()=>{const sc=postShortcode(el.postUrl.value);if(sc)carregaPost(sc);});
    el.postThumb.addEventListener('error',()=>{
      el.postCardError.textContent='O Instagram não liberou a capa agora. O sorteio não depende dela; dá para recarregar a capa ou seguir direto.';
      el.postCardError.classList.remove('hidden');
    });
    const demo=$('demoButton'); if(demo)demo.addEventListener('click',loadDemo);
  }
  async function init() {
    bind(); setMode('url');
    state.eligible=[];updateButton();
    loadLogo('/api/brand-logo');
    try {
      await document.fonts.ready;
      drawPoster();
      const health=await fetchJson('/api/health');
      state.serverToken=!!health.serverToken;
      el.connectionStatus.textContent=state.serverToken ? 'API pronta no servidor' : state.token ? 'Apify configurada' : 'Painel pronto';
    } catch {
      el.connectionStatus.textContent='Servidor offline';
      notice('O servidor não está ativo. Abra pelo arquivo INICIAR-PAINEL.bat (não abra index.html diretamente).','error');
    }
  }
  init();
})();
