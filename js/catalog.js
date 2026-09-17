/* FTask — каталог креосов + карточка (детали). Требует core.js. */

/* ---------- выборка ---------- */
const VIEWS=[["free","Свободные","q"],["work","В работе","p"],["done","Готовые","d"],["deferred","Отложенные","z"]];
const PUB=[["","Все"],["notme","Я не публиковал"],["nobody","Никто не публиковал"],["any","Опубликованные"]];
function inView(c,v){
  if(v==="deferred")return !!c.deferred_at;
  if(c.deferred_at)return false;
  if(v==="free")return c.status==="queued";
  if(v==="work")return c.status==="in_progress";
  return c.status==="done";
}
const nicheNames=c=>(c.niche_ids||[]).map(id=>(nicheOf(id)||{}).name).filter(Boolean);
const catText=c=>[c.caption,c.result_caption,c.source_url,"#"+c.id,c.author_username,nameOf(c.assignee_tg_id),
  nicheNames(c).join(" "),c.notes].filter(Boolean).join(" ").toLowerCase();
function catList(v){
  let list=S.creos.filter(c=>inView(c,v||S.view));
  if(S.mine)list=list.filter(c=>isMine(c)||((v||S.view)==="done"&&iPosted(c)));
  if(S.niche==="none")list=list.filter(c=>!(c.niche_ids||[]).length);
  else if(S.niche)list=list.filter(c=>(c.niche_ids||[]).includes(+S.niche));
  if(S.author)list=list.filter(c=>c.author_username===S.author);
  if((v||S.view)==="done"){
    if(S.pub==="notme")list=list.filter(c=>!iPosted(c));
    else if(S.pub==="nobody")list=list.filter(c=>!postedList(c).length);
    else if(S.pub==="any")list=list.filter(c=>postedList(c).length);
  }
  const q=(S.q||"").trim().toLowerCase();
  if(q)list=list.filter(c=>catText(c).includes(q));
  const key=c=>(v||S.view)==="done"?(c.delivered_at||c.done_at||c.created_at||0)
    :(v||S.view)==="deferred"?(c.deferred_at||c.created_at||0):(c.claimed_at&&(v||S.view)==="work"?c.claimed_at:c.created_at||0);
  list.sort((a,b)=>S.sort==="old"?new Date(key(a))-new Date(key(b)):new Date(key(b))-new Date(key(a)));
  return list;
}

/* ---------- медиа карточки ---------- */
/* индекс последнего результата — по путям (result_urls выровнены по индексу, слот может быть null) */
const lastRes=c=>{const p=c.result_paths||[];return p.length?p.length-1:-1;};
/* что показать на плитке: у референса — исходник, у готового — последний результат */
function tileMedia(c){
  const ri=lastRes(c);
  if(c.status==="done"&&ri>=0){
    const p=(c.result_paths||[])[ri]||"",u=(c.result_urls||[])[ri];
    if(!isVid(p)&&u)return {img:u,ref:[c.id,"result_urls",ri],clip:c.clip_url,clipRef:[c.id,"clip_url",0],lbl:"результат"};
    if(c.preview_url)return {img:c.preview_url,ref:[c.id,"preview_url",0],clip:c.clip_url,clipRef:[c.id,"clip_url",0],lbl:"результат"};
    if(u)return {vid:u,ref:[c.id,"result_urls",ri],lbl:"результат"};
  }
  if(c.source_poster_url)return {img:c.source_poster_url,ref:[c.id,"source_poster_url",0],clip:c.source_clip_url,clipRef:[c.id,"source_clip_url",0],lbl:"исходник"};
  const su=c.source_urls||[],sp=c.source_paths||[];
  for(let i=0;i<su.length;i++)if(su[i]&&!isVid(sp[i]))return {img:su[i],ref:[c.id,"source_urls",i],lbl:"исходник"};
  const mu=c.media_urls||[],mp=c.storage_paths||[];
  for(let i=0;i<mu.length;i++)if(mu[i]&&!isVid(mp[i]))return {img:mu[i],ref:[c.id,"media_urls",i],lbl:"исходник"};
  const sv=su.findIndex(Boolean);
  if(sv>=0)return {vid:su[sv],ref:[c.id,"source_urls",sv],lbl:"исходник"};
  if(c.status==="done"&&ri>=0&&c.preview_url)return {img:c.preview_url,ref:[c.id,"preview_url",0],lbl:"результат"};
  return {none:true};
}
const mref=r=>' data-mref="'+r.join("|")+'"';
function srcState(c){
  // понятное состояние, когда медиа нет
  if(c.kind==="text")return {big:"📝",txt:"текстовая идея"};
  if(c.source_state==="too_big")return {big:"📦",txt:"файл > 20 МБ — открыть в Telegram"};
  if(c.source_state==="failed")return {big:"⚠️",txt:"не удалось подготовить — открыть в Telegram"};
  if(c.source_state==="none"&&c.kind==="link")return {big:"🔗",txt:"ссылка · видео в Telegram"};
  if(!c.source_state&&(c.file_ids||[]).length)return {big:"⏳",txt:"готовится…"};
  return {big:KIND[c.kind]||"📎",txt:"нет превью · открыть в Telegram"};
}
function mediaBox(c,extra){
  const m=tileMedia(c);
  let inner;
  if(m.none){const s=srcState(c);inner='<div class="na"><div><div class="big">'+s.big+'</div>'+esc(s.txt)+'</div></div>';}
  else if(m.vid)inner='<video muted playsinline preload="metadata" src="'+esc(m.vid)+'#t=0.1"'+mref(m.ref)+'></video>';
  else inner='<img loading="lazy" src="'+esc(m.img)+'"'+mref(m.ref)+'>';
  const clip=m.clip?' data-clip="'+esc(m.clip)+'" data-clipref="'+m.clipRef.join("|")+'"':"";
  const st=c.deferred_at?["z","отложено"]:c.status==="queued"?["q","свободно"]:c.status==="in_progress"?["p","в работе"]:["d","готово"];
  const dur=c.duration_sec&&c.status==="done"?'<span class="dur">'+fmtDur(c.duration_sec)+'</span>':"";
  return '<div class="wm" data-cid="'+c.id+'"'+clip+'>'+inner+
    '<span class="kb">'+(KIND[c.kind]||"🎬")+'</span>'+dur+(m.clip?'<span class="tapp">▶</span>':"")+
    '<div class="stt '+st[0]+'"><span class="sdot"></span>'+st[1]+(extra||"")+'</div></div>';
}
const fmtDur=s=>{s=Math.round(+s||0);if(!s)return"";return Math.floor(s/60)+":"+String(s%60).padStart(2,"0");};

