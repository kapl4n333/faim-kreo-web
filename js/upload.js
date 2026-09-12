/* FTask — лист загрузки результата (к крео / отдельное готовое) с нишами. Требует core.js, catalog.js. */
function fab(){killFab();if(S.tab!=="cat")return;const b=document.createElement("button");b.className="fab";b.id="fab";
  b.textContent="+";b.title="Отдельное готовое";b.onclick=()=>openSheet(null);document.body.appendChild(b);}
function killFab(){const f=document.getElementById("fab");if(f)f.remove();}
function openSheet(creoId){haptic();S.files=[];S.deliverTo=creoId||null;S._cap=null;
  const c=creoId?S.creos.find(x=>x.id===creoId):null;
  S.upNiches=c?(c.niche_ids||[]).slice():[];          // существующие ниши крео — подставляем
  renderSheet();
  document.getElementById("scrim").classList.add("show");
  requestAnimationFrame(()=>document.getElementById("sheet").classList.add("show"));}
function closeSheet(){if(S.uploading)return;document.getElementById("sheet").classList.remove("show");
  document.getElementById("scrim").classList.remove("show");}
function renderSheet(){
  const s=document.getElementById("sheet");
  const c=S.deliverTo?S.creos.find(x=>x.id===S.deliverTo):null;
  const title=c?"Загрузить результат к крео #"+c.id:"Новое готовое крео";
  const n=c?(c.result_paths||[]).length:0;
  const hint=c?("Файлы уйдут в AvaCarter Ready, крео станет «готово». "+(n?"Уже есть "+n+" результат(ов) — новые добавятся первыми в списке.":"")):
    "Отдельное готовое без исходного брифа. Уйдёт в AvaCarter Ready и станет «готово».";
  const capV=S._cap!=null?S._cap:(c&&c.result_caption)||"";
  const body=S.uploading
    ? '<div class="uplist" id="uplist">'+S.files.map((f,i)=>
        '<div class="uprow"><span class="un">'+esc(f.name)+'</span>'+
        '<span class="uptrack"><span class="upbar" id="upf-'+i+'"></span></span>'+
        '<span class="uppct" id="upp-'+i+'">0%</span></div>').join("")+'</div>'+
        '<button class="primary" disabled>Отправляю '+S.files.length+'…</button>'
    : '<div class="drop" id="drop"><div class="di">📎</div>Перетащи файлы или <b>выбери</b><br><span style="font-size:12px;opacity:.7">фото и видео, можно несколько</span></div>'+
      '<input id="file" type="file" accept="image/*,video/*" multiple hidden>'+
      (S.files.length?'<div class="thumbs" id="thumbs"></div>':"")+
      '<input class="field" id="cap" placeholder="Подпись к готовому — уйдёт в Ready" value="'+esc(capV)+'">'+
      '<div class="mlabel" style="margin:2px 0 8px">Ниши</div>'+nicheChips(new Set(S.upNiches),{attr:"un"})+
      '<button class="primary" id="send" style="margin-top:12px"'+(S.files.length?"":" disabled")+'>Отправить'+(S.files.length?" · "+S.files.length:"")+'</button>';
  s.innerHTML='<div class="grip"></div><h3>'+title+'</h3><p class="hint">'+hint+'</p>'+body;
  if(S.uploading)return;
  const drop=s.querySelector("#drop"),file=s.querySelector("#file"),cap=s.querySelector("#cap");
  drop.onclick=()=>file.click();
  file.onchange=()=>{addFiles(file.files);};
  drop.ondragover=e=>{e.preventDefault();drop.classList.add("over");};
  drop.ondragleave=()=>drop.classList.remove("over");
  drop.ondrop=e=>{e.preventDefault();drop.classList.remove("over");addFiles(e.dataTransfer.files);};
  cap.oninput=()=>{S._cap=cap.value;};
  s.querySelectorAll("[data-un]").forEach(b=>b.onclick=async()=>{haptic();const v=b.dataset.un;
    if(v==="new"){const nn=await newNiche();if(nn&&!S.upNiches.includes(nn.id))S.upNiches.push(nn.id);renderSheet();return;}
    const id=+v;S.upNiches=S.upNiches.includes(id)?S.upNiches.filter(x=>x!==id):S.upNiches.concat([id]);renderSheet();});
  s.querySelector("#send").onclick=doUpload;
  if(S.files.length)drawThumbs();
}
function addFiles(fl){for(const f of fl)S.files.push(f);renderSheet();}
function drawThumbs(){
  const t=document.getElementById("thumbs");if(!t)return;
  t.innerHTML=S.files.map((f,i)=>{const v=f.type.startsWith("video");
    const src=v?"":URL.createObjectURL(f);
    return '<div class="th">'+(v?'<div class="vf">🎬</div>':'<img src="'+src+'">')+'<button class="x" data-rm="'+i+'">×</button></div>';}).join("");
  t.querySelectorAll("[data-rm]").forEach(b=>b.onclick=()=>{S.files.splice(+b.dataset.rm,1);renderSheet();});
}
function putFile(url,file,onprog){
  return new Promise((res,rej)=>{
    const xhr=new XMLHttpRequest();xhr.open("PUT",url);
    xhr.setRequestHeader("content-type",file.type||"application/octet-stream");
    xhr.setRequestHeader("x-upsert","true");
    xhr.upload.onprogress=e=>{if(e.lengthComputable)onprog(e.loaded/e.total);};
    xhr.onload=()=>(xhr.status>=200&&xhr.status<300)?res():rej(new Error("upload "+xhr.status));
    xhr.onerror=()=>rej(new Error("network"));
    xhr.send(file);
  });
}
async function doUpload(){
  if(!S.files.length||S.uploading)return;
  S._cap=(document.getElementById("cap")||{}).value||null;
  S.uploading=true;renderSheet();
  try{
    const paths=[];
    for(let i=0;i<S.files.length;i++){
      const f=S.files[i];
      const su=await api("sign_upload",{name:f.name});
      if(su.signedUrl)await putFile(su.signedUrl,f,frac=>{
        const b=document.getElementById("upf-"+i),p=document.getElementById("upp-"+i);
        if(b)b.style.width=Math.round(frac*100)+"%";if(p)p.textContent=Math.round(frac*100)+"%";
      });
      const b=document.getElementById("upf-"+i),p=document.getElementById("upp-"+i);
      if(b)b.style.width="100%";if(p)p.textContent="✓";
      paths.push(su.path);
    }
    const niche_ids=S.upNiches.slice();
    if(S.deliverTo){
      const d=await api("deliver_creo",{id:S.deliverTo,paths,caption:S._cap,niche_ids});
      const c=S.creos.find(x=>x.id===S.deliverTo);if(c)Object.assign(c,d.creo);
    }else{
      const kind=S.files.length>1?"album":(S.files[0].type.startsWith("video")?"video":"photo");
      const d=await api("create_upload_creo",{paths,caption:S._cap,kind,niche_ids});
      S.creos.unshift(d.creo);
    }
    S.uploading=false;S.files=[];S.deliverTo=null;S._cap=null;S.upNiches=[];S._sig=sigOf();
    closeSheet();notify();header();render();toast("Результат отправляется в Ready","ok");
  }catch(e){S.uploading=false;renderSheet();toast("Ошибка загрузки: "+errMsg(e),"err");}
}
