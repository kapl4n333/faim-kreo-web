/* FTask — раздел «Автозалив»: задания для ПК с телефонами. Сервер решает, что и когда выполнять,
   страница только создаёт задания и показывает их состояние. Новый тип задачи добавляется в AUTO_TYPES. */
const AUTO_TYPES=[{kind:"publish_reel",platform:"instagram",label:"Reels в Instagram",ext:/\.mp4(\?|$)/i,extName:".mp4"}];
const AUTO_STATUS={queued:"В очереди",claimed:"Выполняется",committed:"Публикуется",sent:"Отправлено",confirmed:"Опубликовано подтверждено",
  done:"Готово",unknown:"Результат неизвестен",needs_attention:"Нужно решение",failed:"Ошибка",missed:"Пропущено",cancelled:"Отменено"};
const AUTO_CODES={asset_missing:"Файл не найден на сервере",handle_mismatch:"На телефоне открыт другой аккаунт",lease_lost_after_commit:"ПК не сообщил результат после разрешения на нажатие",
  not_found:"Публикация не найдена в профиле",late_sent_conflict:"Старая попытка сообщила о публикации",tap_uncertain:"Обрыв во время нажатия",tap_window_expired:"Срок на нажатие вышел",
  commit_no_response:"Нет ответа на запрос разрешения",operator_stop:"Остановлено оператором",app_restarted:"Программа перезапускалась",missed:"ПК был недоступен всё окно запуска"};
const AUTO_ATTENTION=["unknown","needs_attention"],AUTO_ACTIVE=["queued","claimed","committed","sent"];
const canAuto=()=>admin()||roles().includes("uploader");
const autoType=k=>AUTO_TYPES.find(t=>t.kind===k)||AUTO_TYPES[0];

async function loadAuto(silent){
  if(S.autoLoading)return;S.autoLoading=true;
  try{const d=await api("device_list");const sig=JSON.stringify([d.jobs,d.phones,d.workers,d.accounts]);const changed=sig!==S._autoSig;S._autoSig=sig;
    S.auto=d;if(S.tab==="auto"&&S.autoTab!=="settings"&&!S.autoOpen&&(!silent||changed)&&!autoTyping())render();}
  catch(e){if(!silent)toast(errMsg(e),"err");}finally{S.autoLoading=false;}
}
const autoTyping=()=>{const f=document.activeElement;return !!f&&/^(INPUT|SELECT|TEXTAREA)$/.test(f.tagName);};

