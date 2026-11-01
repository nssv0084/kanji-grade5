import type { MonthlyTest, TestResult } from "../types";

/** 子どもに見せる、確定したテストの結果（K-07、TST-11、TST-14） */
export function testResult(t: MonthlyTest): TestResult {
  const wrong = t.questions.filter((q) => t.verdicts?.[q.no] !== "correct");
  return {
    month: t.month,
    title: t.title,
    score: t.score ?? 0,
    total: t.questions.length,
    missed: [...new Set(wrong.map((q) => q.kanji))],
    retry: wrong,
    retried: t.retriedAt !== undefined,
  };
}