/* один активный клип на экране: hover на ПК, тап на телефоне */
let ACTIVE_CLIP=null;
function clipStop(){if(!ACTIVE_CLIP)return;ACTIVE_CLIP.classList.remove("play");const v=ACTIVE_CLIP.querySelector("video.hv");if(v)v.pause();ACTIVE_CLIP=null;}
function clipPlay(m){
  if(ACTIVE_CLIP&&ACTIVE_CLIP!==m)clipStop();
  let cv=m.querySelector("video.hv");
  if(!cv){cv=document.createElement("video");cv.className="hv";cv.muted=true;cv.loop=true;cv.playsInline=true;cv.preload="none";
    cv.src=m.dataset.clip;if(m.dataset.clipref)cv.dataset.mref=m.dataset.clipref;m.appendChild(cv);}
  m.classList.add("play");ACTIVE_CLIP=m;cv.play().catch(()=>{});
}
function bindClips(root){
  const hover=window.matchMedia("(hover:hover)").matches;
  root.querySelectorAll(".wm[data-clip]").forEach(m=>{
    if(hover){m.addEventListener("mouseenter",()=>clipPlay(m));m.addEventListener("mouseleave",()=>{if(ACTIVE_CLIP===m)clipStop();});}
    const t=m.querySelector(".tapp");if(t)t.onclick=e=>{e.stopPropagation();haptic();
      if(ACTIVE_CLIP===m)clipStop();else clipPlay(m);};
  });
}

/* ---------- плитка ---------- */
function primaryAct(c){
  if(c.deferred_at)return ['restore',"↩ Вернуть",""];
  if(c.status==="queued")return canClaim()?['claim',"Взять","take"]:null;
  if(c.status==="in_progress")return isMine(c)?['upload',"📤 Загрузить результат","plus"]:null;
  const ri=lastRes(c);
  if(ri>=0)return ['download',"⬇ Скачать",""];
  return ['upload',"📤 Загрузить результат","plus"];
}
/* Прямое скачивание исходника с плитки (без claim): один файл → сразу качаем, альбом → в карточку,
   где каждый файл отдельно. У готового на плитке главное — результат; исходник остаётся в карточке. */
