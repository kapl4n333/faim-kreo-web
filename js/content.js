/* FTask — «Автозалив»: пул, расписание, настройки, тексты кнопок. Все правила и права на сервере,
   здесь только показ и ввод. Контракт: FaimGenBot/docs/autopost-contract.md.
   Поля настроек строятся из реестра с сервера: новая настройка там сама появляется на этой странице. */
const CT_LABEL={reel:"Reels",carousel:"Карусель",story:"История"};
const CT_PLURAL={reel:"Reels",carousel:"Карусели",story:"Истории"};
const CA_STATE={pending_plan:"Ждёт планировщика",planning:"Планируется",scheduled:"В расписании",scenario_wait:"Сценарий ещё не готов",scenario_expired:"Сценарий ещё не готов, время прошло"};
const CA_WAIT={no_binding:"У аккаунта нет телефона",account_archived:"Аккаунт в архиве",account_paused:"Аккаунт на паузе",type_disabled:"Этот тип выключен в настройках",
  caption_settings_missing:"Не заполнен промпт подписей",no_free_slot:"Нет свободного места по настройкам",limit:"Claude: кончились лимиты, новая попытка позже",
  claude_unavailable:"Claude недоступен",timeout:"Claude не успел ответить",bad_output:"Claude вернул неверный ответ",not_logged_in:"Claude: не выполнен вход по подписке",
  not_subscription:"Claude: вход не по подписке",api_key_in_env:"В окружении задан ключ API, запуск отменён",planner_timeout:"Запуск планировщика не завершился",
  no_plan_returned:"Claude не вернул план для этого материала",duplicate_conflict:"Этот файл уже есть на аккаунте",ffmpeg_failed:"Не удалось извлечь кадры",planner_error:"Сбой планировщика"};
const CA_REJECT={bad_schema:"ответ не прошёл проверку",bad_time:"такого времени нет",in_past:"время уже прошло",beyond_horizon:"слишком далеко вперёд",outside_window:"вне часов публикации",
  rate_exceeded:"сверх нормы",gap_same_type:"мал промежуток внутри типа",gap_any_type:"мал промежуток между публикациями",gap_phone:"мал промежуток на телефоне",spacing_other_accounts:"слишком близко к другому аккаунту",
  spacing_posts_per_hour:"сверх предела в час",round_time:"круглое время",time_repeats_days:"то же время суток, что недавно",caption_missing:"нет подписи",caption_forbidden:"у истории нет подписи",caption_too_long:"длинная подпись",
  caption_line_breaks:"перенос строки в подписи",hashtags:"хештеги не по настройке",caption_mentions_ai:"в подписи упомянут ИИ",locked_changed:"изменено закреплённое поле"};
const CA_LINKW={link_missing:"Ссылки нет, история выйдет без неё",no_button_text:"Нет текстов кнопки, ссылка без своего текста",button_text_repeat:"В пуле один текст, он повторится"};
Object.assign(ERR,{item_active:"У материала есть активное задание: его можно только архивировать.",bad_file_count:"Неверное число файлов для этого типа.",bad_order:"Неверный порядок файлов.",
  bad_setting:"Проверь значение настройки.",planning:"Материал сейчас планируется, подожди минуту.",nothing_selected:"Ничего не выбрано.",nothing_to_change:"Изменений нет.",in_past:"Это время уже прошло.",
  caption_missing:"Нужна подпись.",caption_forbidden:"У истории нет подписи.",bad_url:"Ссылка должна начинаться с https://.",text_too_long:"Текст кнопки длиннее 80 символов.",too_many_lines:"За раз можно вставить до 500 строк.",bad_type:"Этот тип здесь не подходит."});
const waitText=c=>{const r=c.wait_reason;if(!r)return"";if(r.startsWith("validation:")){const k=r.slice(11);return"Отказ проверки: "+(CA_REJECT[k]||k);}return CA_WAIT[r]||r;};
const cFrontKey=()=>crypto.randomUUID?crypto.randomUUID():Date.now()+"-"+Math.random();
const ctAccept=t=>t==="reel"?".mp4,video/mp4":".mp4,.jpg,.jpeg,.png,video/mp4,image/jpeg,image/png";

/* ---------- данные ---------- */
async function loadContent(silent){
  const tab=S.autoTab;if(!["pool","schedule","settings"].includes(tab)||S.cLoading)return;S.cLoading=true;
  try{
    if(tab==="pool"){const folder=S.cType==="story_pool",d=await api("content_pool_list",{status:S.cStatus||"active",content_type:folder?"story":(S.cType||undefined),...(folder?{pool:true}:{})});const sig=JSON.stringify(d.items.map(i=>[i.id,i.status,i.assignments,i.media.map(m=>m.id)]));
      const changed=sig!==S._cSig;S._cSig=sig;S.cPool=d;if(S.tab==="auto"&&S.autoTab==="pool"&&!S.autoOpen&&(!silent||changed)&&!autoTyping())render();}
    else if(tab==="schedule"){const d=await api("content_schedule_list");if(!S.cSet)S.cSet=await api("content_settings_get");const sig=JSON.stringify(d);
      const changed=sig!==S._cSig;S._cSig=sig;S.cSched=d;if(S.tab==="auto"&&S.autoTab==="schedule"&&!S.autoOpen&&(!silent||changed)&&!autoTyping())render();}
    else if(!silent){S.cSet=await api("content_settings_get");if(S.tab==="auto"&&S.autoTab==="settings")render();}
  }catch(e){if(!silent)toast(errMsg(e),"err");}finally{S.cLoading=false;}
}
const cWait=()=>{setTimeout(()=>loadContent(),0);return'<div class="gate"><div><div class="spin"></div><p>Загружаю…</p></div></div>';};
const settingLabel=k=>{const r=(S.cSet&&S.cSet.registry||[]).find(x=>x.key===k);return r?(r.group+": "+r.label):k;};
function goSetting(key){S.autoTab="settings";S.cSetSub="settings";S.cOpenKey=key;S._cSig="";render();}

