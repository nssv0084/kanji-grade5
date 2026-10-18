import { describe, expect, it } from "vitest";
import { addDays, studyDate } from "../../shared/study/dates";
import { behindBy, monthTarget, newKanjiForDay, periodOn, type Plan } from "../../shared/study/plan";
import { buildSession, isEligible, SESSION_LIMIT, siblingForReview, toSets, type KanjiState, type StudyItem } from "../../shared/study/session";
import { mastery, needsCheck, nextQuestionState } from "../../shared/study/srs";
import { currentStreak, isStudyDay, markStudied, milestoneToCelebrate } from "../../shared/study/streak";

// テスト用の学習順。上巻 4回×5字=20字、下巻 5回×4字=20字（本物の学習順はリポジトリに入れない）
const G5 = "像厚経賞情状象絶喜適解許容可技複術構復桜眼銅破修停易祖際準潔備貿質識報告属確因現造";
const plan: Plan = {
  schoolYear: 2026,
  lessons: [
    ...[0, 1, 2, 3].map((i) => ({ volume: "上" as const, no: i + 1, kanji: G5.slice(i * 5, i * 5 + 5) })),
    ...[0, 1, 2, 3, 4].map((i) => ({ volume: "下" as const, no: i + 1, kanji: G5.slice(20 + i * 4, 24 + i * 4) })),
  ],
  startIndex: 20,
  startedOn: "2026-10-18",
};

describe("学習日", () => {
  it("[STK-02] 日本時間の午前3時で翌日に切り替える", () => {
    expect(studyDate(new Date("2026-10-18T17:59:00Z"))).toBe("2026-10-18"); // 日本時間 19日 2:59
    expect(studyDate(new Date("2026-10-18T18:00:00Z"))).toBe("2026-10-19"); // 日本時間 19日 3:00
  });
});

describe("年間の学習計画", () => {
  it("[CUR-06] 上期は4〜8月に上巻、9月は復習。下期は10〜2月に下巻、3月は復習", () => {
    expect(periodOn(plan, "2026-05-10")?.volume).toBe("上");
    expect(periodOn(plan, "2026-12-01")?.volume).toBe("下");
    expect(newKanjiForDay({ ...plan, startIndex: 0, startedOn: "2026-04-01" }, "2026-09-10", 20)).toEqual([]);
    expect(newKanjiForDay(plan, "2027-03-10", 40)).toEqual([]);
  });

  it("[CUR-11] 復習の月（9月・3月）は新しい漢字を出さない", () => {
    expect(newKanjiForDay(plan, "2027-03-01", 30)).toEqual([]);
  });

  it("[CUR-07] 下期の終わり（2月末）までに下巻を学び終える予定にする", () => {
    expect(monthTarget(plan, "2027-02-10")).toBe(40);
  });

  it("[CUR-07] 月の予定は単元の切れ目に合わせる", () => {
    const ends = [24, 28, 32, 36, 40];
    for (const d of ["2026-10-20", "2026-11-15", "2026-12-15", "2027-01-15"]) {
      expect(ends).toContain(monthTarget(plan, d));
    }
  });

  it("[CUR-09] 1日1字、学習順のとおりに出す", () => {
    expect(newKanjiForDay(plan, "2026-10-18", 20)).toEqual([G5[20]]);
  });

  it("[CUR-09] 月の予定字数に達したら、その月は新しい字を出さない", () => {
    const target = monthTarget(plan, "2026-10-25");
    expect(newKanjiForDay(plan, "2026-10-25", target)).toEqual([]);
  });

  it("[CUR-10] 予定より遅れていたら1日2字にして追いつき、遅れを数える", () => {
    expect(behindBy(plan, "2026-12-20", 22)).toBeGreaterThan(0);
    expect(newKanjiForDay(plan, "2026-12-20", 22)).toHaveLength(2);
  });

  it("[CUR-12] 期の途中から始めたときは、始めた位置から出す", () => {
    expect(newKanjiForDay(plan, "2026-10-18", 20)[0]).toBe(plan.lessons[4].kanji[0]);
  });
});

describe("復習", () => {
  const today = "2026-10-20";
  it("[REV-01] 間違えたら翌日の復習に出し、正解したら3日後にもう一度出す", () => {
    const missed = nextQuestionState(undefined, false, today);
    expect(missed.nextReview).toBe(addDays(today, 1));
    const once = nextQuestionState(missed, true, addDays(today, 1));
    expect(once.nextReview).toBe(addDays(today, 4));
  });

  it("[REV-02] 2回続けて正解したら復習の対象から外す", () => {
    let s = nextQuestionState(undefined, false, today);
    s = nextQuestionState(s, true, addDays(today, 1));
    s = nextQuestionState(s, true, addDays(today, 4));
    expect(s.nextReview).toBeUndefined();
  });

  it("[REV-03] 復習で間違えたら翌日から数え直す", () => {
    let s = nextQuestionState(undefined, false, today);
    s = nextQuestionState(s, true, addDays(today, 1));
    s = nextQuestionState(s, false, addDays(today, 4));
    expect(s.nextReview).toBe(addDays(today, 5));
    expect(s.reviewStreak).toBe(0);
  });

  it("最初から正解した問題は復習に入れない", () => {
    expect(nextQuestionState(undefined, true, today).nextReview).toBeUndefined();
  });
});

