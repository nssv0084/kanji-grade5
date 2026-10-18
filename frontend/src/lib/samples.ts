import { decide, type Measurement, type Thresholds, type Verdict } from "../../../shared/handwriting/judge";
import type { Point } from "../../../shared/handwriting/path";

// 試作の記録（筆跡と、実際に正しく書けていたか）。端末の中だけに保存し、書き出した JSON はリポジトリに入れない
export interface Sample {
  at: string;
  char: string;
  strokes: Point[][];
  measurement: Measurement;
  /** 記録したときの判定 */
  verdict: Verdict;
  /** 保護者が見て、実際に正しく書けていたか */
  actuallyCorrect: boolean;
}

const KEY = "kanji-proto-samples";

export function loadSamples(): Sample[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as Sample[];
  } catch {
    return [];
  }
}

/** 保存できなかったら false（容量がいっぱい、プライベートブラウズなど） */
export function saveSamples(samples: Sample[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(samples));
    return true;
  } catch {
    return false;
  }
}

/** 保存する大きさを抑えるため、座標を小数3桁に丸める */
export function roundStrokes(strokes: Point[][]): Point[][] {
  return strokes.map((s) => s.map((p) => ({ x: Math.round(p.x * 1000) / 1000, y: Math.round(p.y * 1000) / 1000 })));
}

export interface Summary {
  total: number;
  /** まちがって書いたのに正解にした */
  falseAccept: number;
  /** 正しく書けたのに不正解にした */
  falseReject: number;
  /** あいまい（AI 判定に回る分） */
  unsure: number;
}

/** 記録を、指定したしきい値で判定し直して数える（しきい値を変えたときの効き目を見るため） */
export function summarize(samples: Sample[], t: Thresholds): Summary {
  const s: Summary = { total: samples.length, falseAccept: 0, falseReject: 0, unsure: 0 };
  for (const x of samples) {
    const v = decide(x.measurement, t);
    if (v === "unsure") s.unsure++;
    else if (v === "correct" && !x.actuallyCorrect) s.falseAccept++;
    else if (v === "wrong" && x.actuallyCorrect) s.falseReject++;
  }
  return s;
}