/* ---------- Пул ---------- */
function vPool(){
  if(!S.cPool)return cWait();
  const sel=S.cSel||[],type=S.cType||"",status=S.cStatus||"active";
  const chip=(v,l,cur,attr)=>'<button class="'+(cur===v?"on":"")+'" '+attr+'="'+v+'">'+l+'</button>';
  return '<div class="autosubs cchips">'+chip("","Все",type,"data-ctype")+chip("reel","Reels",type,"data-ctype")+chip("carousel","Карусели",type,"data-ctype")+chip("story","Истории",type,"data-ctype")+chip("story_pool","Папка историй",type,"data-ctype")+chip("active","Активные",status,"data-cstatus")+chip("archived","Архив",status,"data-cstatus")+'</div>'+
    (sel.length?'<div class="csel"><b>Выбрано: '+sel.length+'</b><button class="primary" id="cassign">Назначить на аккаунты</button><button class="act" id="cclear">Снять</button></div>':'')+
    (S.cPool.items.length?'<div class="batchgrid">'+S.cPool.items.map(poolCard).join("")+'</div>':'<div class="empty"><div class="e-ic">🗂</div><div class="e-h">Материалов нет</div>Нажми «Добавить материал».</div>');
}
function poolCard(i){
  const on=(S.cSel||[]).includes(i.id),m=i.media[0],img=i.poster_url||(m&&m.media_kind==="photo"?m.url:null);
  const assigned=i.assignments.map(a=>'<span class="cchip">'+esc(a.account_name)+' · '+esc(a.job_status?(AUTO_STATUS[a.job_status]||a.job_status):(CA_STATE[a.state]||a.state))+'</span>').join("");
  const order=i.content_type==="carousel"&&i.status==="active"?'<div class="corder">'+i.media.map((f,p)=>'<div class="autorow"><small>'+(p+1)+'. '+esc(fname(f.path))+'</small><button class="act" data-cmove="'+i.id+':'+p+':-1"'+(p?"":" disabled")+'>▲</button><button class="act" data-cmove="'+i.id+':'+p+':1"'+(p<i.media.length-1?"":" disabled")+'>▼</button></div>').join("")+'</div>':'';
  return '<article class="batch job citem'+(on?" picked":"")+'"><div class="btop"><label class="ccheck"><input type="checkbox" data-csel="'+i.id+'"'+(on?" checked":"")+(i.status==="active"?"":" disabled")+'><span class="cthumb">'+(img?'<img loading="lazy" src="'+esc(img)+'">':(m&&m.media_kind==="video"?"🎬":"🖼"))+'</span><b>'+esc(i.title||fname(m&&m.path)||("Материал #"+i.id))+'</b></label><span class="ast">'+esc(CT_LABEL[i.content_type]||i.content_type)+(i.pool?" · папка":"")+(i.media.length>1?" · "+i.media.length:"")+'</span></div>'+
    '<div class="cchips2">'+(assigned||'<small class="hintline">Ещё никуда не назначен</small>')+'</div>'+order+
    '<div class="bacts">'+(i.status==="active"?'<button data-carch="'+i.id+'">В архив</button>':'<button data-crest="'+i.id+'">Вернуть</button>')+'<button data-cdel="'+i.id+'">Удалить</button></div></article>';
}
async function cRefreshPool(){S.cPool=null;S._cSig="";await loadContent(true);render();}
function bindPool(el){
  el.querySelectorAll("[data-ctype]").forEach(b=>b.onclick=()=>{S.cType=b.dataset.ctype;S.cSel=[];S.cPool=null;render();});
  el.querySelectorAll("[data-cstatus]").forEach(b=>b.onclick=()=>{S.cStatus=b.dataset.cstatus;S.cSel=[];S.cPool=null;render();});
  el.querySelectorAll("[data-csel]").forEach(c=>c.onchange=()=>{const id=+c.dataset.csel;S.cSel=c.checked?[...(S.cSel||[]),id]:(S.cSel||[]).filter(x=>x!==id);render();});
  const clear=el.querySelector("#cclear");if(clear)clear.onclick=()=>{S.cSel=[];render();};
  const as=el.querySelector("#cassign");if(as)as.onclick=()=>openAssign();
  const act=async(name,params,done)=>{try{await api(name,params);if(done)toast(done,"ok");await cRefreshPool();}catch(e){toast(errMsg(e),"err");}};
  el.querySelectorAll("[data-carch]").forEach(b=>b.onclick=()=>act("content_item_archive",{id:+b.dataset.carch},"В архиве"));
  el.querySelectorAll("[data-crest]").forEach(b=>b.onclick=()=>act("content_item_restore",{id:+b.dataset.crest},"Возвращён"));
  el.querySelectorAll("[data-cdel]").forEach(b=>b.onclick=()=>{if(confirm("Удалить материал из пула? Файлы и история заданий останутся."))act("content_item_delete",{id:+b.dataset.cdel},"Удалён");});
  el.querySelectorAll("[data-cmove]").forEach(b=>b.onclick=()=>{const[id,p,d]=b.dataset.cmove.split(":").map(Number),item=S.cPool.items.find(x=>x.id===id),ids=item.media.map(m=>m.id);
    [ids[p],ids[p+d]]=[ids[p+d],ids[p]];act("content_item_update",{id,media_order:ids});});
}
function cModal(html){S.autoOpen=true;let root=document.getElementById("amodal");if(!root){root=document.createElement("div");root.id="amodal";root.className="dmodal";document.body.appendChild(root);}root.innerHTML=html;return root;}
function cModalClose(){S.autoOpen=false;document.getElementById("amodal")?.remove();}

