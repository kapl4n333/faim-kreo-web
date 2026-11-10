import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

// The server saves a global setting only for scope "global" (server/content/index.mjs settingsSet);
// any other scope is an account id, and 0 is «Аккаунт недоступен».
test("общие настройки сохраняются со scope \"global\"", () => {
  const src = readFileSync(new URL("../js/wide/sections/settings.js", import.meta.url), "utf8");
  const calls = [...src.matchAll(/call\("content_settings_set",\s*\{scope:\s*([^,]+),/g)].map((m) => m[1].trim());
  assert.ok(calls.length >= 1);
  assert.deepEqual([...new Set(calls)], ['"global"']);
});
