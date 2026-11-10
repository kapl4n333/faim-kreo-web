/* «Автозалить» из Каталога: готовые креативы → тип, аккаунты, время → сразу в очередь Автозалива.
   Под капотом те же content_item_add + content_assign + content_schedule_update, что и в Пуле. */
const AP_TYPES={reel:"Reels",story:"История",carousel:"Карусель"};
const AP_OUT={created:"поставлено",duplicate:"уже было на аккаунте — не ставлю повтор",bad_item:"материал не активен",bad_type:"тип не подходит аккаунту",bad_account:"аккаунт недоступен",no_phone:"у аккаунта нет телефона",forbidden:"нет прав"};

/** Последний готовый файл креатива: один Reels или одна история. */
function apFileOf(c){const p=c&&c.result_paths||[];for(let i=p.length-1;i>=0;i--)if(/\.(mp4|jpe?g|png)$/i.test(p[i]))return {creo_id:c.id,path:p[i],video:/\.mp4$/i.test(p[i])};return null;}
/** Карусель = одна карточка FTask с несколькими фото в результатах, в их порядке. */
function apPhotosOf(c){return (c&&c.result_paths||[]).filter(p=>/\.(jpe?g|png)$/i.test(p)).map(p=>({creo_id:c.id,path:p,video:false}));}
/** Последний выбранный кластер: только удобство, без хранилища просто не помним. */
const AP_CLUSTER_KEY="ftask.ap.cluster";
function apLastCluster(){try{return Number(localStorage.getItem(AP_CLUSTER_KEY))||null;}catch(e){return null;}}
function apRememberCluster(id){try{localStorage.setItem(AP_CLUSTER_KEY,String(id));}catch(e){}}
async function apLoadClusters(){const a=S.ap;if(!a||a.clusters)return;
  try{a.clusters=(await api("content_cluster_list")).clusters.filter(c=>(c.platform||"instagram")==="instagram");}catch(e){a.clusters=[];a.clusterError=errMsg(e);}
  if(!a.clusters.some(c=>c.id===a.cluster))a.cluster=(a.clusters.find(c=>c.id===apLastCluster())||a.clusters[0]||{}).id||null;
  if(S.ap===a)apRender();}

