/* FTask — выбор готовых видео (галочки на плитках + закреплённая панель), настройка пачки и страница «Планирование». */
const DLEVELS={weak:["Бережная","Почти незаметные изменения"],medium:["Сбалансированная","Умеренная обработка"],strong:["Сильная","Более заметные изменения"]};
const DSTATUS={preparing:"Готовится",ready:"Готово к отправке",sending:"Отправляется",sent:"Отправлено",
  failed:"Ошибка",delivery_unknown:"Нужно проверить отправку",cancelled:"Отменено"};
const atName=s=>{s=String(s||"").split(":").pop();return s.startsWith("@")?s:"@"+s;};

function latestVideo(c){
  const p=c&&c.result_paths||[],u=c&&c.result_urls||[];
  for(let i=p.length-1;i>=0;i--)if(isVid(p[i]))return {creo_id:c.id,source_path:p[i],source_index:i,url:u[i]||null,title:c.result_caption||c.caption||("Видео #"+c.id)};
  return null;
}
function videoVersions(c){const out=[];for(let i=(c.result_paths||[]).length-1;i>=0;i--)if(isVid(c.result_paths[i]))out.push({path:c.result_paths[i],i,url:(c.result_urls||[])[i]||null});return out;}
function pickHas(id){return (S.deliveryPick||[]).some(x=>x.creo_id===+id);}
function deliveryPickToggle(c){const v=latestVideo(c);if(!v)return toast("В карточке нет готового видео","err");
  S.deliveryPick=S.deliveryPick||[];const i=S.deliveryPick.findIndex(x=>x.creo_id===c.id);
  if(i>=0)S.deliveryPick.splice(i,1);else if(S.deliveryPick.length>=10)return toast("В одной группе максимум 10 документов","err");else S.deliveryPick.push(v);render();}
function pickThumb(c){const m=tileMedia(c);const img=m.img||c.preview_url||c.source_poster_url||null;
  return '<button class="pth" data-dpick="'+c.id+'" title="Убрать из выбора">'+(img?'<img loading="lazy" src="'+esc(img)+'">':'<span class="na">🎬</span>')+'<i>✕</i></button>';}
function deliveryPickBar(){if(S.view!=="done")return"";const pick=S.deliveryPick||[],n=pick.length;
  const thumbs=pick.map(x=>S.creos.find(c=>c.id===x.creo_id)).filter(Boolean).map(pickThumb).join("");
  return '<div class="pickbar" id="pickbar"><div class="pickrow"><b>'+(n?n+' выбрано':'Отметь видео галочкой')+'</b>'+(n?'<button class="act" id="dpickclear">Сбросить</button>':'')+
    '<div class="pickacts"><button class="act" id="dschedule"'+(n?"":" disabled")+'>Запланировать</button><button class="primary" id="dnow"'+(n?"":" disabled")+'>Уникализировать</button></div></div>'+
    (n?'<div class="pickstrip">'+thumbs+'</div>':'')+'</div>';}
function deliveryPickBadge(c){if(S.view!=="done"||!latestVideo(c))return"";
  return '<button class="pickcheck'+(pickHas(c.id)?" on":"")+'" data-dpick="'+c.id+'" aria-label="Выбрать видео">'+(pickHas(c.id)?"✓":"")+'</button>';}
function syncHdrH(){const h=document.getElementById("hdr");if(h)document.documentElement.style.setProperty("--hdr-h",h.offsetHeight+"px");}
window.addEventListener("resize",syncHdrH);
function bindDeliveryCatalog(el){
  syncHdrH();
  const clr=el.querySelector("#dpickclear");if(clr)clr.onclick=()=>{S.deliveryPick=[];render();};
  el.querySelectorAll("[data-dpick]").forEach(b=>b.onclick=e=>{e.stopPropagation();const y=window.scrollY;deliveryPickToggle(S.creos.find(c=>c.id===+b.dataset.dpick));window.scrollTo(0,y);});
  const now=el.querySelector("#dnow"),plan=el.querySelector("#dschedule");if(now)now.onclick=()=>openDeliveryWizard("immediate",S.deliveryPick);if(plan)plan.onclick=()=>openDeliveryWizard("scheduled",S.deliveryPick);
}