/* ---------- страница ---------- */
function vAuto(){
  if(!S.auto){setTimeout(()=>loadAuto(),0);return'<div class="gate"><div><div class="spin"></div><p>Загружаю задания…</p></div></div>';}
  const tab=S.autoTab||"queue";
  const subs=[["queue","Очередь"],["pool","Пул"],["schedule","Расписание"],["settings","Настройки"],["devices","ПК и телефоны"]].map(([k,l])=>'<button class="'+(tab===k?"on":"")+'" data-autotab="'+k+'">'+l+'</button>').join("");
  const top=(window.FTWide?.useNew?'<button id="autouse_new">Новый вид</button>':'')+(tab==="pool"?'<button class="primary" id="cadd">Добавить материал</button>':tab==="queue"||tab==="devices"?'<button class="primary" id="autonew">Новая задача</button>':'');
  const body={devices:vAutoDevices,pool:vPool,schedule:vSchedule,settings:vSettings}[tab]||vAutoQueue;
  return '<div class="planhead"><div><small>ТЕЛЕФОНЫ</small><h1>Автозалив</h1><p>Сервер запускает задания по расписанию на привязанных ПК и телефонах.</p></div>'+top+'</div><div class="autosubs autotabs">'+subs+'</div>'+body();
}
function vAutoQueue(){
  const jobs=S.auto.jobs||[],need=jobs.filter(j=>AUTO_ATTENTION.includes(j.status)),act=jobs.filter(j=>AUTO_ACTIVE.includes(j.status)),hist=jobs.filter(j=>!AUTO_ATTENTION.includes(j.status)&&!AUTO_ACTIVE.includes(j.status));
  return (need.length?'<h2 class="autoh">Нужно решение · '+need.length+'</h2><div class="batchgrid">'+need.map(autoCard).join("")+'</div>':'')+
    (act.length?'<div class="batchgrid">'+act.map(autoCard).join("")+'</div>':(need.length?'':'<div class="empty"><div class="e-ic">📲</div><div class="e-h">Заданий нет</div>Нажми «Новая задача».</div>'))+
    (hist.length?'<details class="history"><summary>История · '+hist.length+'</summary><div class="batchgrid">'+hist.map(autoCard).join("")+'</div></details>':'');
}
function autoWhen(j){if(!j.run_at)return"";try{return new Intl.DateTimeFormat("ru-RU",{timeZone:j.timezone,day:"numeric",month:"long",hour:"2-digit",minute:"2-digit"}).format(new Date(j.run_at))+" · "+j.timezone;}catch(e){return j.run_at;}}
function autoCard(j){
  const c=S.creos.find(x=>x.id===j.creo_id),title=c?(c.result_caption||c.caption||("Видео #"+c.id)):(j.creo_id?("Видео #"+j.creo_id):autoType(j.kind).label);
  const err=j.error_code?(AUTO_CODES[j.error_code]||j.error_message||j.error_code):"";
  const b=(act,label,cls)=>'<button class="'+(cls||"")+'" data-jact="'+act+'" data-jid="'+j.id+'" data-jrev="'+j.revision+'">'+label+'</button>';
  let acts="";
  if(AUTO_ATTENTION.includes(j.status))acts=b("published","Опубликовано")+b("not_published","Не опубликовано, вернуть в очередь")+b("cancel","Отменить");
  else if(j.status==="queued")acts=b("edit","Изменить")+b("cancel_job","Отменить");
  else if(j.status==="claimed")acts=b("cancel_job","Отменить");
  else if(j.status==="sent")acts=b("confirm","Опубликовано подтверждаю")+b("not_found","Не нашёл в профиле");
  else if(["failed","missed","cancelled"].includes(j.status))acts=b("retry","Повторить")+b("repost","Новый залив");
  else if(["confirmed","done"].includes(j.status)&&j.asset_path)acts=b("repost","Новый залив");
  return '<article class="batch job '+esc(j.status)+'"><div class="btop"><b>'+esc(title)+'</b><span class="ast '+esc(j.status)+'">'+esc(AUTO_STATUS[j.status]||j.status)+'</span></div>'+
    '<div class="bmeta">@'+esc(String(j.account_name||"").replace(/^@/,""))+' · '+esc(autoType(j.kind).label)+' · '+esc(autoWhen(j))+'</div>'+
    (j.caption?'<div class="jcap">'+esc(j.caption)+'</div>':'')+
    (err?'<div class="berr">'+esc(err)+'</div>':'')+
    ((AUTO_ATTENTION.includes(j.status)&&j.tapped_label)?'<div class="jtap '+(j.tapped===false?"no":"maybe")+'">'+esc(j.tapped_label)+'</div>':'')+
    (j.post_url?'<a class="jlink" href="'+esc(j.post_url)+'" target="_blank" rel="noopener">Ссылка на публикацию</a>':'')+
    (j.actor==="operator"?'<div class="bmeta">Опубликовал оператор вручную</div>':'')+
    '<div class="bacts">'+acts+'</div></article>';
}
const seenRecently=t=>!!t&&Date.now()-new Date(t).getTime()<90000;
function vAutoDevices(){
  const workers=S.auto.workers||[],phones=S.auto.phones||[],accounts=(S.auto.accounts||[]);
  const wname=id=>{const w=workers.find(x=>x.id===id);return w?w.name:"—";};
  const pair=admin()?'<div class="autobox"><b>Подключить ПК</b><div class="autorow"><input id="pairname" placeholder="Название ПК"><button class="primary" id="pairgo">Получить код</button></div>'+
    (S.autoPair?'<div class="paircode">'+esc(S.autoPair.code)+'</div><p class="hint">Введи код в PostBot на ПК. Он одноразовый и действует 15 минут.</p>':'')+'</div>':'';
  const wrows=workers.filter(w=>w.paired&&!w.revoked).map(w=>'<div class="autorow"><span class="dot '+(seenRecently(w.last_seen_at)?"on":"")+'"></span><b>'+esc(w.name)+'</b><small>'+(seenRecently(w.last_seen_at)?"на связи":w.last_seen_at?"был "+esc(ago(w.last_seen_at))+" назад":"ещё не подключался")+(w.app_version?" · v"+esc(w.app_version):"")+'</small>'+
    (admin()?'<button class="act" data-wrevoke="'+w.id+'">Отозвать</button>':'')+'</div>').join("");
  const prows=phones.map(p=>'<div class="autorow"><span class="dot '+(p.online?"on":"")+'"></span><b>'+esc(p.name||p.serial)+'</b><small>'+esc(p.online?(({RUNNING:"работает",RESYNC:"читает экран",PAUSED:"пауза",STOPPED:"остановлен",ATTENTION:"нужен человек",TAKEOVER:"ручное управление"})[p.mode]||p.mode||"онлайн"):"офлайн")+(p.paused?" · пауза":"")+(p.mode_reason?" · "+esc(p.mode_reason):"")+'</small>'+
    (admin()?'<select data-pworker="'+p.id+'"><option value="">ПК не выбран</option>'+workers.filter(w=>w.paired&&!w.revoked).map(w=>'<option value="'+w.id+'"'+(w.id===p.worker_id?" selected":"")+'>'+esc(w.name)+'</option>').join("")+'</select>'+(p.online&&(p.mode==="RUNNING"||p.mode==="RESYNC")?'<button class="act" data-ppause="'+p.id+'" data-on="0">Пауза</button><button class="act" data-pstop="'+p.id+'">■ Стоп</button>':'<button class="act" data-ppause="'+p.id+'" data-on="1">▶ Старт</button>'):'<small>'+esc(wname(p.worker_id))+'</small>')+'</div>').join("");
  const brows=accounts.map(a=>{const phone=phones.find(p=>p.id===a.phone_id);
    if(!admin())return '<div class="autorow"><b>@'+esc(String(a.account_name).replace(/^@/,""))+'</b><small>'+(phone?esc(phone.name||phone.serial):"нет привязки к телефону")+'</small></div>';
    return '<div class="autorow bind"><b>'+esc(a.account_name)+'</b><select data-bphone="'+a.id+'"><option value="">Без телефона</option>'+phones.map(p=>'<option value="'+p.id+'"'+(p.id===a.phone_id?" selected":"")+'>'+esc(p.name||p.serial)+'</option>').join("")+'</select>'+
      '<input data-bhandle="'+a.id+'" placeholder="ник на телефоне" value="'+dEscapeAttr(a.expected_handle||String(a.account_name).replace(/^@/,""))+'"><label class="gap">интервал, мин<input type="number" min="0" max="1440" data-bgap="'+a.id+'" value="'+esc(a.min_gap_minutes==null?30:a.min_gap_minutes)+'"></label><button class="act" data-bsave="'+a.id+'">Сохранить</button></div>';}).join("");
  return pair+'<div class="autobox"><b>ПК</b>'+(wrows||'<p class="hint">Подключённых ПК нет.</p>')+'</div>'+
    '<div class="autobox"><b>Телефоны</b>'+(prows||'<p class="hint">Телефоны появятся, когда их увидит подключённый ПК.</p>')+'</div>'+
    '<div class="autobox"><b>Привязки аккаунтов</b>'+(brows||'<p class="hint">Аккаунтов нет. Они добавляются в разделе «Трекер».</p>')+'</div>';
}
function bindAuto(el){
  const n=el.querySelector("#autonew");if(n)n.onclick=()=>openAutoWizard();
  const un=el.querySelector("#autouse_new");if(un)un.onclick=()=>window.FTWide.useNew();
  const add=el.querySelector("#cadd");if(add)add.onclick=()=>openAddItem();
  el.querySelectorAll("[data-autotab]").forEach(b=>b.onclick=()=>{S.autoTab=b.dataset.autotab;S._cSig="";S.cOpenKey=null;render();});
  bindContent(el);
  el.querySelectorAll("[data-jact]").forEach(b=>b.onclick=()=>autoAction(b.dataset.jact,+b.dataset.jid,+b.dataset.jrev));
  const go=el.querySelector("#pairgo");if(go)go.onclick=async()=>{const name=el.querySelector("#pairname").value.trim();if(!name)return toast("Укажи название ПК","err");
    try{S.autoPair=await api("device_pair_code",{name});await loadAuto(true);render();}catch(e){toast(errMsg(e),"err");}};
  const call=async(action,params,done)=>{try{await api(action,params);await loadAuto(true);render();if(done)toast(done,"ok");}catch(e){toast(errMsg(e),"err");}};
  el.querySelectorAll("[data-wrevoke]").forEach(b=>b.onclick=()=>{if(confirm("Отозвать доступ этого ПК? Он перестанет получать задания."))call("device_worker_revoke",{id:+b.dataset.wrevoke});});
  el.querySelectorAll("[data-pworker]").forEach(s=>s.onchange=()=>call("device_phone_set_worker",{id:+s.dataset.pworker,worker_id:s.value?+s.value:null}));
  el.querySelectorAll("[data-pstop]").forEach(b=>b.onclick=()=>{if(confirm("Остановить телефон? Текущее задание остановится до нажатия «Поделиться»."))call("device_phone_stop",{id:+b.dataset.pstop});});
  el.querySelectorAll("[data-ppause]").forEach(b=>b.onclick=()=>call(+b.dataset.on?"device_phone_resume":"device_phone_pause",{id:+b.dataset.ppause}));
  el.querySelectorAll("[data-bsave]").forEach(b=>b.onclick=()=>{const id=b.dataset.bsave,phone=el.querySelector('[data-bphone="'+id+'"]').value;
    if(!phone)return call("device_binding_delete",{account_id:+id},"Привязка снята");
    call("device_binding_set",{account_id:+id,phone_id:+phone,expected_handle:el.querySelector('[data-bhandle="'+id+'"]').value,min_gap_minutes:+el.querySelector('[data-bgap="'+id+'"]').value},"Привязка сохранена");});
}
async function autoAction(act,id,revision){
  const job=(S.auto.jobs||[]).find(j=>j.id===id);if(!job)return;
  if(act==="edit")return openAutoEdit(job);
  if(act==="repost"&&!confirm("Залить этот файл на аккаунт ещё раз? Это будет новая публикация."))return;
  if(act==="not_published"&&!confirm("Точно не опубликовано? Проверь профиль: задание снова выполнится на телефоне."))return;
  if(act==="cancel_job"&&!confirm("Отменить задание?"))return;
  try{
    if(["published","not_published","cancel"].includes(act))await api("device_job_resolve",{id,revision,decision:act});
    else if(act==="cancel_job")await api("device_job_cancel",{id,revision});
    else if(act==="confirm"){const url=prompt("Ссылка на публикацию (можно оставить пустой)","");if(url===null)return;await api("device_job_confirm",{id,revision,url:url.trim()||undefined});}
    else if(act==="not_found")await api("device_job_confirm",{id,revision,outcome:"not_found"});
    else if(act==="retry")await api("device_job_retry",{id,revision});
    else if(act==="repost")await api("device_job_repost",{id,idempotency_key:autoKey()});
    await loadAuto(true);render();
  }catch(e){toast(errMsg(e),"err");await loadAuto(true);render();}
}
const autoKey=()=>crypto.randomUUID?crypto.randomUUID():Date.now()+"-"+Math.random();

