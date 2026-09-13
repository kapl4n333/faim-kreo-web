/* FTask — ядро: состояние, API, синк, шапка/навигация, роутер. Классические скрипты
   (без модулей) — порядок подключения в index.html: core → catalog → download → upload → views.
   Версия ресурсов — в index.html (?v=), бампать при каждой правке js/css. */
const API="https://xgkyuxjvwwstsuhtwhpv.supabase.co/functions/v1/kreo-api";
const CHAT_INTERNAL="3863967700",LINKS_THREAD=3209,READY_THREAD=3;
const tg=window.Telegram&&window.Telegram.WebApp;
try{tg&&tg.ready();tg&&tg.expand();
  tg&&tg.setHeaderColor&&tg.setHeaderColor("#100e0c");
  tg&&tg.setBackgroundColor&&tg.setBackgroundColor("#100e0c");}catch(e){}

/* ---------- заставка: один раз за сессию ---------- */
var _splashDone=false,_bootDone=false;
function tryReveal(){if(_splashDone&&_bootDone)document.body.classList.add("revealed");}
(function(){var sp=document.getElementById("splash");if(!sp){_splashDone=true;return;}var done=false;
  function hide(){if(done)return;done=true;_splashDone=true;tryReveal();
    sp.classList.add("hide");setTimeout(function(){sp.remove();},600);}
  var seen=false;try{seen=sessionStorage.getItem("splashSeen")==="1";sessionStorage.setItem("splashSeen","1");}catch(e){}
  var v=document.getElementById("splashv");
  if(seen){if(v){try{v.pause();v.removeAttribute("src");}catch(e){}}hide();return;}
  if(v){v.addEventListener("ended",hide);v.addEventListener("error",hide);
    try{var p=v.play();if(p&&p.catch)p.catch(hide);}catch(e){hide();}}
  else hide();
  sp.addEventListener("click",hide);
  setTimeout(hide,6000);})();

/* ---------- состояние ---------- */
const S={me:null,creos:[],tasks:[],members:[],niches:[],stats:null,
  tab:"cat",                                   // cat | tasks | keitaro | team | admin
  view:"free",mine:false,q:"",niche:"",author:"",sort:"new",pub:"",   // каталог
  open:null,dview:null,_dsig:"",              // открытая карточка, выбранный кадр в просмотрщике
  files:[],uploading:false,deliverTo:null,_cap:null,upNiches:[],_sig:"",
  adminTab:"access",admin:null,
  tForm:false,tDone:false,tDraft:{title:"",due:"",prio:"",asg:[]},_scroll:{},
  keitTab:"joins",teamTab:"people",track:null,trkGroup:"person",trkPlat:"instagram",_trkLoading:false,
  _notesTimer:null,_notesState:""};
/* всё, что переживает закрытие аппы: вкладка, вид каталога, фильтры, черновик задачи */
const PERSIST=["tab","view","mine","q","niche","author","sort","pub","adminTab","keitTab","teamTab","tDraft","open"];
function loadPrefs(){try{const p=JSON.parse(localStorage.getItem("ftask.prefs")||"{}");
  PERSIST.forEach(k=>{if(p[k]!=null)S[k]=p[k];});
  if(!S.tDraft||typeof S.tDraft!=="object")S.tDraft={title:"",due:"",prio:"",asg:[]};
  if(!Array.isArray(S.tDraft.asg))S.tDraft.asg=[];}catch(e){}}
