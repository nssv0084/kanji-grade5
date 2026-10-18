import { randomUUID } from "node:crypto";
import { overBudget } from "../../shared/generation/cost";
import { AHEAD_DAYS, initialStatus, kanjiNeedingItems, passed, screen, toVerifyQuestions, type Candidate } from "../../shared/generation/pipeline";
import { GENERATION_SYSTEM, GeneratedItems, generationPrompt, VERIFICATION_SYSTEM, Verification, verificationPrompt } from "../../shared/generation/prompts";
import type { ItemType } from "../../shared/items/text";
import { planOrder, type Plan } from "../../shared/study/plan";
import { listChildren } from "./lib/children";
import { askStructured } from "./lib/claude";
import { getItem, putItem, queryAll, queryUserPrefix } from "./lib/db";
import { itemsByStatus, parentApprovedCount, saveItem, type ItemRecord } from "./lib/items";
import { jobKey, newJob, type JobRecord } from "./lib/jobs";
import { getSettings, monthSpent } from "./lib/usage";

// 問題の生成（GEN-04〜08、LVL-01〜04）。毎日の定時と、保護者の「問題を作る」で起動する。
// 失敗しても自動で再実行しない（二重に課金されるため。Lambda の retryAttempts: 0）

/** 1回の実行で扱う字数の上限（Lambda の15分と費用を抑えるため） */
export const MAX_KANJI_PER_RUN = 10;
/** 検査・検証で落ちた分を作り直す回数 */
const RETRY_ROUNDS = 1;

/** 子どもの学習計画から、習った字と、2週間先までの字を集める */
async function childPlans(): Promise<{ order: string[]; learned: Set<string>; learnedCount: number }[]> {
  const out = [];
  for (const { sub } of await listChildren()) {
    const plans = await queryUserPrefix<Plan>(sub, "PLAN#");
    const plan = plans.sort((a, b) => b.schoolYear - a.schoolYear)[0];
    if (!plan) continue;
    const kanji = await queryUserPrefix<{ kanji: string; learnedOn?: string }>(sub, "KANJI#");
    const learned = new Set(kanji.filter((k) => k.learnedOn).map((k) => k.kanji));
    const order = planOrder(plan);
    const i = order.findIndex((k) => !learned.has(k));
    out.push({ order, learned, learnedCount: i === -1 ? order.length : i });
  }
  return out;
}

export async function handler(event: { jobId?: string; trigger?: JobRecord["trigger"] }): Promise<void> {
  const job = (event.jobId && (await getItem<JobRecord>(jobKey(event.jobId)))) || newJob(event.trigger ?? "scheduled");
  await putItem({ ...job });
  try {
    await run(job);
    job.status = job.status === "running" ? "done" : job.status;
  } catch (e) {
    console.error(e);
    job.status = "failed";
    job.message = (e as Error).message;
  }
  job.finishedAt = new Date().toISOString();
  await putItem({ ...job });
}

async function run(job: JobRecord): Promise<void> {
  const settings = await getSettings();
  const children = await childPlans();
  if (children.length === 0) {
    job.message = "学習計画のある子どもがいません";
    return;
  }

  const items = await itemsByStatus(["approved", "review", "pending"]);
  const counts: Record<string, Partial<Record<ItemType, number>>> = {};
  for (const i of items.filter((i) => i.status !== "pending")) {
    counts[i.kanji] ??= {};
    counts[i.kanji][i.type] = (counts[i.kanji][i.type] ?? 0) + 1;
  }

  // 子どもが複数いても同じ字は1回だけ。習った字のうち一番多く進んでいる子どもに合わせる
  const child = children.sort((a, b) => b.learnedCount - a.learnedCount)[0];
  // 続けて1問も作れなかった回数（GEN-10）。使える語が少ない字で、毎日作り直しが続かないようにする
  const missRows = await queryAll<{ sk: string; misses: number }>({ KeyConditionExpression: "pk = :p", ExpressionAttributeValues: { ":p": "GENSTAT" } });
  const misses = Object.fromEntries(missRows.map((r) => [r.sk, r.misses]));
  const needs = kanjiNeedingItems({ order: child.order, learnedCount: child.learnedCount, aheadCount: AHEAD_DAYS, counts, limit: MAX_KANJI_PER_RUN, misses });
  job.kanji = needs.map((n) => n.kanji);
  await putItem({ ...job });

  const approvedByParent = { write: parentApprovedCount(items as ItemRecord[], "write"), read: parentApprovedCount(items as ItemRecord[], "read") };

  for (const need of needs) {
    if (overBudget(await monthSpent(), settings)) {
      job.status = "budget";
      job.message = "今月の予算の90%に達したため、生成を止めました";
      return;
    }
    // 問題文に使ってよい5年生の字は、習った字と対象の字だけ（CUR-05 で出せない問題を作らない）
    const allowed = [...new Set([...child.learned, need.kanji])];
    const existing = items.filter((i) => i.kanji === need.kanji).map((i) => ({ type: i.type, text: i.text }));
    let remaining = { write: need.write, read: need.read };

    for (let round = 0; round <= RETRY_ROUNDS && remaining.write + remaining.read > 0; round++) {
      const generated = await askStructured({
        model: settings.generationModel,
        system: GENERATION_SYSTEM,
        prompt: generationPrompt({ kanji: need.kanji, write: remaining.write, read: remaining.read, allowedGrade5: allowed, existing: existing.map((e) => e.text) }),
        schema: GeneratedItems,
        purpose: `generate:${need.kanji}`,
      });
      const { kept, rejected } = screen(need.kanji, generated, existing);
      job.rejected += rejected.length;
      for (const r of rejected) console.log(`検査で除外 ${r.text}: ${r.reason}`);
      if (kept.length === 0) continue;

      const verification = await askStructured({
        model: settings.verificationModel,
        system: VERIFICATION_SYSTEM,
        prompt: verificationPrompt(toVerifyQuestions(kept)),
        schema: Verification,
        purpose: `verify:${need.kanji}`,
      });
      const { ok, failed } = passed(kept, verification);
      job.rejected += failed.length;
      for (const f of failed) console.log(`検証で除外 ${f.text}: ${f.reason}`);

      for (const c of pickWithin(ok, remaining)) {
        await saveCandidate(c, initialStatus(approvedByParent[c.type], Math.random()), settings.generationModel);
        existing.push({ type: c.type, text: c.text });
        remaining = { ...remaining, [c.type]: remaining[c.type] - 1 };
        job.created++;
      }
      await putItem({ ...job });
    }

    const made = need.write + need.read - (remaining.write + remaining.read);
    const nextMisses = made === 0 ? (misses[need.kanji] ?? 0) + 1 : 0;
    if (nextMisses !== (misses[need.kanji] ?? 0)) await putItem({ pk: "GENSTAT", sk: need.kanji, misses: nextMisses });
    if (made === 0) console.log(`「${need.kanji}」は1問も作れなかった（続けて ${nextMisses} 回）`);
  }
}

/** 足りない数より多く合格したら、足りない数だけ使う */
function pickWithin(ok: Candidate[], remaining: Record<ItemType, number>): Candidate[] {
  const left = { ...remaining };
  return ok.filter((c) => (left[c.type] > 0 ? (left[c.type]--, true) : false));
}

async function saveCandidate(c: Candidate, status: "approved" | "review", model: string): Promise<void> {
  await saveItem({
    itemId: `${c.type}-${randomUUID().slice(0, 12)}`,
    kanji: c.kanji,
    type: c.type,
    text: c.text,
    status,
    source: "ai",
    model,
    createdAt: new Date().toISOString(),
  });
}