describe("定着度", () => {
  it("[MAP-01] 日を空けて2回続けて書けたら「覚えた」、直近3回で2回以上間違えたら「苦手」", () => {
    expect(mastery(false, [])).toBe("unlearned");
    expect(mastery(true, [])).toBe("learning");
    expect(mastery(true, [{ date: "2026-10-01", correct: true }, { date: "2026-10-04", correct: true }])).toBe("mastered");
    expect(mastery(true, [{ date: "2026-10-01", correct: true }, { date: "2026-10-02", correct: true }])).toBe("learning");
    expect(mastery(true, [{ date: "2026-10-01", correct: false }, { date: "2026-10-02", correct: true }, { date: "2026-10-03", correct: false }])).toBe("weak");
  });

  it("[MAP-03] 「覚えた」の字も30日以上出していなければ確認に戻す", () => {
    expect(needsCheck("mastered", "2026-10-01", "2026-10-20")).toBe(false);
    expect(needsCheck("mastered", "2026-10-01", "2026-10-31")).toBe(true);
  });
});

describe("今日の練習", () => {
  const today = "2026-10-20";
  const items: StudyItem[] = [];
  for (const k of G5.slice(0, 24)) {
    items.push({ itemId: `${k}-w1`, kanji: k, type: "write", text: `{${k}|あ}` });
    items.push({ itemId: `${k}-w2`, kanji: k, type: "write", text: `{${k}|あ}` });
    items.push({ itemId: `${k}-r1`, kanji: k, type: "read", text: `{${k}|あ}` });
  }
  const kanji: Record<string, KanjiState> = {};
  for (const k of G5.slice(0, 20)) kanji[k] = { learnedOn: "2026-10-01", writes: [] };
  for (const k of G5.slice(20, 23)) kanji[k] = { learnedOn: "2026-10-18", writes: [] };

  it("[CUR-02] 新しい漢字・復習・確認から、合計15問までで組み立てる", () => {
    const questions = { [`${G5[0]}-w1`]: { attempts: 1, correct: 0, reviewStreak: 0, nextReview: "2026-10-20" } };
    const slots = buildSession({ today, items, kanji, questions });
    expect(slots.length).toBe(SESSION_LIMIT);
    expect(slots.filter((s) => s.reason === "new").length).toBe(6);
    expect(slots.some((s) => s.reason === "review" && s.itemId === `${G5[0]}-w1`)).toBe(true);
    expect(slots.some((s) => s.reason === "check")).toBe(true);
    expect(new Set(slots.map((s) => s.itemId)).size).toBe(slots.length);
  });

  it("[CUR-01] 習っていない漢字の問題は出さない", () => {
    const slots = buildSession({ today, items, kanji, questions: {} });
    expect(slots.some((s) => s.itemId.startsWith(G5[23]))).toBe(false);
  });

  it("[CUR-05] 問題文のほかの5年生の漢字を習っていなければ出さない", () => {
    const item: StudyItem = { itemId: "x", kanji: G5[0], type: "write", text: `${G5[23]}の{${G5[0]}|あ}` };
    expect(isEligible(item, kanji)).toBe(false);
    expect(isEligible({ ...item, text: `${G5[1]}の{${G5[0]}|あ}` }, kanji)).toBe(true);
  });

  it("[CUR-03] 5問ずつの小セットに分ける", () => {
    expect(toSets([1, 2, 3, 4, 5, 6, 7]).map((s) => s.length)).toEqual([5, 2]);
  });

  it("[CUR-04] 新しい漢字がない日は復習と確認だけで組み立てる", () => {
    const old: Record<string, KanjiState> = {};
    for (const k of G5.slice(0, 20)) old[k] = { learnedOn: "2026-09-01", writes: [] };
    const slots = buildSession({ today, items, kanji: old, questions: {} });
    expect(slots.length).toBeGreaterThan(0);
    expect(slots.every((s) => s.reason !== "new")).toBe(true);
  });

  it("[REV-04] 書き取りで間違えた字は、同じ字の別の書き取り問題も復習に入れる", () => {
    const missed = items.find((i) => i.itemId === `${G5[0]}-w1`)!;
    expect(siblingForReview(missed, items, kanji, {})?.itemId).toBe(`${G5[0]}-w2`);
    expect(siblingForReview(items.find((i) => i.itemId === `${G5[0]}-r1`)!, items, kanji, {})).toBeUndefined();
  });
});

describe("連続学習日数", () => {
  it("[STK-04] 「覚えた」の字数が10字の区切りに届いたら、1回だけお祝いする", () => {
    expect(milestoneToCelebrate(9)).toBeUndefined();
    expect(milestoneToCelebrate(10)).toBe(10);
    expect(milestoneToCelebrate(13, 10)).toBeUndefined();
    expect(milestoneToCelebrate(20, 10)).toBe(20);
    // 苦手に戻って減ってから、また同じ区切りに届いてもお祝いしない
    expect(milestoneToCelebrate(19, 20)).toBeUndefined();
    expect(milestoneToCelebrate(20, 20)).toBeUndefined();
    // 一度に区切りを2つ超えたら、大きい方だけ
    expect(milestoneToCelebrate(31, 10)).toBe(30);
  });

  it("[STK-01] 今日の練習を終えた日か、10問以上解いた日を学習した日として数える", () => {
    expect(isStudyDay(9, false)).toBe(false);
    expect(isStudyDay(10, false)).toBe(true);
    expect(isStudyDay(3, true)).toBe(true);
    let s = markStudied({ days: 0 }, "2026-10-20");
    s = markStudied(s, "2026-10-20");
    s = markStudied(s, "2026-10-21");
    expect(s.days).toBe(2);
    expect(currentStreak(s, "2026-10-22")).toBe(2);
    expect(currentStreak(s, "2026-10-23")).toBe(0);
    expect(markStudied(s, "2026-10-24").days).toBe(1);
  });
});