/* ---------- мастер создания ---------- */
function autoVersions(c,type){return videoVersions(c).map(v=>({...v,allowed:type.ext.test(v.path),ext:(/\.[a-z0-9]+(\?|$)/i.exec(v.path)||[""])[0].replace("?","").toLowerCase()}));}
function autoNoFormat(type,versions){const exts=[...new Set(versions.map(v=>v.ext))].join(", ");return "Формат "+exts+" нельзя выбрать: для задачи «"+type.label+"» нужен файл "+type.extName;}
async function openAutoWizard(){
  if(!S.auto)await loadAuto(true);
  S.autoDraft={kind:AUTO_TYPES[0].kind,account_id:"",items:[],mode:"now",local:"",timezone:localTZ(),q:""};
  S.autoOpen=true;renderAutoWizard();
}
function closeAutoWizard(){S.autoOpen=false;S.autoDraft=null;document.getElementById("amodal")?.remove();}
function autoLibrary(type){const d=S.autoDraft,q=d.q.trim().toLowerCase();
  return S.creos.filter(c=>c.status==="done"&&!c.deferred_at&&videoVersions(c).length).filter(c=>!q||String(c.result_caption||c.caption||"").toLowerCase().includes(q)||("#"+c.id).includes(q)).slice(0,60).map(c=>{
    const vv=autoVersions(c,type),ok=vv.some(v=>v.allowed),on=d.items.some(i=>i.creo_id===c.id),m=tileMedia(c),img=m.img||c.preview_url||c.source_poster_url;
    return '<button class="apick'+(on?" on":"")+(ok?"":" off")+'" data-apick="'+c.id+'"'+(ok?"":" disabled")+'><span class="at">'+(img?'<img loading="lazy" src="'+esc(img)+'">':'🎬')+'</span><span class="an"><b>'+esc(c.result_caption||c.caption||("Видео #"+c.id))+'</b>'+(ok?'':'<small class="why">'+esc(autoNoFormat(type,vv))+'</small>')+'</span><i>'+(on?"✓":"")+'</i></button>';}).join("")||'<p class="hint">Нет готовых видео.</p>';
}
function autoItem(x,pos,type){const c=S.creos.find(z=>z.id===x.creo_id);if(!c)return"";const vv=autoVersions(c,type);
  return '<div class="aitem"><b>'+(pos+1)+'. '+esc(c.result_caption||c.caption||("Видео #"+c.id))+'</b>'+
    '<select data-aver="'+pos+'">'+vv.map((v,vi)=>'<option value="'+dEscapeAttr(v.path)+'"'+(v.path===x.path?" selected":"")+(v.allowed?"":" disabled")+'>Версия '+(v.i+1)+(vi===0?" · последняя":"")+(v.allowed?"":" · "+esc(v.ext)+" нельзя, нужен "+esc(type.extName))+'</option>').join("")+'</select>'+
    '<textarea data-acap="'+pos+'" rows="2" maxlength="2200" placeholder="Подпись">'+esc(x.caption)+'</textarea>'+
    (x.conflict?'<div class="berr">Этот файл уже есть на аккаунте: '+esc(AUTO_STATUS[x.conflict.job.status]||x.conflict.job.status)+'.'+
      '<div class="bacts">'+(x.conflict.can_retry?'<button data-aretry="'+pos+'">Повторить то задание</button>':'')+(x.conflict.can_repost?'<button data-arepost="'+pos+'">Новый залив</button>':'')+'</div></div>':'')+
    (x.done?'<div class="jtap no">Задание создано</div>':'')+'</div>';
}
function renderAutoWizard(){const d=S.autoDraft;if(!d)return;const type=autoType(d.kind);let root=document.getElementById("amodal");
  if(!root){root=document.createElement("div");root.id="amodal";root.className="dmodal";document.body.appendChild(root);}
  const accs=(S.auto.accounts||[]).filter(a=>a.platform===type.platform);
  const keep=root.querySelector(".dwscroll")?.scrollTop||0;
  root.innerHTML='<div class="dw"><div class="dwhead"><div><small>АВТОЗАЛИВ</small><h2>Новая задача</h2></div><button id="awclose">✕</button></div><div class="dwscroll">'+
    '<div class="dwsec"><label>Тип задачи</label><select id="awkind">'+AUTO_TYPES.map(t=>'<option value="'+t.kind+'"'+(t.kind===d.kind?" selected":"")+'>'+esc(t.label)+'</option>').join("")+'</select></div>'+
    '<div class="dwsec"><label>Аккаунт</label><select id="awacc"><option value="">Выбери аккаунт</option>'+accs.map(a=>'<option value="'+a.id+'"'+(String(d.account_id)===String(a.id)?" selected":"")+(a.phone_id?"":" disabled")+'>'+esc(a.account_name)+(a.phone_id?"":" · нет привязки к телефону")+'</option>').join("")+'</select></div>'+
    '<div class="dwsec"><label>Готовые креативы</label><input id="awq" placeholder="Поиск" value="'+dEscapeAttr(d.q)+'"><div class="alib">'+autoLibrary(type)+'</div></div>'+
    (d.items.length?'<div class="dwsec"><label>Выбрано и подписи</label>'+d.items.map((x,p)=>autoItem(x,p,type)).join("")+'</div>':'')+
    '<div class="dwsec"><label>Когда</label><div class="modegrid"><button class="'+(d.mode==="now"?"on":"")+'" data-amode="now"><b>Сразу</b><small>Как только ПК свободен</small></button><button class="'+(d.mode==="at"?"on":"")+'" data-amode="at"><b>По расписанию</b><small>Дата и часовой пояс</small></button></div>'+
    (d.mode==="at"?'<label>Дата и время</label><input id="awtime" type="datetime-local" value="'+esc(d.local)+'"><label>Часовой пояс</label><input id="awtz" value="'+dEscapeAttr(d.timezone)+'" list="atzlist"><datalist id="atzlist"><option>Europe/Warsaw</option><option>UTC</option></datalist>':'')+
    '<p class="hint">Если ПК будет выключен, задание можно запустить в течение 2 часов после этого времени, затем оно станет пропущенным.</p></div>'+
    '</div><div class="dwfoot"><button class="act" id="awcancel">Закрыть</button><button class="primary" id="awsave"'+(d.items.length?"":" disabled")+'>Создать</button></div></div>';
  root.querySelector(".dwscroll").scrollTop=keep;
  bindAutoWizard(root,type);
}
function bindAutoWizard(root,type){const d=S.autoDraft;
  root.querySelector("#awclose").onclick=root.querySelector("#awcancel").onclick=closeAutoWizard;
  root.querySelector("#awkind").onchange=e=>{d.kind=e.target.value;d.items=[];d.account_id="";renderAutoWizard();};
  root.querySelector("#awacc").onchange=e=>{d.account_id=e.target.value;d.items.forEach(i=>{i.conflict=null;i.key=autoKey();});};
  const q=root.querySelector("#awq");q.oninput=()=>{d.q=q.value;root.querySelector(".alib").innerHTML=autoLibrary(type);bindPicks(root,type);};
  bindPicks(root,type);
  root.querySelectorAll("[data-aver]").forEach(s=>s.onchange=()=>{const i=d.items[+s.dataset.aver];i.path=s.value;i.conflict=null;i.key=autoKey();});
  root.querySelectorAll("[data-acap]").forEach(t=>t.oninput=()=>{d.items[+t.dataset.acap].caption=t.value;});
  root.querySelectorAll("[data-amode]").forEach(b=>b.onclick=()=>{d.mode=b.dataset.amode;renderAutoWizard();});
  const time=root.querySelector("#awtime");if(time)time.onchange=()=>{d.local=time.value;};
  const tz=root.querySelector("#awtz");if(tz)tz.oninput=()=>{d.timezone=tz.value.trim();};
  root.querySelector("#awsave").onclick=saveAutoWizard;
  root.querySelectorAll("[data-aretry]").forEach(b=>b.onclick=()=>autoConflict(+b.dataset.aretry,"retry"));
  root.querySelectorAll("[data-arepost]").forEach(b=>b.onclick=()=>autoConflict(+b.dataset.arepost,"repost"));
}
function bindPicks(root,type){const d=S.autoDraft;root.querySelectorAll("[data-apick]").forEach(b=>b.onclick=()=>{const id=+b.dataset.apick,at=d.items.findIndex(i=>i.creo_id===id);
  if(at>=0)d.items.splice(at,1);else{const c=S.creos.find(x=>x.id===id),v=autoVersions(c,type).find(x=>x.allowed);if(!v)return;d.items.push({creo_id:id,path:v.path,caption:"",key:autoKey(),conflict:null,done:false});}
  renderAutoWizard();});}
