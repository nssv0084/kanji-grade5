import { describe, expect, it } from "vitest";
import { budgetMicroUsd, DEFAULT_SETTINGS, gradingOverBudget } from "../../shared/generation/cost";
import type { TestQuestion } from "../../shared/test/compose";
import { expectedAnswer, finalize, gradingPrompt, judgeAnswers, retakeReasons, type SheetReading } from "../../shared/test/grade";

const questions: TestQuestion[] = [
  { no: 1, itemId: "w1", kanji: "評", type: "write", text: "新しいゲームは{好評|こうひょう}だ。" },
  { no: 2, itemId: "w2", kanji: "護", type: "write", text: "動物を{愛護|あいご}する。" },
  { no: 3, itemId: "r1", kanji: "評", type: "read", text: "先生が作文を{評価|ひょうか}する。" },
];

type Answer = SheetReading["answers"][number];
const box = { x: 100, y: 200, width: 300, height: 60 };
const ans = (no: number, written: string, extra: Partial<Answer> = {}): Answer => ({
  no,
  written,
  legibility: "clear",
  formError: false,
  confidence: "high",
  note: "",
  photo: 1,
  box,
  ...extra,
});
const reading = (answers: Answer[], sheets: SheetReading["sheets"] = [{ photo: 1, usable: true, problem: "" }]): SheetReading => ({ sheets, answers });

describe("月例テストの採点", () => {
  it("[TST-08] 書き取りはマスに書く5年生の字だけ、読みはひらがなで比べる", () => {
    expect(questions.map(expectedAnswer)).toEqual(["評", "護", "ひょうか"]);
    const r = judgeAnswers(questions, reading([ans(1, "評"), ans(2, "談"), ans(3, "ヒョウカ")]), 1);
    expect(r.map((a) => a.verdict)).toEqual(["correct", "wrong", "correct"]);
    expect(r.every((a) => !a.needsCheck)).toBe(true);
    expect(r[0].box).toEqual({ photo: 0, ...box });
  });

  it("[TST-08] AI には正答を渡さない（書かれた字をそのまま読み取ってもらう）", () => {
    const p = gradingPrompt("10月の漢字テスト", questions, 1);
    expect(p).toContain("好□（よみ: こうひょう）");
    expect(p).toContain("愛□（よみ: あいご）");
    expect(p).not.toContain("好評");
    expect(p).not.toContain("愛護");
    // 読みの問題は漢字を見せる（印刷されている）が、読みは見せない
    expect(p).toContain("［評価］");
    expect(p).not.toContain("ひょうか");
  });

  it("[TST-08] 字の形がちがうときは、近い字が正答でも不正解にして確認を求める", () => {
    const [a] = judgeAnswers(questions.slice(0, 1), reading([ans(1, "評", { formError: true, note: "右の部分の横画が1本足りない" })]), 1);
    expect(a.verdict).toBe("wrong");
    expect(a.needsCheck).toBe(true);
  });

  it("[TST-08] とめ・はねの指摘は参考で、点数には入れない", () => {
    const [a] = judgeAnswers(questions.slice(0, 1), reading([ans(1, "評", { note: "最後の画をはねている" })]), 1);
    expect(a.verdict).toBe("correct");
    expect(a.needsCheck).toBe(false);
    expect(a.note).toBe("最後の画をはねている");
  });

  it("[TST-09] 読み取れない・自信が低い・見つからない問は、確認が要る", () => {
    const r = judgeAnswers(questions, reading([ans(1, "評", { legibility: "unclear" }), ans(2, "護", { confidence: "low" })]), 1);
    expect(r.map((a) => [a.verdict, a.needsCheck])).toEqual([
      ["unreadable", true],
      ["correct", true],
      ["unreadable", true],
    ]);
    expect(r[2].box).toBeUndefined();
  });

  it("[TST-08] 何も書いていない答えは不正解", () => {
    const [a] = judgeAnswers(questions.slice(0, 1), reading([ans(1, "", { legibility: "blank" })]), 1);
    expect(a.verdict).toBe("wrong");
  });

  it("[TST-09] 確認が要る問は、保護者が○×を選ばないと確定できない", () => {
    const r = judgeAnswers(questions, reading([ans(1, "評", { legibility: "unclear" }), ans(2, "談"), ans(3, "ひょうか")]), 1);
    expect(finalize(r, {})).toEqual({ missing: [1] });
    expect(finalize(r, { 1: "correct", 2: "correct" })).toEqual({ verdicts: { 1: "correct", 2: "correct", 3: "correct" }, score: 3 });
  });

  it("[TST-10] 使えない写真や、解答欄の多くが見つからないときは撮り直しを求める", () => {
    const bad = reading([ans(1, "評"), ans(2, "護"), ans(3, "ひょうか")], [{ photo: 1, usable: false, problem: "暗くて読めません" }]);
    expect(retakeReasons(bad, judgeAnswers(questions, bad, 1))).toEqual(["写真1: 暗くて読めません"]);

    const partial = reading([ans(1, "評")]);
    expect(retakeReasons(partial, judgeAnswers(questions, partial, 1))).toHaveLength(1);

    const ok = reading([ans(1, "評"), ans(2, "護"), ans(3, "ひょうか")]);
    expect(retakeReasons(ok, judgeAnswers(questions, ok, 1))).toEqual([]);
  });

  it("[TST-08] 写真の番号や解答欄の位置がおかしいときは、切り抜きを出さずに確認を求める", () => {
    const r = judgeAnswers(questions.slice(0, 1), reading([ans(1, "評", { photo: 3 })]), 1);
    expect(r[0].box).toBeUndefined();
    expect(r[0].needsCheck).toBe(true);
  });
});

describe("採点の費用", () => {
  it("[COST-01] 月例テストの採点は、予算の100%まで止めない", () => {
    const budget = budgetMicroUsd(DEFAULT_SETTINGS);
    expect(gradingOverBudget(budget * 0.95, DEFAULT_SETTINGS)).toBe(false);
    expect(gradingOverBudget(budget, DEFAULT_SETTINGS)).toBe(true);
  });
});
