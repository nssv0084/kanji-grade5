import { describe, expect, it } from "vitest";
import { summarize } from "../../shared/study/dashboard";
import type { Plan } from "../../shared/study/plan";
import type { KanjiState } from "../../shared/study/session";

// テスト用の学習順（本物の学習順はリポジトリに入れない）
const G5 = "像厚経賞情状象絶喜適解許容可技複術構復桜眼銅破修停易祖際準潔備貿質識報告属確因現造";
const plan: Plan = {
  schoolYear: 2026,
  lessons: [
    { volume: "上", no: 1, kanji: G5.slice(0, 20) },
    { volume: "下", no: 1, kanji: G5.slice(20, 30) },
    { volume: "下", no: 2, kanji: G5.slice(30, 40) },
  ],
  startIndex: 20,
  startedOn: "2026-10-18",
};

const kanji: Record<string, KanjiState> = {};
for (const k of G5.slice(0, 22)) kanji[k] = { learnedOn: "2026-09-30", writes: [] };
kanji[G5[0]] = { learnedOn: "2026-09-30", writes: [{ date: "2026-10-10", correct: true }, { date: "2026-10-14", correct: true }] };
kanji[G5[1]] = { learnedOn: "2026-09-30", writes: [{ date: "2026-10-10", correct: true }, { date: "2026-10-12", correct: false }, { date: "2026-10-14", correct: false }] };

const base = { plan, kanji, total: 193, days: [{ date: "2026-10-19", answers: 15, correct: 12 }] };

describe("保護者のダッシュボード", () => {
  it("[DSH-01] 習った字・覚えた字・苦手な字の数と、今日までの7日分の学習量を出す", () => {
    const s = summarize({ ...base, today: "2026-10-20", profile: { days: 3, lastStudyDate: "2026-10-19" } });
    expect([s.learned, s.mastered, s.weak, s.total]).toEqual([22, 1, 1, 193]);
    expect(s.streak).toBe(3);
    expect(s.week.map((d) => d.date)).toEqual(["2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18", "2026-10-19", "2026-10-20"]);
    expect(s.week[5]).toEqual({ date: "2026-10-19", answers: 15, correct: 12 });
    expect(s.week[6].answers).toBe(0);
  });

  it("[STK-03] 最後の学習から2日以上空いたら知らせる", () => {
    expect(summarize({ ...base, today: "2026-10-20", profile: { days: 1, lastStudyDate: "2026-10-19" } }).idleAlert).toBe(false);
    const s = summarize({ ...base, today: "2026-10-21", profile: { days: 1, lastStudyDate: "2026-10-19" } });
    expect([s.idleDays, s.idleAlert, s.streak]).toEqual([2, true, 0]);
    expect(summarize({ ...base, today: "2026-10-20", profile: { days: 0 } }).idleAlert).toBe(true);
  });

  it("[DSH-02] 苦手な字の一覧に、直近の書き取りの結果をつける", () => {
    const s = summarize({ ...base, today: "2026-10-20", profile: { days: 0 } });
    expect(s.weakKanji).toEqual([{ kanji: G5[1], recent: [true, false, false] }]);
  });

  it("[DSH-05] [CUR-10] 今月の予定の位置、予定との差、期の残り日数を出す", () => {
    const s = summarize({ ...base, today: "2026-10-20", profile: { days: 0 } });
    expect(s.progress?.learnedCount).toBe(22);
    expect(s.progress?.monthTarget).toBeGreaterThan(20);
    expect(s.progress?.reviewMonth).toBe(false);
    expect(s.progress?.daysLeft).toBe(131);
    const late = summarize({ ...base, today: "2027-01-15", profile: { days: 0 } });
    expect(late.progress?.behind).toBeGreaterThan(0);
  });

  it("[DSH-05] 復習の月は予定との差を出さず、月末までの日数を出す", () => {
    const s = summarize({ ...base, today: "2027-03-20", profile: { days: 0 } });
    expect(s.progress).toMatchObject({ reviewMonth: true, behind: 0, daysLeft: 11 });
  });

  it("[DSH-05] 月例テストの点数を古い月から並べる", () => {
    const tests = [
      { month: "2026-11", score: 27, total: 30 },
      { month: "2026-10", score: 24, total: 30 },
    ];
    expect(summarize({ ...base, today: "2026-11-30", profile: { days: 0 }, tests }).testScores.map((t) => t.month)).toEqual(["2026-10", "2026-11"]);
    expect(summarize({ ...base, today: "2026-10-20", profile: { days: 0 } }).testScores).toEqual([]);
  });

  it("[DSH-05] 学習計画がなければ進み具合を出さない", () => {
    expect(summarize({ ...base, plan: undefined, today: "2026-10-20", profile: { days: 0 } }).progress).toBeUndefined();
  });
});
