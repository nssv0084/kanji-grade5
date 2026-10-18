import { addDays, daysBetween } from "./dates";

// 間違えた問題の復習（REV-01〜03）と、漢字ごとの定着度（MAP-01、MAP-03）

export interface QuestionState {
  attempts: number;
  correct: number;
  /** 復習中のとき、次に出す日。復習の対象でなければ undefined */
  nextReview?: string;
  /** 復習で続けて正解した回数 */
  reviewStreak: number;
  lastAnswered?: string;
}

export function nextQuestionState(prev: QuestionState | undefined, correct: boolean, today: string): QuestionState {
  const s: QuestionState = prev ? { ...prev } : { attempts: 0, correct: 0, reviewStreak: 0 };
  s.attempts += 1;
  s.lastAnswered = today;
  if (correct) s.correct += 1;

  const inReview = s.nextReview !== undefined;
  if (!correct) {
    // REV-01、REV-03: 間違えたら翌日から（数え直し）
    s.nextReview = addDays(today, 1);
    s.reviewStreak = 0;
  } else if (inReview) {
    s.reviewStreak += 1;
    // REV-02: 2回続けて正解したら外す。REV-01: 1回目の正解の後は3日後
    if (s.reviewStreak >= 2) {
      s.nextReview = undefined;
      s.reviewStreak = 0;
    } else {
      s.nextReview = addDays(today, 3);
    }
  }
  return s;
}

export type Mastery = "unlearned" | "learning" | "mastered" | "weak";

export interface WriteResult {
  date: string;
  correct: boolean;
}

/** 書き取りの直近の結果（古い順）から定着度を決める（MAP-01） */
export function mastery(learned: boolean, writes: WriteResult[]): Mastery {
  if (!learned) return "unlearned";
  const last3 = writes.slice(-3);
  if (last3.filter((w) => !w.correct).length >= 2) return "weak";
  const [a, b] = writes.slice(-2);
  if (a && b && a.correct && b.correct && daysBetween(a.date, b.date) >= 3) return "mastered";
  return "learning";
}

/** 「覚えた」の字も、30日以上出していなければ確認に戻す（MAP-03） */
export function needsCheck(m: Mastery, lastAsked: string | undefined, today: string): boolean {
  if (m === "unlearned") return false;
  if (m !== "mastered") return true;
  return !lastAsked || daysBetween(lastAsked, today) >= 30;
}