function tileDl(c){
  if(c.status==="done")return "";
  const items=dlSourceItems(c);
  if(!items.length)return "";
  if(items.length===1)return dlButton(c,items[0].field,items[0].i,{label:"⬇",cls:"sm",title:"Скачать исходник: "+items[0].name});
  return '<button class="act dlb sm" data-act="files" data-id="'+c.id+'" title="Скачать файлы исходника по одному">⬇ '+items.length+'</button>';
}
function ccard(c){
  const capUrl=c.kind==="link"&&c.source_url&&!c.caption;
  const cap=c.result_caption||c.caption||c.source_url||"";
  const who=c.status==="queued"?"от <b>"+esc(c.author_username||"—")+"</b>"
    :c.status==="in_progress"?"делает <b>"+esc(nameOf(c.assignee_tg_id)||"?")+"</b>"
    :(nameOf(c.assignee_tg_id)?"сделал <b>"+esc(nameOf(c.assignee_tg_id))+"</b>":"от <b>"+esc(c.author_username||"—")+"</b>");
  const nn=nicheNames(c);
  const chips=nn.length?'<div class="nchips">'+nn.slice(0,2).map(n=>'<span class="nc">'+esc(n)+'</span>').join("")+
    (nn.length>2?'<span class="nc">+'+(nn.length-2)+'</span>':"")+'</div>':"";
  const pa=primaryAct(c),td=tileDl(c);
  const mainAct=pa?(pa[0]==="download"?dlButton(c,"result",lastRes(c),{label:pa[1]}):'<button class="act '+pa[2]+'" data-act="'+pa[0]+'" data-id="'+c.id+'">'+pa[1]+'</button>'):"";
  const act=(pa||td)?'<div class="ca">'+mainAct+td+'</div>':"";
  const post=postedList(c).length?' · <span style="color:var(--o)">✓ опубл.</span>':"";
  return '<div class="cc'+(S.open===c.id?" open":"")+(isMine(c)&&c.status==="in_progress"?" mine":"")+'" data-open="'+c.id+'">'+deliveryPickBadge(c)+mediaBox(c)+
    '<div class="cb"><div class="ct'+(capUrl?" url":"")+'">'+(cap?esc(cap):'<span style="opacity:.4">без подписи</span>')+'</div>'+
    chips+'<div class="cm">'+who+post+'<span class="ago">'+ago(c.status==="done"?(c.delivered_at||c.done_at||c.created_at):c.created_at)+'</span></div>'+act+'</div></div>';
}

/* ---------- экран каталога ---------- */
function vCatalog(){
  const counts={};VIEWS.forEach(([k])=>counts[k]=catList(k).length);
  const authors=[...new Set(S.creos.map(c=>c.author_username).filter(Boolean))];
  const list=catList();
  let h='<div class="ctools">'+
    '<div class="search"><span class="si">🔍</span><input class="field" id="cq" type="search" placeholder="Поиск: подпись, ссылка, ID, ниша, кто делал" value="'+esc(S.q||"")+'"></div>'+
    '<div class="views">'+VIEWS.map(([k,l,cl])=>'<button class="'+(S.view===k?"on "+cl:"")+'" data-view="'+k+'">'+l+'<span class="n">'+counts[k]+'</span></button>').join("")+'</div>'+
    '<div class="frow"><button class="tog'+(S.mine?" on":"")+'" id="cmine">Мои</button>'+
    '<select id="cn"><option value="">Все ниши</option><option value="none"'+(S.niche==="none"?" selected":"")+'>Без ниши</option>'+
      S.niches.map(n=>'<option value="'+n.id+'"'+(String(S.niche)===String(n.id)?" selected":"")+'>'+esc(n.name)+'</option>').join("")+'</select>'+
    '<select id="ca"><option value="">Все авторы</option>'+authors.map(a=>'<option'+(S.author===a?" selected":"")+'>'+esc(a)+'</option>').join("")+'</select>'+
    '<select id="cs"><option value="new"'+(S.sort!=="old"?" selected":"")+'>Свежие сверху</option><option value="old"'+(S.sort==="old"?" selected":"")+'>Сначала старые</option></select></div>'+
    (S.view==="done"?'<div class="nchips">'+PUB.map(([k,l])=>'<button class="nc'+((S.pub||"")===k?" on":"")+'" data-pub="'+k+'">'+l+'</button>').join("")+'</div>'+deliveryPickBar():"")+
    '</div>';
  if(!list.length){
    const any=S.q||S.niche||S.author||S.mine||S.pub;
    const msg={free:"Свободных референсов нет — поставь 👍 в AvaKreo Links.",work:"Никто ничего не делает прямо сейчас.",
      done:"Готовых пока нет — загрузи результат кнопкой «📤».",deferred:"Отложенных нет."}[S.view];
    return h+'<div class="empty"><div class="e-ic">'+(any?"🔍":"🗂")+'</div><div class="e-h">'+(any?"Ничего не нашлось":"Пусто")+'</div>'+(any?"Поменяй запрос или сними фильтры.":msg)+'</div>';
  }
  return h+'<div class="cgrid">'+list.map(ccard).join("")+'</div>';
}
function bindCatalog(el){
  const cq=el.querySelector("#cq");
  if(cq){let t=null;cq.oninput=()=>{clearTimeout(t);t=setTimeout(()=>{S.q=cq.value;savePrefs();
    const y=window.scrollY;render();window.scrollTo(0,y);
    const n=document.getElementById("cq");if(n){n.focus();n.setSelectionRange(n.value.length,n.value.length);}},180);};}
  el.querySelectorAll("[data-view]").forEach(b=>b.onclick=()=>{haptic();S._scroll[scrollKey()]=window.scrollY;S.view=b.dataset.view;
    if(S.view!=="done")S.pub="";savePrefs();render();window.scrollTo(0,S._scroll[scrollKey()]||0);});
  const cm=el.querySelector("#cmine");if(cm)cm.onclick=()=>{haptic();S.mine=!S.mine;savePrefs();render();};
  const cn=el.querySelector("#cn");if(cn)cn.onchange=()=>{S.niche=cn.value;savePrefs();render();};
  const ca=el.querySelector("#ca");if(ca)ca.onchange=()=>{S.author=ca.value;savePrefs();render();};
  const cs=el.querySelector("#cs");if(cs)cs.onchange=()=>{S.sort=cs.value;savePrefs();render();};
  el.querySelectorAll("[data-pub]").forEach(b=>b.onclick=()=>{haptic();S.pub=b.dataset.pub;savePrefs();render();});
  el.querySelectorAll("[data-act]").forEach(b=>b.onclick=e=>{e.stopPropagation();creoAction(b.dataset.act,+b.dataset.id);});
  el.querySelectorAll("[data-open]").forEach(cd=>cd.onclick=e=>{if(e.target.closest("button"))return;openDetail(+cd.dataset.open);});
  bindDl(el);
  bindClips(el);
  bindDeliveryCatalog(el);
}