function savePrefs(){try{const p={};PERSIST.forEach(k=>p[k]=S[k]);localStorage.setItem("ftask.prefs",JSON.stringify(p));}catch(e){}}
const KIND={link:"🔗",photo:"🖼",video:"🎬",album:"🗂",text:"📝"};
const PLAT=[["instagram","Instagram","📸"],["x","X","✖"],["tiktok","TikTok","🎵"],["threads","Threads","🧵"],["reddit","Reddit","👽"]];
const platLabel=k=>{const p=PLAT.find(x=>x[0]===k);return p?p[1]:k;};
const platIcon=k=>{const p=PLAT.find(x=>x[0]===k);return p?p[2]:"🔗";};
const RAIL=[["free","Свободные","q"],["work","В работе","p"],["done","Готовые","d"],["posted","Опубликовано","o"]];
const postedList=c=>Array.isArray(c.posters)?c.posters:[];
const iPosted=c=>!!S.me&&postedList(c).some(p=>String(p.tg_id)===String(S.me.tg_id));
const HUES=["#B98A3E","#B0673A","#8F7440","#9A6B96","#5B8C7E","#B05C5C","#7A72B6"];

/* ---------- API ---------- */
/* window.__FTASK_DEMO__ — ТОЛЬКО для tests/demo.html: локальные фикстуры вместо сервера.
   Это не обход авторизации: к edge не обращаемся вообще, данные вымышленные. */
async function api(action,params){
  if(window.__FTASK_DEMO__)return window.__FTASK_DEMO__(action,params||{});
  const r=await fetch(API,{method:"POST",
    headers:{"content-type":"application/json","x-init-data":(tg&&tg.initData)||""},
    body:JSON.stringify(Object.assign({action},params||{}))});
  const d=await r.json().catch(()=>({}));
  if(!r.ok){const e=new Error(d.error||("HTTP "+r.status));e.data=d;throw e;}
  return d;
}
const esc=s=>(s==null?"":String(s)).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const ago=iso=>{if(!iso)return"";const s=(Date.now()-new Date(iso).getTime())/1000;
  return s<60?"только что":s<3600?Math.floor(s/60)+" мин":s<86400?Math.floor(s/3600)+" ч":Math.floor(s/86400)+" дн";};
const hue=s=>HUES[[...String(s||"?")].reduce((a,c)=>a+c.charCodeAt(0),0)%HUES.length];
const initial=s=>((String(s||"?").trim()[0])||"?").toUpperCase();
const isVid=p=>/\.(mp4|mov|webm|m4v|avi|mkv)(\?|$)/i.test(p||"");
const fname=p=>String(p||"").split("/").pop().replace(/^\d+_[a-z0-9]+_/,"");
function haptic(t){try{tg.HapticFeedback.impactOccurred(t||"light")}catch(e){}}
function notify(t){try{tg.HapticFeedback.notificationOccurred(t||"success")}catch(e){}}
const ERR={not_member:"Тебя нет в команде FTask.",forbidden:"Недостаточно прав для этого.",
  admin_only:"Это может только админ.",bad_status:"Неверный статус.",no_files:"Нет файлов для загрузки.",
  not_found:"Крео не найдено — возможно, уже удалили.",cant_remove_self:"Себя убрать нельзя.",
  server:"Сервер не ответил. Попробуй ещё раз.",unauthorized:"Сессия истекла — переоткрой через /app.",
  already_claimed:"Это крео уже взял другой — список обновлён.",conflict:"Кто-то менял это одновременно — попробуй ещё раз.",
  owner_only:"Назначать админов может только владелец бота.",no_name:"Пустое название.",niche_exists:"Такая ниша уже есть.",
  network:"Нет сети. Проверь соединение."};
const errMsg=e=>{const m=(e&&e.message)||"";if(/failed to fetch|networkerror|load failed/i.test(m))return ERR.network;return ERR[m]||"Не вышло. "+(m||"Попробуй ещё раз.");};
function toast(msg,type){
  const t=document.createElement("div");t.className="toast"+(type?" "+type:"");t.textContent=msg;
  document.body.appendChild(t);requestAnimationFrame(()=>t.classList.add("show"));
  setTimeout(()=>{t.classList.remove("show");setTimeout(()=>t.remove(),300);},3000);
}
const roles=()=>(S.me&&S.me.roles)||[];
const admin=()=>roles().includes("admin");
const canClaim=()=>admin()||roles().includes("creative");
const nameOf=id=>{if(id==null)return null;const m=S.members.find(x=>String(x.tg_id)===String(id));return m?(m.name||("@"+(m.username||id))):null;};
const nicheOf=id=>S.niches.find(n=>n.id===+id);
const isMine=c=>!!S.me&&c.assignee_tg_id!=null&&String(c.assignee_tg_id)===String(S.me.tg_id);

