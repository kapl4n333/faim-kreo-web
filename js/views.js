/* FTask — остальные разделы: Задачи, Трекер (вступления + воронка + мои аккаунты), Команда (люди + статистика), Админка. */

/* ---------- под-вкладки ---------- */
function bindSub(el){el.querySelectorAll("[data-sub]").forEach(b=>b.onclick=()=>{
  haptic();S[b.dataset.sub]=b.dataset.v;savePrefs();window.scrollTo(0,0);render();});}
const subnav=(key,items)=>'<div class="subnav">'+items.map(([v,l])=>'<button class="'+(S[key]===v?"on":"")+'" data-sub="'+key+'" data-v="'+v+'">'+l+'</button>').join("")+'</div>';

/* ---------- задачи ---------- */
function vTasks(){
  const open=S.tasks.filter(t=>t.status!=="done");
  const done=S.tasks.filter(t=>t.status==="done");
  const row=(t,i,arr)=>{
    const aids=Array.isArray(t.assignee_tg_ids)&&t.assignee_tg_ids.length?t.assignee_tg_ids:(t.assignee_tg_id?[t.assignee_tg_id]:[]);
    const who=aids.map(nameOf).filter(Boolean).join(", ");const by=nameOf(t.created_by_tg_id);
    return '<div class="row'+(t.pinned?" pin":"")+'"><div class="prio '+(t.priority||"")+'"></div><div class="b">'+
      '<div class="t">'+(t.pinned?"📌 ":"")+esc(t.title)+'</div>'+
      '<div class="m">'+(t.due_date?"до "+t.due_date+" · ":"")+
      (who?"кому: "+esc(who):"общая")+(by?" · от "+esc(by):"")+'</div></div>'+
      '<div class="tbtns">'+
      (t.status!=="done"&&admin()?'<button class="ico'+(t.pinned?" on":"")+'" data-pin="'+t.id+'" data-pv="'+(t.pinned?0:1)+'">📌</button>':"")+
      (t.status!=="done"&&i!=null&&arr&&i>0?'<button class="ico" data-up="'+t.id+'">▲</button>':"")+
      '<button class="pill '+(t.status==="done"?"done":"")+'" data-tt="'+t.id+'" data-ns="'+(t.status==="done"?"queued":"done")+'">'+
      (t.status==="done"?"↺":"✓ Готово")+'</button>'+
      ((admin()||t.created_by_tg_id===S.me.tg_id)?'<button class="ico" data-tdel="'+t.id+'">🗑</button>':"")+
      '</div></div>';
  };
  // черновик живёт в S.tDraft (обновляется на КАЖДЫЙ ввод, персистится) — переживает навигацию,
  // поллинг и закрытие аппы (ревью D)
  const dr=S.tDraft;const sel=v=>dr.prio===v?' selected':'';const asg=new Set(dr.asg||[]);
  const hasDraft=!!(dr.title||dr.due||dr.prio||asg.size);
  const form=S.tForm
    ? '<div class="panel"><input class="field" id="tT" placeholder="Новая задача — что сделать?" maxlength="200" style="margin-bottom:10px" value="'+esc(dr.title||"")+'">'+
      '<div class="two" style="margin-bottom:10px"><input class="field" id="tD" type="date" value="'+esc(dr.due||"")+'"><select class="field" id="tP"><option value="">Приоритет</option>'+
      '<option value="high"'+sel("high")+'>Высокий</option><option value="med"'+sel("med")+'>Средний</option><option value="low"'+sel("low")+'>Низкий</option></select></div>'+
      '<div style="font-size:12px;color:var(--hint);margin:0 2px 8px">Кому — можно несколько · выбрано <span id="asgCnt">'+asg.size+'</span></div>'+
      '<div class="rolechips" id="asgChips" style="margin-bottom:12px">'+
      S.members.map(m=>'<button class="rc'+(asg.has(m.tg_id)?" creative on":"")+'" data-asg="'+m.tg_id+'">'+esc(m.name||("@"+(m.username||m.tg_id)))+'</button>').join("")+'</div>'+
      '<div class="two"><button class="primary" id="tGo">Добавить задачу</button><button class="act" id="tHide">Скрыть</button></div>'+
      '<button class="act" id="tCancel" style="width:100%;margin-top:8px;color:var(--hint)">✕ Отменить и очистить</button></div>'
    : '<button class="act plus" id="tShow" style="width:100%;margin-bottom:12px">＋ Новая задача'+(hasDraft?' <span class="c">черновик</span>':'')+'</button>';
  return form+
    '<div class="hh">В работе <span class="c">'+open.length+'</span></div>'+
    (open.length?open.map((t,i)=>row(t,i,open)).join(""):'<div class="empty" style="padding:26px">Задач нет — спланируй неделю.</div>')+
    (done.length?'<div class="hh" id="tDoneHd" style="cursor:pointer">История <span class="c">'+done.length+'</span> '+(S.tDone?"▾":"▸")+'</div>'+
      (S.tDone?done.map(t=>row(t)).join(""):""):"");
}
const clearDraft=()=>{S.tDraft={title:"",due:"",prio:"",asg:[]};savePrefs();};
function bindTasks(el){
  const sh=el.querySelector("#tShow");if(sh)sh.onclick=()=>{S.tForm=true;render();const t=document.getElementById("tT");if(t)t.focus();};
  const hd=el.querySelector("#tHide");if(hd)hd.onclick=()=>{S.tForm=false;render();};
  const cn=el.querySelector("#tCancel");if(cn)cn.onclick=()=>{clearDraft();S.tForm=false;render();};
  const dh=el.querySelector("#tDoneHd");if(dh)dh.onclick=()=>{S.tDone=!S.tDone;render();};
  // черновик — на каждый ввод, без ожидания «Скрыть»
  const tT=el.querySelector("#tT"),tD=el.querySelector("#tD"),tP=el.querySelector("#tP");
  if(tT)tT.oninput=()=>{S.tDraft.title=tT.value;savePrefs();};
  if(tD)tD.onchange=()=>{S.tDraft.due=tD.value;savePrefs();};
  if(tP)tP.onchange=()=>{S.tDraft.prio=tP.value;savePrefs();};
  el.querySelectorAll("[data-asg]").forEach(b=>b.onclick=()=>{haptic();const id=+b.dataset.asg;
    const a=new Set(S.tDraft.asg||[]);
    if(a.has(id)){a.delete(id);b.classList.remove("creative","on");}else{a.add(id);b.classList.add("creative","on");}
    S.tDraft.asg=[...a];savePrefs();
    const c=el.querySelector("#asgCnt");if(c)c.textContent=a.size;});
  const go=el.querySelector("#tGo");if(go)go.onclick=async()=>{
    const title=(el.querySelector("#tT").value||"").trim();if(!title){toast("Напиши, что сделать","err");return;}
    try{const d=await api("create_task",{title,due_date:el.querySelector("#tD").value||null,
      priority:el.querySelector("#tP").value||null,assignee_tg_ids:(S.tDraft.asg||[]).slice()});
      S.tasks.unshift(d.task);clearDraft();S.tForm=false;S._sig=sigOf();render();toast("Задача добавлена","ok");}catch(e){toast(errMsg(e),"err");}};
  const patchTask=async(id,patch)=>{const d=await api("update_task",Object.assign({id},patch));
    const i=S.tasks.findIndex(t=>t.id===id);if(i>=0)S.tasks[i]=d.task;S._sig=sigOf();};
  el.querySelectorAll("[data-tt]").forEach(b=>b.onclick=async()=>{haptic();
    try{await patchTask(+b.dataset.tt,{status:b.dataset.ns});render();}catch(e){toast(errMsg(e),"err");}});
  el.querySelectorAll("[data-pin]").forEach(b=>b.onclick=async()=>{haptic();
    try{await patchTask(+b.dataset.pin,{pinned:b.dataset.pv==="1"});render();}catch(e){toast(errMsg(e),"err");}});
  el.querySelectorAll("[data-tdel]").forEach(b=>b.onclick=async()=>{
    if(!confirm("Удалить задачу?"))return;haptic("medium");
    try{await api("delete_task",{id:+b.dataset.tdel});S.tasks=S.tasks.filter(t=>t.id!==+b.dataset.tdel);S._sig=sigOf();render();}catch(e){toast(errMsg(e),"err");}});
  el.querySelectorAll("[data-up]").forEach(b=>b.onclick=async()=>{haptic();
    const id=+b.dataset.up,open=S.tasks.filter(t=>t.status!=="done"),i=open.findIndex(t=>t.id===id);
    if(i<=0)return;const above=open[i-1];
    try{await patchTask(id,{position:(above.position||0)-1});render();}catch(e){toast(errMsg(e),"err");}});
}