function autoRunAt(){const d=S.autoDraft;if(d.mode==="now")return{run_at:null,timezone:d.timezone||localTZ()};
  const iso=zonedToIso(d.local,d.timezone);if(!iso)return null;return{run_at:iso,timezone:d.timezone};}
async function saveAutoWizard(){const d=S.autoDraft;if(!d||!d.items.length)return;
  if(!d.account_id)return toast("Выбери аккаунт","err");
  const when=autoRunAt();if(!when)return toast("Проверь дату, время и часовой пояс. Это время может не существовать при переходе часов.","err");
  const btn=document.getElementById("awsave");btn.disabled=true;let left=0;
  for(const x of d.items){if(x.done)continue;
    try{await api("device_job_create",{kind:d.kind,account_id:+d.account_id,creo_id:x.creo_id,source_path:x.path,caption:x.caption,idempotency_key:x.key,...when});x.done=true;x.conflict=null;}
    catch(e){left++;if(e.message==="duplicate_asset"&&e.data)x.conflict=e.data;else toast(errMsg(e),"err");}}
  await loadAuto(true);
  if(!left){const n=d.items.length;closeAutoWizard();S.autoTab="queue";render();toast("Заданий создано: "+n,"ok");}
  else renderAutoWizard();
}
async function autoConflict(pos,act){const d=S.autoDraft,x=d.items[pos];if(!x||!x.conflict)return;const when=autoRunAt();if(!when)return toast("Проверь дату и время","err");
  if(act==="repost"&&!confirm("Залить этот файл на аккаунт ещё раз? Это будет новая публикация."))return;
  try{if(act==="retry")await api("device_job_retry",{id:x.conflict.job.id,revision:x.conflict.job.revision,run_at:when.run_at});
    else await api("device_job_repost",{id:x.conflict.job.id,idempotency_key:x.key,caption:x.caption,...when});
    x.done=true;x.conflict=null;await loadAuto(true);renderAutoWizard();}catch(e){toast(errMsg(e),"err");}}