/* ---------- загрузка ---------- */
async function boot(){
  const dbg=tg?("platform "+(tg.platform||"?")+" · initData "+((tg.initData||"").length)+"b"):"вне Telegram";
  try{
    const d=await api("bootstrap");
    absorb(d);
    loadPrefs();
    if(S.tab==="admin"&&!admin())S.tab="cat";
    if(!["cat","tasks","keitaro","team","admin"].includes(S.tab))S.tab="cat";
    if(S.open&&!S.creos.find(c=>c.id===S.open))S.open=null;
    document.getElementById("hdr").classList.remove("hidden");
    document.getElementById("nav").classList.remove("hidden");
    header();render();
    S._sig=sigOf();
    startSync();
    _bootDone=true;tryReveal();
  }catch(e){
    const m=e.message==="unauthorized"
      ?"Telegram не передал подпись входа. Открой FTask командой /app в боте и жми inline-кнопку."
      :e.message==="not_member"
      ?("Тебя ещё нет в команде FTask. Скинь админу свой Telegram ID — он добавит тебя во вкладке «Люди», и заходи снова."+
        ((tg&&tg.initDataUnsafe&&tg.initDataUnsafe.user&&tg.initDataUnsafe.user.id)?"<div class=\"dbg\">твой ID: "+tg.initDataUnsafe.user.id+"</div>":""))
      :("Ошибка: "+esc(errMsg(e)));
    document.getElementById("app").innerHTML='<div class="gate"><div><div class="gh">Нет доступа</div>'+
      '<p>'+m+'</p><div class="dbg">'+esc(dbg)+'</div></div></div>';
    _splashDone=true;_bootDone=true;tryReveal();
  }
}

/* ---------- realtime через мягкий поллинг ---------- */
function absorb(d){Object.assign(S,{me:d.me,creos:d.creos||[],tasks:d.tasks||[],members:d.members||[],niches:d.niches||[],stats:d.stats});}
/* сигнатура = бизнес-поля (без подписанных URL — они меняются каждый bootstrap и обновляются
   отдельно через refreshMedia, чтобы не перерисовывать экран каждые 10 секунд) */
function sigOf(){
  return JSON.stringify([
    S.creos.map(c=>[c.id,c.status,c.delivery_state,postedList(c).map(p=>p.tg_id).join(),c.assignee_tg_id,
      c.caption,c.result_caption,(c.result_paths||[]).join(),(c.source_paths||[]).join(),(c.storage_paths||[]).join(),c.source_state,c.preview_poster,c.preview_clip,
      // null → URL требует построить просмотрщик вместо заглушки; ротация URL — только refreshMedia.
      [c.source_urls,c.media_urls,c.result_urls].map(u=>(u||[]).map(Boolean)),
      c.source_poster,c.source_clip,c.delivered_at,c.done_at,c.ready_msg_id,c.downloaded_msg_id,c.archived_at,
      (c.niche_ids||[]).join(),c.deferred_at,c.notes,c.notes_updated_at]),
    S.tasks.map(t=>[t.id,t.status,t.pinned,t.position,t.title,t.due_date,t.priority,(t.assignee_tg_ids||[]).join(),t.done_at]),
    S.members.map(m=>[m.tg_id,(m.roles||[]).join(),m.name,m.username]),
    S.niches.map(n=>[n.id,n.name])]);
}
function flashSync(){const s=document.getElementById("sync");if(!s)return;
  s.classList.add("on");setTimeout(()=>s.classList.remove("on"),650);}
