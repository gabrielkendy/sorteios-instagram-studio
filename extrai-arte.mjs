// Extrai a ARTE (canvas 1080x1920) direto do painel e salva como PNG.
import puppeteer from 'puppeteer';
import crypto from 'node:crypto';
import fs from 'node:fs';
const CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe';
const DIR=process.env.SAIDA || './gravacao';
const dados=JSON.parse(fs.readFileSync(process.argv[2] || './gravacao/dados.json','utf-8'));
const linhas=['username,text,ownerProfilePic'];
for(const v of dados){
  const u=String((v.user&&v.user.username)||'').replace(/^@/,'');
  if(!u) continue;
  const nf=crypto.createHash('sha1').update(u).digest('hex').slice(0,16)+'.jpg';
  linhas.push([u,String(v.text||'').replace(/[",\n]/g,' '),nf].join(','));
}
const csvPath=DIR+'/arte-base.csv'; fs.writeFileSync(csvPath,linhas.join('\n'));
const browser=await puppeteer.launch({headless:'new',executablePath:CHROME,
  args:['--no-sandbox','--disable-dev-shm-usage','--window-size=1450,1500']});
const page=await browser.newPage();
await page.setViewport({width:1450,height:1500,deviceScaleFactor:1});
const pausa=(ms)=>new Promise(r=>setTimeout(r,ms));
await page.goto('http://127.0.0.1:3214',{waitUntil:'domcontentloaded'});
await pausa(2500);
await page.evaluate(()=>{const b=document.getElementById('modeCsv');if(b)b.click();});
await pausa(900);
await (await page.$('#csvInput')).uploadFile(csvPath);
await pausa(5200);
await page.evaluate(()=>{const q=document.getElementById('winnerQty');q.value=1;q.dispatchEvent(new Event('input',{bubbles:true}));});
await pausa(1300);
await page.evaluate(()=>{const b=document.getElementById('spinButton');if(b)b.click();});
await pausa(2500);
await page.evaluate(()=>{const b=document.getElementById('rtGirar');if(b)b.click();});
for(let i=0;i<40;i++){await pausa(600);
  if(await page.evaluate(()=>!!document.querySelector('.rt-nome')))break;}
const campeao=await page.evaluate(()=>document.querySelector('.rt-nome')?.textContent||'');
await page.evaluate(async ()=>{const v=window.NechioRoleta.vencedores();await window.NechioRoleta.baixarArte(v);});
await pausa(2500);
const b64=await page.evaluate(()=>document.getElementById('posterCanvas').toDataURL('image/png').split(',')[1]);
const out=DIR+'/ARTE-GANHADOR.png';
fs.writeFileSync(out,Buffer.from(b64,'base64'));
const st=fs.statSync(out);
console.log('CAMPEAO:',campeao);
console.log('ARTE:',out);
console.log('TAMANHO:',(st.size/1024).toFixed(0)+' KB');
await browser.close();
