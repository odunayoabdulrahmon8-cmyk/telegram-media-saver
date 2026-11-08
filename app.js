"use strict";
/* Client Room: practise client calls out loud, get coached. Runs fully in the browser; your key and data stay on this device. */
const $=(s,r=document)=>r.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const uid8=()=>Math.random().toString(36).slice(2,10);

/* ---------- settings (this device only) ---------- */
const DEF={key:"",model:"claude-sonnet-5-5",lang:"en-NG",speak:true,hands:false};
function getCfg(){try{return{...DEF,...JSON.parse(localStorage.getItem("cr_cfg")||"{}")}}catch(e){return{...DEF}}}
function setCfg(p){const c={...getCfg(),...p};try{localStorage.setItem("cr_cfg",JSON.stringify(c))}catch(e){}return c}

/* ---------- storage: IndexedDB key/value ---------- */
let idb=null;
function openDb(){return new Promise((res,rej)=>{const r=indexedDB.open("client-room",1);r.onupgradeneeded=()=>r.result.createObjectStore("kv");r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
const tx=(mode,fn)=>new Promise((res,rej)=>{const t=idb.transaction("kv",mode),s=t.objectStore("kv"),r=fn(s);t.oncomplete=()=>res(r&&r.result);t.onerror=()=>rej(t.error)});
async function put(k,v){try{await tx("readwrite",s=>s.put(v,k));flash("Saved")}catch(e){flash("Not saved")}}
async function del(k){try{await tx("readwrite",s=>s.delete(k))}catch(e){}}
async function loadAll(){
  const out={};
  await new Promise(res=>{const r=idb.transaction("kv").objectStore("kv").openCursor();r.onsuccess=()=>{const c=r.result;if(c){out[c.key]=c.value;c.continue()}else res()};r.onerror=()=>res()});
  return out;
}
let ft=null;function flash(t){const e=$("#saveState");if(!e)return;e.textContent=t;clearTimeout(ft);ft=setTimeout(()=>e.textContent="",1500)}

/* ---------- state ---------- */
const S={tab:"library",view:"setup",sources:[],notes:"",profile:{summary:"",count:0},sessions:[],use:{},
  setup:{role:"designer",scenario:"",level:"realistic"},cur:null,busy:false,err:"",open:null,pdfMsg:"",
  listening:false,live:"",speaking:false,say:""};
const SCEN=["Skeptical startup founder","Busy restaurant owner","Client who wants a discount","Indecisive committee","Friendly but vague client","Client comparing three designers"];
const LEVELS=[["warm","Warm"],["realistic","Realistic"],["tough","Tough"]];
const FILL=["um","uh","erm","like","you know","basically","actually","sort of","kind of","i mean","literally","so yeah"];
const SR=window.SpeechRecognition||window.webkitSpeechRecognition;

/* ---------- retrieval over the uploaded text ---------- */
function chunk(text){
  const out=[];let cur="";
  for(const p of text.split(/\n{2,}/)){
    if((cur+p).length>1100&&cur){out.push(cur.trim());cur=""}
    cur+=p+"\n\n";
  }
  if(cur.trim())out.push(cur.trim());
  return out;
}
const STOP=new Set("the a an and or of to in is it that this for on with as at be are was i you we they my your our not but have has had so if then than what how why can will would should".split(" "));
const toks=s=>[...new Set((s.toLowerCase().match(/[a-z']{3,}/g)||[]).filter(w=>!STOP.has(w)))];
function retrieve(query,k=4){
  const q=toks(query),all=[];
  for(const s of S.sources){if(S.use[s.id]===false)continue;(s.chunks||(s.chunks=chunk(s.text))).forEach((c,i)=>all.push({c,i,n:s.name}))}
  if(!all.length)return"";
  const scored=all.map(x=>{const l=x.c.toLowerCase();return{...x,sc:q.reduce((a,w)=>a+(l.includes(w)?1:0),0)}}).sort((a,b)=>b.sc-a.sc||a.i-b.i);
  let pick=scored.filter(x=>x.sc>0).slice(0,k);
  if(pick.length<2)pick=pick.concat(scored.filter(x=>!pick.includes(x)).slice(0,2-pick.length));
  return pick.map(x=>`[${x.n}] ${x.c}`).join("\n---\n");
}

/* ---------- Claude API (your own key, called from this device) ---------- */
async function ask({system,messages,max=700,stream=false,onText,signal,model}){
  const cfg=getCfg();
  if(!cfg.key)throw Object.assign(new Error("no key"),{code:"nokey"});
  const r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",signal,
    headers:{"content-type":"application/json","x-api-key":cfg.key,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},
    body:JSON.stringify({model:model||cfg.model,max_tokens:max,system,messages,stream})});
  if(!r.ok){let m="";try{m=(await r.json()).error.message}catch(e){}throw Object.assign(new Error(m||("HTTP "+r.status)),{code:r.status})}
  if(!stream){const j=await r.json();return j.content.map(b=>b.text||"").join("")}
  const rd=r.body.getReader(),dec=new TextDecoder();let buf="",text="";
  for(;;){
    const{done,value}=await rd.read();if(done)break;
    buf+=dec.decode(value,{stream:true});
    let i;while((i=buf.indexOf("\n\n"))>=0){
      const ev=buf.slice(0,i);buf=buf.slice(i+2);
      const line=ev.split("\n").find(l=>l.startsWith("data:"));if(!line)continue;
      try{const j=JSON.parse(line.slice(5));if(j.type==="content_block_delta"&&j.delta&&j.delta.text){text+=j.delta.text;onText&&onText(text)}}catch(e){}
    }
  }
  return text;
}
function errText(e){
  if(e&&e.name==="AbortError")return"";
  if(e&&e.code==="nokey")return"Add your Anthropic API key in Settings first.";
  if(e&&(e.code===401||e.code===403))return"The API key was rejected. Check it in Settings.";
  if(e&&e.code===404)return"That model name was not found. Check the model in Settings.";
  if(e&&e.code===429)return"Too many requests or the credit limit was reached. Wait a moment, then try again.";
  if(e&&e.code===529)return"The AI service is busy. Try again in a moment.";
  if(e instanceof TypeError)return"Could not reach the AI. Check your internet connection.";
  return"Something went wrong: "+(e&&e.message||"unknown error");
}

/* ---------- prompts ---------- */
function persona(){
  const st=S.cur,aiRole=st.role==="designer"?"client":"designer";
  const lv={warm:"cooperative and friendly, but still ask real questions",realistic:"a normal busy client: polite, but you probe vague answers, question price and timeline, and need convincing",tough:"demanding and sceptical: you push back hard, challenge claims, compare with cheaper options and do not agree easily"}[st.level];
  const last=st.msgs.filter(m=>!m.hidden).slice(-3).map(m=>m.text).join(" ");
  return `You are role-playing a live phone or video call so a freelance graphic and brand designer can practise client communication out loud.
YOUR ROLE: the ${aiRole}. The user plays the ${st.role}.
SCENARIO: ${st.scenario||"a prospective client discussing a design project"}.
YOUR ATTITUDE: ${lv}.
RULES: Stay in character for the whole call and never coach or break character. Your words are spoken aloud, so write plain spoken sentences with no lists, no markdown and no stage directions. Use 1 to 3 short sentences, one question or point at a time. React to what the user actually said and push on anything vague, unsupported or evasive. ${aiRole==="client"?"Behave like a real client whose mindset follows the reference material (motivations, fears, decision habits). Show it in how you talk; do not quote the material or name the theories.":"Behave like a capable designer pitching and discovering needs; sometimes make a small mistake or weak claim that a sharp client would catch."}
${S.profile.summary?`WHAT YOU KNOW ABOUT THE USER'S WEAK SPOTS (probe these naturally): ${S.profile.summary}\n`:""}${S.notes.trim()?`THE USER'S OWN NOTES ON THE MATERIAL:\n${S.notes.slice(0,3000)}\n`:""}
RELEVANT EXCERPTS FROM THE REFERENCE MATERIAL:\n${retrieve(last+" "+(st.scenario||""))||"(none uploaded)"}`;
}
function apiMsgs(){
  const m=[{role:"user",content:"[The call begins now. Say your opening line.]"}];
  for(const x of S.cur.msgs)m.push({role:x.who==="me"?"user":"assistant",content:x.text});
  return m;
}

/* ---------- speech out (the AI's voice) ---------- */
function pickVoice(){
  const vs=speechSynthesis.getVoices(),l=getCfg().lang.toLowerCase();
  return vs.find(v=>v.lang.toLowerCase()===l)||vs.find(v=>v.lang.toLowerCase().startsWith(l.slice(0,2)))||null;
}
function speak(text,done){
  if(!getCfg().speak||!("speechSynthesis"in window)){done&&done();return}
  speechSynthesis.cancel();
  const u=new SpeechSynthesisUtterance(text);const v=pickVoice();if(v)u.voice=v;u.lang=getCfg().lang;u.rate=1;
  u.onstart=()=>{S.speaking=true;paintStatus()};
  const end=()=>{S.speaking=false;paintStatus();done&&done()};
  u.onend=end;u.onerror=end;
  speechSynthesis.speak(u);
}
function stopSpeaking(){try{speechSynthesis.cancel()}catch(e){}S.speaking=false}

/* ---------- speech in (your voice) ---------- */
let rec=null,wantListen=false,base="",startedAt=0,lastWords=0;
function startListening(){
  if(!SR){S.err="This browser cannot listen. Open the app in Chrome, or type your reply.";render();return}
  if(S.busy||S.listening)return;
  stopSpeaking();S.err="";base="";S.live="";wantListen=true;startedAt=0;
  makeRec();S.listening=true;render();
}
function makeRec(){
  rec=new SR();rec.lang=getCfg().lang;rec.continuous=true;rec.interimResults=true;
  rec.onresult=e=>{
    if(!startedAt)startedAt=Date.now();
    let fin="",tmp="";
    for(let i=0;i<e.results.length;i++){(e.results[i].isFinal?(fin+=e.results[i][0].transcript+" "):(tmp+=e.results[i][0].transcript))}
    S.live=(base+fin+tmp).trim();paintLive();
    rec._fin=fin;
  };
  rec.onerror=e=>{
    if(e.error==="not-allowed"||e.error==="service-not-allowed"){wantListen=false;S.listening=false;S.err="Microphone access was blocked. Allow the microphone for this site in your browser settings.";render()}
    else if(e.error==="audio-capture"){wantListen=false;S.listening=false;S.err="No microphone found.";render()}
  };
  rec.onend=()=>{
    base=(base+(rec._fin||"")).replace(/\s+/g," ");
    if(wantListen){try{makeRec();rec.start()}catch(e){}}  // Chrome stops after pauses, so restart until the user taps stop
  };
  try{rec.start()}catch(e){}
}
function stopListening(send=true){
  wantListen=false;S.listening=false;
  const r=rec;let text=S.live.trim();
  try{r&&r.stop()}catch(e){}
  const secs=startedAt?(Date.now()-startedAt)/1000:0;startedAt=0;S.live="";
  if(send&&text)sendTurn(text,secs);else render();
}

/* ---------- the call ---------- */
async function startCall(){
  const v=$("#scenIn").value.trim();if(v)S.setup.scenario=v;
  S.cur={id:uid8(),started:Date.now(),role:S.setup.role,level:S.setup.level,scenario:S.setup.scenario,msgs:[],turns:[]};
  S.view="call";S.err="";persistCur();await aiTurn();
}
const persistCur=()=>S.cur&&put("ses_"+S.cur.id,S.cur);
async function sendTurn(text,secs){
  const words=(text.toLowerCase().match(/[a-z']+/g)||[]).length;
  S.cur.msgs.push({who:"me",text});
  S.cur.turns.push({words,secs:Math.round(secs*10)/10,wpm:secs>=3?Math.round(words/(secs/60)):null,voice:secs>0});
  S.err="";persistCur();await aiTurn();
}
let ctrl=null;
async function aiTurn(extraHidden){
  S.busy=true;S.err="";const c=S.cur;
  if(extraHidden)c.msgs.push(extraHidden);
  const msg={who:"them",text:""};c.msgs.push(msg);render();
  const msgs=apiMsgs();msgs.pop();
  ctrl=new AbortController();
  try{
    const t=await ask({system:persona(),messages:msgs,max:300,stream:true,signal:ctrl.signal,onText:x=>{msg.text=x;paintLast()}});
    msg.text=(t||msg.text).trim();
  }catch(e){if(!msg.text)c.msgs.pop();else msg.text=msg.text.trim();S.err=errText(e)}
  S.busy=false;render();persistCur();
  if(msg.text&&!S.err)speak(msg.text,()=>{if(getCfg().hands&&S.view==="call"&&S.tab==="practice")startListening()});
}
function paintLast(){const els=document.querySelectorAll(".msg.them");const el=els[els.length-1];if(el){el.textContent=S.cur.msgs[S.cur.msgs.length-1].text;el.scrollIntoView({block:"end"})}}
function paintLive(){const e=$("#live");if(e){e.textContent=S.live||"Listening…";e.hidden=false}}
function paintStatus(){const e=$("#status");if(e)e.textContent=statusText()}
const statusText=()=>S.busy?"The "+(S.cur.role==="designer"?"client":"designer")+" is thinking…":S.speaking?"Speaking. Tap the mic to interrupt.":S.listening?"Listening. Tap again when you finish.":"Tap the mic and speak.";

function delivery(){
  const t=(S.cur.turns||[]).filter(x=>x.voice),mine=S.cur.msgs.filter(m=>m.who==="me"&&!m.hidden);
  const text=mine.map(m=>m.text).join(" ").toLowerCase(),words=(text.match(/[a-z']+/g)||[]).length;
  const fill={};let total=0;
  for(const f of FILL){const n=(text.match(new RegExp("\\b"+f+"\\b","g"))||[]).length;if(n){fill[f]=n;total+=n}}
  const w=t.filter(x=>x.wpm);
  return{turns:mine.length,words,avg:Math.round(words/Math.max(1,mine.length)),fill,fillTotal:total,
    fillPer100:words?Math.round(total/words*1000)/10:0,
    wpm:w.length?Math.round(w.reduce((a,x)=>a+x.wpm,0)/w.length):null,spoken:t.length,
    longest:t.length?Math.max(...t.map(x=>x.words)):0};
}
async function makeReport(){
  const c=S.cur;stopSpeaking();if(S.listening)stopListening(false);
  const mine=c.msgs.filter(m=>m.who==="me"&&!m.hidden);
  if(mine.length<2){S.err="Say at least two things in the call before ending it, so there is something to assess.";render();return}
  S.busy=true;S.err="";S.view="report";c.reporting=true;render();
  const d=delivery(),dims=c.role==="designer"?["Discovery","Clarity","Objections","Confidence","Closing"]:["Probing","Clarity","Challenge","Composure","Decision"];
  const transcript=c.msgs.filter(m=>!m.hidden).map(m=>(m.who==="me"?"USER":"OTHER")+": "+m.text).join("\n");
  const prompt=`You are a direct, fair communication coach for a freelance designer who is practising client calls. Assess the USER only. The user played the ${c.role}; the other side was AI.
Scenario: ${c.scenario||"general client call"}. Difficulty: ${c.level}.
Previous known patterns: ${S.profile.summary||"none yet"}.
The user's notes: ${S.notes.slice(0,1500)||"none"}
Excerpts from the psychology material: ${retrieve(mine.map(m=>m.text).join(" "),3).slice(0,2500)||"none"}
Delivery numbers: ${d.spoken?`spoken aloud in ${d.spoken} turns, average pace ${d.wpm??"unknown"} words per minute, ${d.fillTotal} filler words (${d.fillPer100} per 100 words). The speech recogniser often drops fillers, so treat low filler counts with caution.`:"typed, not spoken."}

TRANSCRIPT:
${transcript}

Return JSON only, no other text:
{"overall":number 0-10 one decimal,
"headline":"one plain sentence verdict",
"dimensions":[{"name":one of ${JSON.stringify(dims)},"score":0-10 integer,"note":"one short sentence"}] (all five, in that order),
"strengths":[2-3 short strings],
"corrections":[{"said":"exact short quote from the USER","issue":"what weakened it","better":"a stronger version in the user's voice, written the way it would be spoken"}] (3 to 5, quote real lines only),
"missed":[1-3 strings: moments where a skilled person would have asked or said something else],
"delivery":"1-2 sentences on pace, length of answers and filler habits",
"psychology":"1-3 sentences on how well the user used the client-psychology material, or what to apply next time",
"practice_next":[2-3 short drills],
"hard_questions":[3 difficult questions this client type could ask next time],
"profile_update":"under 90 words, plain text: the user's recurring weak spots and strengths, merging the previous patterns with this call"}
Be specific and honest. Do not inflate scores. Scores describe this call, not a final grade.`;
  try{
    const t=await ask({system:"You return only valid JSON.",messages:[{role:"user",content:prompt}],max:2500});
    const r=JSON.parse(t.slice(t.indexOf("{"),t.lastIndexOf("}")+1));
    c.report=r;c.ended=Date.now();c.stats=d;
    S.profile={summary:String(r.profile_update||S.profile.summary||"").slice(0,900),count:(S.profile.count||0)+1};
    S.sessions=[c,...S.sessions.filter(x=>x.id!==c.id)];
    await Promise.all([put("ses_"+c.id,c),saveMeta()]);
  }catch(e){S.err=e instanceof SyntaxError?"The report came back garbled. Press End and get report again.":errText(e);S.view="call"}
  c.reporting=false;S.busy=false;render();
}
const saveMeta=()=>put("meta",{notes:S.notes,profile:S.profile,use:S.use});

/* ---------- PDF ---------- */
let pdfLib=null;
async function loadPdfJs(){
  if(pdfLib)return pdfLib;
  await new Promise((res,rej)=>{const s=document.createElement("script");s.src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";s.onload=res;s.onerror=()=>rej(new Error("pdfjs"));document.head.appendChild(s)});
  const w=await (await fetch("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js")).text();
  window.pdfjsLib.GlobalWorkerOptions.workerSrc=URL.createObjectURL(new Blob([w],{type:"text/javascript"}));
  return pdfLib=window.pdfjsLib;
}
async function readPdf(file){
  const lib=await loadPdfJs(),doc=await lib.getDocument({data:await file.arrayBuffer()}).promise;let out="";
  for(let i=1;i<=doc.numPages;i++){
    const tc=await (await doc.getPage(i)).getTextContent();let line="",y=null;
    for(const it of tc.items){if(y!==null&&Math.abs(it.transform[5]-y)>4)line+="\n";line+=it.str+" ";y=it.transform[5]}
    out+=line.replace(/[ \t]+\n/g,"\n")+"\n\n";
    S.pdfMsg=`Reading page ${i} of ${doc.numPages}…`;const e=$("#pdfMsg");if(e)e.textContent=S.pdfMsg;
  }
  return out;
}
async function addSource(name,text){
  text=text.replace(/\u0000/g,"").trim();
  if(text.length<40){S.pdfMsg="No readable text found. If the PDF is scanned images, paste the text instead.";render();return}
  const src={id:uid8(),name,text:text.slice(0,600000),added:Date.now(),chars:text.length};
  S.sources.push(src);S.use[src.id]=true;S.pdfMsg="Added "+name+".";
  await Promise.all([put("src_"+src.id,{id:src.id,name:src.name,text:src.text,added:src.added,chars:src.chars}),saveMeta()]);render();
}

/* ---------- views ---------- */
function nav(){
  $("#nav").innerHTML=[["library","Library"],["practice","Practice"],["progress","Progress"],["settings","Settings"]]
    .map(([k,l])=>`<button data-tab="${k}" aria-current="${S.tab===k}">${l}</button>`).join("");
}
function vLibrary(){
  const srcs=S.sources.length?S.sources.map(s=>`<div class="src"><div class="grow"><b>${esc(s.name)}</b><div class="sub mono">${Math.round((s.chars||s.text.length)/1000)}k characters</div></div>
    <button class="chip" data-use="${s.id}" aria-pressed="${S.use[s.id]!==false}">${S.use[s.id]!==false?"In use":"Off"}</button>
    <button class="btn ghost small" data-delsrc="${s.id}" aria-label="Remove ${esc(s.name)}">Remove</button></div>`).join("")
    :`<div class="empty">No client psychology material yet. Add the PDF and the AI will draw on it during calls.</div>`;
  return `<section class="card"><h2>Client psychology material</h2>
    <p class="sub" style="margin:0 0 12px">The text is read on this phone. Long PDFs are split up and only the relevant parts are sent to the AI in each call.</p>
    ${srcs}
    <div class="row" style="margin-top:12px"><label class="btn" for="pdfIn">Add PDF</label>
      <input id="pdfIn" type="file" accept="application/pdf,.pdf,text/plain,.txt,.md" hidden><span class="sub" id="pdfMsg">${esc(S.pdfMsg)}</span></div>
    <details style="margin-top:12px"><summary class="sub" style="cursor:pointer">PDF not reading? Paste text instead</summary>
      <input type="text" id="pasteName" placeholder="Name, for example Chapter 3" style="margin:8px 0"><textarea id="pasteText" placeholder="Paste the text here"></textarea>
      <button class="btn small" id="pasteAdd" style="margin-top:8px">Add text</button></details></section>
  <section class="card"><h2>Your notes</h2>
    <p class="sub" style="margin:0 0 8px">Write what you understood and how you would apply it. The AI uses this to test your thinking.</p>
    <textarea id="notes" placeholder="Example: Anchoring means the first number shapes everything. I should state my package price before they name a budget.">${esc(S.notes)}</textarea>
    <div class="row" style="margin-top:8px;justify-content:space-between"><span class="sub" id="notesState"></span><button class="btn small" id="saveNotes">Save notes</button></div></section>
  ${S.profile.summary?`<section class="card"><h3>What the coach has noticed in ${S.profile.count} call${S.profile.count===1?"":"s"}</h3><p style="margin:0">${esc(S.profile.summary)}</p></section>`:""}`;
}
function vSetup(){
  const st=S.setup,cfg=getCfg();
  return `<section class="card"><h2>Start a call</h2>
    ${cfg.key?"":`<p class="err" style="margin:0 0 12px">Add your Anthropic API key in Settings before the first call.</p>`}
    <h3>You are the</h3>
    <div class="seg"><button data-role="designer" aria-pressed="${st.role==="designer"}"><b>Designer</b><span class="sub">AI plays the client</span></button>
    <button data-role="client" aria-pressed="${st.role==="client"}"><b>Client</b><span class="sub">AI plays the designer</span></button></div>
    <h3 style="margin-top:16px">Scenario</h3>
    <div class="chips">${SCEN.map(s=>`<button class="chip" data-scen="${esc(s)}" aria-pressed="${st.scenario===s}">${esc(s)}</button>`).join("")}</div>
    <input type="text" id="scenIn" value="${esc(SCEN.includes(st.scenario)?"":st.scenario)}" placeholder="Or describe your own" style="margin-top:8px">
    <h3 style="margin-top:16px">Difficulty</h3>
    <div class="chips">${LEVELS.map(([k,l])=>`<button class="chip" data-level="${k}" aria-pressed="${st.level===k}">${l}</button>`).join("")}</div>
    ${S.err?`<p class="err" style="margin-top:12px">${esc(S.err)}</p>`:""}
    <button class="btn" id="start" style="margin-top:16px;width:100%" ${cfg.key?"":"disabled"}>Start call</button></section>
  ${S.profile.summary?`<section class="card"><h3>The client will probe</h3><p style="margin:0">${esc(S.profile.summary)}</p></section>`:""}`;
}
function vCall(){
  const c=S.cur,other=c.role==="designer"?"Client":"Designer";
  const ms=c.msgs.filter(m=>!m.hidden).map(m=>`<div class="who ${m.who}">${m.who==="me"?"You":other}</div><div class="msg ${m.who}">${esc(m.text)}</div>`).join("");
  const last=c.msgs[c.msgs.length-1],thinking=S.busy&&last&&last.who==="them"&&!last.text;
  return `<div class="row" style="justify-content:space-between"><div><b>${esc(c.scenario||"Client call")}</b><div class="sub">You are the ${c.role} · ${c.level}</div></div>
    <button class="btn ghost small" id="end" ${S.busy?"disabled":""}>End and get report</button></div>
    <div class="msgs">${ms}${thinking?`<div class="msg them dots"><span></span><span></span><span></span></div>`:""}${S.listening?`<div class="msg me live" id="live">${esc(S.live||"Listening…")}</div>`:""}</div>
    ${S.err?`<p class="err">${esc(S.err)}</p>`:""}
    <div class="dock">
      <div class="status" id="status">${statusText()}</div>
      <div class="microw">
        <button class="btn ghost small" id="challenge" ${S.busy||S.listening?"disabled":""}>Challenge me</button>
        <button class="mic ${S.listening?"on":""}" id="mic" ${S.busy?"disabled":""} aria-label="${S.listening?"Stop and send":"Start speaking"}">${S.listening?"Send":"Speak"}</button>
        <button class="btn ghost small" id="mute" aria-pressed="${getCfg().speak}">${getCfg().speak?"Voice on":"Voice off"}</button>
      </div>
      <details><summary class="sub" style="cursor:pointer;text-align:center">Type instead</summary>
        <textarea id="say" placeholder="Type your reply" style="min-height:64px;margin-top:8px"></textarea><button class="btn small" id="send" style="margin-top:8px" ${S.busy?"disabled":""}>Send</button></details>
    </div>`;
}
function vReport(){
  const c=S.cur;
  if(c.reporting)return `<section class="card"><h2>Reading your call</h2><p class="sub">Marking each answer against the material. This takes a few seconds.</p><div class="dots"><span></span><span></span><span></span></div></section>`;
  return (c.report?reportHtml(c):`<p class="err">No report yet.</p>`)+`<div class="row"><button class="btn" id="again">New call</button></div>`;
}
function reportHtml(c){
  const r=c.report,st=c.stats||{};
  const dims=(r.dimensions||[]).map(d=>`<div class="score"><span>${esc(d.name)}</span><div class="bar"><i style="width:${Math.max(0,Math.min(10,d.score))*10}%"></i></div><b class="mono">${esc(d.score)}</b></div><div class="sub" style="margin:-2px 0 6px 104px">${esc(d.note)}</div>`).join("");
  const fills=Object.entries(st.fill||{}).map(([k,v])=>`${esc(k)} ×${v}`).join(", ");
  const li=a=>(a||[]).map(x=>`<li>${esc(x)}</li>`).join("");
  return `<section class="card"><div class="row" style="align-items:flex-end;gap:16px"><div><div class="big mono">${esc(Number(r.overall).toFixed(1))}</div><div class="sub">out of 10 for this call</div></div><p class="grow" style="margin:0"><b>${esc(r.headline)}</b></p></div><div style="margin-top:12px">${dims}</div></section>
  <section class="card"><h3>Your delivery</h3>
    <p style="margin:0" class="mono">${st.turns||0} replies · ${st.words||0} words · ${st.avg||0} per reply${st.wpm?` · ${st.wpm} words/min`:""}</p>
    <p class="sub" style="margin:6px 0 0">${st.fillTotal?`Filler words: ${fills} (${st.fillPer100} per 100 words).`:"No common filler words picked up."} ${st.spoken?"Phone speech recognition often drops fillers, so the real number may be higher.":""}</p>
    ${r.delivery?`<p style="margin:8px 0 0">${esc(r.delivery)}</p>`:""}</section>
  <section class="card"><h3>What worked</h3><ul style="margin:0;padding-left:18px">${li(r.strengths)}</ul></section>
  <section class="card"><h3>Say it better</h3>${(r.corrections||[]).map(x=>`<div class="fix"><p class="said"><span class="tag">You said</span><br>${esc(x.said)}</p><p class="sub">${esc(x.issue)}</p><p class="better"><span class="tag">Try</span><br>${esc(x.better)}</p><button class="btn ghost small" data-say="${esc(x.better)}">Hear it</button></div>`).join("")}</section>
  ${(r.missed||[]).length?`<section class="card"><h3>Missed openings</h3><ul style="margin:0;padding-left:18px">${li(r.missed)}</ul></section>`:""}
  ${r.psychology?`<section class="card"><h3>Using the psychology</h3><p style="margin:0">${esc(r.psychology)}</p></section>`:""}
  <section class="card"><h3>Practise next</h3><ul style="margin:0 0 12px;padding-left:18px">${li(r.practice_next)}</ul><h3>Questions this client may ask next time</h3><ul style="margin:0;padding-left:18px">${li(r.hard_questions)}</ul></section>`;
}
function vPractice(){return S.view==="call"&&S.cur?vCall():S.view==="report"&&S.cur?vReport():vSetup()}
function spark(vals){
  if(vals.length<2)return"";
  const w=300,h=70,p=8,xs=i=>p+i*(w-2*p)/(vals.length-1),ys=v=>h-p-(v/10)*(h-2*p),l=vals.length-1;
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="Overall score for each call, oldest to newest"><line x1="${p}" x2="${w-p}" y1="${ys(5)}" y2="${ys(5)}" stroke="var(--line)" stroke-dasharray="3 4"/>
  <polyline points="${vals.map((v,i)=>xs(i).toFixed(1)+","+ys(v).toFixed(1)).join(" ")}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${xs(l)}" cy="${ys(vals[l])}" r="4.5" fill="var(--accent)"/></svg>`;
}
function vProgress(){
  if(S.open){const c=S.sessions.find(x=>x.id===S.open);if(c&&c.report)return `<button class="btn ghost small" id="back" style="align-self:flex-start">Back</button><div><b>${esc(c.scenario||"Client call")}</b><div class="sub">${new Date(c.started).toLocaleString()} · you were the ${c.role}</div></div>${reportHtml(c)}
    <details class="card"><summary class="sub" style="cursor:pointer">Transcript</summary><div class="msgs" style="margin-top:12px">${c.msgs.filter(m=>!m.hidden).map(m=>`<div class="msg ${m.who}">${esc(m.text)}</div>`).join("")}</div></details>`}
  const done=S.sessions.filter(s=>s.report);
  if(!done.length)return `<div class="empty">Finished calls show up here with a score trend. Start one in Practice.</div>`;
  const vals=[...done].reverse().map(s=>Number(s.report.overall)||0),sums={};
  done.forEach(s=>(s.report.dimensions||[]).forEach(d=>{(sums[d.name]=sums[d.name]||[]).push(d.score)}));
  const avg=Object.entries(sums).map(([k,a])=>[k,a.reduce((x,y)=>x+y,0)/a.length]).sort((a,b)=>a[1]-b[1]);
  const wp=done.map(s=>s.stats&&s.stats.wpm).filter(Boolean);
  return `<section class="card"><h3>Overall score by call</h3>${spark(vals)||`<p class="sub" style="margin:0">One call so far. A trend line appears after the second.</p>`}
    <p class="sub" style="margin:8px 0 0">Scores are the coach's judgment of each call. Read the trend, not the exact number.</p></section>
  <section class="card"><h3>Average by skill</h3>${avg.map(([k,v])=>`<div class="score"><span>${esc(k)}</span><div class="bar"><i style="width:${v*10}%"></i></div><b class="mono">${v.toFixed(1)}</b></div>`).join("")}${avg.length?`<p class="sub" style="margin:8px 0 0">Weakest: ${esc(avg[0][0])}.</p>`:""}
    ${wp.length?`<p class="sub" style="margin:4px 0 0">Average speaking pace: ${Math.round(wp.reduce((a,b)=>a+b,0)/wp.length)} words per minute.</p>`:""}</section>
  <section class="card"><h3>Past calls</h3>${done.map(s=>`<button class="hist" data-open="${s.id}"><span><b>${esc(s.scenario||"Client call")}</b><br><span class="sub">${new Date(s.started).toLocaleDateString()} · ${s.role}</span></span><span class="mono"><b>${Number(s.report.overall).toFixed(1)}</b></span></button>`).join("")}</section>`;
}
function vSettings(){
  const c=getCfg();
  return `<section class="card"><h2>Settings</h2>
    <label class="f" for="key">Anthropic API key</label><input type="password" id="key" value="${esc(c.key)}" placeholder="sk-ant-..." autocomplete="off">
    <p class="sub" style="margin:6px 0 0">Stored only on this phone. Calls go straight from this phone to Anthropic. Set a monthly spend limit in your Anthropic console.</p>
    <label class="f" for="model">Model</label><input type="text" id="model" value="${esc(c.model)}">
    <label class="f" for="lang">Speaking language and accent</label>
    <select id="lang">${[["en-NG","English (Nigeria)"],["en-US","English (US)"],["en-GB","English (UK)"],["en-ZA","English (South Africa)"]].map(([v,l])=>`<option value="${v}" ${c.lang===v?"selected":""}>${l}</option>`).join("")}</select>
    <div class="toggle"><span>AI speaks its replies</span><button class="chip" id="tSpeak" aria-pressed="${c.speak}">${c.speak?"On":"Off"}</button></div>
    <div class="toggle"><span>Hands-free: mic opens after the AI finishes</span><button class="chip" id="tHands" aria-pressed="${c.hands}">${c.hands?"On":"Off"}</button></div>
    <div class="row" style="margin-top:8px"><button class="btn" id="saveCfg">Save settings</button><span class="sub" id="cfgState"></span></div></section>
  <section class="card"><h3>Your data</h3><p class="sub" style="margin:0 0 8px">Everything is stored on this phone. Clearing the browser data for this app erases it.</p>
    <button class="btn ghost small" id="wipe">Delete all calls and progress</button><span class="sub" id="wipeState" style="margin-left:8px"></span></section>`;
}
function render(){
  nav();const m=$("#main");
  const keep=document.activeElement&&document.activeElement.id==="say"?$("#say").value:null;
  m.innerHTML=S.tab==="library"?vLibrary():S.tab==="practice"?vPractice():S.tab==="progress"?vProgress():vSettings();
  if(keep!==null&&$("#say")){$("#say").value=keep;$("#say").closest("details").open=true}
  if(S.tab==="practice"&&S.view==="call"){const e=document.querySelectorAll(".msg");if(e.length)e[e.length-1].scrollIntoView({block:"end"})}
}

/* ---------- events ---------- */
document.addEventListener("click",async ev=>{
  const t=ev.target.closest("button,label");if(!t)return;const d=t.dataset||{};
  if(d.tab){if(S.listening)stopListening(false);stopSpeaking();S.tab=d.tab;S.open=null;S.err="";render();scrollTo(0,0);return}
  if(d.use){S.use[d.use]=S.use[d.use]===false;await saveMeta();render();return}
  if(d.delsrc){S.sources=S.sources.filter(s=>s.id!==d.delsrc);delete S.use[d.delsrc];await del("src_"+d.delsrc);await saveMeta();render();return}
  if(t.id==="saveNotes"){S.notes=$("#notes").value;await saveMeta();$("#notesState").textContent="Notes saved";return}
  if(t.id==="pasteAdd"){const x=$("#pasteText").value;if(x.trim())await addSource($("#pasteName").value.trim()||"Pasted text",x);return}
  if(d.role){S.setup.role=d.role;render();return}
  if(d.scen){S.setup.scenario=S.setup.scenario===d.scen?"":d.scen;render();return}
  if(d.level){S.setup.level=d.level;render();return}
  if(t.id==="start"){await startCall();return}
  if(t.id==="mic"){S.listening?stopListening(true):startListening();return}
  if(t.id==="mute"){const v=!getCfg().speak;setCfg({speak:v});if(!v)stopSpeaking();render();return}
  if(t.id==="send"){const v=$("#say").value.trim();if(v&&!S.busy){$("#say").value="";await sendTurn(v,0)}return}
  if(t.id==="challenge"){if(S.busy)return;await aiTurn({who:"me",hidden:true,text:"[Director note, not part of the call: ask me one hard critical-thinking question that tests how well I understand and can apply the reference material. Stay in character and keep it short enough to say aloud. Do not mention this note.]"});return}
  if(t.id==="end"){await makeReport();return}
  if(t.id==="again"){S.view="setup";S.cur=null;S.err="";render();return}
  if(d.say){speak(d.say);return}
  if(d.open){S.open=d.open;render();scrollTo(0,0);return}
  if(t.id==="back"){S.open=null;render();return}
  if(t.id==="tSpeak"||t.id==="tHands"){const k=t.id==="tSpeak"?"speak":"hands";const v=!getCfg()[k];setCfg({[k]:v});t.setAttribute("aria-pressed",v);t.textContent=v?"On":"Off";return}
  if(t.id==="saveCfg"){setCfg({key:$("#key").value.trim(),model:$("#model").value.trim()||DEF.model,lang:$("#lang").value});$("#cfgState").textContent="Saved";return}
  if(t.id==="wipe"){for(const s of S.sessions)await del("ses_"+s.id);S.sessions=[];S.profile={summary:"",count:0};await saveMeta();$("#wipeState").textContent="Deleted";return}
});
document.addEventListener("change",async ev=>{
  if(ev.target.id!=="pdfIn")return;
  const f=ev.target.files[0];ev.target.value="";if(!f)return;
  S.pdfMsg="Reading "+f.name+"…";const e=$("#pdfMsg");if(e)e.textContent=S.pdfMsg;
  try{const pdf=/pdf$/i.test(f.name)||f.type==="application/pdf";await addSource(f.name.replace(/\.[^.]+$/,""),pdf?await readPdf(f):await f.text())}
  catch(err){S.pdfMsg="This PDF could not be read. Check your internet connection once, or paste the text instead.";render()}
});
if("speechSynthesis"in window)speechSynthesis.onvoiceschanged=()=>{};

/* ---------- boot ---------- */
(async()=>{
  render();
  try{idb=await openDb();const all=await loadAll(),m=all.meta;
    if(m){S.notes=m.notes||"";S.profile=m.profile||S.profile;S.use=m.use||{}}
    S.sources=Object.keys(all).filter(k=>k.startsWith("src_")).map(k=>all[k]).sort((a,b)=>a.added-b.added);
    S.sessions=Object.keys(all).filter(k=>k.startsWith("ses_")).map(k=>all[k]).sort((a,b)=>b.started-a.started);
    // a call left unfinished (no report) is not shown in Progress
  }catch(e){S.err="Storage is unavailable in this browser, so nothing will be saved."}
  render();
})();