/* ---------- правка до запуска ---------- */
function openAutoEdit(job){S.autoOpen=true;let root=document.getElementById("amodal");if(!root){root=document.createElement("div");root.id="amodal";root.className="dmodal";document.body.appendChild(root);}
  const tz=job.timezone;
  root.innerHTML='<div class="dw"><div class="dwhead"><div><small>АВТОЗАЛИВ</small><h2>Изменить задание</h2></div><button id="aeclose">✕</button></div><div class="dwscroll"><div class="dwsec"><label>Подпись</label><textarea id="aecap" rows="3" maxlength="2200">'+esc(job.caption)+'</textarea>'+
    '<label>Дата и время</label><input id="aetime" type="datetime-local" value="'+esc(isoToLocal(job.run_at,tz))+'"><label>Часовой пояс</label><input id="aetz" value="'+dEscapeAttr(tz)+'"></div></div><div class="dwfoot"><button class="act" id="aecancel">Закрыть</button><button class="primary" id="aesave">Сохранить</button></div></div>';
  const close=()=>{S.autoOpen=false;root.remove();};root.querySelector("#aeclose").onclick=root.querySelector("#aecancel").onclick=close;
  root.querySelector("#aesave").onclick=async()=>{const zone=root.querySelector("#aetz").value.trim(),iso=zonedToIso(root.querySelector("#aetime").value,zone);if(!iso)return toast("Проверь дату, время и часовой пояс.","err");
    try{await api("device_job_update",{id:job.id,revision:job.revision,caption:root.querySelector("#aecap").value,run_at:iso,timezone:zone});close();await loadAuto(true);render();}catch(e){toast(errMsg(e),"err");close();await loadAuto(true);render();}};
}