/* ---------- действия (единый контракт с сервером: logic.statusTransition) ---------- */
function upd(c,d){if(d&&d.creo)Object.assign(c,d.creo);S._sig=sigOf();header();render();}
async function creoAction(act,id){
  const c=S.creos.find(x=>x.id===id);if(!c)return;
  if(act==="download"){downloadFile(id,"result",lastRes(c));return;}   // без haptic/await до picker (activation)
  if(act==="files"){openDetail(id);return;}
  haptic();
  try{
    if(act==="claim"){const d=await api("claim_creo",{id});upd(c,d);notify();toast("Взял в работу","ok");}
    else if(act==="upload")openSheet(id);
    else if(act==="restore"){const d=await api("restore_creo",{id});upd(c,d);toast("Вернул в каталог","ok");}
    else if(act==="defer"){const d=await api("defer_creo",{id});upd(c,d);toast("Отложено — вид «Отложенные»","ok");}
    else if(act==="queue"){const d=await api("set_creo_status",{id,status:"queued"});upd(c,d);toast("Вернул в свободные","ok");}
    else if(act==="work"){const d=await api("set_creo_status",{id,status:"in_progress"});upd(c,d);toast("Снова в работе","ok");}
    else if(act==="done"){const d=await api("set_creo_status",{id,status:"done"});upd(c,d);toast("Отмечено готовым","ok");}
    else if(act==="ready")openReady(c);
    else if(act==="src")openSource(c);
    else if(act==="link")openExt(c.source_url);
  }catch(e){toast(errMsg(e),"err");if(e.data&&e.data.creo){Object.assign(c,e.data.creo);S._sig=sigOf();header();render();}
    else if(e.message==="already_claimed"||e.message==="conflict")poll();}
}
async function togglePosted(id){
  haptic();const c=S.creos.find(x=>x.id===id);const prev=(c.posters||[]).slice();
  const meP={tg_id:S.me.tg_id,username:S.me.username,at:new Date().toISOString()};
  c.posters=iPosted(c)?prev.filter(p=>String(p.tg_id)!==String(S.me.tg_id)):prev.concat([meP]);
  header();render();
  try{const d=await api("toggle_posted",{id});Object.assign(c,d.creo);S._sig=sigOf();header();render();}
  catch(e){c.posters=prev;header();render();toast(errMsg(e),"err");}
}
async function delCreo(id){
  const c=S.creos.find(x=>x.id===id);
  if(!confirm("Точно удалить крео #"+id+" от "+(c&&c.author_username||"—")+"? Это навсегда."))return;
  haptic("medium");
  try{await api("delete_creo",{id});S.creos=S.creos.filter(x=>x.id!==id);if(S.open===id)closeDetail(true);S._sig=sigOf();header();render();toast("Крео удалено","ok");}
  catch(e){toast(errMsg(e),"err");}
}
async function doAssign(id,v){
  const c=S.creos.find(x=>x.id===id);
  try{const d=await api("assign_creo",{id,assignee_tg_id:v==="0"?null:+v});upd(c,d);}
  catch(e){toast(errMsg(e),"err");render();}
}
/* ниши */
async function setNiches(id,ids){
  const c=S.creos.find(x=>x.id===id);const prev=(c.niche_ids||[]).slice();
  c.niche_ids=ids.slice();S._sig=sigOf();
  try{const d=await api("set_creo_niches",{id,niche_ids:ids});c.niche_ids=d.niche_ids||ids;S._sig=sigOf();}
  catch(e){c.niche_ids=prev;toast(errMsg(e),"err");}
  render();
}
async function newNiche(){
  const name=prompt("Название новой ниши (например, Косплей):");
  if(name==null)return null;
  if(!name.trim()){toast(ERR.no_name,"err");return null;}
  try{const d=await api("create_niche",{name:name.trim()});
    if(!S.niches.find(n=>n.id===d.niche.id))S.niches.push(d.niche);
    S.niches.sort((a,b)=>a.name.localeCompare(b.name,"ru"));S._sig=sigOf();
    toast(d.existed?"Такая ниша уже была — выбрал её":"Ниша создана","ok");return d.niche;}
  catch(e){toast(errMsg(e),"err");return null;}
}
async function renameNiche(id){
  const n=nicheOf(id);if(!n)return;const name=prompt("Новое название ниши:",n.name);
  if(name==null||!name.trim()||name.trim()===n.name)return;
  try{const d=await api("rename_niche",{id,name:name.trim()});Object.assign(n,d.niche);S._sig=sigOf();render();toast("Переименовано","ok");}
  catch(e){toast(errMsg(e),"err");}
}
function nicheChips(sel,opts){
  // общий рендер чипов ниш: sel = Set выбранных id; opts.attr — data-атрибут для клика
  const at=opts.attr;
  return '<div class="nchips">'+S.niches.map(n=>'<button class="nc'+(sel.has(n.id)?" on":"")+'" data-'+at+'="'+n.id+'">'+esc(n.name)+'</button>').join("")+
    '<button class="nc add" data-'+at+'="new">＋ Новая ниша</button></div>';
}

