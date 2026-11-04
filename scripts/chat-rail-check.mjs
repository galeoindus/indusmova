import { spawn } from 'node:child_process';
import WebSocket from 'ws';
const BASE='http://127.0.0.1:4173', PORT=9270;
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const chrome=spawn('chromium',['--headless=new','--no-sandbox','--disable-gpu',`--remote-debugging-port=${PORT}`,'--window-size=1280,900','about:blank'],{stdio:'ignore'});
let page;for(let i=0;i<80;i++){try{const l=await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();page=l.find(t=>t.type==='page'&&t.webSocketDebuggerUrl);if(page)break;}catch{}await sleep(250);}
const ws=new WebSocket(page.webSocketDebuggerUrl,{perMessageDeflate:false,maxPayload:64*1024*1024});
await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});
let id=0;const w=new Map();
const send=(m,p={})=>new Promise((res,rej)=>{const i=++id;w.set(i,{res,rej});ws.send(JSON.stringify({id:i,method:m,params:p}));});
ws.on('message',async(raw)=>{const m=JSON.parse(raw.toString());
 if(m.id&&w.has(m.id)){const{res,rej}=w.get(m.id);w.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result);return;}
 if(m.method==='Page.javascriptDialogOpening'){await send('Page.handleJavaScriptDialog',{accept:true}).catch(()=>{});}});
const ev=async(e)=>{const r=await send('Runtime.evaluate',{expression:e,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)return 'EVALERR '+(r.exceptionDetails.exception?.description||'').split('\n')[0];return r.result.value;};
await send('Page.enable');await send('Runtime.enable');
await send('Page.navigate',{url:`${BASE}/chat/`}).catch(()=>{});
await sleep(2200);
// Seed three chats: two today, one older.
await ev(`(() => {
  const now = Date.now();
  const rows = [
    { q: 'What is photosynthesis', at: now, answer: null },
    { q: 'When did Chandrayaan-3 land', at: now - 3600e3, answer: null },
    { q: 'Who was Ashoka', at: now - 86400e3 * 5, answer: null },
  ];
  localStorage.setItem('indusmova:chat:recent:v1', JSON.stringify(rows));
})()`);
await send('Page.reload').catch(()=>{});
await sleep(2200);
const out={};
out.rows = await ev(`document.querySelectorAll('.rail-row').length`);
out.count = await ev(`document.getElementById('railCount')?.textContent || ''`);
out.groups = await ev(`[...document.querySelectorAll('.rail-group')].map(n=>n.textContent.trim())`);
out.clearVisible = await ev(`!(document.getElementById('railClear')?.hidden ?? true)`);
// delete one via the cross
await ev(`document.querySelector('.rail-del')?.click()`);
await sleep(500);
out.afterDelete = await ev(`document.querySelectorAll('.rail-row').length`);
out.undoToast = await ev(`Boolean(document.querySelector('.chat-toast'))`);
// clear all
await ev(`document.getElementById('railClear')?.click()`);
await sleep(700);
out.afterClear = await ev(`document.querySelectorAll('.rail-row').length`);
out.emptyMsg = await ev(`Boolean(document.querySelector('.rail-empty'))`);
out.centerEmpty = await ev(`document.body.classList.contains('is-empty')`);
console.log(JSON.stringify(out,null,1));
const pass = out.rows===3 && out.count==='3' && out.groups.includes('Today') && out.groups.includes('Earlier')
  && out.clearVisible && out.afterDelete===2 && out.undoToast && out.afterClear===0 && out.emptyMsg && out.centerEmpty;
console.log(pass?'VERDICT: PASS — rail grouped, cross deletes, clear-all empties, centre returns to new chat':'VERDICT: FAIL');
ws.close();chrome.kill();process.exit(pass?0:1);
