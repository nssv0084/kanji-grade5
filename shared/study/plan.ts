import { addDays, daysBetween, endOfMonth } from "./dates";

// 年間の学習計画（CUR-06〜12）。上期は4〜8月に上巻、下期は10〜2月に下巻の漢字を学ぶ。9月と3月は復習の月

export interface Lesson {
  volume: "上" | "下";
  no: number;
  kanji: string;
}

export interface Plan {
  /** 年度（4月始まり）の開始年 */
  schoolYear: number;
  /** 学習順（ドリル・教科書の順）。リポジトリには入れず、本番のデータとしてだけ持つ（CUR-08） */
  lessons: Lesson[];
  /** 使い始めた位置（学習順の何字目から。0始まり）と、その日 */
  startIndex: number;
  startedOn: string;
}

export interface Period {
  volume: "上" | "下";
  /** 学習順の範囲 [from, to) */
  from: number;
  to: number;
  /** 新しい漢字を学ぶ期間（5か月）と、復習の月 */
  newFrom: string;
  newUntil: string;
  reviewUntil: string;
}

export function planOrder(plan: Plan): string[] {
  return plan.lessons.flatMap((l) => [...l.kanji]);
}

export function periods(plan: Plan): Period[] {
  const y = plan.schoolYear;
  const order = (v: "上" | "下") => plan.lessons.filter((l) => l.volume === v).reduce((n, l) => n + [...l.kanji].length, 0);
  const upper = order("上");
  const total = upper + order("下");
  return [
    { volume: "上", from: 0, to: upper, newFrom: `${y}-04-01`, newUntil: `${y}-08-31`, reviewUntil: `${y}-09-30` },
    {
      volume: "下",
      from: upper,
      to: total,
      newFrom: `${y}-10-01`,
      newUntil: endOfMonth(`${y + 1}-02-01`),
      reviewUntil: `${y + 1}-03-31`,
    },
  ];
}

export function periodOn(plan: Plan, date: string): Period | undefined {
  return periods(plan).find((p) => date >= p.newFrom && date <= p.reviewUntil);
}

/** 単元の切れ目（その回までの累計字数）。月の境目をここに合わせる（CUR-07） */
function lessonEnds(plan: Plan): number[] {
  let n = 0;
  return plan.lessons.map((l) => (n += [...l.kanji].length));
}

/**
 * その日までに習っておく予定の字数（学習順の位置）。
 * 期の途中から始めたときは、始めた日・位置から期の終わりまでを均等に割る（CUR-12）。
 * 月末の予定は単元の切れ目に合わせる（CUR-07）
 */
export function monthTarget(plan: Plan, date: string): number {
  const p = periodOn(plan, date);
  if (!p) return date < periods(plan)[0].newFrom ? 0 : planOrder(plan).length;
  if (date > p.newUntil) return p.to;
  const startDay = plan.startedOn > p.newFrom ? plan.startedOn : p.newFrom;
  const startPos = Math.max(p.from, Math.min(plan.startIndex, p.to));
  const span = daysBetween(startDay, p.newUntil) + 1;
  const monthEnd = endOfMonth(date) < p.newUntil ? endOfMonth(date) : p.newUntil;
  const share = Math.min(1, (daysBetween(startDay, monthEnd) + 1) / span);
  const linear = startPos + (p.to - startPos) * share;
  if (monthEnd === p.newUntil) return p.to;
  const ends = lessonEnds(plan).filter((e) => e > startPos && e <= p.to);
  return ends.reduce((best, e) => (Math.abs(e - linear) < Math.abs(best - linear) ? e : best), ends[0] ?? p.to);
}

/** その日に予定どおりなら習っているはずの字数（遅れの計算用。日割り） */
export function expectedByDay(plan: Plan, date: string): number {
  const p = periodOn(plan, date);
  if (!p) return date < periods(plan)[0].newFrom ? 0 : planOrder(plan).length;
  if (date > p.newUntil) return p.to;
  const startDay = plan.startedOn > p.newFrom ? plan.startedOn : p.newFrom;
  const startPos = Math.max(p.from, Math.min(plan.startIndex, p.to));
  if (date < startDay) return startPos;
  const span = daysBetween(startDay, p.newUntil) + 1;
  return Math.floor(startPos + ((p.to - startPos) * (daysBetween(startDay, date) + 1)) / span);
}

/**
 * 今日新しく出す字（CUR-09〜11）。
 * 1日1字。予定より遅れていたら2字まで。月の予定字数に達したら出さない。復習の月は出さない。
 */
export function newKanjiForDay(plan: Plan, date: string, learnedCount: number): string[] {
  const p = periodOn(plan, date);
  if (!p || date > p.newUntil) return [];
  const order = planOrder(plan);
  const target = Math.min(monthTarget(plan, date), p.to);
  const behind = expectedByDay(plan, date) - learnedCount;
  const count = Math.max(0, Math.min(behind > 0 ? 2 : 1, target - learnedCount));
  return order.slice(learnedCount, learnedCount + count);
}

/** 予定との差（正なら遅れ、負なら進み）。保護者の画面に出す（CUR-10） */
export function behindBy(plan: Plan, date: string, learnedCount: number): number {
  return expectedByDay(plan, date) - learnedCount;
}

export { addDays };