/* ---------- карточка (детали) ---------- */
function openDetail(id){
  S.open=id;S.dview=null;savePrefs();
  document.querySelectorAll(".cc.open").forEach(x=>x.classList.remove("open"));
  const cd=document.querySelector('.cc[data-open="'+id+'"]');if(cd)cd.classList.add("open");
  renderDetail();
  const d=document.getElementById("detail");
  if(!isSplit()){clipStop();document.body.classList.add("dopen");d.scrollTop=0;requestAnimationFrame(()=>d.classList.add("show"));}
}
function closeDetail(silent){
  const d=document.getElementById("detail");
  d.classList.remove("show");document.body.classList.remove("dopen");
  S.open=null;S.dview=null;S._dsig="";savePrefs();
  document.querySelectorAll(".cc.open").forEach(x=>x.classList.remove("open"));
  if(isSplit()&&S.tab==="cat")renderDetail();
  else if(!silent)setTimeout(()=>{d.innerHTML="";},300);
}
/* просмотрщик: список кадров = исходник (source_urls / media_urls) + результаты (новые первыми) */
/* Итерируем по ПУТЯМ: *_urls выровнены по индексу, слот может быть null (ссылка не подписалась /
   ещё не пришла) — кадр всё равно есть, скачать его можно (sign_download подпишет заново). */
