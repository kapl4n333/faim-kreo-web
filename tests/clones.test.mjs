import {test} from 'node:test';
import assert from 'node:assert/strict';
globalThis.esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
globalThis.document={addEventListener(){}};
const {cloneListHtml}=await import('../js/wide/ui/clones.js');
test('clone metadata is escaped and a pending login never offers a binding',()=>{
 const html=cloneListHtml({main_app_allowed:false,apps:[{package:'local.igclone.slot001',label:'<img src=x onerror=alert(1)>',status:'allowed',present:1,observation_status:'login_required'}]});
 assert(!html.includes('<img'));assert(html.includes('&lt;img'));assert(html.includes('Нужен вход/подтверждение'));
 assert(!html.includes('data-confirm='));assert(!html.includes('data-f="handle"'));assert(!html.includes('data-rebind="true"'));
});
test('a changed observed account requires an explicit rebind action',()=>{
 const html=cloneListHtml({main_app_allowed:false,apps:[{package:'local.igclone.slot001',status:'allowed',present:1,observation_status:'identified',observed_handle:'new.user',bound_handle:'old.user',observation_id:'id'}]});
 assert(html.includes('Перепривязать к'));assert(html.includes('data-rebind="true"'));assert(html.includes('@new.user'));assert(html.includes('@old.user'));
});