async function loadDeliveries(silent){
  if(S.deliveryLoading)return;S.deliveryLoading=true;
  try{const d=await api("delivery_list"),next=d.batches||[];const sig=JSON.stringify(next.map(b=>[b.id,b.status,b.updated_at,b.error_code,(b.items||[]).map(i=>[i.id,i.position,i.source_path,i.prep_state,i.prep_attempts,i.prep_error]) ]));
    const changed=sig!==S._deliverySig;S._deliverySig=sig;S.batches=next;S.deliveryAccounts=d.accounts||[];S.deliveryLoaded=true;if(S.tab==="plan"&&(!silent||changed))render();}
  catch(e){if(!silent)toast(errMsg(e),"err");}finally{S.deliveryLoading=false;}
}
const localTZ=()=>{try{return Intl.DateTimeFormat().resolvedOptions().timeZone||"Europe/Warsaw"}catch(e){return"Europe/Warsaw"}};
function tzParts(date,tz){const p=new Intl.DateTimeFormat("en-CA",{timeZone:tz,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"}).formatToParts(date);const o={};p.forEach(x=>{if(x.type!=="literal")o[x.type]=+x.value});return o;}
function zonedToIso(local,tz){
  const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local||"");if(!m)return null;
  const wanted=Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+m[5]);let guess=wanted;
  for(let i=0;i<4;i++){const p=tzParts(new Date(guess),tz);const shown=Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second||0);guess+=wanted-shown;}
  const check=tzParts(new Date(guess),tz);if(check.year!==+m[1]||check.month!==+m[2]||check.day!==+m[3]||check.hour!==+m[4]||check.minute!==+m[5])return null;
  return new Date(guess).toISOString();
}
function isoToLocal(iso,tz){if(!iso)return"";const p=tzParts(new Date(iso),tz);return [p.year,String(p.month).padStart(2,"0"),String(p.day).padStart(2,"0")].join("-")+"T"+String(p.hour).padStart(2,"0")+":"+String(p.minute).padStart(2,"0");}
function dEscapeAttr(s){return esc(s).replace(/"/g,"&quot;");}

async function openDeliveryWizard(mode,items,batch){
  if(!S.deliveryLoaded)await loadDeliveries(true);
  const tz=(batch&&batch.timezone)||localTZ();
  S.deliveryDraft={id:batch&&batch.id,mode:mode||(batch&&batch.mode)||"immediate",timezone:tz,
    deliverLocal:batch&&batch.deliver_at?isoToLocal(batch.deliver_at,tz):"",default_level:(batch&&batch.default_level)||"medium",
    account_id:batch&&batch.account_id||"",idempotency_key:(batch&&batch.idempotency_key)||(crypto.randomUUID?crypto.randomUUID():Date.now()+"-"+Math.random()),
    items:(items||[]).map((x,pos)=>({creo_id:+x.creo_id,source_path:x.source_path,
      source_url:x.source_url||null,title:x.title||null,
      uniq_level:(batch&&x.uniq_level===batch.default_level)?null:(x.uniq_level||null),position:pos}))};
  S.deliveryOpen=true;renderDeliveryWizard();
}
function closeDeliveryWizard(){S.deliveryOpen=false;S.deliveryDraft=null;document.getElementById("dmodal")?.remove();}
function wizardItem(x,pos){const c=S.creos.find(z=>z.id===x.creo_id);if(!c)return"";const vv=videoVersions(c);let cur=vv.find(v=>v.path===x.source_path);
  if(!cur&&x.source_path){cur={path:x.source_path,i:null,url:x.source_url||null,snapshot:true};vv.unshift(cur);}if(!cur)cur=vv[0];
  return '<div class="dwitem" data-di="'+pos+'"><div class="dwprev">'+(cur&&cur.url?'<video controls playsinline preload="metadata" src="'+esc(cur.url)+'#t=0.1"></video>':'<div class="na">🎬</div>')+'</div><div class="dwbody"><b>'+(pos+1)+'. '+esc(x.title||c.result_caption||c.caption||("Видео #"+c.id))+'</b>'+
    '<select data-dver="'+pos+'">'+vv.map((v,vi)=>'<option value="'+dEscapeAttr(v.path)+'"'+(v.path===x.source_path?' selected':'')+'>'+(v.snapshot?'Сохранённая версия':'Версия '+(v.i+1)+(vi===0?' · последняя':''))+'</option>').join("")+'</select>'+
    '<select data-dlevel="'+pos+'"><option value="">Как у пачки</option>'+Object.entries(DLEVELS).map(([k,v])=>'<option value="'+k+'"'+(x.uniq_level===k?' selected':'')+'>'+v[0]+'</option>').join("")+'</select></div><div class="dword"><button data-dup="'+pos+'"'+(pos?"":" disabled")+'>↑</button><button data-ddown="'+pos+'"'+(pos<S.deliveryDraft.items.length-1?"":" disabled")+'>↓</button><button data-dremove="'+pos+'">✕</button></div></div>';}
function renderDeliveryWizard(){const d=S.deliveryDraft;if(!d)return;let root=document.getElementById("dmodal");if(!root){root=document.createElement("div");root.id="dmodal";root.className="dmodal";document.body.appendChild(root);}
  root.innerHTML='<div class="dw'+(d.individual?' individual':'')+'"><div class="dwhead"><div><small>'+(d.mode==="scheduled"?"ЗАПЛАНИРОВАТЬ":"УНИКАЛИЗИРОВАТЬ")+'</small><h2>'+d.items.length+' видео</h2></div><button id="dwclose">✕</button></div><div class="dwscroll"><div class="dwitems">'+d.items.map(wizardItem).join("")+'</div>'+
    '<div class="dwsec"><label>Доставка файлов в Telegram</label><div class="modegrid"><button class="'+(d.mode==='immediate'?'on':'')+'" data-dmode="immediate"><b>Сразу</b><small>После подготовки</small></button><button class="'+(d.mode==='scheduled'?'on':'')+'" data-dmode="scheduled"><b>По расписанию</b><small>Дата и часовой пояс</small></button></div></div>'+
    '<div class="dwsec"><label>Степень уникализации</label><div class="levelgrid">'+Object.entries(DLEVELS).map(([k,v])=>'<button class="'+(d.default_level===k?'on':'')+'" data-dcommon="'+k+'"><b>'+v[0]+'</b><small>'+v[1]+'</small></button>').join("")+'</div><details id="dwind"'+(d.individual?' open':'')+'><summary>Настроить отдельно</summary><p class="hint">Выбор у конкретного видео имеет приоритет над общим.</p></details></div>'+
    '<div class="dwsec"><label>Аккаунт <small>необязательно</small></label><select id="dwacc"><option value="">Не указывать</option>'+S.deliveryAccounts.map(a=>'<option value="'+a.id+'"'+(String(d.account_id)===String(a.id)?' selected':'')+'>'+esc((a.account_name||"")+(a.platform?" · "+a.platform:""))+'</option>').join("")+'</select></div>'+
    (d.mode==="scheduled"?'<div class="dwsec"><label>Дата и время доставки в Telegram</label><input id="dwtime" type="datetime-local" value="'+esc(d.deliverLocal)+'"><label>Часовой пояс</label><input id="dwtz" value="'+esc(d.timezone)+'" list="tzlist"><datalist id="tzlist"><option>Europe/Warsaw</option><option>UTC</option></datalist><p class="hint">Время доставки, не начала обработки. Подготовка начнётся сразу.</p></div>':'')+
    '</div><div class="dwfoot"><button class="act" id="dwcancel">Отмена</button><button class="primary" id="dwsave">'+(d.id?"Сохранить":"Создать пачку")+'</button></div></div>';
  bindDeliveryWizard(root);
}
function bindDeliveryWizard(root){const d=S.deliveryDraft;root.querySelector("#dwclose").onclick=root.querySelector("#dwcancel").onclick=closeDeliveryWizard;
  const ind=root.querySelector("#dwind");if(ind)ind.ontoggle=()=>{d.individual=ind.open;root.querySelector(".dw").classList.toggle("individual",ind.open);};
  root.querySelectorAll("[data-dmode]").forEach(b=>b.onclick=()=>{d.mode=b.dataset.dmode;renderDeliveryWizard();});
  root.querySelectorAll("[data-dcommon]").forEach(b=>b.onclick=()=>{d.default_level=b.dataset.dcommon;renderDeliveryWizard();});
  root.querySelectorAll("[data-dver]").forEach(s=>s.onchange=()=>{d.items[+s.dataset.dver].source_path=s.value;renderDeliveryWizard();});
  root.querySelectorAll("[data-dlevel]").forEach(s=>s.onchange=()=>{d.items[+s.dataset.dlevel].uniq_level=s.value||null;});
  root.querySelectorAll("[data-dremove]").forEach(b=>b.onclick=()=>{d.items.splice(+b.dataset.dremove,1);if(!d.items.length)return closeDeliveryWizard();renderDeliveryWizard();});
  root.querySelectorAll("[data-dup]").forEach(b=>b.onclick=()=>{const i=+b.dataset.dup;[d.items[i-1],d.items[i]]=[d.items[i],d.items[i-1]];renderDeliveryWizard();});
  root.querySelectorAll("[data-ddown]").forEach(b=>b.onclick=()=>{const i=+b.dataset.ddown;[d.items[i+1],d.items[i]]=[d.items[i],d.items[i+1]];renderDeliveryWizard();});
  root.querySelector("#dwsave").onclick=saveDeliveryWizard;
}
async function saveDeliveryWizard(){const d=S.deliveryDraft;if(!d||!d.items.length)return;const acc=document.getElementById("dwacc");if(acc)d.account_id=acc.value||null;
  let deliver_at=null;if(d.mode==="scheduled"){d.deliverLocal=document.getElementById("dwtime").value;d.timezone=document.getElementById("dwtz").value.trim();deliver_at=zonedToIso(d.deliverLocal,d.timezone);if(!deliver_at)return toast("Проверь дату, время и часовой пояс. Это время может не существовать при переходе часов.","err");}
  const payload={id:d.id,mode:d.mode,deliver_at,timezone:d.timezone,default_level:d.default_level,account_id:d.account_id,
    idempotency_key:d.idempotency_key,items:d.items.map((x,position)=>({creo_id:x.creo_id,source_path:x.source_path,uniq_level:x.uniq_level||d.default_level,position}))};
  const btn=document.getElementById("dwsave");btn.disabled=true;
  try{await api(d.id?"delivery_update":"delivery_create",payload);const n=d.items.length,when=d.mode==="scheduled"?new Intl.DateTimeFormat("ru-RU",{timeZone:d.timezone,day:"numeric",month:"long",hour:"2-digit",minute:"2-digit"}).format(new Date(deliver_at))+" · "+d.timezone:"сразу после подготовки";
    const a=S.deliveryAccounts.find(x=>String(x.id)===String(d.account_id));closeDeliveryWizard();S.deliveryPick=[];await loadDeliveries(true);toast(n+" видео · "+when+(a?" · "+atName(a.account_name):""),"ok");S.tab="plan";header();render();}
  catch(e){btn.disabled=false;toast(errMsg(e),"err");}}

function batchProgress(b){const ready=(b.items||[]).filter(i=>i.prep_state==="ready").length;return ready+"/"+(b.items||[]).length;}
function batchWhen(b){if(b.mode!=="scheduled"||!b.deliver_at)return"сразу после подготовки";try{return new Intl.DateTimeFormat("ru-RU",{timeZone:b.timezone,day:"numeric",month:"long",hour:"2-digit",minute:"2-digit"}).format(new Date(b.deliver_at))+" · "+b.timezone}catch(e){return b.deliver_at}}
function batchCard(b){const active=!['sent','cancelled'].includes(b.status);const lvl=[...new Set((b.items||[]).map(i=>i.uniq_level))];const previews=(b.items||[]).map(i=>'<div class="bp">'+(i.clip_url?'<video muted loop playsinline preload="none" data-lazy="'+esc(i.clip_url)+'"></video>':i.poster_url?'<img loading="lazy" src="'+esc(i.poster_url)+'">':i.source_url?'<video muted playsinline preload="metadata" src="'+esc(i.source_url)+'#t=0.1"></video>':'🎬')+'</div>').join("");
  const prepFailed=b.items.some(i=>i.prep_state==='failed');let actions="";
  if(active&&b.status!=="sending"){actions='<button data-bact="edit" data-bid="'+b.id+'">Изменить</button><button data-bact="refresh" data-bid="'+b.id+'">Обновить версии</button>'+
    (prepFailed?'<button data-bact="retry" data-bid="'+b.id+'">Повторить неудавшиеся</button>':'<button data-bact="now" data-bid="'+b.id+'">'+(b.status==='delivery_unknown'?'Повторить явно':b.status==='failed'?'Повторить отправку':'Отправить сейчас')+'</button>')+
    '<button data-bact="cancel" data-bid="'+b.id+'">Отменить</button>';}
  else if(b.status==='sent')actions='<button data-bact="redeliver" data-bid="'+b.id+'">Получить повторно</button>';
  return '<article class="batch '+(active?'active':'history')+'"><div class="btop"><b>Пачка #'+b.id+' · '+b.items.length+' видео</b><span class="bst '+b.status+'">'+DSTATUS[b.status]+'</span></div><div class="bpreviews">'+previews+'</div><div class="bmeta">'+batchWhen(b)+(b.account_label?' · '+esc(atName(b.account_label)):'')+' · '+(lvl.length===1?DLEVELS[lvl[0]][0]:"разные уровни")+'</div>'+
    (b.status==='preparing'?'<div class="prog"><i style="width:'+((+batchProgress(b).split('/')[0]/b.items.length)*100)+'%"></i></div><small>Подготовлено '+batchProgress(b)+'</small>':'')+
    (b.error_message?'<div class="berr">'+esc(b.error_message)+'</div>':'')+'<div class="bacts">'+actions+'</div></article>';}
function vPlanning(){if(!S.deliveryLoaded){setTimeout(()=>loadDeliveries(),0);return'<div class="gate"><div><div class="spin"></div><p>Загружаю пачки…</p></div></div>';}
  const active=(S.batches||[]).filter(b=>!['sent','cancelled'].includes(b.status)),hist=(S.batches||[]).filter(b=>['sent','cancelled'].includes(b.status));
  return '<div class="planhead"><div><small>ГЕНЕРАЦИЯ</small><h1>Планирование</h1><p>Подготовка начинается сразу. Дата — время доставки файлов в Telegram.</p></div><button class="primary" id="pnew">Выбрать в «Готовых»</button></div>'+
    (active.length?'<div class="batchgrid">'+active.map(batchCard).join("")+'</div>':'<div class="empty"><div class="e-ic">🗓</div><div class="e-h">Активных пачек нет</div>Выбери видео в каталоге «Готовые».</div>')+
    (hist.length?'<details class="history"><summary>История · '+hist.length+'</summary><div class="batchgrid">'+hist.map(batchCard).join("")+'</div></details>':'');}
function bindPlanning(el){const n=el.querySelector("#pnew");if(n)n.onclick=()=>{S.tab="cat";S.view="done";header();render();window.scrollTo(0,0);};
  el.querySelectorAll("[data-bact]").forEach(b=>b.onclick=()=>batchAction(b.dataset.bact,+b.dataset.bid));observeBatchVideos(el);}
async function batchAction(act,id){const b=S.batches.find(x=>x.id===id);if(!b)return;
  if(act==="edit")return openDeliveryWizard(b.mode,b.items,b);if(act==="cancel"&&!confirm("Отменить пачку? Уже подготовленные файлы сохранятся, но отправки не будет."))return;
  const map={refresh:"delivery_refresh_sources",now:"delivery_send_now",cancel:"delivery_cancel",retry:"delivery_retry_failed",redeliver:"delivery_redeliver"};
  try{await api(map[act],{id});await loadDeliveries(true);render();toast(act==="redeliver"?"Повторная выдача поставлена в очередь":"Готово","ok");}catch(e){toast(errMsg(e),"err");}}
function observeBatchVideos(root){if(!('IntersectionObserver'in window))return;const io=new IntersectionObserver(es=>es.forEach(e=>{const v=e.target;if(e.isIntersecting){if(!v.src){v.src=v.dataset.lazy;v.load()}v.play().catch(()=>{});}else v.pause();}),{rootMargin:"80px"});root.querySelectorAll("video[data-lazy]").forEach(v=>io.observe(v));}

function openSingleDelivery(c,path){const versions=videoVersions(c),v=versions.find(x=>x.path===path)||versions[0];if(!v)return toast("Это не видео","err");openDeliveryWizard("immediate",[{creo_id:c.id,source_path:v.path}]);}
