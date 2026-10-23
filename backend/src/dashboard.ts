import { GRADE5_CHARS } from "../../shared/kanji";
import { summarize, type DayAmount, type DayTally } from "../../shared/study/dashboard";
import { addDays, studyDate } from "../../shared/study/dates";
import type { Streak } from "../../shared/study/streak";
import type { ChildDashboard } from "../../shared/types";
import { listChildren } from "./lib/children";
import { getItem, keys, queryAll, queryUserPrefix } from "./lib/db";
import type { TestRecord } from "./monthlyTest";
import { loadKanji, loadPlan } from "./study";

// 保護者のダッシュボード（P-01、DSH-01、DSH-02、DSH-05、DSH-06、STK-03）

async function recentDays(sub: string, today: string): Promise<DayAmount[]> {
  const rows = await queryAll<DayTally & { sk: string }>({
    KeyConditionExpression: "pk = :pk AND sk BETWEEN :from AND :to",
    ExpressionAttributeValues: { ":pk": `USER#${sub}`, ":from": `DAY#${addDays(today, -6)}`, ":to": `DAY#${today}` },
  });
  return rows.map((r) => ({ date: r.sk.slice(4), answers: r.answers, correct: r.correct, ...(r.byType && { byType: r.byType }) }));
}

export async function getChildren(now = new Date()): Promise<ChildDashboard[]> {
  const today = studyDate(now);
  const children = await listChildren();
  return Promise.all(
    children.map(async (c) => {
      const [plan, kanji, profile, days, tests] = await Promise.all([
        loadPlan(c.sub),
        loadKanji(c.sub),
        getItem<Streak>(keys.profile(c.sub)),
        recentDays(c.sub, today),
        queryUserPrefix<TestRecord>(c.sub, "MTEST#"),
      ]);
      const testScores = tests.filter((t) => t.status === "confirmed").map((t) => ({ month: t.month, score: t.score ?? 0, total: t.questions.length }));
      return { childId: c.sub, nickname: c.nickname, ...summarize({ today, plan, kanji, profile: profile ?? { days: 0 }, days, total: GRADE5_CHARS.length, tests: testScores }) };
    }),
  );
}