/* добавление материала */
function openAddItem(){S.cAdd={type:S.cType==="story_pool"?"story":(S.cType||"reel"),source:"upload",files:[],picks:[],title:"",busy:false,progress:"",q:"",pool:true};renderAddItem();}
const cIsPool=a=>a.type==="story"&&a.pool;
function cReadyList(a){const q=a.q.trim().toLowerCase();return (S.creos||[]).filter(c=>c.status==="done"&&!c.deferred_at).map(c=>({c,paths:(c.result_paths||[]).map((p,i)=>({p,i})).filter(x=>a.type==="reel"?/\.mp4(\?|$)/i.test(x.p):/\.(mp4|jpe?g|png)(\?|$)/i.test(x.p))})).filter(x=>x.paths.length&&(!q||String(x.c.result_caption||x.c.caption||"").toLowerCase().includes(q)||("#"+x.c.id).includes(q))).slice(0,60);}
function renderAddItem(){const a=S.cAdd,root=cModal(
  '<div class="dw"><div class="dwhead"><div><small>ПУЛ</small><h2>Новый материал</h2></div><button id="cac">✕</button></div><div class="dwscroll">'+
  '<div class="dwsec"><label>Тип</label><select id="cat">'+Object.keys(CT_LABEL).map(t=>'<option value="'+t+'"'+(t===a.type?" selected":"")+'>'+CT_LABEL[t]+'</option>').join("")+'</select>'+
  (a.type==="story"?'<label class="ccheckrow"><input id="capool" type="checkbox"'+(a.pool?" checked":"")+'><b>В папку историй</b></label><p class="hint">'+(a.pool?'Можно выбрать сразу много фото. Сервер сам каждый день берёт случайное и сам решает, в какой истории будет ссылка.':'Обычная история: назначаешь её на аккаунт, как Reels.')+'</p>':'')+
  '<label>Название, необязательно</label><input id="caname" value="'+dEscapeAttr(a.title)+'" maxlength="200"></div>'+
  '<div class="dwsec"><div class="modegrid"><button class="'+(a.source==="upload"?"on":"")+'" data-casrc="upload"><b>Загрузить файлы</b></button><button class="'+(a.source==="ready"?"on":"")+'" data-casrc="ready"><b>Из готовых</b></button></div>'+
  (a.source==="upload"?'<label>Файлы'+(a.type==="carousel"?", в нужном порядке":"")+'</label><input id="cafile" type="file" accept="'+ctAccept(a.type)+'"'+(a.type==="carousel"||cIsPool(a)?" multiple":"")+'>'+(a.files.length?'<p class="hint">Выбрано: '+a.files.map(f=>esc(f.name)).join(", ")+'</p>':''):
    '<label>Готовые креативы</label><input id="caq" placeholder="Поиск" value="'+dEscapeAttr(a.q)+'"><div class="alib">'+(cReadyList(a).map(({c,paths})=>{const x=paths[paths.length-1],on=a.picks.some(p=>p.creo_id===c.id);return '<button class="apick'+(on?" on":"")+'" data-capick="'+c.id+'" data-capath="'+dEscapeAttr(x.p)+'"><span class="an"><b>'+esc(c.result_caption||c.caption||("Креатив #"+c.id))+'</b></span><i>'+(on?"✓":"")+'</i></button>';}).join("")||'<p class="hint">Подходящих файлов нет.</p>')+'</div>')+
  (a.progress?'<p class="hint">'+esc(a.progress)+'</p>':'')+'</div></div><div class="dwfoot"><button class="act" id="cac2">Закрыть</button><button class="primary" id="cago"'+(a.busy?" disabled":"")+'>Добавить</button></div></div>');
  root.querySelector("#cac").onclick=root.querySelector("#cac2").onclick=()=>{if(!a.busy)cModalClose();};
  root.querySelector("#cat").onchange=e=>{a.type=e.target.value;a.files=[];a.picks=[];renderAddItem();};
  root.querySelector("#caname").oninput=e=>{a.title=e.target.value;};
  const pl=root.querySelector("#capool");if(pl)pl.onchange=()=>{a.pool=pl.checked;a.files=[];a.picks=[];renderAddItem();};
  root.querySelectorAll("[data-casrc]").forEach(b=>b.onclick=()=>{a.source=b.dataset.casrc;renderAddItem();});
  const f=root.querySelector("#cafile");if(f)f.onchange=()=>{a.files=[...f.files];renderAddItem();};
  const q=root.querySelector("#caq");if(q)q.onchange=()=>{a.q=q.value;renderAddItem();};
  root.querySelectorAll("[data-capick]").forEach(b=>b.onclick=()=>{const id=+b.dataset.capick,at=a.picks.findIndex(p=>p.creo_id===id);if(at>=0)a.picks.splice(at,1);else{if(a.type!=="carousel"&&!cIsPool(a))a.picks=[];a.picks.push({creo_id:id,path:b.dataset.capath});}renderAddItem();});
  root.querySelector("#cago").onclick=saveAddItem;
}
/* Кадр для превью рисует браузер: на сервере ffmpeg считался бы в те же 384 МБ сервиса. */
function cPoster(file){return new Promise(res=>{try{const url=URL.createObjectURL(file),done=b=>{URL.revokeObjectURL(url);res(b);};const draw=(src,w,h)=>{const k=Math.min(1,480/Math.max(w,h)),c=document.createElement("canvas");c.width=Math.round(w*k);c.height=Math.round(h*k);c.getContext("2d").drawImage(src,0,0,c.width,c.height);c.toBlob(done,"image/jpeg",.8);};
  setTimeout(()=>done(null),8000);
  if(file.type.startsWith("image")){const i=new Image();i.onload=()=>draw(i,i.width,i.height);i.onerror=()=>done(null);i.src=url;}
  else{const v=document.createElement("video");v.muted=true;v.playsInline=true;v.preload="metadata";v.onloadedmetadata=()=>{v.currentTime=Math.min(1,(v.duration||1)/2);};v.onseeked=()=>draw(v,v.videoWidth,v.videoHeight);v.onerror=()=>done(null);v.src=url;}}catch(e){res(null);}});}