async function openAutopost(creoIds){
  const creos=creoIds.map(id=>S.creos.find(c=>c.id===+id)).filter(Boolean);
  const files=creos.map(apFileOf).filter(Boolean);
  const albums=creos.map(apPhotosOf).filter(g=>g.length>=2);
  if(!files.length&&!albums.length)return toast("У выбранного нет готового файла","err");
  let accounts=[];try{accounts=(await api("content_accounts")).accounts.filter(a=>a.has_phone);}catch(e){return toast(errMsg(e),"err");}
  // Без аккаунтов с телефоном остаётся только «В кластер…»: кластер раздаст, когда телефоны появятся.
  S.ap={files,albums,type:albums.length&&albums.length===creos.length?"carousel":files.every(f=>f.video)?"reel":"story",accounts,picked:new Set(accounts.map(a=>a.id)),when:"auto",local:"",busy:false,log:[],
    target:accounts.length?"accounts":"cluster",clusters:null,cluster:apLastCluster()};
  apRender();
  if(S.ap.target==="cluster")apLoadClusters();
}
function apClose(){document.getElementById("apmodal")?.remove();S.ap=null;}
function apRender(){const a=S.ap;if(!a)return;let root=document.getElementById("apmodal");
  if(!root){root=document.createElement("div");root.id="apmodal";root.className="dmodal";document.body.appendChild(root);}
  const n=a.files.length,types=Object.keys(AP_TYPES).filter(t=>t!=="carousel"||a.albums.length).filter(t=>t!=="reel"||(n&&a.files.every(f=>f.video))).filter(t=>t!=="story"||n);
  if(!types.includes(a.type))a.type=types[0];
  const what=a.type==="carousel"?a.albums.map(g=>"карусель из "+g.length+" фото").join(", ")+" на каждый аккаунт":"по одному: "+n+" "+(a.type==="story"?"истор.":"Reels")+" на каждый аккаунт";
  root.innerHTML='<div class="dw"><div class="dwhead"><div><small>АВТОЗАЛИВ</small><h2>Автозалить: '+(a.type==="carousel"?a.albums.length:n)+' шт.</h2></div><button id="apx">✕</button></div><div class="dwscroll">'+
    '<div class="dwsec"><label>Как выложить</label><div class="modegrid">'+types.map(t=>'<button class="'+(a.type===t?"on":"")+'" data-aptype="'+t+'"><b>'+AP_TYPES[t]+'</b></button>').join("")+'</div><p class="hint">'+esc(what)+'</p></div>'+
    '<div class="dwsec"><label>Куда</label><div class="modegrid"><button class="'+(a.target==="accounts"?"on":"")+'" data-aptarget="accounts"'+(a.accounts.length?"":" disabled")+'><b>На аккаунты</b><small>'+(a.accounts.length?"сразу на выбранные аккаунты":"нет аккаунтов с телефоном")+'</small></button><button class="'+(a.target==="cluster"?"on":"")+'" data-aptarget="cluster"><b>В кластер…</b><small>в общий пул, кластер раздаст сам</small></button></div></div>'+
    (a.target==="cluster"?apClusterHtml(a):
    '<div class="dwsec"><label>На какие аккаунты</label>'+a.accounts.map(x=>'<label class="ccheckrow"><input type="checkbox" data-apacc="'+x.id+'"'+(a.picked.has(x.id)?" checked":"")+'><b>@'+esc(String(x.account_name).replace(/^@/,""))+'</b> <small>'+esc(x.phone_name||"")+'</small></label>').join("")+'</div>'+
    '<div class="dwsec"><label>Когда</label><div class="modegrid"><button class="'+(a.when==="auto"?"on":"")+'" data-apwhen="auto"><b>Сам выберет</b><small>время и подпись подберёт планировщик</small></button><button class="'+(a.when==="exact"?"on":"")+'" data-apwhen="exact"><b>Точное время</b><small>подпись всё равно напишет планировщик</small></button></div>'+
    (a.when==="exact"?'<input id="aptime" type="datetime-local" value="'+esc(a.local)+'"><p class="hint">Время в поясе аккаунта (по умолчанию Варшава).</p>':'')+'</div>')+
    (a.log.length?'<div class="dwsec">'+a.log.map(l=>'<p class="hint">'+esc(l)+'</p>').join("")+'</div>':'')+
    '</div><div class="dwfoot"><button class="act" id="apx2">'+(a.done?"Закрыть":"Отмена")+'</button>'+(a.done?'':'<button class="primary" id="apgo"'+(a.busy||(a.target==="cluster"?!a.cluster:!a.picked.size)?" disabled":"")+'>'+(a.target==="cluster"?"В кластер":"Автозалить")+'</button>')+'</div></div>';
  root.querySelector("#apx").onclick=root.querySelector("#apx2").onclick=()=>{if(!a.busy)apClose();};
  root.querySelectorAll("[data-aptype]").forEach(b=>b.onclick=()=>{a.type=b.dataset.aptype;apRender();});
  root.querySelectorAll("[data-apwhen]").forEach(b=>b.onclick=()=>{a.when=b.dataset.apwhen;apRender();});
  root.querySelectorAll("[data-aptarget]").forEach(b=>b.onclick=()=>{a.target=b.dataset.aptarget;apRender();if(a.target==="cluster")apLoadClusters();});
  const cs=root.querySelector("#apcluster");if(cs)cs.onchange=()=>{a.cluster=Number(cs.value)||null;apRender();};
  root.querySelectorAll("[data-apacc]").forEach(c=>c.onchange=()=>{const id=+c.dataset.apacc;if(c.checked)a.picked.add(id);else a.picked.delete(id);apRender();});
  const t=root.querySelector("#aptime");if(t)t.onchange=()=>{a.local=t.value;};
  const go=root.querySelector("#apgo");if(go)go.onclick=apSubmit;
}
function apClusterHtml(a){
  if(!a.clusters)return '<div class="dwsec"><label>Кластер</label><p class="hint">Загружаю кластеры…</p></div>';
  if(!a.clusters.length)return '<div class="dwsec"><label>Кластер</label><p class="hint">'+esc(a.clusterError||"Кластеров нет. Создай кластер в «Автозалив → Кластеры».")+'</p></div>';
  const c=a.clusters.find(x=>x.id===a.cluster);
  return '<div class="dwsec"><label>Кластер</label><select id="apcluster">'+a.clusters.map(x=>'<option value="'+x.id+'"'+(x.id===a.cluster?" selected":"")+'>'+esc(x.name)+' · аккаунтов '+x.accounts+(x.paused?" · пауза":"")+'</option>').join("")+'</select>'+
    '<p class="hint">Материал попадёт в пул кластера. Каждый аккаунт кластера получит его в своём порядке, время и подпись выберет планировщик.'+(c&&c.paused?" Кластер на паузе: раздача начнётся после снятия паузы.":"")+'</p></div>';
}
async function apSubmitCluster(){const a=S.ap;
  const c=(a.clusters||[]).find(x=>x.id===a.cluster);if(!c)return toast("Выбери кластер","err");
  a.busy=true;a.log=["Добавляю в кластер…"];apRender();
  const key=crypto.randomUUID?crypto.randomUUID():Date.now()+"-"+Math.random();
  try{
    const groups=a.type==="carousel"?a.albums:a.files.map(f=>[f]);
    const itemIds=[];
    for(const[n,g]of groups.entries()){const r=await api("content_item_add",{content_type:a.type,title:"",idempotency_key:key+":"+n,files:g.map(f=>({creo_id:f.creo_id,path:f.path}))});itemIds.push(r.item.id);}
    await api("content_cluster_items",{id:c.id,add:itemIds});
    apRememberCluster(c.id);
    a.log=["Готово: "+itemIds.length+" в пуле «"+c.name+"». Раздача по аккаунтам пойдёт сама, смотри «Автозалив → Кластеры»."];
    a.done=true;toast("В кластере «"+c.name+"»: "+itemIds.length,"ok");
    S.deliveryPick=[];
  }catch(e){a.log=["Ошибка: "+errMsg(e)];}
  a.busy=false;apRender();
}
async function apSubmit(){const a=S.ap;if(!a||a.busy)return;
  if(a.target==="cluster")return apSubmitCluster();
  if(a.when==="exact"&&!a.local)return toast("Укажи время","err");
  a.busy=true;a.log=["Ставлю…"];apRender();
  const key=crypto.randomUUID?crypto.randomUUID():Date.now()+"-"+Math.random();
  try{
    const groups=a.type==="carousel"?a.albums:a.files.map(f=>[f]);
    const itemIds=[];
    for(const[n,g]of groups.entries()){const r=await api("content_item_add",{content_type:a.type,title:"",idempotency_key:key+":"+n,files:g.map(f=>({creo_id:f.creo_id,path:f.path}))});itemIds.push(r.item.id);}
    const {results}=await api("content_assign",{item_ids:itemIds,account_ids:[...a.picked]});
    const name=id=>{const x=a.accounts.find(z=>z.id===id);return x?"@"+String(x.account_name).replace(/^@/,""):"#"+id;};
    a.log=[];let ok=0;
    for(const r of results){
      if(r.outcome==="created"){ok++;
        if(a.when==="exact"){try{await api("content_schedule_update",{id:r.assignment_id,run_at_local:a.local});}catch(e){a.log.push(name(r.account_id)+": поставлено, но время не принято — "+errMsg(e));continue;}}
      }else a.log.push(name(r.account_id)+": "+(AP_OUT[r.outcome]||r.outcome));
    }
    a.log.unshift("Готово: "+ok+" из "+results.length+". Смотри «Автозалив → Контент → Очередь».");
    a.done=true;toast(ok?"В автозаливе: "+ok:"Ничего не поставлено",ok?"ok":"err");
    S.deliveryPick=[];
  }catch(e){a.log=["Ошибка: "+errMsg(e)];}
  a.busy=false;apRender();
}
