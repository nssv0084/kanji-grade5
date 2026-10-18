// 画面と API で共通の型
import type { ItemType } from "./items/text";
import type { Mastery } from "./study/srs";

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