async function saveAddItem(){const a=S.cAdd;if(a.busy)return;
  a.busy=true;a.key=a.key||cFrontKey();
  try{let files;let poster;
    if(a.source==="ready"){if(!a.picks.length)throw new Error("nothing_selected");files=a.picks;}
    else{if(!a.files.length)throw new Error("nothing_selected");files=[];
      for(const[n,f]of a.files.entries()){a.progress="Загружаю "+(n+1)+" из "+a.files.length+": "+f.name;renderAddItem();const su=await api("sign_upload",{name:f.name});
        await putFile(su.signedUrl,f,frac=>{const h=document.querySelector("#amodal .dwscroll .hint:last-child");if(h)h.textContent="Загружаю "+(n+1)+" из "+a.files.length+": "+Math.round(frac*100)+"%";});files.push({path:su.path});}
      const blob=await cPoster(a.files[0]);if(blob){const su=await api("sign_upload",{name:"poster.jpg"});await putFile(su.signedUrl,blob,()=>{});poster=su.path;}
    }
    a.progress="Проверяю файлы на сервере…";renderAddItem();
    if(cIsPool(a)){for(const[n,f]of files.entries()){a.progress="В папку историй: "+(n+1)+" из "+files.length;renderAddItem();await api("content_item_add",{content_type:"story",pool:true,title:a.title,idempotency_key:a.key+":"+n,files:[f],poster_path:n===0?poster:undefined});}}
    else await api("content_item_add",{content_type:a.type,title:a.title,idempotency_key:a.key,files,poster_path:poster});
    cModalClose();S.cAdd=null;toast("Материал добавлен","ok");S.cType=S.cType||"";await cRefreshPool();
  }catch(e){a.busy=false;a.progress="";toast(errMsg(e),"err");renderAddItem();}
}

/* назначение */
function openAssign(){const accs=S.cPool.accounts||[];S.cAsg={ids:[],results:null};renderAssign(accs);}
function renderAssign(accs){const g=S.cAsg,root=cModal('<div class="dw"><div class="dwhead"><div><small>НАЗНАЧЕНИЕ</small><h2>Материалов: '+(S.cSel||[]).length+'</h2></div><button id="cgc">✕</button></div><div class="dwscroll"><div class="dwsec"><label>Аккаунты</label>'+
  accs.map(a=>'<label class="ccheckrow'+(a.has_phone?"":" off")+'"><input type="checkbox" data-gacc="'+a.id+'"'+(g.ids.includes(a.id)?" checked":"")+(a.has_phone?"":" disabled")+'><b>'+esc(a.account_name)+'</b><small>'+(a.has_phone?esc(a.phone_name):"Нет телефона")+'</small></label>').join("")+'</div>'+
  (g.results?'<div class="dwsec"><label>Результат</label>'+g.results.map(cResultRow).join("")+'</div>':'')+
  '</div><div class="dwfoot"><button class="act" id="cgc2">Закрыть</button><button class="primary" id="cggo">Назначить</button></div></div>');
  root.querySelector("#cgc").onclick=root.querySelector("#cgc2").onclick=()=>{cModalClose();cRefreshPool();};
  root.querySelectorAll("[data-gacc]").forEach(c=>c.onchange=()=>{const id=+c.dataset.gacc;g.ids=c.checked?[...g.ids,id]:g.ids.filter(x=>x!==id);});
  root.querySelector("#cggo").onclick=async()=>{if(!g.ids.length)return toast("Выбери аккаунт","err");
    const confirmed=[...root.querySelectorAll("[data-gconf]:checked")].map(c=>{const[item_id,account_id]=c.dataset.gconf.split(":").map(Number);return{item_id,account_id};});
    try{const d=await api("content_assign",{item_ids:S.cSel,account_ids:g.ids,confirm_repeat_pairs:confirmed});
      const prior=(g.results||[]).filter(r=>r.outcome==="created");g.results=[...prior,...d.results];
      const dup=d.results.filter(r=>r.outcome==="duplicate");
      if(!dup.length&&d.results.every(r=>r.outcome==="created")){const n=d.results.length;cModalClose();S.cSel=[];toast("Назначений: "+n+". Время и подпись определит планировщик.","ok");await cRefreshPool();return;}
      renderAssign(accs);
    }catch(e){toast(errMsg(e),"err");}};
}
function cResultRow(r){const item=(S.cPool.items||[]).find(i=>i.id===r.item_id),acc=(S.cPool.accounts||[]).find(a=>a.id===r.account_id),name=esc((item&&(item.title||("#"+item.id)))||r.item_id)+" → "+esc((acc&&acc.account_name)||r.account_id);
  const text={created:"назначен",no_phone:"нет телефона",forbidden:"нет прав",bad_account:"аккаунт недоступен",bad_type:"не та соцсеть",bad_item:"материал в архиве"}[r.outcome]||r.outcome;
  if(r.outcome!=="duplicate")return '<div class="autorow"><small>'+name+': '+esc(text)+'</small></div>';
  return '<label class="ccheckrow"><input type="checkbox" data-gconf="'+r.item_id+':'+r.account_id+'"><b>'+name+'</b><small>Уже назначался сюда. Отметь и нажми «Назначить», чтобы выложить ещё раз</small></label>';
}

