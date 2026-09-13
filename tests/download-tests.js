// Local browser tests: OS picker, Telegram and Storage are mocked; no production requests.
import { downloadTarget, downloadName } from "../supabase/functions/kreo-api/logic.js";

export async function runDownloadTests(T) {
  const row = () => ({id: 901, status: "queued", kind: "album", source_state: "ready",
    source_paths: ["sources/901/0.jpg", "sources/901/1.mp4"], source_urls: [null, "https://example.invalid/preview"],
    storage_paths: [], result_paths: [], result_urls: [], niche_ids: [], posters: []});
  const check = (name, fn) => T(name, async () => {
    const saved = {creos: S.creos, open: S.open, picker: window.showSaveFilePicker,
      Telegram: window.Telegram, api, fetch: window.fetch, toast, notify, haptic, poll, browser: dlBrowser,
      blocked: DL.pickerBlocked};
    const events = [], messages = [], c = row(); let removed = 0, signed = 0;
    let bytes = [], closed = false, aborted = false;
    const handle = {createWritable: async () => new WritableStream({
      write(chunk) {bytes.push(...chunk);}, close() {closed = true;}, abort() {aborted = true;}
    }), remove: async () => {removed++;}};
    try {
      S.creos = [c]; S.open = null; DL.busy.clear(); DL.pickerBlocked = false;
      toast = (m, type) => messages.push({m, type}); notify = haptic = () => {};
      poll = () => events.push("poll"); window.Telegram = undefined;
      dlBrowser = () => events.push("browser");
      api = async (action, p) => {
        events.push("sign"); signed++;
        if (action !== "sign_download") throw Error("unexpected action: " + action);
        const t = downloadTarget({cur: c, field: p.field, index: p.index});
        if (!t.ok) throw Error(t.error);
        return {path: t.path, name: t.name, url: "https://example.invalid/fresh-" + signed};
      };
      window.fetch = async url => {events.push("fetch:" + url); return new Response(new Uint8Array([1, 2, 3]));};
      window.showSaveFilePicker = opts => {events.push({picker: opts}); return Promise.resolve(handle);};
      return await fn({c, handle, events, messages, removed: () => removed,
        saved: () => ({bytes, closed, aborted}), signed: () => signed});
    } finally {
      S.creos = saved.creos; S.open = saved.open; window.showSaveFilePicker = saved.picker;
      window.Telegram = saved.Telegram; api = saved.api; window.fetch = saved.fetch;
      toast = saved.toast; notify = saved.notify; haptic = saved.haptic; poll = saved.poll;
      dlBrowser = saved.browser; DL.busy.clear(); DL.pickerBlocked = saved.blocked;
    }
  });
  await T("downloadTarget: only own field and integer index, never arbitrary path", () => {
    const c = row();
    return downloadTarget({cur: c, field: "source", index: 1}).path === c.source_paths[1]
      && [null, "", false, "1", -1, 0.5, 2].every(index => !downloadTarget({cur: c, field: "source", index}).ok)
      && ["__proto__", "constructor", "toString", "file_ids", "arbitrary"].every(field => !downloadTarget({cur: c, field, index: 0}).ok);
  });
  await T("downloadName: safe names and identical frontend/server extension", () => {
    return ["sources/901/0.mp4", "1/123_xyz_hello.mov", "x/evil<>:\".jpg", "x/a.png?token=secret", "x/без имени.webp"].every(path => {
      const a = dlName(901, "source", 0, path);
      return a === downloadName({id: 901, field: "source", index: 0, path}) && !/[<>:"/\\|?*]/.test(a) && !a.includes("secret");
    });
  });
  await check("queued source: download button without claim permission; album indices survive null URLs", async ({c}) => {
    const single = {...c, source_paths: [c.source_paths[0]], source_urls: [null]};
    const html = ccard(single), fs = frames(c), items = dlSourceItems(c);
    return html.includes('data-dl="source|0"') && fs.length === 2 && fs[0].u === null
      && fs[1].i === 1 && items[1].p === c.source_paths[1] && tileDl(c).includes('data-act="files"');
  });
  await check("picker invoked before signing, fixed directory id, bytes committed on success", async ({c, events, saved}) => {
    const p = downloadFile(c.id, "source", 1);
    const first = events[0]; const sync = events.length === 1;
    await p;
    return sync && first.picker.id === "ftask-downloads" && !Object.hasOwn(first.picker, "startIn")
      && first.picker.suggestedName.endsWith(".mp4") && saved().closed && saved().bytes.join() === "1,2,3"
      && !DL.busy.size && c.status === "queued";
  });
  await check("second file uses same picker id and newly signed URL", async ({c, events, signed}) => {
    await downloadFile(c.id, "source", 0); await downloadFile(c.id, "source", 1);
    return signed() === 2 && events.filter(x => x.picker).every(x => x.picker.id === "ftask-downloads" && !x.picker.startIn)
      && events.includes("fetch:https://example.invalid/fresh-2");
  });
  await check("picker cancellation never signs or starts fallback download", async ({c, events}) => {
    window.showSaveFilePicker = () => Promise.reject(new DOMException("cancel", "AbortError"));
    await downloadFile(c.id, "source", 0);
    return events.length === 0 && !DL.busy.size;
  });
  await check("HTTP failure preserves pre-existing selected file, never removes it or reports saved", async ({c, removed, messages}) => {
    window.fetch = async () => new Response("failed", {status: 500});
    await downloadFile(c.id, "source", 0);
    return removed() === 0 && !messages.some(x => x.type === "ok") && !DL.busy.size;
  });
  await check("stream error aborts write and releases busy state", async ({c, saved, messages}) => {
    window.fetch = async () => new Response(new ReadableStream({start(ctrl) {ctrl.error(Error("network"));}}));
    await downloadFile(c.id, "source", 0);
    return saved().aborted && !saved().closed && !messages.some(x => x.type === "ok") && !DL.busy.size;
  });
  await check("double click during picker signs once", async ({c, handle, signed}) => {
    let resolve; window.showSaveFilePicker = () => new Promise(r => {resolve = r;});
    const one = downloadFile(c.id, "source", 0); await downloadFile(c.id, "source", 0);
    resolve(handle); await one;
    return signed() === 1 && !DL.busy.size;
  });
  await check("changed path during Save As never downloads replacement", async ({c, handle, events, messages}) => {
    let resolve; window.showSaveFilePicker = () => new Promise(r => {resolve = r;});
    const p = downloadFile(c.id, "source", 0); c.source_paths[0] = "sources/901/replaced.jpg";
    resolve(handle); await p;
    return !events.some(x => typeof x === "string" && x.startsWith("fetch:"))
      && events.includes("poll") && messages.some(x => x.m.includes("изменился"));
  });
  await check("unsupported picker → Telegram; accepted request is not saved file", async ({c, events, messages}) => {
    window.showSaveFilePicker = undefined;
    window.Telegram = {WebApp: {isVersionAtLeast: () => true, downloadFile: (p, cb) => {events.push("tg:" + p.file_name); cb(true);}}};
    await downloadFile(c.id, "source", 1);
    return events.some(x => typeof x === "string" && x.startsWith("tg:")) && !events.includes("browser")
      && messages.some(x => x.m.includes("принял")) && !messages.some(x => x.m.startsWith("Сохранено"));
  });
  await check("SecurityError → ordinary browser fallback, honest folder note", async ({c, events}) => {
    window.showSaveFilePicker = () => Promise.reject(new DOMException("blocked", "SecurityError"));
    await downloadFile(c.id, "source", 0);
    return events.includes("browser") && DL.pickerBlocked && !dlModeNote().includes("запоминает");
  });
  await check("permission refusal is an error, not a surprise fallback", async ({c, events}) => {
    window.showSaveFilePicker = () => Promise.reject(new DOMException("denied", "NotAllowedError"));
    await downloadFile(c.id, "source", 0);
    return events.length === 0 && !DL.busy.size;
  });
  await check("no picker / no Telegram → browser attachment download", async ({c, events}) => {
    window.showSaveFilePicker = undefined; await downloadFile(c.id, "source", 0);
    return events.includes("browser") && !events.some(x => typeof x === "string" && x.startsWith("fetch:"));
  });
  await check("result upload keeps original downloads and independent file indices", async ({c}) => {
    c.status = "done"; c.result_paths = ["1/result.mp4"]; c.result_urls = [null];
    return dlSourceItems(c).length === 2 && dlItems(c).length === 3
      && defaultFrame(frames(c), c).res && ccard(c).includes('data-dl="result|0"');
  });
  await check("recovered null preview changes render signature; signed URL rotation does not", async ({c}) => {
    const before = sigOf(); c.source_urls[0] = "https://example.invalid/new";
    const recovered = sigOf(); c.source_urls[0] = "https://example.invalid/rotated";
    return before !== recovered && recovered === sigOf();
  });
  await check("source tile download fits inside narrow card and is clickable", async ({c}) => {
    const box = document.createElement("div"); box.style.cssText = "position:fixed;left:0;top:0;width:190px;z-index:1001";
    const single = {...c, source_paths: [c.source_paths[0]], source_urls: [null]};
    box.innerHTML = ccard(single); document.body.appendChild(box);
    try {
      const card = box.querySelector(".cc").getBoundingClientRect();
      const b = box.querySelector("[data-dl]").getBoundingClientRect();
      return b.width > 20 && b.right <= card.right && b.bottom <= card.bottom || JSON.stringify({card:card.toJSON(), button:b.toJSON()});
    } finally {box.remove();}
  });
  await check("real browser fallback creates attachment anchor with safe filename", async ({c, events}) => {
    // Exercise production fallback without performing a real download/navigation.
    const click = HTMLAnchorElement.prototype.click;
    let clicked;
    try {
      HTMLAnchorElement.prototype.click = function() {clicked = {url: this.href, name: this.download, connected: this.isConnected};};
      window.showSaveFilePicker = undefined;
      // Function stored on the global object is replaced in check; use original captured below.
      originalBrowser("https://example.invalid/file?download=ftask.jpg", "ftask.jpg");
      return clicked && clicked.connected && clicked.name === "ftask.jpg" && clicked.url.includes("download=");
    } finally {HTMLAnchorElement.prototype.click = click;}
  });
}
const originalBrowser = dlBrowser;
