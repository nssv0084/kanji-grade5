import data from "./grade5.json";

// 5年生の配当漢字（193字）。KANJIDIC2（学年・読み）と KanjiVG（筆順）から scripts/build-kanji-data.ts で作る
export interface KanjiEntry {
  /** 音読み（カタカナ） */
  on: string[];
  /** 訓読み（ひらがな。送りがなの前に "." が入る） */
  kun: string[];
  /** 筆順どおりの各画（SVG のパス、109×109） */
  strokes: string[];
}

export const GRADE5: Record<string, KanjiEntry> = data;
export const GRADE5_CHARS: string[] = Object.keys(data);

/** 訓読みの "まね.く" を "まね(く)" の形にする */
export function formatKun(kun: string): string {
  const [stem, okuri] = kun.split(".");
  return okuri ? `${stem}(${okuri})` : stem;
}
