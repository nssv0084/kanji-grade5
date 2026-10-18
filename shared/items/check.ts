import { GRADE5 } from "../kanji";
import { isKanji, KANJI_INFO, parseText, targetOf, toHiragana, type ItemType } from "./text";

// 問題の機械的な検査（LVL-01、LVL-02）。errors があれば出題しない。warnings は保護者の確認で判断する

export interface ItemDraft {
  kanji: string;
  type: ItemType;
  text: string;
}

export interface CheckResult {
  errors: string[];
  warnings: string[];
}

const HIRAGANA = /^[ぁ-ゖー]+$/;

export function checkItem(item: ItemDraft): CheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!(item.kanji in GRADE5)) errors.push(`対象の字「${item.kanji}」は5年生の漢字ではありません`);

  let target: { word: string; reading: string };
  try {
    target = targetOf(item.text);
  } catch (e) {
    return { errors: [...errors, (e as Error).message], warnings };
  }
  if (!target.word.includes(item.kanji)) errors.push(`問う語「${target.word}」に対象の字「${item.kanji}」がありません`);
  if (!HIRAGANA.test(target.reading)) errors.push(`読み「${target.reading}」はひらがなで書いてください`);

  // LVL-01: 問題文の漢字は5年生までに習う字だけ（6年生以上・常用外の字はひらがなにする）
  const plainText = parseText(item.text)
    .map((s) => (s.kind === "plain" ? s.text : s.word))
    .join("");
  for (const c of new Set([...plainText].filter(isKanji))) {
    if (!(c in KANJI_INFO)) errors.push(`「${c}」は5年生までに習わない漢字です。ひらがなにしてください`);
  }

  // LVL-02: 読みが、各字の音読み・訓読みの組み合わせ（連濁・促音を含む）で説明できるか
  if (errors.length === 0 && !readingFits(target.word, target.reading)) {
    warnings.push(`読み「${target.reading}」を「${target.word}」の音読み・訓読みから組み立てられません（特別な読みでないか確認）`);
  }
  return { errors, warnings };
}

const RENDAKU: Record<string, string[]> = {
  か: ["が"], き: ["ぎ"], く: ["ぐ"], け: ["げ"], こ: ["ご"],
  さ: ["ざ"], し: ["じ"], す: ["ず"], せ: ["ぜ"], そ: ["ぞ"],
  た: ["だ"], ち: ["ぢ", "じ"], つ: ["づ", "ず"], て: ["で"], と: ["ど"],
  は: ["ば", "ぱ"], ひ: ["び", "ぴ"], ふ: ["ぶ", "ぷ"], へ: ["べ", "ぺ"], ほ: ["ぼ", "ぽ"],
};

/** 1字の読みの候補。訓読みは送りがなの前（"." の前）まで */
function charReadings(c: string, first: boolean, last: boolean): string[] {
  const info = KANJI_INFO[c];
  if (!info) return [];
  const base = new Set<string>();
  for (const on of info.on) base.add(toHiragana(on.replace(/-/g, "")));
  for (const kun of info.kun) {
    const k = kun.replace(/-/g, "");
    base.add(k.split(".")[0]);
    base.add(k.replace(".", ""));
  }
  const out = new Set(base);
  for (const r of base) {
    if (!first && RENDAKU[r[0]]) for (const v of RENDAKU[r[0]]) out.add(v + r.slice(1));
    if (!last && /[つちくき]$/.test(r)) out.add(r.slice(0, -1) + "っ");
  }
  return [...out].filter(Boolean);
}

function readingFits(word: string, reading: string): boolean {
  const chars = [...word];
  const fits = (i: number, rest: string): boolean => {
    if (i === chars.length) return rest === "";
    const c = chars[i];
    // 漢字でない字（送りがなが語に入っている場合）はそのまま一致させる
    if (!isKanji(c)) return rest.startsWith(toHiragana(c)) && fits(i + 1, rest.slice(1));
    return charReadings(c, i === 0, i === chars.length - 1).some((r) => rest.startsWith(r) && fits(i + 1, rest.slice(r.length)));
  };
  return fits(0, reading);
}
