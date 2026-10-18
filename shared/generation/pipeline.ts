import { checkItem } from "../items/check";
import { normalizeReading, parseText, targetOf, type ItemType } from "../items/text";
import type { GeneratedItems, Verification, VerifyQuestion } from "./prompts";

// 生成した問題をふるいにかける（GEN-06、LVL-01〜04）。API を呼ぶ部分と分けて、テストできるようにする

export interface Candidate {
  kanji: string;
  type: ItemType;
  text: string;
}

/** 同じ形式で同じ語を問う問題は1つだけにする（REV-04 で別の語の問題に回せるように） */
const sameQuestionKey = (type: ItemType, text: string) => `${type}:${targetOf(text).word}`;

/** 機械的な検査（LVL-01、LVL-02）に通り、すでにある問題と同じ文・同じ語の問題でないものだけを残す */
export function screen(
  kanji: string,
  generated: GeneratedItems,
  existing: { type: ItemType; text: string }[],
): { kept: Candidate[]; rejected: { text: string; reason: string }[] } {
  const kept: Candidate[] = [];
  const rejected: { text: string; reason: string }[] = [];
  const seen = new Set(existing.map((e) => sameQuestionKey(e.type, e.text)));
  for (const g of generated.items) {
    const c: Candidate = { kanji, type: g.type, text: g.text.trim() };
    const r = checkItem(c);
    if (r.errors.length || r.warnings.length) {
      rejected.push({ text: c.text, reason: [...r.errors, ...r.warnings].join(" / ") });
      continue;
    }
    const key = sameQuestionKey(c.type, c.text);
    if (seen.has(key)) {
      rejected.push({ text: c.text, reason: "すでにある問題と同じ語" });
      continue;
    }
    seen.add(key);
    kept.push(c);
  }
  return { kept, rejected };
}

/**
 * 問題が足りない字（GEN-06、GEN-08）。習った字を先に（学習順）、次に2週間先までに習う予定の字。
 * 1回の実行で扱う字数に上限を設ける（Lambda の時間と費用を抑えるため）
 */
export function kanjiNeedingItems(args: {
  order: string[];
  learnedCount: number;
  aheadCount: number;
  counts: Record<string, Partial<Record<ItemType, number>>>;
  limit: number;
}): { kanji: string; write: number; read: number }[] {
  const out: { kanji: string; write: number; read: number }[] = [];
  for (const k of args.order.slice(0, args.learnedCount + args.aheadCount)) {
    const write = Math.max(0, TARGET_PER_KANJI.write - (args.counts[k]?.write ?? 0));
    const read = Math.max(0, TARGET_PER_KANJI.read - (args.counts[k]?.read ?? 0));
    if (write + read > 0) out.push({ kanji: k, write, read });
    if (out.length >= args.limit) break;
  }
  return out;
}

/** 2週間先までに習う予定の字数（1日1字の目安） */
export const AHEAD_DAYS = 14;

/** 検証用に、答えを伏せた形にする */
export function toVerifyQuestions(cands: Candidate[]): VerifyQuestion[] {
  return cands.map((c, i) => ({
    no: i + 1,
    type: c.type,
    shown: parseText(c.text)
      .map((s) => (s.kind === "plain" ? s.text : c.type === "write" ? `［${s.reading}］` : `［${s.word}］`))
      .join(""),
  }));
}

/** 検証の結果、正答と一致し、答えが1つに決まり、自然で、5年生に合う問題だけを合格にする（LVL-03） */
export function passed(cands: Candidate[], v: Verification): { ok: Candidate[]; failed: { text: string; reason: string }[] } {
  const ok: Candidate[] = [];
  const failed: { text: string; reason: string }[] = [];
  cands.forEach((c, i) => {
    const r = v.results.find((x) => x.no === i + 1);
    const { word, reading } = targetOf(c.text);
    const expected = c.type === "write" ? word : reading;
    const got = r ? (c.type === "write" ? r.answer.trim() : normalizeReading(r.answer)) : "";
    if (!r) failed.push({ text: c.text, reason: "検証の結果がない" });
    else if (got !== expected) failed.push({ text: c.text, reason: `答えが合わない（検証: ${r.answer}）` });
    else if (!r.uniqueAnswer || !r.natural || !r.suitableForGrade5) failed.push({ text: c.text, reason: r.issue || "答えが1つに決まらない・不自然・5年生に合わない" });
    else ok.push(c);
  });
  return { ok, failed };
}

/** 保護者の承認が型ごとに20問に届くまでは確認待ち、その後は約1割を抜き取りで確認待ちにする（LVL-04） */
export const CALIBRATION_TARGET = 20;
export const SAMPLE_RATIO = 0.1;

export function initialStatus(parentApproved: number, random: number): "approved" | "review" {
  if (parentApproved < CALIBRATION_TARGET) return "review";
  return random < SAMPLE_RATIO ? "review" : "approved";
}

/** 1字あたりの目安（GEN-04）。送りがな・熟語は4択の画面ができてから */
export const TARGET_PER_KANJI: Record<ItemType, number> = { write: 4, read: 3 };