function frames(c){
  const out=[];
  const sp=c.source_paths||[],su=c.source_urls||[];
  sp.forEach((p,i)=>out.push({f:"source_urls",dl:"source",i,u:su[i]||null,p:p||"",lbl:"исходник",vid:isVid(p)}));
  const mp=c.storage_paths||[],mu=c.media_urls||[];
  mp.forEach((p,i)=>{if(!(c.result_paths||[]).includes(p))out.push({f:"media_urls",dl:"media",i,u:mu[i]||null,p:p||"",lbl:"исходник",vid:isVid(p)});});
  const rp=c.result_paths||[],ru=c.result_urls||[];
  for(let i=rp.length-1;i>=0;i--)out.push({f:"result_urls",dl:"result",i,u:ru[i]||null,p:rp[i]||"",lbl:"результат",vid:isVid(rp[i]),res:true,n:i+1});
  return out;
}
function defaultFrame(fr,c){
  if(c.status==="done"){const r=fr.find(x=>x.res);if(r)return r;}
  return fr[0]||null;
}
function renderDetail(){
  const d=document.getElementById("detail");
  const c=S.open?S.creos.find(x=>x.id===S.open):null;
  if(!c){S.open=null;
    d.innerHTML=isSplit()?'<div class="dempty"><div class="big">🗂</div>Выбери крео в каталоге —<br>подробности откроются здесь.</div>':"";
    d.classList.toggle("empty",true);return;}
  d.classList.remove("empty");
  const fr=frames(c);
  let cur=S.dview&&fr.find(x=>x.f===S.dview.f&&x.i===S.dview.i);
  if(!cur){cur=defaultFrame(fr,c);S.dview=cur?{f:cur.f,i:cur.i}:null;}
  // сохранить ввод заметок, если перерисовка застала текстовое поле в фокусе
  const na=document.activeElement;const keepNotes=(na&&na.id==="dnotes")?{v:na.value,s:na.selectionStart}:null;
  const st=c.deferred_at?["z","отложено"]:c.status==="queued"?["q","свободно"]:c.status==="in_progress"?["p","в работе"]:["d","готово"];
  const dsig=JSON.stringify([c.id,cur&&cur.f,cur&&cur.i,cur&&cur.u,fr.map(x=>x.u)]);
  const viewerHtml=()=>{
    if(!cur){const s=srcState(c);return '<div class="viewer"><div class="vna"><div class="big">'+s.big+'</div>'+esc(s.txt)+'</div></div>';}
    const main=!cur.u?'<div class="vna"><div class="big">⏳</div>ссылка на файл обновляется…</div>'
      :cur.vid?'<video class="vmain" controls playsinline preload="metadata" src="'+esc(cur.u)+'"'+mref([c.id,cur.f,cur.i])+'></video>'
      :'<img class="vmain" src="'+esc(cur.u)+'"'+mref([c.id,cur.f,cur.i])+'>';
    const th=fr.length>1?'<div class="thumbs2">'+fr.map(x=>'<div class="th2'+(x===cur?" on":"")+'" data-fr="'+x.f+'|'+x.i+'">'+
      (x.vid||!x.u?'<div class="vf">'+(x.vid?"🎬":"⏳")+'</div>':'<img src="'+esc(x.u)+'"'+mref([c.id,x.f,x.i])+'>')+'<span class="lb">'+(x.res?"рез. "+x.n:"исх.")+'</span></div>').join("")+'</div>':"";
    // скачать ровно текущий кадр — исходник доступен без claim и после загрузки результатов
    const dlrow='<div class="vdl"><span class="vfn">'+esc(fname(cur.p)||"файл")+'</span>'+
      dlButton(c,cur.dl,cur.i,{label:"⬇ Скачать этот файл",cls:"cur"})+'</div>';
    return '<div class="viewer"><span class="vlbl">'+cur.lbl+(cur.res?" "+cur.n:"")+'</span>'+main+'</div>'+th+dlrow;
  };
  const cap=c.caption||"";const rcap=c.result_caption||"";
  const links='<div class="dlinks">'+
    (c.source_msg_id?'<button class="act" data-dact="src"><span class="ar">'+(c.downloaded_msg_id?"▶":"↗")+'</span> '+(c.downloaded_msg_id?"Видео в Telegram":"Исходник в Telegram")+'</button>':"")+
    (c.source_url?'<button class="act" data-dact="link"><span class="ar">🔗</span> Открыть ссылку</button>':"")+
    (c.ready_msg_id?'<button class="act" data-dact="ready"><span class="ar">✓</span> В Ready</button>':"")+'</div>';
  // действия по состоянию
  const mine=isMine(c);let acts="";
  if(c.deferred_at){acts='<button class="primary" data-dact="restore">↩ Вернуть в каталог</button>'+
    '<div class="note" style="margin-top:8px">Отложил '+esc(nameOf(c.deferred_by_tg_id)||"—")+' · '+ago(c.deferred_at)+'. Статус и исполнитель сохранены.</div>';}
  else if(c.status==="queued"){acts=(canClaim()?'<button class="primary" data-dact="claim">Взять в работу</button>':"")+
    '<div class="row2"><button class="act" data-dact="defer">💤 Отложить</button></div>';}
  else if(c.status==="in_progress"){
    acts=mine?'<button class="primary" data-dact="upload">📤 Загрузить результат</button>'+
      '<div class="row2"><button class="act" data-dact="queue">↩ В свободные</button><button class="act" data-dact="done" title="Отметить готовым без загрузки файлов">✓ Готово</button></div>'+
      '<div class="row2"><button class="act" data-dact="defer">💤 Отложить</button></div>'
      :'<div class="note">В работе у <b>'+esc(nameOf(c.assignee_tg_id)||"?")+'</b> · взял '+ago(c.claimed_at||c.created_at)+'</div>'+
      '<div class="row2">'+(admin()?'<button class="act" data-dact="queue">↩ В свободные</button>':"")+'<button class="act" data-dact="defer">💤 Отложить</button></div>';}
  else{acts='<button class="primary" data-dact="upload">📤 Загрузить ещё результат</button>'+
    '<div class="row2">'+((mine||admin())?'<button class="act" data-dact="work">↩ Снова в работу</button>':"")+'<button class="act" data-dact="defer">💤 Отложить</button></div>';}
  if(admin()&&!c.deferred_at)acts+='<div class="assign"><select id="dassign"><option value="">↪ переназначить…</option><option value="0">← в свободные</option>'+
    S.members.map(m=>'<option value="'+m.tg_id+'"'+(String(m.tg_id)===String(c.assignee_tg_id)?" selected":"")+'>'+esc(m.name||("@"+(m.username||m.tg_id)))+'</option>').join("")+'</select></div>';
  const sel=new Set(c.niche_ids||[]);
  const results=(c.result_paths||[]).map((p,i)=>({p,u:(c.result_urls||[])[i],i})).reverse();
  const rlist=results.length?'<div class="rlist result-files">'+results.map((r,k)=>'<div class="rrow'+(k===0?" new":"")+'"><div class="ri">'+
      (isVid(r.p)?"🎬":(r.u?'<img loading="lazy" src="'+esc(r.u)+'"'+mref([c.id,"result_urls",r.i])+'>':"🖼"))+'</div>'+
      '<div class="rn">'+esc(fname(r.p))+'<small>'+(k===0?"последний · ":"")+'результат '+(r.i+1)+' из '+results.length+'</small></div>'+
      (isVid(r.p)?'<button class="act uqone" data-uqpath="'+dEscapeAttr(r.p)+'" data-uqcid="'+c.id+'">Уникализировать</button>':'')+
      dlButton(c,"result",r.i,{title:"Скачать: "+dlName(c.id,"result",r.i,r.p)})+'</div>').join("")+'</div>':'<div class="note">Результатов ещё нет.</div>';
  // исходник референса: каждый файл (альбом — по одному) качается без claim; нет файлов — честное состояние
  const srcs=dlSourceItems(c);
  const slist=srcs.length?'<div class="rlist">'+srcs.map(x=>'<div class="rrow"><div class="ri">'+
      (x.vid?"🎬":(mediaUrl(c.id,DL_URLF[x.field],x.i)?'<img loading="lazy" src="'+esc(mediaUrl(c.id,DL_URLF[x.field],x.i))+'"'+mref([c.id,DL_URLF[x.field],x.i])+'>':"🖼"))+'</div>'+
      '<div class="rn">'+esc(fname(x.p))+'<small>'+esc(x.name)+'</small></div>'+dlButton(c,x.field,x.i,{title:"Скачать: "+x.name})+'</div>').join("")+'</div>'
    :'<div class="note">'+esc(srcState(c).txt)+(c.source_state==="too_big"||c.source_state==="failed"||(c.source_state==="none"&&c.source_msg_id)?" — кнопка «Исходник в Telegram» выше.":"")+'</div>';
  const ssec='<div class="dsec"><div class="dh">Исходник <span class="c">'+srcs.length+'</span></div>'+slist+'<div class="note dlnote">'+esc(dlModeNote())+'</div></div>';
  const dl=c.delivery_state==="pending"?'<div class="dl pend"><span class="dspin"></span> Уходит в AvaCarter Ready…</div>'
    :(c.delivery_state==="sent"&&c.ready_msg_id)?'<button class="dl sent" data-dact="ready">✓ В Ready · открыть ↗</button>':"";
  const ps=postedList(c),pm=iPosted(c);
  const pnames=ps.map(p=>"@"+esc(p.username||nameOf(p.tg_id)||p.tg_id));
  const pbar='<div class="pbar"><button class="posted'+(pm?" on":ps.length?" has":"")+'" id="dpost">'+
    (ps.length?"✓ Опубликовали: "+pnames.slice(0,3).join(", ")+(pnames.length>3?" +"+(pnames.length-3):""):"☁ Я опубликовал")+'</button></div>';
  const canDel=admin()||c.author_tg_id===S.me.tg_id;
  const notes=c.notes||"";
  const nst=c.notes_updated_at?("сохранено · "+esc(nameOf(c.notes_by_tg_id)||"")+" · "+ago(c.notes_updated_at)):"";
  d.innerHTML='<div class="dbar"><button class="back" id="dback">‹</button><div class="dt">#'+c.id+' · '+(KIND[c.kind]||"📎")+' '+esc(c.author_username||"—")+'</div>'+
    '<div class="dtags"><span class="dtag '+st[0]+'">'+st[1]+'</span></div><button class="close" id="dclose">✕</button></div>'+
    '<div class="dbody">'+
    '<div id="dviewer">'+viewerHtml()+'</div>'+
    '<div class="dsec">'+(cap?'<div class="dcap">'+linkify(cap)+'</div>':rcap?'':'<div class="dcap" style="opacity:.5">без подписи</div>')+
      (rcap&&rcap!==cap?'<div class="dcap" style="'+(cap?"margin-top:8px;":"")+'color:var(--d)">'+linkify(rcap)+'</div>':"")+
      '<div class="dmeta"><span>автор <b>'+esc(c.author_username||"—")+'</b></span><span>добавлено <b>'+ago(c.created_at)+'</b></span>'+
      (c.assignee_tg_id?'<span>исполнитель <b>'+esc(nameOf(c.assignee_tg_id)||"?")+'</b></span>':"")+
      (c.done_at?'<span>готово <b>'+ago(c.done_at)+'</b></span>':"")+'</div>'+links+'</div>'+
    '<div class="dsec"><div class="dh">Действия</div><div class="dacts">'+acts+'</div></div>'+ssec+
    '<div class="dsec"><div class="dh">Ниши <span class="c">'+sel.size+'</span>'+(sel.size?'<button class="rt act" style="padding:4px 9px;font-size:11px" data-dact="niche-rename">✎</button>':"")+'</div>'+nicheChips(sel,{attr:"dn"})+'</div>'+
    '<div class="dsec"><div class="dh">Заметки</div><textarea class="notes" id="dnotes" placeholder="Коротко: что переделать, откуда звук, куда постить…" maxlength="4000">'+esc(notes)+'</textarea>'+
      '<div class="nstate'+(S._notesState==="saved"?" sv":"")+'" id="nstate">'+(S._notesState==="saving"?"сохраняю…":S._notesState==="error"?"не сохранилось — ещё раз":nst)+'</div></div>'+
    '<div class="dsec"><div class="dh">Результаты <span class="c">'+results.length+'</span></div>'+rlist+dl+(results.length?pbar:"")+'</div>'+
    (canDel?'<div class="danger" id="ddel">🗑 Удалить крео</div>':"")+
    '</div>';
  S._dsig=dsig;
  bindDetail(d,c);
  if(keepNotes){const n=document.getElementById("dnotes");if(n){n.value=keepNotes.v;n.focus();try{n.setSelectionRange(keepNotes.s,keepNotes.s);}catch(e){}}}
}
const linkify=s=>esc(s).replace(/(https?:\/\/[^\s<]+)/g,'<a href="$1" target="_blank" rel="noopener">$1</a>');
function bindDetail(d,c){
  const bk=d.querySelector("#dback");if(bk)bk.onclick=()=>{haptic();closeDetail();};
  const cl=d.querySelector("#dclose");if(cl)cl.onclick=()=>{haptic();closeDetail();};
  d.querySelectorAll("[data-fr]").forEach(t=>t.onclick=()=>{const [f,i]=t.dataset.fr.split("|");S.dview={f,i:+i};renderDetail();});
  d.querySelectorAll("[data-uqpath]").forEach(b=>b.onclick=()=>openSingleDelivery(c,b.dataset.uqpath));
  d.querySelectorAll("[data-dact]").forEach(b=>b.onclick=()=>{
    const a=b.dataset.dact;
    if(a==="niche-rename"){const ids=c.niche_ids||[];if(ids.length===1)renameNiche(ids[0]);else{const n=prompt("ID/название ниши для переименования:\n"+ids.map(i=>i+" — "+(nicheOf(i)||{}).name).join("\n"));const id=+String(n||"").split(" ")[0];if(id)renameNiche(id);}return;}
    creoAction(a,c.id);});
  const as=d.querySelector("#dassign");if(as)as.onchange=()=>{if(as.value!=="")doAssign(c.id,as.value);};
  d.querySelectorAll("[data-dn]").forEach(b=>b.onclick=async()=>{haptic();
    const v=b.dataset.dn;const cur=new Set(c.niche_ids||[]);
    if(v==="new"){const n=await newNiche();if(n){cur.add(n.id);setNiches(c.id,[...cur]);}return;}
    if(cur.has(+v))cur.delete(+v);else cur.add(+v);setNiches(c.id,[...cur]);});
  bindDl(d);
  const dp=d.querySelector("#dpost");if(dp)dp.onclick=()=>togglePosted(c.id);
  const dd=d.querySelector("#ddel");if(dd)dd.onclick=()=>delCreo(c.id);
  const n=d.querySelector("#dnotes");if(n)n.oninput=()=>notesChanged(c.id,n.value);
  d.querySelectorAll("a[href]").forEach(a=>a.onclick=e=>{e.preventDefault();openExt(a.href);});
}
/* заметки: автосохранение через 800 мс после последнего ввода; сервер — источник истины */
function notesChanged(id,val){
  clearTimeout(S._notesTimer);S._notesState="saving";
  const st=document.getElementById("nstate");if(st){st.textContent="сохраняю…";st.classList.remove("sv");}
  S._notesTimer=setTimeout(async()=>{
    const c=S.creos.find(x=>x.id===id);if(!c)return;
    try{const d=await api("set_notes",{id,notes:val});Object.assign(c,d.creo);S._sig=sigOf();S._notesState="saved";
      const s=document.getElementById("nstate");if(s&&S.open===id){s.textContent="сохранено · "+(nameOf(c.notes_by_tg_id)||"")+" · только что";s.classList.add("sv");}}
    catch(e){S._notesState="error";const s=document.getElementById("nstate");if(s){s.textContent="не сохранилось — "+errMsg(e);s.classList.remove("sv");}}
    setTimeout(()=>{S._notesState="";},2500);
  },800);
}
