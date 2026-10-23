import type { ItemType } from "../items/text";
import { addDays, daysBetween } from "./dates";
import { behindBy, monthTarget, periodOn, planOrder, type Plan } from "./plan";
import type { KanjiState } from "./session";
import { mastery } from "./srs";
import { currentStreak, type Streak } from "./streak";

// 保護者のダッシュボードの集計（DSH-01、DSH-02、DSH-05、DSH-06、STK-03）

/** 最後の学習からこの日数以上空いたら目立たせる（STK-03。設定画面ができたら変えられるようにする） */
export const IDLE_ALERT_DAYS = 2;
const WEEK = 7;

export interface Tally {
  answers: number;
  correct: number;
}

/** 日別の学習量（DAY#）。byType は形式別に記録するようになってからの日だけにある（DSH-06） */
export interface DayTally extends Tally {
  byType?: Partial<Record<ItemType, Tally>>;
}

export interface DayAmount extends DayTally {
  date: string;
}

/** 1問の解答を日別の学習量に足す */
export function addAnswer(day: DayTally | undefined, type: ItemType, correct: boolean): DayTally {
  const add = (t: Tally | undefined): Tally => ({ answers: (t?.answers ?? 0) + 1, correct: (t?.correct ?? 0) + (correct ? 1 : 0) });
  return { ...add(day), byType: { ...day?.byType, [type]: add(day?.byType?.[type]) } };
}

function sum(tallies: (Tally | undefined)[]): Tally {
  return tallies.reduce<Tally>((s, t) => ({ answers: s.answers + (t?.answers ?? 0), correct: s.correct + (t?.correct ?? 0) }), { answers: 0, correct: 0 });
}

export interface TestScore {
  month: string;
  score: number;
  total: number;
}

export interface ChildSummary {
  learned: number;
  mastered: number;
  weak: number;
  total: number;
  streak: number;
  lastStudyDate?: string;
  /** 最後の学習から何日空いたか。一度も学習していなければ undefined */
  idleDays?: number;
  idleAlert: boolean;
  /** 今日までの7日分（古い順）（DSH-01） */
  week: DayAmount[];
  /** 7日分を合わせた正答率（DSH-06）。形式別は byType を記録した日だけで数える */
  weekTotal: Tally & { byType: Record<ItemType, Tally> };
  /** 苦手な字と、直近の書き取りの結果（古い順）（DSH-02） */
  weakKanji: { kanji: string; recent: boolean[] }[];
  /** 確定した月例テストの点数（古い月から）（DSH-05） */
  testScores: TestScore[];
  /** 学習計画の進み具合（DSH-05）。計画がなければ undefined */
  progress?: {
    /** 学習順の何字目まで習ったか */
    learnedCount: number;
    /** 今月末までに習う予定の位置 */
    monthTarget: number;
    /** 予定との差（正なら遅れ、負なら進み）（CUR-10） */
    behind: number;
    reviewMonth: boolean;
    /** 期（新しい漢字を学ぶ期間、または復習の月）の残り日数 */
    daysLeft?: number;
  };
}

/** 学習順の先頭から、続けて習った字の数 */
export function learnedCount(plan: Plan, kanji: Record<string, KanjiState>): number {
  const order = planOrder(plan);
  const i = order.findIndex((k) => !kanji[k]?.learnedOn);
  return i === -1 ? order.length : i;
}

export function summarize(args: {
  today: string;
  plan?: Plan;
  kanji: Record<string, KanjiState>;
  profile: Streak;
  days: DayAmount[];
  total: number;
  tests?: TestScore[];
}): ChildSummary {
  const { today, plan, kanji, profile, days, total, tests = [] } = args;
  const states = Object.entries(kanji).map(([k, s]) => ({ k, s, m: mastery(!!s.learnedOn, s.writes) }));
  const idleDays = profile.lastStudyDate ? daysBetween(profile.lastStudyDate, today) : undefined;
  const byDate = new Map(days.map((d) => [d.date, d]));

  let progress: ChildSummary["progress"];
  if (plan) {
    const count = learnedCount(plan, kanji);
    const p = periodOn(plan, today);
    const reviewMonth = !!p && today > p.newUntil;
    progress = {
      learnedCount: count,
      monthTarget: monthTarget(plan, today),
      behind: reviewMonth || !p ? 0 : behindBy(plan, today, count),
      reviewMonth,
      daysLeft: p ? daysBetween(today, reviewMonth ? p.reviewUntil : p.newUntil) : undefined,
    };
  }

  const week = Array.from({ length: WEEK }, (_, i) => {
    const date = addDays(today, i - WEEK + 1);
    return byDate.get(date) ?? { date, answers: 0, correct: 0 };
  });

  return {
    learned: states.filter((x) => x.m !== "unlearned").length,
    mastered: states.filter((x) => x.m === "mastered").length,
    weak: states.filter((x) => x.m === "weak").length,
    total,
    streak: currentStreak(profile, today),
    lastStudyDate: profile.lastStudyDate,
    idleDays,
    // 計画があるのに一度も学習していないときも知らせる
    idleAlert: idleDays === undefined ? !!plan : idleDays >= IDLE_ALERT_DAYS,
    week,
    weekTotal: {
      ...sum(week),
      byType: { write: sum(week.map((d) => d.byType?.write)), read: sum(week.map((d) => d.byType?.read)) },
    },
    weakKanji: states
      .filter((x) => x.m === "weak")
      .sort((a, b) => (plan ? planOrder(plan).indexOf(a.k) - planOrder(plan).indexOf(b.k) : a.k.localeCompare(b.k)))
      .map((x) => ({ kanji: x.k, recent: x.s.writes.slice(-5).map((w) => w.correct) })),
    testScores: [...tests].sort((a, b) => a.month.localeCompare(b.month)),
    progress,
  };
}
