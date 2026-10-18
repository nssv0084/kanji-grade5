import { describe, expect, it } from "vitest";
import type { Plan } from "../../shared/study/plan";
import type { KanjiState, StudyItem } from "../../shared/study/session";
import { composeTest, defaultCounts, isLastWeek, targetKanji, testTitle } from "../../shared/test/compose";

// テスト用の学習順（本物の学習順はリポジトリに入れない）
const G5 = "像厚経賞情状象絶喜適解許容可技複術構復桜眼銅破修停易祖際準潔備貿質識報告属確因現造";
const plan: Plan = {
  schoolYear: 2026,
  lessons: [
    { volume: "上", no: 1, kanji: G5.slice(0, 20) },
    { volume: "下", no: 1, kanji: G5.slice(20, 40) },
  ],
  startIndex: 20,
  startedOn: "2026-10-18",
};

const items: StudyItem[] = [];
for (const k of G5) {
  for (let n = 1; n <= 4; n++) items.push({ itemId: `${k}-w${n}`, kanji: k, type: "write", text: `{${k}|あ}` });
  for (let n = 1; n <= 3; n++) items.push({ itemId: `${k}-r${n}`, kanji: k, type: "read", text: `{${k}|あ}` });
}
const kanji: Record<string, KanjiState> = {};
for (const k of G5.slice(0, 20)) kanji[k] = { learnedOn: "2026-09-30", writes: [] };
for (const [i, k] of [...G5.slice(20, 30)].entries()) kanji[k] = { learnedOn: `2026-10-${String(18 + i).padStart(2, "0")}`, writes: [] };

describe("月例テストの問題", () => {
  it("[TST-04] 新しい漢字を学ぶ月は書き取り20・読み10、復習の月は25・25", () => {
    expect(defaultCounts(plan, "2026-10-28")).toEqual({ write: 20, read: 10 });
    expect(defaultCounts(plan, "2027-03-25")).toEqual({ write: 25, read: 25 });
  });

  it("[TST-03] 月の最後の7日に、テストの印刷をうながす", () => {
    expect(isLastWeek("2026-10-24")).toBe(false);
    expect(isLastWeek("2026-10-25")).toBe(true);
    expect(isLastWeek("2026-10-31")).toBe(true);
    expect(isLastWeek("2027-02-21")).toBe(false);
    expect(isLastWeek("2027-02-22")).toBe(true);
    expect(testTitle("2026-10")).toBe("10月の漢字テスト");
  });

  it("[TST-03] 新しい漢字を学ぶ月は、その月に習った字を対象にする", () => {
    expect(targetKanji(plan, kanji, "2026-10", "2026-10-28")).toEqual([...G5.slice(20, 30)]);
  });

  it("[TST-13] その月の字は書き取りに各字1問以上出し、足りない分は前に習った字で埋める", () => {
    const qs = composeTest({ plan, month: "2026-10", today: "2026-10-28", items, kanji, questions: {}, counts: { write: 20, read: 10 } });
    const writes = qs.filter((q) => q.type === "write");
    expect(writes).toHaveLength(20);
    expect(qs.filter((q) => q.type === "read")).toHaveLength(10);
    for (const k of G5.slice(20, 30)) expect(writes.some((q) => q.kanji === k)).toBe(true);
    expect(new Set(qs.map((q) => q.itemId)).size).toBe(30);
    expect(qs.map((q) => q.no)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
  });

  it("[TST-13] その月の字が少ないときは、「苦手」の字を先に使って埋める", () => {
    const few: Record<string, KanjiState> = { ...kanji };
    for (const k of G5.slice(22, 30)) delete few[k];
    few[G5[5]] = { learnedOn: "2026-09-30", writes: [{ date: "2026-10-01", correct: false }, { date: "2026-10-02", correct: false }] };
    const qs = composeTest({ plan, month: "2026-10", today: "2026-10-28", items, kanji: few, questions: {}, counts: { write: 20, read: 10 } });
    const writes = qs.filter((q) => q.type === "write");
    expect(writes.filter((q) => q.kanji === G5[20] || q.kanji === G5[21])).toHaveLength(8);
    expect(writes[8].kanji).toBe(G5[5]);
  });

  it("[TST-13] 練習で解いたことのない問題を先に選ぶ", () => {
    const one: Record<string, KanjiState> = { [G5[20]]: { learnedOn: "2026-10-18", writes: [] } };
    const qs = composeTest({ plan, month: "2026-10", today: "2026-10-28", items, kanji: one, questions: { [`${G5[20]}-w1`]: { attempts: 2, correct: 1, reviewStreak: 0 } }, counts: { write: 1, read: 0 } });
    expect(qs[0].itemId).toBe(`${G5[20]}-w2`);
  });
});
