import {call, escape} from '../bridge.js';
import {dialog, dialogMessage, errorOf} from './dialog.js';

export function cloneListHtml(data) {
  const names={unidentified:'Не определён',identified:'Ник прочитан',login_required:'Нужен вход/подтверждение',failed:'Проверка не выполнена'};
  return `<div class="wform"><p>Вход и регистрация выполняются вручную на телефоне. Затем определите аккаунт и подтвердите найденную привязку.</p>
      <label class="wf"><span>Основной Instagram разрешён</span><input type="checkbox" data-main ${data.main_app_allowed?'checked':''}></label>
      <button class="wbtn" data-save-main>Сохранить разрешение</button><label class="wf"><span>Добавить пакет нашего клона вручную</span><input data-new-package placeholder="local.igclone.slot004"></label><button class="wbtn" data-add-package>Добавить в разрешённый список</button>
      <p class="wmute">Один активный прокси. Строгая блокировка сети при смерти VPN пока не подтверждена.</p>
      ${data.apps.map(a=>`<div class="wa-box" data-clone="${escape(a.package)}"><b>${escape(a.label||a.package)}</b><div class="mono">${escape(a.package)}</div>
        <p>${escape(a.version_name||'Версия не определена')} · ${a.present?'установлен':'не найден'} · ${escape(names[a.observation_status]||a.observation_status)}${a.observed_handle?' · @'+escape(a.observed_handle):''}${a.bound_handle?' · привязан @'+escape(a.bound_handle):''}</p>
        <p class="wmute">Последняя проверка маршрута: ${escape(a.route_country||"—")} · ${escape(a.route_ip||"—")} · ${escape(a.route_checked_at||"ещё не выполнялась")}</p>
        <button class="wbtn" data-allow="${a.status==='allowed'?'disabled':'allowed'}">${a.status==='allowed'?'Отключить':'Разрешить'}</button>
        ${a.status==='allowed'&&a.present?`<label class="wf"><span>Страна выхода прокси (пусто — клон без прокси, через интернет телефона)</span><input data-country maxlength="2" placeholder="UA"></label><button class="wbtn" data-identify>Определить аккаунт</button>`:''}
        ${a.observation_status==='identified'&&a.bound_handle&&a.bound_handle.toLowerCase()===a.observed_handle.toLowerCase()?'<p>Совпадает с привязанным аккаунтом</p>':a.observation_status==='identified'?`<button class="wbtn" data-confirm="${escape(a.observation_id)}" data-rebind="${a.bound_handle&&a.bound_handle.toLowerCase()!==a.observed_handle.toLowerCase()?'true':'false'}">${a.bound_handle&&a.bound_handle.toLowerCase()!==a.observed_handle.toLowerCase()?'Перепривязать к':'Подтвердить привязку'} @${escape(a.observed_handle)}</button>`:''}</div>`).join('')||'<p>Клоны ещё не обнаружены. Подключённый PostBot передаёт список при синхронизации.</p>'}
      ${data.tasks?.length?'<p>Последние проверки: '+data.tasks.map(t=>escape(t.package)+' — '+escape(t.state)+(t.error_code?' ('+escape(t.error_code)+')':'')).join('<br>')+'</p>':''}
      </div>`;
}

/** Identity is read on the phone. This screen never asks an operator to invent a handle. */
export async function manageClones(phoneId, reload) {
  const data=await call('device_apps_list',{phone_id:phoneId});
  const root=dialog({
    title:'Клоны телефона',
    body:cloneListHtml(data),
    actions:[{id:'refresh',label:'Обновить список'},{id:'close',label:'Закрыть'}],
    onAction:async(action)=>{if(action==='refresh')await manageClones(phoneId,reload);return false;},
  });
  // dialog owns a single modal; bind only elements unique to this screen.
  root.querySelector('[data-add-package]')?.addEventListener('click',async()=>{
    try{await call('device_app_set',{phone_id:phoneId,package:root.querySelector('[data-new-package]').value.trim(),status:'allowed'});await manageClones(phoneId,reload);}
    catch(e){dialogMessage(root,errorOf(e));}
  });
  const main=root.querySelector('[data-save-main]');
  if(main)main.onclick=async()=>{
    try{await call('device_main_app_set',{phone_id:phoneId,allowed:root.querySelector('[data-main]').checked});reload?.();}
    catch(e){dialogMessage(root,errorOf(e));}
  };
  for(const row of root.querySelectorAll('[data-clone]')) {
    const request=async(action,body)=>{
      row.querySelectorAll('button').forEach(b=>b.disabled=true);
      try{await call(action,{phone_id:phoneId,package:row.dataset.clone,...body});reload?.();await manageClones(phoneId,reload);}
      catch(e){dialogMessage(root,errorOf(e));row.querySelectorAll('button').forEach(b=>b.disabled=false);}
    };
    row.querySelector('[data-allow]')?.addEventListener('click',e=>request('device_app_set',{status:e.target.dataset.allow}));
    row.querySelector('[data-identify]')?.addEventListener('click',()=>request('device_apps_discover',{country:row.querySelector('[data-country]').value.trim().toUpperCase()}));
    row.querySelector('[data-confirm]')?.addEventListener('click',e=>request('device_app_confirm',{observation_id:e.target.dataset.confirm,rebind:e.target.dataset.rebind==='true'}));
  }
}
