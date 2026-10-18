import { GRADE5 } from "../kanji";
import readingsData from "../kanji/readings.json";

// 問題文の書き方: 「友だちに本を{貸|か}す。」のように、問う語を {漢字|よみ} で1か所だけ囲む。
// 書き取りは読みを見せて語の中の5年生の漢字を書かせ、読みは漢字を見せて読みを入力させる

export type ItemType = "write" | "read";

export type Segment = { kind: "plain"; text: string } | { kind: "target"; word: string; reading: string };

const TARGET = /\{([^|{}]+)\|([^|{}]+)\}/g;
const KANJI = /[一-鿿々]/u;

export const KANJI_INFO: Record<string, { grade: number; on: string[]; kun: string[] }> = readingsData;

export function parseText(text: string): Segment[] {
  const segments: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(TARGET)) {
    if (m.index > last) segments.push({ kind: "plain", text: text.slice(last, m.index) });
    segments.push({ kind: "target", word: m[1], reading: m[2] });
    last = m.index + m[0].length;
  }
  if (last < text.length) segments.push({ kind: "plain", text: text.slice(last) });
  return segments;
}

export function targetOf(text: string): { word: string; reading: string } {
  const targets = parseText(text).filter((s) => s.kind === "target");
  if (targets.length !== 1) throw new Error(`問う語は1か所だけにしてください: ${text}`);
  const t = targets[0] as Extract<Segment, { kind: "target" }>;
  return { word: t.word, reading: t.reading };
}

/** 書き取りで書かせる字（語の中の5年生の漢字）。それ以外の字はマスに印刷して見せる */
export function charsToWrite(word: string): boolean[] {
  return [...word].map((c) => c in GRADE5);
}

/** 問題文（語を含む）に出てくる5年生の漢字。すべて習ってからでないと出題しない（CUR-01、CUR-05） */
export function requiredKanji(text: string): string[] {
  const plain = text.replace(TARGET, "$1");
  return [...new Set([...plain].filter((c) => c in GRADE5))];
}

export function isKanji(c: string): boolean {
  return KANJI.test(c);
}

export function toHiragana(s: string): string {
  return s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

/** 読みの入力を比べられる形にそろえる（カタカナ→ひらがな、空白を除く） */
export function normalizeReading(s: string): string {
  return toHiragana(s.normalize("NFKC")).replace(/\s+/g, "");
}