/* ---------- Расписание ---------- */
function vSchedule(){
  if(!S.cSched)return cWait();
  const d=S.cSched,p=d.planner||{},lr=p.last_run;
  const err=lr&&lr.error_code?(CA_WAIT[lr.error_code]||lr.error_code)+(lr.error_detail?": "+lr.error_detail:""):"";
  const planner='<div class="autobox"><b>Планировщик</b><div class="autorow"><small>'+(p.offline?'<span class="cwarn">Не выходит на связь'+(p.last_poll_at?", был "+esc(ago(p.last_poll_at))+" назад":"")+'</span>':p.last_poll_at?"На связи, был "+esc(ago(p.last_poll_at))+" назад":"Ещё не подключался")+' · ждёт материалов: '+esc(p.waiting||0)+(err?'<br><span class="cwarn">'+esc(err)+'</span>':'')+'</small><button class="act" id="creplan">Пересчитать расписание</button></div></div>';
  const stock=(d.stock||[]);
  const stockBox=stock.length?'<div class="autobox"><b>Запас контента</b>'+stock.map(s=>'<div class="autorow"><small>'+esc(s.account_name)+' · '+esc(CT_PLURAL[s.content_type])+': '+(s.days==null?esc(s.count)+" шт.":"на "+esc(s.days)+" дн.")+'</small>'+(s.request_content?'<span class="ast failed">Нужен контент</span>':'')+'</div>').join("")+'</div>':'';
  const rows=(d.rows||[]);
  return planner+stockBox+(rows.length?'<div class="batchgrid">'+rows.map(schedCard).join("")+'</div>':'<div class="empty"><div class="e-ic">🗓</div><div class="e-h">Расписание пусто</div>Назначь материалы в разделе «Пул».</div>')+
    ((d.old_form||[]).length?'<h2 class="autoh">Из формы «Новая задача»</h2><div class="batchgrid">'+d.old_form.map(j=>'<article class="batch job"><div class="btop"><b>@'+esc(j.account_name)+'</b><span class="ast '+esc(j.job_status)+'">'+esc(AUTO_STATUS[j.job_status]||j.job_status)+'</span></div><div class="bmeta">'+esc(CT_LABEL[j.content_type]||"")+' · '+esc(cWhen(j))+(j.phone?' · '+esc(j.phone.name):'')+'</div>'+(j.caption?'<div class="jcap">'+esc(j.caption)+'</div>':'')+'</article>').join("")+'</div>':'');
}
const cWhen=r=>{if(!r.run_at)return"время не выбрано";try{return new Intl.DateTimeFormat("ru-RU",{timeZone:r.timezone,day:"numeric",month:"long",hour:"2-digit",minute:"2-digit"}).format(new Date(r.run_at))+" · "+r.timezone;}catch(e){return r.run_at;}};
function schedCard(r){
  const status=r.job_status?'<span class="ast '+esc(r.job_status)+'">'+esc(AUTO_STATUS[r.job_status]||r.job_status)+'</span>':'<span class="ast">'+esc(CA_STATE[r.state]||r.state)+'</span>';
  const l=r.story_link;
  const link=r.content_type==="story"&&l?'<div class="bmeta">Ссылка: '+(l.enabled?esc(l.url)+(l.text?' · «'+esc(l.text)+'»':''):'нет')+'</div>'+(l.warning?'<div class="cwarn">'+esc(CA_LINKW[l.warning]||l.warning)+'</div>':''):'';
  const block=(r.blocking_settings||[]).map(k=>'<button class="clinkbtn" data-goset="'+esc(k)+'">'+esc(settingLabel(k))+'</button>').join("");
  const wait=waitText(r);
  return '<article class="batch job"><div class="btop"><b>'+esc(r.title||("Материал #"+r.item_id))+'</b>'+status+'</div>'+
    '<div class="bmeta">'+esc(CT_LABEL[r.content_type])+' · @'+esc(String(r.account_name).replace(/^@/,""))+(r.phone?' · '+esc(r.phone.name):' · нет телефона')+'</div><div class="bmeta">'+esc(cWhen(r))+(r.time_manual?" · задано вручную":"")+'</div>'+
    (r.caption?'<div class="jcap">'+esc(r.caption)+'</div>':'')+link+
    (wait?'<div class="berr">'+esc(wait)+(r.wait_detail?': '+esc(r.wait_detail):'')+'</div>':'')+(block?'<div class="cblock">Что мешает: '+block+'</div>':'')+
    (r.plan_reason?'<div class="bmeta">Claude: '+esc(r.plan_reason)+'</div>':'')+(r.replan_requested?'<div class="bmeta">Ждёт пересчёта, старое время действует</div>':'')+
    (r.editable?'<div class="bacts"><button data-cedit="'+r.id+'">Изменить</button><button data-ccancel="'+r.id+'" data-rev="'+r.revision+'">Отменить</button></div>':'<div class="bmeta">Телефон уже взял задание, только просмотр</div>')+'</article>';
}
function bindSchedule(el){
  const re=el.querySelector("#creplan");if(re)re.onclick=async()=>{if(!confirm("Пересчитать время? Не тронет то, что уже взял телефон или что правили вручную."))return;
    try{const d=await api("content_schedule_replan",{});toast("На пересчёт: "+d.requested+", не тронуто: "+d.skipped,"ok");await cReloadSched();}catch(e){toast(errMsg(e),"err");}};
  el.querySelectorAll("[data-goset]").forEach(b=>b.onclick=()=>goSetting(b.dataset.goset));
  el.querySelectorAll("[data-cedit]").forEach(b=>b.onclick=()=>openSchedEdit((S.cSched.rows||[]).find(r=>r.id===+b.dataset.cedit)));
  el.querySelectorAll("[data-ccancel]").forEach(b=>b.onclick=async()=>{if(!confirm("Отменить это назначение?"))return;try{await api("content_assignment_cancel",{id:+b.dataset.ccancel,revision:+b.dataset.rev});await cReloadSched();}catch(e){toast(errMsg(e),"err");await cReloadSched();}});
}
async function cReloadSched(){S._cSig="";await loadContent(true);render();}
function openSchedEdit(r){const acc=(S.cSet&&S.cSet.accounts||[]).find(a=>a.id===r.account_id),story=r.content_type==="story",l=r.story_link||{};
  const tz=r.timezone||"UTC",local=r.local_time||"";
  const root=cModal('<div class="dw"><div class="dwhead"><div><small>РАСПИСАНИЕ</small><h2>'+esc(CT_LABEL[r.content_type])+' · @'+esc(r.account_name)+'</h2></div><button id="cec">✕</button></div><div class="dwscroll"><div class="dwsec">'+
    (story?'':'<label>Подпись</label><textarea id="cecap" rows="4" maxlength="2200">'+esc(r.caption||"")+'</textarea>')+
    '<label>Время'+(r.timezone?', '+esc(tz):', в поясе аккаунта')+'</label><input id="cetime" type="datetime-local" value="'+esc(local)+'">'+
    (story?'<label class="ccheckrow"><input id="celink" type="checkbox"'+((l.wanted||l.enabled)?" checked":"")+'><b>Ссылка в истории</b></label><label>Адрес, если своя</label><input id="ceurl" placeholder="https://…" value="'+dEscapeAttr(l.url_source==="manual"?l.url:"")+'"><label>Текст кнопки</label><input id="cetext" maxlength="80" value="'+dEscapeAttr(l.text||"")+'">':'')+
    '</div></div><div class="dwfoot"><button class="act" id="cec2">Закрыть</button><button class="primary" id="cesave">Сохранить</button></div></div>');
  void acc;
  root.querySelector("#cec").onclick=root.querySelector("#cec2").onclick=cModalClose;
  root.querySelector("#cesave").onclick=async()=>{const p={id:r.id,revision:r.revision};
    const cap=root.querySelector("#cecap");if(cap&&cap.value!==(r.caption||""))p.caption=cap.value;
    const t=root.querySelector("#cetime").value;if(t&&t!==local)p.run_at_local=t;
    if(story){const on=root.querySelector("#celink").checked,url=root.querySelector("#ceurl").value.trim(),text=root.querySelector("#cetext").value.trim();
      if(on!==!!(l.wanted||l.enabled)||url||text!==(l.text||""))p.story_link={enabled:on,...(url?{url}:{}),...(text!==(l.text||"")?{text}:{})};}
    try{await api("content_schedule_update",p);cModalClose();await cReloadSched();toast("Сохранено","ok");}catch(e){toast(errMsg(e),"err");if(e.message==="conflict"||e.message==="bad_status"){cModalClose();await cReloadSched();}}};
}

