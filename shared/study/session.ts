import { requiredKanji, type ItemType } from "../items/text";
import { daysBetween } from "./dates";
import { mastery, needsCheck, type QuestionState, type WriteResult } from "./srs";

// 今日の練習の組み立て（CUR-02〜05、REV-04）

export const SESSION_LIMIT = 15;
export const NEW_SLOT = 6;
export const REVIEW_SLOT = 8;
export const SET_SIZE = 5;

export interface StudyItem {
  itemId: string;
  kanji: string;
  type: ItemType;
  text: string;
}

export interface KanjiState {
  learnedOn?: string;
  writes: WriteResult[];
  lastAsked?: string;
}

export interface SessionInput {
  today: string;
  items: StudyItem[];
  kanji: Record<string, KanjiState>;
  questions: Record<string, QuestionState>;
}

export interface Slot {
  itemId: string;
  reason: "new" | "review" | "check";
}

/** 問題文の5年生の漢字をすべて習っているか（CUR-01、CUR-05） */
export function isEligible(item: StudyItem, kanji: Record<string, KanjiState>): boolean {
  return requiredKanji(item.text).every((k) => kanji[k]?.learnedOn);
}

/** 書き取りを先、まだ解いていない問題を先、同じ順位なら itemId 順（並びを毎回同じにする） */
function byPriority(questions: Record<string, QuestionState>) {
  return (a: StudyItem, b: StudyItem) =>
    (a.type === "write" ? 0 : 1) - (b.type === "write" ? 0 : 1) ||
    (questions[a.itemId]?.attempts ?? 0) - (questions[b.itemId]?.attempts ?? 0) ||
    (questions[a.itemId]?.lastAnswered ?? "").localeCompare(questions[b.itemId]?.lastAnswered ?? "") ||
    a.itemId.localeCompare(b.itemId);
}

export function buildSession({ today, items, kanji, questions }: SessionInput): Slot[] {
  const eligible = items.filter((i) => isEligible(i, kanji));
  const slots: Slot[] = [];
  const used = new Set<string>();
  const take = (item: StudyItem, reason: Slot["reason"]) => {
    if (used.has(item.itemId) || slots.length >= SESSION_LIMIT) return false;
    used.add(item.itemId);
    slots.push({ itemId: item.itemId, reason });
    return true;
  };

  // 新しい漢字: 習ってから7日以内の字。新しい字ほど先に
  const recent = Object.entries(kanji)
    .filter(([, s]) => s.learnedOn && daysBetween(s.learnedOn, today) < 7)
    .sort(([, a], [, b]) => b.learnedOn!.localeCompare(a.learnedOn!))
    .map(([k]) => k);
  const newItems = recent.flatMap((k) => eligible.filter((i) => i.kanji === k).sort(byPriority(questions)));
  let added = 0;
  for (const item of newItems) if (added < NEW_SLOT && take(item, "new")) added++;

  // 復習: 予定日が来た問題（REV-01〜03）
  const due = eligible
    .filter((i) => questions[i.itemId]?.nextReview && questions[i.itemId].nextReview! <= today)
    .sort((a, b) => questions[a.itemId].nextReview!.localeCompare(questions[b.itemId].nextReview!) || a.itemId.localeCompare(b.itemId));
  added = 0;
  for (const item of due) if (added < REVIEW_SLOT && take(item, "review")) added++;

  // 確認: まだ定着していない字（覚えた字も30日出していなければ）から1問ずつ。出していない期間が長い字を先に
  const checkKanji = Object.entries(kanji)
    .filter(([, s]) => needsCheck(mastery(!!s.learnedOn, s.writes), s.lastAsked, today))
    .sort(([ka, a], [kb, b]) => (a.lastAsked ?? "").localeCompare(b.lastAsked ?? "") || ka.localeCompare(kb))
    .map(([k]) => k);
  for (const k of checkKanji) {
    if (slots.length >= SESSION_LIMIT) break;
    const pick = eligible.filter((i) => i.kanji === k && !used.has(i.itemId)).sort(byPriority(questions))[0];
    if (pick) take(pick, "check");
  }
  return slots;
}

/** 書き取りで間違えた字は、同じ字の別の書き取り問題も翌日の復習に入れる（REV-04） */
export function siblingForReview(missed: StudyItem, items: StudyItem[], kanji: Record<string, KanjiState>, questions: Record<string, QuestionState>): StudyItem | undefined {
  if (missed.type !== "write") return undefined;
  return items
    .filter((i) => i.kanji === missed.kanji && i.type === "write" && i.itemId !== missed.itemId && isEligible(i, kanji))
    .filter((i) => !questions[i.itemId]?.nextReview)
    .sort(byPriority(questions))[0];
}

export function toSets<T>(slots: T[]): T[][] {
  const sets: T[][] = [];
  for (let i = 0; i < slots.length; i += SET_SIZE) sets.push(slots.slice(i, i + SET_SIZE));
  return sets;
}
