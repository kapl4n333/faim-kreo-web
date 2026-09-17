// Чистые функции учёта публикаций (logic.js). Без DOM/сети — только логика решений.
import {
  resolveUniqLevel, deliveryFile, isDeliverable, pickAsset, normReelUrl,
  publishTransition, replanWarning, slotConflicts, expandBatch,
} from "../supabase/functions/kreo-api/logic.js";

export async function runPubTests(T) {
  await T("pub: приоритет обработки публикация > пресет аккаунта > none", () =>
    resolveUniqLevel({ uniq_level: "strong" }, { default_uniq_level: "weak" }) === "strong"
    && resolveUniqLevel({}, { default_uniq_level: "weak" }) === "weak"
    && resolveUniqLevel({}, {}) === "none" || "priority");

  await T("pub: файл доставки — финал важнее подготовленного", () => {
    const f1 = deliveryFile({ final_path: "f.mp4", prepared_path: "p.mp4" });
    const f2 = deliveryFile({ prepared_path: "p.mp4" });
    return f1.kind === "final" && f1.path === "f.mp4" && f2.kind === "prepared" || "file";
  });

  await T("pub: isDeliverable — prepared только при ready, final всегда", () =>
    isDeliverable({ prepared_path: "p", prepared_state: "ready" }) === true
    && isDeliverable({ prepared_path: "p", prepared_state: "processing" }) === false
    && isDeliverable({ final_path: "f", prepared_state: "queue" }) === true
    && isDeliverable({}) === false || "deliverable");

  await T("pub: pickAsset result/source, плохой индекс/вид → ошибка", () => {
    const creo = { result_paths: ["r0.mp4", "r1.mp4"], source_paths: ["s0.mp4"] };
    return pickAsset({ creo, kind: "result", index: 1 }).path === "r1.mp4"
      && pickAsset({ creo, kind: "source", index: 0 }).path === "s0.mp4"
      && pickAsset({ creo, kind: "result", index: 5 }).error === "no_asset"
      && pickAsset({ creo, kind: "x", index: 0 }).error === "bad_kind" || "pick";
  });

  await T("pub: normReelUrl — только http(s), иначе null", () =>
    normReelUrl(" https://insta/reel/1 ") === "https://insta/reel/1"
    && normReelUrl("javascript:x") === null && normReelUrl("") === null || "reel");

  await T("pub: publishTransition — published ставит дату/автора, повтор не сдвигает", () => {
    const a = publishTransition({ cur: { created_by_tg_id: 7, publish_state: "planned" }, me: 7, isAdmin: false, target: "published", nowIso: "T1" });
    const b = publishTransition({ cur: { created_by_tg_id: 7, publish_state: "published", published_at: "T1", confirmed_by_tg_id: 7 }, me: 7, isAdmin: false, target: "published", nowIso: "T2" });
    return a.patch.publish_state === "published" && a.patch.published_at === "T1" && a.patch.confirmed_by_tg_id === 7
      && b.patch.published_at === "T1" || "publish";
  });

  await T("pub: publishTransition — чужой forbidden, отмена чистит факт", () => {
    const f = publishTransition({ cur: { created_by_tg_id: 9, publish_state: "planned" }, me: 7, isAdmin: false, target: "published", nowIso: "T" });
    const c = publishTransition({ cur: { created_by_tg_id: 7, publish_state: "published", published_at: "T", confirmed_by_tg_id: 7 }, me: 7, isAdmin: false, target: "cancelled", nowIso: "T" });
    return f.error === "forbidden" && c.patch.publish_state === "cancelled" && c.patch.published_at === null || "access";
  });

  await T("pub: replanWarning — активная публикация того же аккаунта → warn", () => {
    const ex = [{ account_id: 1, publish_state: "published" }, { account_id: 2, publish_state: "cancelled" }];
    return replanWarning({ account_id: 1, existing: ex }).warn === true
      && replanWarning({ account_id: 2, existing: ex }).warn === false || "replan";
  });

  await T("pub: slotConflicts — тот же аккаунт+день (в пачке и с существующими)", () => {
    const existing = [{ id: 5, account_id: 1, planned_at: "2026-09-20T10:00:00Z", publish_state: "planned" }];
    const drafts = [
      { account_id: 1, planned_at: "2026-09-20T18:00:00Z", creo_id: 11 },
      { account_id: 1, planned_at: "2026-09-21T10:00:00Z", creo_id: 12 },
      { account_id: 1, planned_at: "2026-09-21T20:00:00Z", creo_id: 13 },
    ];
    return slotConflicts({ drafts, existing }).length === 2 || "conflicts";
  });

  await T("pub: expandBatch one_per_day — ролик в день, все аккаунты", () => {
    const { drafts } = expandBatch({ creoIds: [11, 12], accountIds: [1, 2], level: "medium", mode: "one_per_day", dates: ["2026-09-20T09:00:00.000Z"] });
    const d12 = drafts.filter(d => d.creo_id === 12);
    return drafts.length === 4 && drafts.every(d => d.uniq_level === "medium")
      && d12.length === 2 && d12.every(d => d.planned_at.slice(0, 10) === "2026-09-21") || "batch";
  });

  await T("pub: expandBatch manual_dates + resolver подставляет путь ассета", () => {
    const creos = { 11: { result_paths: ["r11.mp4"] }, 12: { result_paths: ["r12.mp4"] } };
    const { drafts } = expandBatch({ creoIds: [11, 12], accountIds: [1], mode: "manual_dates", dates: ["2026-09-20T09:00:00Z", "2026-09-25T09:00:00Z"] }, id => creos[id]);
    return drafts.length === 2 && drafts[0].source_path === "r11.mp4"
      && drafts[1].planned_at.slice(0, 10) === "2026-09-25" || "manual";
  });
}
