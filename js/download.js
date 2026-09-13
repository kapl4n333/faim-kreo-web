/* FTask — скачивание файлов крео на устройство (исходники и результаты). Требует core.js, catalog.js.
   Любой член команды качает исходник, НЕ забирая крео в работу и не завершая его.

   Режимы (dlMode):
   fs      — File System Access: window.showSaveFilePicker вызывается СИНХРОННО в обработчике клика,
             до любого await (transient activation), с постоянным id "ftask-downloads" → Chromium
             сам запоминает последнюю папку для этого id между файлами и сессиями. startIn НЕ передаём
             (иначе каждый раз сброс в «Загрузки»). Тело fetch льётся потоком в writable (pipeTo):
             успех = close, ошибка = abort. Отмена диалога = тишина, без фолбэка.
   tg      — Telegram.WebApp.downloadFile (Bot API 8.0+): Telegram спрашивает и качает сам.
             «Принято» ≠ «скачано»; папку выбирает Telegram, мы этого не обещаем.
   browser — <a download> (или внешний браузер из Telegram) по подписанной ссылке с
             Content-Disposition: attachment. Папку выбирает браузер.
   Ссылка всегда свежая: sign_download (600 с) на конкретный (id, field, index); путь сверяется с тем,
   по которому кликнули, — подписанные URL из bootstrap для скачивания не используются (протухают). */
const DL_FIELDS={source:"source_paths",media:"storage_paths",result:"result_paths"};
const DL_URLF={source:"source_urls",media:"media_urls",result:"result_urls"};
const DL_MIME={jpg:"image/jpeg",jpeg:"image/jpeg",png:"image/png",webp:"image/webp",gif:"image/gif",
  mp4:"video/mp4",mov:"video/quicktime",webm:"video/webm",m4v:"video/x-m4v"};
