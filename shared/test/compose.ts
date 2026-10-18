import { daysBetween } from "../study/dates";
import { periodOn, planOrder, type Plan } from "../study/plan";
import { isEligible, type KanjiState, type StudyItem } from "../study/session";
import { mastery, type QuestionState } from "../study/srs";

// 月例テストの問題の選び方（TST-03、TST-04、TST-13）

export interface TestQuestion {
  no: number;
  itemId: string;
  kanji: string;
  type: "write" | "read";
  text: string;
}

export interface TestCounts {
  write: number;
  read: number;
}

export const testTitle = (month: string) => `${Number(month.slice(5, 7))}月の漢字テスト`;

/** 月の最終週（最後の7日）か。保護者の画面に「今月のテストを印刷しよう」を出す（TST-03） */
export function isLastWeek(date: string): boolean {
  const [y, m, d] = date.split("-").map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d > days - 7;
}

/** 新しい漢字を学ぶ月は書き取り20・読み10、復習の月は学校の50問テストに合わせて25・25（TST-04） */
export function defaultCounts(plan: Plan, date: string): TestCounts {
  const p = periodOn(plan, date);
  const reviewMonth = !!p && date > p.newUntil;
  return reviewMonth ? { write: 25, read: 25 } : { write: 20, read: 10 };
}

/** テストの対象の字。新しい漢字を学ぶ月はその月に習った字、復習の月はその期の字（TST-03） */
export function targetKanji(plan: Plan, kanji: Record<string, KanjiState>, month: string, date: string): string[] {
  const p = periodOn(plan, date);
  const order = planOrder(plan);
  if (p && date > p.newUntil) return order.slice(p.from, p.to).filter((k) => kanji[k]?.learnedOn);
  return order.filter((k) => kanji[k]?.learnedOn?.startsWith(month));
}

/** 「苦手」「練習中」を先に、次に長く出していない字（TST-13） */
function fillPriority(kanji: Record<string, KanjiState>, today: string) {
  const rank = { weak: 0, learning: 1, mastered: 2, unlearned: 3 } as const;
  return (a: string, b: string) =>
    rank[mastery(!!kanji[a]?.learnedOn, kanji[a]?.writes ?? [])] - rank[mastery(!!kanji[b]?.learnedOn, kanji[b]?.writes ?? [])] ||
    daysBetween(kanji[b]?.lastAsked ?? "2000-01-01", today) - daysBetween(kanji[a]?.lastAsked ?? "2000-01-01", today) ||
    a.localeCompare(b);
}

export function composeTest(args: {
  plan: Plan;
  month: string;
  today: string;
  items: StudyItem[];
  kanji: Record<string, KanjiState>;
  questions: Record<string, QuestionState>;
  counts: TestCounts;
}): TestQuestion[] {
  const { plan, month, today, items, kanji, questions, counts } = args;
  const eligible = items.filter((i) => isEligible(i, kanji));
  // 練習で解いたことのない問題を先に。同じなら itemId 順（並びを毎回同じにする）
  const fresh = (a: StudyItem, b: StudyItem) => (questions[a.itemId]?.attempts ?? 0) - (questions[b.itemId]?.attempts ?? 0) || a.itemId.localeCompare(b.itemId);
  const used = new Set<string>();
  const picked: StudyItem[] = [];
  const pick = (type: "write" | "read", k: string) => {
    const item = eligible.filter((i) => i.kanji === k && i.type === type && !used.has(i.itemId)).sort(fresh)[0];
    if (!item) return false;
    used.add(item.itemId);
    picked.push(item);
    return true;
  };

  const targets = targetKanji(plan, kanji, month, today);
  const others = Object.keys(kanji)
    .filter((k) => kanji[k].learnedOn && !targets.includes(k))
    .sort(fillPriority(kanji, today));

  for (const type of ["write", "read"] as const) {
    const want = counts[type];
    const start = picked.filter((p) => p.type === type).length;
    const have = () => picked.filter((p) => p.type === type).length - start;
    // 対象の字を1周ずつ（書き取りは各字1問以上）。足りなければもう1周、それでも足りなければ前に習った字で埋める
    for (let round = 0; round < 4 && have() < want; round++) {
      let progressed = false;
      for (const k of targets) if (have() < want && pick(type, k)) progressed = true;
      if (!progressed) break;
    }
    for (const k of others) if (have() < want) pick(type, k);
  }

  return picked.map((i, n) => ({ no: n + 1, itemId: i.itemId, kanji: i.kanji, type: i.type, text: i.text }));
}
