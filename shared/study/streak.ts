import { addDays } from "./dates";

// 連続学習日数（STK-01）。今日の練習を終えた日、または10問以上解いた日を「学習した日」とする

export const ANSWERS_FOR_STUDY_DAY = 10;

export interface Streak {
  days: number;
  lastStudyDate?: string;
}

export function isStudyDay(answersToday: number, sessionDone: boolean): boolean {
  return sessionDone || answersToday >= ANSWERS_FOR_STUDY_DAY;
}

/** 今日が「学習した日」になったときに呼ぶ。同じ日に何度呼んでも1日として数える */
export function markStudied(s: Streak, today: string): Streak {
  if (s.lastStudyDate === today) return s;
  const continued = s.lastStudyDate === addDays(today, -1);
  return { days: continued ? s.days + 1 : 1, lastStudyDate: today };
}

/** 表示用。昨日も今日も学習していなければ0に戻す */
export function currentStreak(s: Streak, today: string): number {
  if (!s.lastStudyDate) return 0;
  return s.lastStudyDate === today || s.lastStudyDate === addDays(today, -1) ? s.days : 0;
}
