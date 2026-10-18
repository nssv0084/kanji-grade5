import { addDays, daysBetween } from "./dates";
import { behindBy, monthTarget, periodOn, planOrder, type Plan } from "./plan";
import type { KanjiState } from "./session";
import { mastery } from "./srs";
import { currentStreak, type Streak } from "./streak";

// 保護者のダッシュボードの集計（DSH-01、DSH-02、DSH-05、STK-03）

/** 最後の学習からこの日数以上空いたら目立たせる（STK-03。設定画面ができたら変えられるようにする） */
export const IDLE_ALERT_DAYS = 2;
const WEEK = 7;

export interface DayAmount {
  date: string;
  answers: number;
  correct: number;
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
  /** 苦手な字と、直近の書き取りの結果（古い順）（DSH-02） */
  weakKanji: { kanji: string; recent: boolean[] }[];
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

export function summarize(args: { today: string; plan?: Plan; kanji: Record<string, KanjiState>; profile: Streak; days: DayAmount[]; total: number }): ChildSummary {
  const { today, plan, kanji, profile, days, total } = args;
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
    week: Array.from({ length: WEEK }, (_, i) => {
      const date = addDays(today, i - WEEK + 1);
      return byDate.get(date) ?? { date, answers: 0, correct: 0 };
    }),
    weakKanji: states
      .filter((x) => x.m === "weak")
      .sort((a, b) => (plan ? planOrder(plan).indexOf(a.k) - planOrder(plan).indexOf(b.k) : a.k.localeCompare(b.k)))
      .map((x) => ({ kanji: x.k, recent: x.s.writes.slice(-5).map((w) => w.correct) })),
    progress,
  };
}