async function poll(){
  if(!S.me||document.hidden||S.uploading)return;
  if(document.getElementById("scrim").classList.contains("show"))return;   // открыт лист — не мешаем
  const f=document.activeElement;
  if(f&&/^(INPUT|SELECT|TEXTAREA)$/.test(f.tagName))return;                 // идёт ввод — не перерисовываем
  let d;try{d=await api("bootstrap");}catch(e){return;}
  absorb(d);
  const sig=sigOf();
  if(sig!==S._sig){S._sig=sig;const y=window.scrollY;header();render();window.scrollTo(0,y);}
  else refreshMedia(document);                                               // только свежие подписанные ссылки (E)
  flashSync();
}
function startSync(){
  setInterval(poll,10000);
  document.addEventListener("visibilitychange",()=>{if(!document.hidden)poll();});
  const s=document.getElementById("sync");if(s)s.onclick=()=>{haptic();poll();};
  window.addEventListener("resize",onLayoutChange);
}
/* ---------- медиа-ссылки: адресное обновление без перерисовки (ревью E) ----------
   Каждый img/video медиа крео несёт data-mref="cid|field|index". После нового bootstrap
   подставляем свежий URL только туда, где он изменился; играющее видео не трогаем. */
function mediaUrl(cid,field,i){const c=S.creos.find(x=>x.id===+cid);if(!c)return"";
  const v=c[field];if(Array.isArray(v))return v[+i]||"";return v||"";}
function refreshMedia(root){
  (root||document).querySelectorAll("[data-mref]").forEach(el=>{
    const [cid,field,i]=el.dataset.mref.split("|");const u=mediaUrl(cid,field,i);
    if(!u)return;
    const cur=el.getAttribute("src")||"";
    if(cur===u||cur===u+"#t=0.1")return;
    if(el.tagName==="VIDEO"){
      if(!el.paused&&!el.ended)return;              // играет — обновим после
      const t=el.currentTime;el.src=u;try{el.load();if(t)el.currentTime=t;}catch(e){}
    }else el.src=u;
    el.dataset.err="";
  });
}
/* ссылка протухла (403) → один раз перезапросить bootstrap и подставить свежую */
function mediaError(el){
  if(el.dataset.err==="1")return;el.dataset.err="1";
  clearTimeout(window._mErrT);window._mErrT=setTimeout(async()=>{
    try{const d=await api("bootstrap");absorb(d);refreshMedia(document);}catch(e){}},600);
}
document.addEventListener("error",e=>{const t=e.target;if(t&&t.dataset&&t.dataset.mref)mediaError(t);},true);

/* ---------- шапка и навигация ---------- */
const NAVICON={
  cat:'<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
  tasks:'<path d="M4 6l1.6 1.6L8.5 4.7M4 17.4l1.6 1.6 2.9-2.9M12 6.5h8M12 16.5h8"/>',
  keitaro:'<path d="M5 20V11M12 20V4M19 20V14"/>',
  team:'<circle cx="9" cy="8" r="3.2"/><path d="M3.5 20a5.5 5.5 0 0111 0"/><path d="M16 5.2a3.2 3.2 0 010 6M15.2 15.6A5.5 5.5 0 0120.5 20"/>',
  admin:'<path d="M4 21v-6M4 11V3M12 21v-9M12 8V3M20 21v-5M20 12V3"/><path d="M2 15h4M10 8h4M18 16h4"/>'};
