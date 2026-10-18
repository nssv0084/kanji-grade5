// 画面と API で共通の型
import type { ItemType } from "./items/text";
import type { Mastery } from "./study/srs";
import type { TestQuestion } from "./test/compose";

/** 保護者（parents グループ）か子ども（children グループ） */
export type Role = "parent" | "child";

/** GET /me の応答 */
export interface Me {
  nickname: string;
  role: Role;
}

export type ItemStatus = "pending" | "approved" | "review" | "reported" | "disabled";

/** 練習で出す1問。書き取りは端末で判定するため、答え（問う語）を含む */
export interface PracticeQuestion {
  index: number;
  itemId: string;
  kanji: string;
  type: ItemType;
  text: string;
  reason: "new" | "review" | "check";
  /** 解答済みなら結果 */
  answered?: { correct: boolean };
}

/** GET /today の応答 */
export interface TodayResponse {
  date: string;
  /** 学習計画がまだない（CUR-04） */
  needsPlan: boolean;
  /** 今日新しく習う字 */
  newKanji: string[];
  /** 5問ずつの小セット（CUR-03） */
  sets: PracticeQuestion[][];
  streak: number;
  learnedCount: number;
  masteredCount: number;
  total: number;
}

/** POST /answers の要求 */
export interface AnswerRequest {
  date: string;
  index: number;
  correct: boolean;
  /** 子どもが手本と見比べて自分で選んだ結果か（HWR-03、HWR-10） */
  selfJudged?: boolean;
}

export interface AnswerResponse {
  streak: number;
  done: boolean;
}

/** GET /kanji の応答（漢字マップ、MAP-02） */
export interface KanjiMapEntry {
  kanji: string;
  mastery: Mastery;
}

/** 保護者が見る問題（P-05、P-06） */
export interface AdminItem {
  itemId: string;
  kanji: string;
  type: ItemType;
  text: string;
  status: ItemStatus;
  source: string;
  createdAt: string;
}

/** 生成ジョブ（P-06、GEN-08） */
export interface JobSummary {
  jobId: string;
  status: "running" | "done" | "failed" | "budget";
  trigger: "scheduled" | "manual";
  createdAt: string;
  finishedAt?: string;
  kanji: string[];
  created: number;
  rejected: number;
  message?: string;
}

/** 月例テスト（P-11、TST-03〜06）。問題と並びを保存し、PDF はブラウザで作り直す */
export interface MonthlyTest {
  childId: string;
  month: string;
  title: string;
  status: "created";
  createdAt: string;
  questions: TestQuestion[];
}

/** GET /admin/tests の応答 */
export interface TestsResponse {
  /** 今の学習日の月（yyyy-mm） */
  month: string;
  /** 月の最終週なら true（TST-03） */
  reminder: boolean;
  children: { childId: string; nickname: string; tests: MonthlyTest[] }[];
}

/** GET /admin/overview の応答（P-01 の一部、DSH-03、DSH-04） */
export interface AdminOverview {
  usage: { spentMicroUsd: number; budgetMicroUsd: number; stopRatio: number; usdJpy: number };
  reviewCount: number;
  jobs: JobSummary[];
}