const DL={busy:new Map(),pickerBlocked:false};
const tgw=()=>window.Telegram&&window.Telegram.WebApp;
const dlKey=(id,f,i)=>id+"|"+f+"|"+i;
/* Имя файла — та же формула, что logic.downloadName на сервере (tests/run.html сверяет обе). */
function dlName(id,field,i,path){
  const base=String(path||"").split("?")[0].split("#")[0].split("/").pop()||"";
  const m=/\.([a-z0-9]{1,5})$/i.exec(base);const ext=m?m[1].toLowerCase():"bin";
  let stem=(m?base.slice(0,-m[0].length):base).replace(/^\d+_[a-z0-9]+_/,"");
  stem=stem.replace(/[^\w.\-]+/g,"_").replace(/^[._-]+|[._-]+$/g,"").slice(0,40);
  if(/^\d*$/.test(stem))stem="";
  const tag=field==="source"?"src":field==="result"?"res":"med";
  return "ftask-"+Number(id)+"-"+tag+"-"+(Number(i)+1)+(stem?"-"+stem:"")+"."+ext;
}
const dlExt=n=>(/\.([a-z0-9]{1,5})$/i.exec(n||"")||[,""])[1].toLowerCase();
function dlMode(){
  if(!DL.pickerBlocked&&typeof window.showSaveFilePicker==="function"&&window.isSecureContext)return "fs";
  return dlFallbackMode();
}
function dlFallbackMode(){
  const t=tgw();
  if(t&&typeof t.downloadFile==="function"&&t.isVersionAtLeast&&t.isVersionAtLeast("8.0"))return "tg";
  return "browser";
}
/* Честный текст про папку — зависит от режима, ничего лишнего не обещаем. */
function dlModeNote(){
  const m=dlMode();
  if(m==="fs")return "«Сохранить как»: браузер обычно запоминает последнюю выбранную папку для FTask.";
  if(m==="tg")return "Скачивает Telegram: подтверждение и папка — в его настройках загрузок.";
  return "Скачивает браузер: папка — из его настроек загрузок.";
}
const dlAbort=e=>!!e&&e.name==="AbortError";
const dlPickerUnavailable=e=>!!e&&["SecurityError","NotSupportedError"].includes(e.name);
function dlDisablePicker(){
  DL.pickerBlocked=true;
  document.querySelectorAll(".dlnote").forEach(n=>n.textContent=dlModeNote());
  toast("Этот режим Telegram/браузера не позволяет выбирать папку FTask. Используем его обычную загрузку.");
}
function dlPickerOpts(name){
  const ext=dlExt(name),mime=DL_MIME[ext];
  const o={id:"ftask-downloads",suggestedName:name};
  if(mime)o.types=[{description:mime.startsWith("video")?"Видео":"Изображение",accept:{[mime]:["."+ext]}}];
  return o;
}
/* Все скачиваемые файлы крео: исходники (source / media) и результаты. */
function dlItems(c){
  const out=[];
  (c.source_paths||[]).forEach((p,i)=>{if(p)out.push({field:"source",i,p,vid:isVid(p),name:dlName(c.id,"source",i,p)});});
  const rp=c.result_paths||[];
  (c.storage_paths||[]).forEach((p,i)=>{if(p&&!rp.includes(p))out.push({field:"media",i,p,vid:isVid(p),name:dlName(c.id,"media",i,p)});});
  rp.forEach((p,i)=>{if(p)out.push({field:"result",i,p,vid:isVid(p),name:dlName(c.id,"result",i,p),res:true});});
  return out;
}
const dlSourceItems=c=>dlItems(c).filter(x=>!x.res);
/* Кнопка скачивания: data-dl="field|index" + data-id; занятая — с прогрессом и disabled. */
function dlButton(c,field,i,o){
  o=o||{};const key=dlKey(c.id,field,i),b=DL.busy.get(key);const lbl=o.label||"⬇";
  return '<button class="act dlb '+(o.cls||"")+'" data-dl="'+field+'|'+i+'" data-id="'+c.id+'" data-dlkey="'+key+'" data-lbl="'+esc(lbl)+'"'+
    (o.title?' title="'+esc(o.title)+'" aria-label="'+esc(o.title)+'"':"")+(b?" disabled":"")+'>'+(b?esc(b.txt||"…"):lbl)+'</button>';
}
function bindDl(root){
  root.querySelectorAll("[data-dl]").forEach(b=>b.onclick=e=>{e.stopPropagation();
    const [f,i]=b.dataset.dl.split("|");downloadFile(+b.dataset.id,f,+i);});
}
function dlPaint(key,txt){
  document.querySelectorAll('[data-dlkey="'+key+'"]').forEach(b=>{
    if(txt==null){b.disabled=false;b.textContent=b.dataset.lbl||"⬇";}
    else{b.disabled=true;b.textContent=txt;}});
  const st=DL.busy.get(key);if(st&&txt!=null)st.txt=txt;
}
const fmtMB=n=>(n/1048576).toFixed(1)+" МБ";
function dlErr(e){
  const m=(e&&e.message)||"";
  if(/^http_(401|403|400)$/.test(m))return "Ссылка истекла — нажми ещё раз.";
  if(/^http_/.test(m))return "Сервер файлов ответил "+m.slice(5)+".";
  if(m==="file_changed")return "Файл у крео изменился — список обновлён, нажми ещё раз.";
  if(m==="no_file"||m==="bad_field")return "Этого файла у крео больше нет.";
  if(e&&e.name==="NotAllowedError")return "Браузер не разрешил запись в выбранный файл.";
  if(e&&e.name==="TypeError"&&/fetch/i.test(m))return ERR.network;
  return errMsg(e);
}
/* Telegram качает сам: true = принято, false = отклонено, null = ответа нет. */
function dlTelegram(url,name){
  return new Promise(res=>{let done=false;let timer;const fin=v=>{if(!done){done=true;clearTimeout(timer);res(v);}};
    timer=setTimeout(()=>fin(null),120000);
    try{tgw().downloadFile({url,file_name:name},ok=>fin(!!ok));}catch(e){fin(false);}
  });
}
function dlBrowser(url,name){
  const t=tgw();
  if(t&&t.initData){openExt(url);return;}                     // WebView без downloadFile → внешний браузер (attachment)
  const a=document.createElement("a");a.href=url;a.download=name;a.rel="noopener";a.style.display="none";
  document.body.appendChild(a);a.click();setTimeout(()=>a.remove(),1000);
}
/* Главный вход. Вызывать напрямую из обработчика клика — иначе picker потеряет activation. */
async function downloadFile(id,field,i){
  const c=S.creos.find(x=>x.id===id);if(!c)return;
  const path=((c[DL_FIELDS[field]])||[])[i];
  if(!path){toast("Файла нет: "+srcState(c).txt,"err");return;}
  const key=dlKey(id,field,i);
  if(DL.busy.has(key)){toast("Этот файл уже скачивается","err");return;}
  const name=dlName(id,field,i,path);
  let mode=dlMode(),picker=null;
  if(mode==="fs"){
    try{picker=window.showSaveFilePicker(dlPickerOpts(name));}   // СИНХРОННО, до первого await
    catch(e){if(dlAbort(e))return;if(!dlPickerUnavailable(e)){toast(dlErr(e),"err");return;}
      dlDisablePicker();mode=dlFallbackMode();}
  }
  DL.busy.set(key,{txt:"…"});dlPaint(key,"…");haptic();
  let handle=null,writable=null;
  try{
    if(picker){
      try{handle=await picker;}
      catch(e){if(dlAbort(e))return;if(!dlPickerUnavailable(e))throw e;
        dlDisablePicker();mode=dlFallbackMode();}              // отмена — тихо и без фолбэка
    }
    const d=await api("sign_download",{id,field,index:i});
    if(!d||d.path!==path||!d.url)throw new Error("file_changed");
    if(handle){
      const r=await fetch(d.url);
      if(!r.ok||!r.body)throw new Error("http_"+r.status);
      writable=await handle.createWritable();
      const total=+(r.headers.get("content-length")||0);let got=0;
      const meter=new TransformStream({transform(ch,ctl){got+=ch.byteLength;
        dlPaint(key,total?Math.round(got/total*100)+"%":fmtMB(got));ctl.enqueue(ch);}});
      await r.body.pipeThrough(meter).pipeTo(writable);          // close при успехе, abort при ошибке
      writable=null;
      notify();toast("Сохранено: "+(handle.name||name),"ok");
    }else if(mode==="tg"){
      const ok=await dlTelegram(d.url,name);
      if(ok)toast("Telegram принял загрузку — дальше качает и кладёт он сам","ok");
      else toast(ok===null?"Telegram не ответил на запрос загрузки":"Загрузка отклонена в Telegram","err");
    }else{
      dlBrowser(d.url,name);
      toast("Отдал браузеру: "+name,"ok");
    }
  }catch(e){
    if(writable){try{await writable.abort();}catch(_){}}
    // Никогда не удаляем handle: пользователь мог выбрать уже существующий файл.
    // createWritable фиксирует замену только при успешном close; при ошибке abort сохраняет старое.
    toast(dlErr(e),"err");
    if(e&&(e.message==="file_changed"||e.message==="no_file"))poll();
  }finally{DL.busy.delete(key);dlPaint(key,null);}
}