const navIcon=k=>'<svg viewBox="0 0 24 24" aria-hidden="true">'+(NAVICON[k]||"")+'</svg>';
const active=()=>S.creos.filter(c=>!c.deferred_at);
function header(){
  const rl=admin()?"АДМИН":(roles().length?roles().map(r=>r==="creative"?"КРЕАТИВ":"ЗАЛИВ").join("·"):"КОМАНДА");
  document.getElementById("user").innerHTML='<span class="un">'+esc(S.me.name||"Вы")+'</span><span class="badge">'+rl+'</span>';
  const a=active();
  const cnt={free:a.filter(c=>c.status==="queued").length,work:a.filter(c=>c.status==="in_progress").length,
    done:a.filter(c=>c.status==="done").length,posted:S.creos.filter(x=>postedList(x).length).length};
  document.getElementById("pipe").innerHTML=RAIL.map(([k,l,cl])=>
    '<div class="st '+cl+'" data-rail="'+k+'" role="button" style="cursor:pointer"><div class="n">'+cnt[k]+'</div><div class="l">'+l+'</div></div>').join("");
  // счётчик = вид каталога («все такие»): поиск и фильтры сбрасываем
  document.querySelectorAll("#pipe .st").forEach(el=>el.onclick=()=>{haptic();const k=el.dataset.rail;
    S.tab="cat";S.q="";S.author="";S.niche="";S.mine=false;
    if(k==="posted"){S.view="done";S.pub="any";}else{S.view=k;S.pub="";}
    savePrefs();window.scrollTo(0,0);header();render();});
  const tabs=[["cat","Каталог"],["tasks","Задачи"],["keitaro","Кейтаро"],["team","Команда"]];
  if(admin())tabs.push(["admin","Админ"]);
  document.getElementById("nav").innerHTML=tabs.map(([k,l])=>
    '<button class="'+(S.tab===k?"on":"")+'" data-t="'+k+'">'+navIcon(k)+'<span class="lbl">'+l+'</span></button>').join("");
  document.querySelectorAll("#nav button").forEach(b=>b.onclick=()=>{S._scroll[scrollKey()]=window.scrollY;S.tab=b.dataset.t;
    if(S.tab!=="cat"&&!isSplit())closeDetail(true);
    savePrefs();header();render();window.scrollTo(0,S._scroll[scrollKey()]||0);});
}
const scrollKey=()=>S.tab==="cat"?"cat:"+S.view:S.tab;
function isSplit(){return window.matchMedia("(min-width:1024px) and (min-aspect-ratio:1/1)").matches;}
function onLayoutChange(){document.body.classList.toggle("split",isSplit()&&S.tab==="cat");if(S.open)renderDetail();}

function render(){
  const el=document.getElementById("app");killFab();
  document.body.classList.toggle("split",isSplit()&&S.tab==="cat");
  if(S.tab==="tasks"){el.innerHTML=vTasks();bindTasks(el);return;}
  if(S.tab==="keitaro"){el.innerHTML=vKeitaroTab();bindKeitaroTab(el);return;}
  if(S.tab==="team"){el.innerHTML=vTeamTab();bindTeamTab(el);return;}
  if(S.tab==="admin"){el.innerHTML=vAdmin();bindAdmin(el);if(!S.admin)loadAdmin();return;}
  el.innerHTML=vCatalog();bindCatalog(el);fab();
  const dt=document.getElementById("detail");
  if(S.open){renderDetail();if(!isSplit()){dt.classList.add("show");document.body.classList.add("dopen");}}
  else{renderDetail();dt.classList.remove("show");document.body.classList.remove("dopen");}
}
function openTg(u){try{tg.openTelegramLink(u)}catch(e){window.open(u,"_blank")}}
function openExt(u){try{tg.openLink(u)}catch(e){window.open(u,"_blank")}}
function openSource(c){const m=c.downloaded_msg_id||c.source_msg_id;if(!m)return;
  openTg("https://t.me/c/"+CHAT_INTERNAL+"/"+LINKS_THREAD+"/"+m);}
function openReady(c){if(!c||!c.ready_msg_id)return;
  openTg("https://t.me/c/"+CHAT_INTERNAL+"/"+READY_THREAD+"/"+c.ready_msg_id);}