/* ---------- Настройки: поле строится из записи реестра ---------- */
function cField(rec,v,id,dis){const d=dis?" disabled":"";
  switch(rec.type){
    case"bool":return '<label class="ccheckrow"><input type="checkbox" id="'+id+'"'+(v?" checked":"")+d+'><span>Включено</span></label>';
    case"number":case"int":return '<input type="number" step="'+(rec.type==="number"?"0.1":"1")+'" id="'+id+'" min="'+rec.min+'" max="'+rec.max+'" value="'+esc(v)+'"'+d+'>';
    case"range":return '<div class="cinline"><label>от<input type="number" data-f="min" id="'+id+'" min="'+rec.min+'" max="'+rec.max+'" value="'+esc(v.min)+'"'+d+'></label><label>до<input type="number" data-f="max" min="'+rec.min+'" max="'+rec.max+'" value="'+esc(v.max)+'"'+d+'></label></div>';
    case"strings":return '<textarea id="'+id+'" rows="4"'+d+'>'+esc((v||[]).join("\n"))+'</textarea>';
    case"enum":return '<select id="'+id+'"'+d+'>'+rec.options.map(o=>'<option value="'+o+'"'+(o===v?" selected":"")+'>'+esc(({auto:"Свой, иначе общий",account:"Только свой, иначе общий",global:"Общий",calm:"Спокойный",normal:"Обычный",active:"Активный",mixed:"Смешанный",double_tap:"Двойной тап",heart:"Кнопка сердца"})[o]||o)+'</option>').join("")+'</select>';
    case"text":return rec.multiline?'<textarea id="'+id+'" rows="8"'+d+'>'+esc(v)+'</textarea>':'<input id="'+id+'" value="'+dEscapeAttr(v)+'"'+d+'>';
    case"timezone":case"url":return '<input id="'+id+'" value="'+dEscapeAttr(v==null?"":v)+'"'+d+'>';
    case"rate":return '<div class="cinline"><label>от<input type="number" min="0" data-f="min" id="'+id+'" value="'+esc(v.min)+'"'+d+'></label><label>до<input type="number" min="1" data-f="max" value="'+esc(v.max)+'"'+d+'></label><select data-f="period"'+d+'><option value="day"'+(v.period==="day"?" selected":"")+'>в день</option><option value="week"'+(v.period==="week"?" selected":"")+'>в неделю</option></select></div>';
    case"hours":return '<input id="'+id+'" placeholder="10:00-22:00, 23:00-01:00" value="'+dEscapeAttr((v||[]).map(w=>w.from+"-"+w.to).join(", "))+'"'+d+'>';
    case"link_frequency":return '<div class="cinline"><select data-f="mode" id="'+id+'"'+d+'><option value="percent"'+(v.mode==="percent"?" selected":"")+'>процент историй</option><option value="nth"'+(v.mode==="nth"?" selected":"")+'>каждая N-я</option><option value="daily"'+(v.mode==="daily"?" selected":"")+'>историй со ссылкой в день</option></select><input type="number" min="0" data-f="value" value="'+esc(v.value)+'"'+d+'></div>';
    case"hashtags":return '<div class="cstack"><label>Обязательные<input data-f="required" id="'+id+'" value="'+dEscapeAttr((v.required||[]).join(" "))+'"'+d+'></label><label>Из чего выбирать<input data-f="pool" value="'+dEscapeAttr((v.pool||[]).join(" "))+'"'+d+'></label><label>Всего не больше<input type="number" min="0" data-f="max" value="'+esc(v.max)+'"'+d+'></label></div>';
    default:return '<input id="'+id+'" value="'+dEscapeAttr(JSON.stringify(v))+'"'+d+'>';
  }
}
function cFieldRead(rec,box){const f=n=>box.querySelector('[data-f="'+n+'"]'),main=box.querySelector("input,select,textarea");
  switch(rec.type){
    case"bool":return main.checked;
    case"number":case"int":return main.value===""?null:Number(main.value);
    case"range":return{min:Number(f("min").value),max:Number(f("max").value)};
    case"strings":return main.value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
    case"url":return main.value.trim()||null;
    case"timezone":return main.value.trim();
    case"rate":return{min:Number(f("min").value),max:Number(f("max").value),period:f("period").value};
    case"hours":return main.value.split(",").map(s=>s.trim()).filter(Boolean).map(s=>{const[from,to]=s.split("-").map(x=>x.trim());return{from,to};});
    case"link_frequency":return{mode:f("mode").value,value:Number(f("value").value)};
    case"hashtags":{const tags=n=>f(n).value.split(/[\s,]+/).filter(Boolean);return{required:tags("required"),pool:tags("pool"),max:Number(f("max").value)};}
    default:return main.value;
  }
}
const cEffective=(rec,o)=>rec.key in o?o[rec.key]:(rec.key in (S.cSet.global||{})?S.cSet.global[rec.key]:rec.default);
function cGroups(list){const g=new Map();for(const r of list){if(!g.has(r.group))g.set(r.group,[]);g.get(r.group).push(r);}return g;}
function vSettings(){
  if(!S.cSet)return cWait();
  const sub=S.cSetSub||"settings";
  return '<div class="autosubs cchips"><button class="'+(sub==="settings"?"on":"")+'" data-csub="settings">Настройки</button><button class="'+(sub==="texts"?"on":"")+'" data-csub="texts">Тексты кнопок</button></div>'+(sub==="texts"?vTexts():vSettingsMain());
}
function vSettingsMain(){const s=S.cSet,scope=S.cScope||"global",reg=s.registry;
  const accs=s.accounts||[],isGlobal=scope==="global",acc=accs.find(a=>String(a.id)===String(scope));
  const pick='<div class="autobox"><b>Для чего настройки</b><select id="cscope" class="cwide"><option value="global"'+(isGlobal?" selected":"")+'>Общие: все аккаунты</option>'+accs.map(a=>'<option value="'+a.id+'"'+(String(a.id)===String(scope)?" selected":"")+'>'+esc(a.account_name)+(a.has_phone?"":" · нет телефона")+'</option>').join("")+'</select>'+(admin()&&accs.length?'<button class="act cbulk" id="cbulk">Изменить сразу у нескольких</button>':'')+'</div>';
  const phones=(S.auto&&S.auto.phones)||[];
  const bind=acc?'<div class="autobox"><b>Телефон</b><div class="autorow"><small>'+(acc.has_phone?esc(acc.phone_name):"Нет телефона: на этот аккаунт нельзя назначать")+'</small>'+(admin()?'<select id="cbindphone"><option value="">Нет телефона</option>'+phones.map(p=>'<option value="'+p.id+'"'+(p.id===acc.phone_id?" selected":"")+'>'+esc(p.name||p.serial)+'</option>').join("")+'</select><button class="act" id="cbindsave">Сохранить</button>':'')+'</div></div>':'';
  const list=reg.filter(r=>isGlobal?r.scope!=="account":r.scope!=="global");
  const canEdit=isGlobal?s.can_edit_global:true,overrides=isGlobal?{}:(s.overrides[scope]||{});
  let html=pick+bind;
  for(const[group,items]of cGroups(list)){
    html+='<details class="autobox cgroup"'+(items.some(r=>r.key===S.cOpenKey)||group==="Подписи"?" open":"")+'><summary><b>'+esc(group)+'</b></summary>'+items.map(r=>{
      const own=!isGlobal&&r.key in overrides,val=isGlobal?(r.key in s.global?s.global[r.key]:r.default):cEffective(r,overrides),dis=!canEdit||(!isGlobal&&!own&&r.scope!=="account");
      return '<div class="csetting'+(r.key===S.cOpenKey?" flash":"")+'" data-skey="'+esc(r.key)+'"><div class="cshead"><b>'+esc(r.label)+'</b>'+(!isGlobal&&r.scope!=="account"?'<div class="cmode"><button class="'+(own?"":"on")+'" data-sinherit="'+esc(r.key)+'">Как в общих</button><button class="'+(own?"on":"")+'" data-sown="'+esc(r.key)+'">Своё</button></div>':'')+'</div>'+(r.hint?'<small class="hintline">'+esc(r.hint)+'</small>':'')+
        '<div class="csbox">'+cField(r,val,"f_"+r.key.replace(/\W/g,"_"),dis)+'</div>'+(dis?'':'<button class="act csave" data-ssave="'+esc(r.key)+'">Сохранить</button>')+'</div>';}).join("")+'</details>';
  }
  return html;
}
function bindSettings(el){
  el.querySelectorAll("[data-csub]").forEach(b=>b.onclick=()=>{S.cSetSub=b.dataset.csub;S.cTexts=null;render();});
  if((S.cSetSub||"settings")==="texts")return bindTexts(el);
  const scopeSel=el.querySelector("#cscope");if(scopeSel)scopeSel.onchange=()=>{S.cScope=scopeSel.value;render();};
  const reload=async msg=>{S.cSet=await api("content_settings_get");render();if(msg)toast(msg,"ok");};
  const scope=()=>S.cScope&&S.cScope!=="global"?+S.cScope:"global";
  const reg=k=>S.cSet.registry.find(r=>r.key===k);
  el.querySelectorAll("[data-ssave]").forEach(b=>b.onclick=async()=>{const key=b.dataset.ssave,box=el.querySelector('[data-skey="'+key+'"] .csbox');
    try{await api("content_settings_set",{scope:scope(),key,mode:"set",value:cFieldRead(reg(key),box)});S.cOpenKey=key;await reload("Сохранено");}catch(e){toast(e.message==="bad_setting"?"Проверь значение: "+reg(key).label:errMsg(e),"err");}});
  el.querySelectorAll("[data-sinherit]").forEach(b=>b.onclick=async()=>{try{await api("content_settings_set",{scope:scope(),key:b.dataset.sinherit,mode:"inherit"});S.cOpenKey=b.dataset.sinherit;await reload();}catch(e){toast(errMsg(e),"err");}});
  el.querySelectorAll("[data-sown]").forEach(b=>b.onclick=async()=>{const key=b.dataset.sown,r=reg(key);if(key in (S.cSet.overrides[scope()]||{}))return;
    try{await api("content_settings_set",{scope:scope(),key,mode:"set",value:cEffective(r,{})});S.cOpenKey=key;await reload();}catch(e){toast(errMsg(e),"err");}});
  const bs=el.querySelector("#cbindsave");if(bs)bs.onclick=async()=>{const phone=el.querySelector("#cbindphone").value,acc=S.cSet.accounts.find(a=>String(a.id)===String(S.cScope));
    try{if(phone)await api("device_binding_set",{account_id:acc.id,phone_id:+phone,expected_handle:acc.expected_handle||String(acc.account_name).replace(/^@/,""),min_gap_minutes:acc.min_gap_minutes==null?0:acc.min_gap_minutes});else await api("device_binding_delete",{account_id:acc.id});await reload("Сохранено");}catch(e){toast(errMsg(e),"err");}};
  const bulk=el.querySelector("#cbulk");if(bulk)bulk.onclick=openBulk;
}
function openBulk(){const s=S.cSet,list=s.registry.filter(r=>r.scope!=="global");S.cBulk=S.cBulk||{ids:[],key:list[0].key,mode:"set"};const b=S.cBulk,rec=list.find(r=>r.key===b.key);
  const root=cModal('<div class="dw"><div class="dwhead"><div><small>НАСТРОЙКИ</small><h2>Несколько аккаунтов</h2></div><button id="cbc">✕</button></div><div class="dwscroll"><div class="dwsec"><label>Аккаунты</label>'+s.accounts.map(a=>'<label class="ccheckrow"><input type="checkbox" data-bacc="'+a.id+'"'+(b.ids.includes(a.id)?" checked":"")+'><b>'+esc(a.account_name)+'</b></label>').join("")+'</div><div class="dwsec"><label>Настройка</label><select id="cbkey">'+list.map(r=>'<option value="'+esc(r.key)+'"'+(r.key===b.key?" selected":"")+'>'+esc(r.group+": "+r.label)+'</option>').join("")+'</select>'+
    '<div class="cmode cmode2"><button class="'+(b.mode==="set"?"on":"")+'" data-bmode="set">Своё значение</button><button class="'+(b.mode==="inherit"?"on":"")+'" data-bmode="inherit">Как в общих</button></div>'+(b.mode==="set"?'<div class="csbox" id="cbbox">'+cField(rec,cEffective(rec,{}),"cbval",false)+'</div>':'')+'</div></div><div class="dwfoot"><button class="act" id="cbc2">Закрыть</button><button class="primary" id="cbgo">Применить</button></div></div>');
  root.querySelector("#cbc").onclick=root.querySelector("#cbc2").onclick=cModalClose;
  root.querySelectorAll("[data-bacc]").forEach(c=>c.onchange=()=>{const id=+c.dataset.bacc;b.ids=c.checked?[...b.ids,id]:b.ids.filter(x=>x!==id);});
  root.querySelector("#cbkey").onchange=e=>{b.key=e.target.value;openBulk();};
  root.querySelectorAll("[data-bmode]").forEach(x=>x.onclick=()=>{b.mode=x.dataset.bmode;openBulk();});
  root.querySelector("#cbgo").onclick=async()=>{if(!b.ids.length)return toast("Выбери аккаунты","err");
    try{await api("content_settings_bulk",{account_ids:b.ids,changes:[{key:b.key,mode:b.mode,...(b.mode==="set"?{value:cFieldRead(rec,root.querySelector("#cbbox"))}:{})}]});cModalClose();S.cSet=await api("content_settings_get");render();toast("Применено: "+b.ids.length,"ok");}catch(e){toast(e.message==="bad_setting"?"Проверь значение":errMsg(e),"err");}};
}