/* ---------- Трекер: [Вступления][Воронка][Мои аккаунты] ---------- */
async function loadTrack(force){
  if(S._trkLoading)return;
  if(S.track!==null&&!force)return;
  S._trkLoading=true;
  try{const d=await api("track_data");S.track=d.accounts||[];}
  catch(e){if(S.track===null)S.track=[];toast(errMsg(e),"err");}
  finally{S._trkLoading=false;render();}
}
async function loadFunnel(force){
  if(S._fnLoading)return;
  if(S.funnel!==null&&!force)return;
  S._fnLoading=true;
  try{const d=await api("funnel_data",{days:S.funnelDays});S.funnel=d.funnels||[];}
  catch(e){if(S.funnel===null)S.funnel=[];toast(errMsg(e),"err");}
  finally{S._fnLoading=false;render();}
}
function vKeitaroTab(){
  const sub=subnav("keitTab",[["joins","Вступления"],["funnel","Воронка"],["acc","Мои аккаунты"]]);
  const body=S.keitTab==="acc"?vAccounts():S.keitTab==="funnel"?vFunnel():vKeitaro();
  return sub+body;
}
function bindKeitaroTab(el){
  bindSub(el);
  if(S.keitTab==="acc"){bindAccounts(el);if(S.track===null)loadTrack();}
  else if(S.keitTab==="funnel"){bindFunnel(el);if(S.funnel===null)loadFunnel();}
  else{const r=el.querySelector("#kRef");if(r)r.onclick=()=>{haptic();loadTrack(true);};if(S.track===null)loadTrack();}
}
function vAccounts(){
  const mine=(S.track||[]).filter(a=>String(a.owner_tg_id)===String(S.me.tg_id));
  let h='<div class="accform"><select id="acP">'+
    PLAT.map(([k,l,ic])=>'<option value="'+k+'"'+(S.trkPlat===k?" selected":"")+'>'+ic+" "+l+'</option>').join("")+'</select>'+
    '<input class="field" id="acN" placeholder="Название аккаунта (напр. @ava.daily)" maxlength="80">'+
    '<button class="act plus" id="acAdd">Создать ссылку</button></div>';
  if(S.track===null)return h+'<div class="empty" style="padding:34px"><div class="spin"></div></div>';
  if(!mine.length)return h+'<div class="empty"><div class="e-ic">🔗</div><div class="e-h">Пока нет аккаунтов</div>'+
    'Добавь свой соц-аккаунт — бот выдаст под него отдельную трек-ссылку в канал. По ней увидишь, сколько людей пришло именно оттуда.</div>';
  h+='<div class="hh">Мои аккаунты <span class="c">'+mine.length+'</span> <button class="miniref" id="acRef" title="Обновить">↻</button></div>';
  h+='<div class="acctbl">'+mine.map(accRow).join("")+'</div>';
  h+='<div class="note" style="margin:12px 2px">Ссылку менять нельзя — только скопировать (тап) или удалить строку. Удаление отзывает ссылку и стирает её статистику.</div>';
  return h;
}
function accRow(a){
  let link;
  if(a.invite_link)link='<button class="linkchip" data-copy="'+esc(a.invite_link)+'">'+esc(a.invite_link.replace(/^https?:\/\//,""))+' <span class="cp">⧉</span></button>';
  else if(a.link_error)link='<span class="linkerr" title="'+esc(a.link_error)+'">⚠ ошибка создания</span>';
  else link='<span class="linkpend"><span class="dspin"></span> создаётся…</span>';
  return '<div class="accrow"><div class="acic">'+platIcon(a.platform)+'</div>'+
    '<div class="acmain"><div class="acnm">'+esc(a.account_name)+'</div>'+
    '<div class="acsub">'+platLabel(a.platform)+' · вступлений: <b>'+(a.joins||0)+'</b>'+
    (a.joins_24h?' <span class="d1">+'+a.joins_24h+' за 24ч</span>':"")+'</div>'+
    '<div class="aclink">'+link+'</div></div>'+
    '<button class="trash" data-acdel="'+a.id+'">🗑</button></div>';
}
function bindAccounts(el){
  const add=el.querySelector("#acAdd");if(add)add.onclick=addAccount;
  const p=el.querySelector("#acP");if(p)p.onchange=()=>{S.trkPlat=p.value;};
  const ref=el.querySelector("#acRef");if(ref)ref.onclick=()=>{haptic();loadTrack(true);};
  el.querySelectorAll("[data-copy]").forEach(b=>b.onclick=()=>copyLink(b.dataset.copy));
  el.querySelectorAll("[data-acdel]").forEach(b=>b.onclick=()=>delAccount(+b.dataset.acdel));
}
async function addAccount(){
  const p=document.getElementById("acP"),n=document.getElementById("acN");
  const platform=p.value,account_name=(n.value||"").trim();
  if(!account_name){toast("Впиши название аккаунта","err");return;}
  haptic();
  try{const d=await api("track_add",{platform,account_name});
    S.track=[d.account].concat(S.track||[]);n.value="";render();
    toast("Аккаунт добавлен — ссылка создаётся (~15с)","ok");}
  catch(e){toast(errMsg(e),"err");}
}
async function delAccount(id){
  const a=(S.track||[]).find(x=>x.id===id);
  if(!confirm("Удалить аккаунт "+((a&&a.account_name)||"")+"?\nСсылка перестанет работать, статистика по ней сотрётся."))return;
  haptic("medium");
  try{await api("track_delete",{id});S.track=(S.track||[]).filter(x=>x.id!==id);render();toast("Удалено","ok");}
  catch(e){toast(errMsg(e),"err");}
}
function copyLink(u){
  const done=()=>{haptic();notify();toast("Ссылка скопирована","ok");};
  try{if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(u).then(done,()=>fallbackCopy(u,done));
    else fallbackCopy(u,done);}
  catch(e){fallbackCopy(u,done);}
}
function fallbackCopy(u,done){
  const t=document.createElement("textarea");t.value=u;t.style.position="fixed";t.style.opacity="0";
  document.body.appendChild(t);t.focus();t.select();
  try{document.execCommand("copy");done();}catch(e){toast("Не смог скопировать","err");}
  t.remove();
}
function vKeitaro(){
  const G=[["person","По людям"],["account","По аккаунтам"],["platform","По соцсетям"]];
  let h='<div class="subnav sub2">'+G.map(([k,l])=>'<button class="'+(S.trkGroup===k?"on":"")+'" data-sub="trkGroup" data-v="'+k+'">'+l+'</button>').join("")+
    '<button class="miniref" id="kRef" title="Обновить">↻</button></div>';
  if(S.track===null)return h+'<div class="empty" style="padding:34px"><div class="spin"></div></div>';
  const accs=S.track||[];
  const totAll=accs.reduce((s,a)=>s+(a.joins||0),0);
  const tot24=accs.reduce((s,a)=>s+(a.joins_24h||0),0);
  h+='<div class="sgrid two2"><div class="stat"><div class="n">'+totAll+'</div><div class="l">всего вступлений</div></div>'+
     '<div class="stat o"><div class="n">'+tot24+'</div><div class="l">за 24 часа</div></div>'+
     '<div class="stat"><div class="n">'+accs.length+'</div><div class="l">ссылок</div></div></div>';
  if(!accs.length)return h+'<div class="empty"><div class="e-ic">📊</div><div class="e-h">Данных пока нет</div>'+
    'Заведи аккаунты в «Мои аккаунты» и раздай трек-ссылки по соцсетям.</div>';
  let rows=[];
  if(S.trkGroup==="account"){
    rows=accs.map(a=>({label:platIcon(a.platform)+" "+a.account_name,sub:(nameOf(a.owner_tg_id)||"")+" · "+platLabel(a.platform),n:a.joins||0,d1:a.joins_24h||0}));
  }else if(S.trkGroup==="platform"){
    const m={};accs.forEach(a=>{const g=m[a.platform]=m[a.platform]||{n:0,d1:0};g.n+=a.joins||0;g.d1+=a.joins_24h||0;});
    rows=Object.entries(m).map(([k,v])=>({label:platIcon(k)+" "+platLabel(k),sub:"",n:v.n,d1:v.d1}));
  }else{
    const m={};accs.forEach(a=>{const g=m[a.owner_tg_id]=m[a.owner_tg_id]||{n:0,d1:0};g.n+=a.joins||0;g.d1+=a.joins_24h||0;});
    rows=Object.entries(m).map(([k,v])=>({label:nameOf(+k)||("id"+k),sub:"",n:v.n,d1:v.d1}));
  }
  rows.sort((a,b)=>b.n-a.n);
  const max=Math.max(1,...rows.map(r=>r.n));
  h+='<div class="hh">'+({person:"По людям",account:"По аккаунтам",platform:"По соцсетям"}[S.trkGroup])+'</div>';
  h+=rows.map(r=>'<div class="lead"><div class="nm">'+esc(r.label)+(r.sub?'<span class="ls">'+esc(r.sub)+'</span>':"")+'</div>'+
    '<div class="track"><div class="bar" style="width:'+Math.round(r.n/max*100)+'%"></div></div>'+
    '<div class="num">'+r.n+(r.d1?' <span class="d1">+'+r.d1+'</span>':"")+'</div></div>').join("");
  return h;
}

/* ---------- Трекер → Воронка: источник → вступление → покупка PPV ---------- */
const _fstat=(n,l)=>'<div class="stat"><div class="n">'+esc(String(n))+'</div><div class="l">'+esc(l)+'</div></div>';
const _usd=v=>{const x=Number(v||0);return (Math.round(x*100)/100).toString();};
function vFunnel(){
  const D=[[7,"7д"],[30,"30д"],[90,"90д"]];
  let h='<div class="subnav sub2">'+D.map(([d,l])=>'<button class="'+(S.funnelDays===d?"on":"")+'" data-fnd="'+d+'">'+l+'</button>').join("")+
    '<button class="miniref" id="fnRef" title="Обновить">↻</button></div>';
  if(S.funnel===null)return h+'<div class="empty" style="padding:34px"><div class="spin"></div></div>';
  if(!S.funnel.length)return h+'<div class="empty"><div class="e-ic">🫥</div><div class="e-h">Воронок пока нет</div>'+
    'Заведи трек-ссылки в «Мои аккаунты» и подключи импорт продаж — тут появится путь от источника до покупки.</div>';
  for(const f of S.funnel){
    const r=f.report||{};
    const srcs=f.sources||[];
    const attrBuyers=srcs.reduce((s,x)=>s+(+x.buyers||0),0);
    h+='<div class="hh">'+esc(f.name||"Воронка")+'</div>';
    h+='<div class="sgrid two2">'+
      _fstat(r.acquisition_unique_users||0,"пришло за период")+
      _fstat(r.buyers||0,"покупателей")+
      _fstat("★"+(r.gross_stars||0),"звёзд (оборот)")+
      _fstat("$"+_usd(r.usd_estimate),"оценка, не прибыль")+
      _fstat((r.net_observed_movement>0?"+":"")+(r.net_observed_movement||0),"чистое движение")+
      _fstat(r.churn_count||0,"вышло (отписки)")+'</div>';
    h+='<div class="note" style="margin:6px 2px">'+
      (r.last_successful_pull_at?"Продажи обновлены "+ago(r.last_successful_pull_at)+" назад":
        "⚠ Импорт продаж ещё не запускался — цифры покупок появятся после первого прогона.")+'</div>';
    h+='<div class="hh">Источники <span class="c">'+srcs.length+'</span></div>';
    if(!srcs.length){h+='<div class="empty">Пока никто из отслеживаемых источников не привёл покупателя.</div>';}
    else{
      const max=Math.max(1,...srcs.map(s=>+s.acquired||0));
      h+=srcs.map(s=>{
        const label=s.source_account?(platIcon(s.source_platform)+" "+s.source_account):"❔ источник неизвестен";
        return '<div class="lead"><div class="nm">'+esc(label)+
          '<span class="ls">привёл '+(s.acquired||0)+' · купили '+(s.buyers||0)+' · конв '+(s.conv_pct||0)+'% · $'+_usd(s.usd_estimate_total)+'</span></div>'+
          '<div class="track"><div class="bar" style="width:'+Math.round((+s.acquired||0)/max*100)+'%"></div></div>'+
          '<div class="num">'+(s.buyers||0)+'/'+(s.acquired||0)+'</div></div>';
      }).join("");
      h+='<div class="note" style="margin:8px 2px">Атрибутировано покупателей: <b>'+attrBuyers+'</b> из '+(r.buyers||0)+
        ' — остальные пришли до трекинга или органикой. Выручка — оборот по звёздам, <b>не прибыль</b>. '+
        'Привязка по аккаунту-источнику, не по конкретному рилсу.</div>';
    }
    const geo=r.geo_rows;
    if(geo&&Object.keys(geo).length){
      const items=Object.entries(geo).sort((a,b)=>b[1]-a[1]);
      h+='<div class="hh">Страны покупателей</div>'+
        '<div class="note" style="margin:2px">'+items.map(([cc,n])=>esc(cc)+": "+n).join(" · ")+'</div>';
    }
  }
  return h;
}
function bindFunnel(el){
  el.querySelectorAll("[data-fnd]").forEach(b=>b.onclick=()=>{haptic();S.funnelDays=+b.dataset.fnd;S.funnel=null;render();loadFunnel(true);});
  const r=el.querySelector("#fnRef");if(r)r.onclick=()=>{haptic();loadFunnel(true);};
}

/* ---------- Команда: [Люди][Статистика] ---------- */
function vTeamTab(){return subnav("teamTab",[["people","Люди"],["stats","Статистика"]])+(S.teamTab==="stats"?vStats():vMembers());}
function bindTeamTab(el){bindSub(el);if(S.teamTab!=="stats")bindMembers(el);}
function vStats(){
  const st=S.stats||{byStatus:{queued:0,in_progress:0,done:0},posted:0,deferred:0,byAuthor:[],byPoster:[],avgTurnaroundHours:null,avgPostLagHours:null,total:0};
  const maxA=Math.max(1,...st.byAuthor.map(a=>a.submitted));
  const maxP=Math.max(1,...(st.byPoster||[]).map(a=>a.posted));
  return '<div class="sgrid">'+
    '<div class="stat q"><div class="n">'+st.byStatus.queued+'</div><div class="l">свободные</div></div>'+
    '<div class="stat p"><div class="n">'+st.byStatus.in_progress+'</div><div class="l">в работе</div></div>'+
    '<div class="stat d"><div class="n">'+st.byStatus.done+'</div><div class="l">готово</div></div>'+
    '<div class="stat o"><div class="n">'+(st.posted||0)+'</div><div class="l">опубликовано</div></div></div>'+
    '<div class="sgrid two2"><div class="stat"><div class="n">'+st.total+'</div><div class="l">всего крео'+(st.deferred?' · '+st.deferred+' отлож.':'')+'</div></div>'+
    '<div class="stat"><div class="n">'+(st.avgTurnaroundHours==null?"—":st.avgTurnaroundHours)+'</div><div class="l">ч до готово</div></div>'+
    '<div class="stat"><div class="n">'+(st.avgPostLagHours==null?"—":st.avgPostLagHours)+'</div><div class="l">ч до публикации</div></div></div>'+
    '<div class="hh">Кто сколько принёс идей</div>'+
    (st.byAuthor.length?st.byAuthor.map(a=>'<div class="lead"><div class="nm">'+esc(a.author)+'</div>'+
      '<div class="track"><div class="bar" style="width:'+Math.round(a.submitted/maxA*100)+'%"></div></div>'+
      '<div class="num">'+a.done+'/'+a.submitted+'</div></div>').join(""):'<div class="empty">Пока нет данных</div>')+
    '<div class="hh">Кто сколько опубликовал</div>'+
    ((st.byPoster||[]).length?st.byPoster.map(a=>'<div class="lead"><div class="nm">'+esc(a.poster)+'</div>'+
      '<div class="track"><div class="bar o" style="width:'+Math.round(a.posted/maxP*100)+'%"></div></div>'+
      '<div class="num">'+a.posted+'</div></div>').join(""):'<div class="empty" style="padding:24px">Ещё ничего не опубликовано.</div>');
}
function roleLabel(r){return r==="admin"?"админ":r==="creative"?"креатив":r==="uploader"?"залив":r;}
function vMembers(){
  return '<div class="hh">Команда <span class="c">'+S.members.length+'</span></div>'+
    S.members.map(m=>{
      const rs=(m.roles||[]);
      const chips=rs.length?rs.map(r=>'<span class="rc '+r+' on">'+roleLabel(r)+'</span>').join(""):'<span class="rc">без роли</span>';
      return '<div class="row"><div class="av" style="width:38px;height:38px;background:'+hue(m.username||m.tg_id)+'">'+initial(m.name||m.username)+'</div>'+
      '<div class="b"><div class="t">'+esc(m.name||"—")+'</div><div class="m">'+(m.username?"@"+esc(m.username):"id "+m.tg_id)+'</div></div>'+
      '<div class="rolechips">'+chips+'</div></div>';
    }).join("")+
    (admin()?'<div class="hh">Добавить</div><div class="panel"><input class="field" id="mI" placeholder="Telegram ID" inputmode="numeric">'+
      '<input class="field" id="mN" placeholder="Имя (необязательно)"><button class="primary" id="mGo">Добавить участника</button>'+
      '<div class="note" style="margin-top:8px">Роли выдаются в «Админке».</div></div>':
      '<div class="hh">Роли</div><div class="panel"><div class="note">Роли и доступ настраивает админ.</div></div>');
}
function bindMembers(el){
  const go=el.querySelector("#mGo");if(go)go.onclick=async()=>{const id=parseInt(el.querySelector("#mI").value,10);if(!id)return;
    try{const d=await api("add_member",{tg_id:id,name:el.querySelector("#mN").value.trim()||null});
      if(!S.members.find(m=>m.tg_id===id))S.members.push(d.member);else S.members[S.members.findIndex(m=>m.tg_id===id)]=d.member;
      S._sig=sigOf();render();toast("Участник добавлен","ok");}catch(e){toast(errMsg(e),"err");}};
}

/* ---------- админка ---------- */
async function loadAdmin(){
  try{const d=await api("admin_data");
    S.admin={users:d.users||[],requests:d.requests||[],workflows:d.workflows||[]};render();}
  catch(e){toast(errMsg(e),"err");}
}
const ATABS=[["access","Доступ"],["requests","Заявки"],["workflows","Воркфлоу"],["roles","Роли"],["niches","Ниши"]];
function vAdmin(){
  const reqN=(S.admin&&S.admin.requests.length)||0;
  let h='<div class="subnav">'+ATABS.map(([k,l])=>
    '<button class="'+(S.adminTab===k?"on":"")+'" data-at="'+k+'">'+l+
    (k==="requests"&&reqN?'<span class="b">'+reqN+'</span>':"")+'</button>').join("")+'</div>';
  if(S.adminTab==="roles")return h+vRoles();
  if(S.adminTab==="niches")return h+vNichesAdmin();
  if(!S.admin)return h+'<div class="empty" style="padding:40px"><div class="spin"></div></div>';
  if(S.adminTab==="requests")return h+vReq();
  if(S.adminTab==="workflows")return h+vWf();
  return h+vAccess();
}
function vNichesAdmin(){
  const used={};S.creos.forEach(c=>(c.niche_ids||[]).forEach(id=>used[id]=(used[id]||0)+1));
  return '<div class="hh">Ниши <span class="c">'+S.niches.length+'</span></div>'+
    (S.niches.length?S.niches.map(n=>'<div class="row"><div class="b"><div class="t">'+esc(n.name)+'</div><div class="m">крео: '+(used[n.id]||0)+(n.created_by_tg_id?' · создал '+esc(nameOf(n.created_by_tg_id)||""):"")+'</div></div>'+
      '<div class="tbtns"><button class="ico" data-nren="'+n.id+'">✎</button><button class="ico" data-ndel="'+n.id+'">🗑</button></div></div>').join("")
      :'<div class="empty" style="padding:26px">Ниш пока нет — создаются из карточки крео или формы загрузки.</div>')+
    '<div class="panel" style="margin-top:12px"><button class="act plus" id="nNew" style="width:100%">＋ Новая ниша</button>'+
    '<div class="note" style="margin-top:8px">Удаление ниши снимает её с крео, сами крео остаются. Переименовать может любой из карточки.</div></div>';
}
function vAccess(){
  const us=S.admin.users;
  const tog=(u,cls,on,cmd,field,label)=>'<button class="'+cls+(on?" on":" off")+'" data-uc="'+cmd+'" data-ut="'+u.tg_id+'" data-uf="'+field+'" data-uon="'+(on?0:1)+'">'+label+'</button>';
  let h=us.map(u=>{
    const canGen=!u.no_gen,canUniq=!u.no_uniq;
    const own=u.is_owner;
    return '<div class="row"><div class="av" style="width:36px;height:36px;background:'+hue(u.username||u.tg_id)+'">'+initial(u.name||u.username)+'</div>'+
      '<div class="b"><div class="t">'+esc(u.name||"—")+(own?" 👑":"")+'</div>'+
      '<div class="m">'+(u.username?"@"+esc(u.username):"id "+u.tg_id)+'</div></div>'+
      '<div class="utog">'+
      (own?'<span class="tag">владелец</span>':
        tog(u,"acc",u.approved,"__acc","approved","доступ")+tog(u,"adm",u.is_admin,"set_admin","is_admin","админ"))+
      tog(u,"",canGen,"set_gen","no_gen","ген")+
      tog(u,"",canUniq,"set_uniq","no_uniq","уник")+
      tog(u,"",u.agent_ok,"set_agent","agent_ok","агент")+
      '</div></div>';
  }).join("");
  h+='<div class="hh">Добавить по id</div><div class="panel">'+
     '<input class="field" id="aI" placeholder="Telegram ID" inputmode="numeric">'+
     '<input class="field" id="aN" placeholder="Имя (необязательно)">'+
     '<button class="primary" id="aGo">Дать доступ</button>'+
     '<div class="note" style="margin-top:8px">Команды применяет бот (~10с). 👑 владельца изменить нельзя; «админ» назначает только владелец.</div></div>';
  return h;
}
function vReq(){
  const rs=S.admin.requests;
  if(!rs.length)return '<div class="empty" style="padding:36px">Заявок нет.</div>';
  return rs.map(r=>'<div class="row"><div class="av" style="width:36px;height:36px;background:'+hue(r.username||r.tg_id)+'">'+initial(r.name||r.username)+'</div>'+
    '<div class="b"><div class="t">'+esc(r.name||"—")+'</div><div class="m">'+(r.username?"@"+esc(r.username):"id "+r.tg_id)+'</div></div>'+
    '<div class="tbtns"><button class="pill done" data-rq="approve" data-rid="'+r.tg_id+'">✓ Одобрить</button>'+
    '<button class="ico" data-rq="deny" data-rid="'+r.tg_id+'">✕</button></div></div>').join("");
}
function vWf(){
  const wfs=S.admin.workflows;
  if(!wfs.length)return '<div class="empty" style="padding:36px">ВФ подтянутся из бота через несколько секунд — обнови.</div>';
  return wfs.map(w=>{
    const inst=w.instance_type==="plus";
    return '<div class="row"><div class="b"><div class="t">'+esc(w.title||w.key)+'</div>'+
      '<div class="m">'+esc(w.key)+' · '+(inst?"48GB plus":"24GB")+'</div></div>'+
      '<div class="tbtns">'+
      '<button class="ico" data-wfinst="'+esc(w.key)+'" data-inston="'+(inst?0:1)+'" title="VRAM">'+(inst?"48":"24")+'</button>'+
      '<button class="pill'+(w.enabled?" done":"")+'" data-wf="'+esc(w.key)+'" data-wfen="'+(w.enabled?0:1)+'">'+(w.enabled?"✓ вкл":"выкл")+'</button>'+
      '</div></div>';
  }).join("")+'<div class="note" style="margin:14px 2px">Вкл/выкл прячет ВФ у команды. Новые ВФ (с node_id) добавляются в код. Правка названий/дефолтов — следующим шагом.</div>';
}
function vRoles(){
  const ALL=["admin","creative","uploader"];
  return '<div class="hh">Роли FTask</div>'+S.members.map(m=>{
    const rs=(m.roles||[]);
    return '<div class="row"><div class="av" style="width:36px;height:36px;background:'+hue(m.username||m.tg_id)+'">'+initial(m.name||m.username)+'</div>'+
      '<div class="b"><div class="t">'+esc(m.name||"—")+'</div><div class="m">'+(m.username?"@"+esc(m.username):"id "+m.tg_id)+'</div>'+
      '<div class="rolechips" style="margin-top:8px">'+ALL.map(r=>'<button class="rc '+r+(rs.includes(r)?" on":"")+'" data-role-tg="'+m.tg_id+'" data-role="'+r+'">'+roleLabel(r)+'</button>').join("")+'</div></div>'+
      (m.tg_id!==S.me.tg_id?'<button class="ico" data-mdel="'+m.tg_id+'">🗑</button>':"")+'</div>';
  }).join("");
}
async function adminCmd(cmd,payload,apply){
  haptic();
  try{await api("admin_cmd",{cmd,payload});if(apply)apply();render();toast("Отправлено боту (~10с)","ok");}
  catch(e){toast(errMsg(e),"err");}
}
function bindAdmin(el){
  el.querySelectorAll("[data-at]").forEach(b=>b.onclick=()=>{S.adminTab=b.dataset.at;savePrefs();window.scrollTo(0,0);render();});
  el.querySelectorAll("[data-uc]").forEach(b=>b.onclick=()=>{
    const tgid=+b.dataset.ut,cmd=b.dataset.uc,field=b.dataset.uf,on=b.dataset.uon==="1";
    const u=S.admin.users.find(x=>x.tg_id===tgid);if(!u)return;
    if(cmd==="__acc"){adminCmd(on?"add_user":"remove_user",{tg_id:tgid},()=>{u.approved=on;});return;}
    adminCmd(cmd,{tg_id:tgid,on},()=>{
      if(field==="no_gen")u.no_gen=!on;else if(field==="no_uniq")u.no_uniq=!on;
      else if(field==="is_admin")u.is_admin=on;else if(field==="agent_ok")u.agent_ok=on;});
  });
  const aGo=el.querySelector("#aGo");if(aGo)aGo.onclick=()=>{const id=parseInt(el.querySelector("#aI").value,10);if(!id)return;
    adminCmd("add_user",{tg_id:id,name:el.querySelector("#aN").value.trim()||null},()=>{
      if(!S.admin.users.find(u=>u.tg_id===id))S.admin.users.push({tg_id:id,name:el.querySelector("#aN").value.trim()||null,approved:true});});};
  el.querySelectorAll("[data-rq]").forEach(b=>b.onclick=()=>{
    const tgid=+b.dataset.rid,act=b.dataset.rq;
    adminCmd(act,{tg_id:tgid},()=>{S.admin.requests=S.admin.requests.filter(r=>r.tg_id!==tgid);});});
  el.querySelectorAll("[data-wf]").forEach(b=>b.onclick=async()=>{haptic();
    const key=b.dataset.wf,en=b.dataset.wfen==="1";const w=S.admin.workflows.find(x=>x.key===key);
    try{const d=await api("set_workflow",{key,enabled:en});if(w)Object.assign(w,d.workflow);render();toast(en?"ВФ включён":"ВФ выключен","ok");}catch(e){toast(errMsg(e),"err");}});
  el.querySelectorAll("[data-wfinst]").forEach(b=>b.onclick=async()=>{haptic();
    const key=b.dataset.wfinst,on=b.dataset.inston==="1";const w=S.admin.workflows.find(x=>x.key===key);
    try{const d=await api("set_workflow",{key,instance_type:on?"plus":null});if(w)Object.assign(w,d.workflow);render();toast(on?"48GB":"24GB","ok");}catch(e){toast(errMsg(e),"err");}});
  el.querySelectorAll("[data-role]").forEach(b=>b.onclick=async()=>{haptic();
    const tgid=+b.dataset.roleTg,role=b.dataset.role;
    const m=S.members.find(x=>x.tg_id===tgid);const rs=new Set(m.roles||[]);
    if(rs.has(role))rs.delete(role);else rs.add(role);
    try{const d=await api("set_member_roles",{tg_id:tgid,roles:[...rs]});m.roles=d.member.roles;
      if(tgid===S.me.tg_id){S.me.roles=d.member.roles;header();}S._sig=sigOf();render();}
    catch(e){toast(errMsg(e),"err");}});
  el.querySelectorAll("[data-mdel]").forEach(b=>b.onclick=async()=>{
    const id=+b.dataset.mdel;if(!confirm("Убрать участника из команды?"))return;haptic("medium");
    try{await api("remove_member",{tg_id:id});S.members=S.members.filter(m=>m.tg_id!==id);S._sig=sigOf();render();toast("Участник убран","ok");}catch(e){toast(errMsg(e),"err");}});
  // ниши
  const nn=el.querySelector("#nNew");if(nn)nn.onclick=async()=>{await newNiche();render();};
  el.querySelectorAll("[data-nren]").forEach(b=>b.onclick=()=>renameNiche(+b.dataset.nren));
  el.querySelectorAll("[data-ndel]").forEach(b=>b.onclick=async()=>{const id=+b.dataset.ndel;const n=nicheOf(id);
    if(!confirm("Удалить нишу «"+((n&&n.name)||id)+"»? Крео останутся, ниша снимется с них."))return;haptic("medium");
    try{await api("delete_niche",{id});S.niches=S.niches.filter(x=>x.id!==id);S.creos.forEach(c=>{c.niche_ids=(c.niche_ids||[]).filter(x=>x!==id);});
      if(String(S.niche)===String(id))S.niche="";S._sig=sigOf();render();toast("Ниша удалена","ok");}catch(e){toast(errMsg(e),"err");}});
}