/* ---------- Тексты кнопок ---------- */
function vTexts(){const s=S.cSet,scope=S.cTextScope||"";
  if(!S.cTexts){setTimeout(async()=>{try{S.cTexts=(await api("content_button_texts_list",{account_id:scope||null})).texts;render();}catch(e){toast(errMsg(e),"err");S.cTexts=[];}},0);return'<div class="gate"><div><div class="spin"></div></div></div>';}
  const can=scope?true:s.can_edit_global;
  return '<div class="autobox"><b>Пул</b><select id="ctscope" class="cwide"><option value="">Общий</option>'+s.accounts.map(a=>'<option value="'+a.id+'"'+(String(a.id)===String(scope)?" selected":"")+'>'+esc(a.account_name)+'</option>').join("")+'</select>'+(scope?'<small class="hintline">Если здесь нет включённых текстов, берётся общий пул.</small>':'')+'</div>'+
    (can?'<div class="autobox"><b>Добавить</b><small class="hintline">По одному тексту на строку, до 80 символов. Повторы не добавятся.</small><textarea id="ctadd" rows="5" class="cwide"></textarea><button class="primary" id="ctgo">Добавить</button></div>':'')+
    '<div class="autobox"><b>Тексты · '+S.cTexts.length+'</b>'+(S.cTexts.map(t=>'<div class="autorow"><label class="ccheckrow"><input type="checkbox" data-ttog="'+t.id+'"'+(t.enabled?" checked":"")+(can?"":" disabled")+'><span>'+esc(t.text)+'</span></label><small class="cright">использован: '+esc(t.use_count)+'</small></div>').join("")||'<p class="hint">Пока пусто.</p>')+'</div>';
}
function bindTexts(el){
  const sc=el.querySelector("#ctscope");if(sc)sc.onchange=()=>{S.cTextScope=sc.value;S.cTexts=null;render();};
  const go=el.querySelector("#ctgo");if(go)go.onclick=async()=>{try{const d=await api("content_button_texts_add",{account_id:S.cTextScope||null,text:el.querySelector("#ctadd").value});S.cTexts=null;render();toast("Добавлено: "+d.added+", пропущено: "+d.skipped,"ok");}catch(e){toast(errMsg(e),"err");}};
  el.querySelectorAll("[data-ttog]").forEach(c=>c.onchange=async()=>{try{await api("content_button_text_update",{id:+c.dataset.ttog,enabled:c.checked});}catch(e){toast(errMsg(e),"err");c.checked=!c.checked;}});
}

function bindContent(el){const t=S.autoTab;if(t==="pool")bindPool(el);else if(t==="schedule")bindSchedule(el);else if(t==="settings")bindSettings(el);}
