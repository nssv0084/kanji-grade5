import { z } from "zod";
import { charsToWrite, normalizeReading, parseText, targetOf } from "../items/text";
import type { TestQuestion } from "./compose";

// 月例テストの採点（TST-08〜10）。AI には正答を渡さず、書かれた字と解答欄の位置だけを読み取ってもらい、正誤はここで決める。
// プロンプトを変えたら、実際の解答用紙で読み取りの正確さを確かめて PR に書く

export const SheetReading = z.object({
  sheets: z.array(
    z.object({
      photo: z.number().int(),
      usable: z.boolean(),
      /** 使えないときの理由（暗い、斜め、解答欄が切れている、別の紙など）。使えるときは空 */
      problem: z.string(),
    }),
  ),
  answers: z.array(
    z.object({
      no: z.number().int(),
      /** 書かれた字（書き取りはマスの中の字だけ、読みは枠の中のひらがな）。何も書いていなければ空 */
      written: z.string(),
      legibility: z.enum(["clear", "unclear", "blank"]),
      /** 画が足りない・多い、組み立てがちがうなど、正しい字になっていない */
      formError: z.boolean(),
      confidence: z.enum(["high", "low"]),
      /** とめ・はね・はらいなどの気づき（参考。点数には入れない）。なければ空 */
      note: z.string(),
      /** 解答欄が写っている写真の番号（1から）。見つからなければ 0 */
      photo: z.number().int(),
      /** 解答欄の位置（写真のピクセル座標） */
      box: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }),
    }),
  ),
});
export type SheetReading = z.infer<typeof SheetReading>;

export const GRADING_SYSTEM = `あなたは小学5年生の漢字テストの解答用紙を読み取る係です。採点はしません。
子どもが鉛筆で書いた字を、見えたとおりに書き写してください。

- 正しい答えを推測して直さない。文の意味から考えた字ではなく、実際に書かれている字の形を書き写す
- 画が足りない・多い、部分の組み立てがちがうなど、正しい字になっていないときは、いちばん近い字を written に書き、formError を true にし、note に何がちがうかを書く
- とめ・はね・はらいの細かい点は formError にせず、気づいたことを note に短く書く
- 薄い、消しあとと重なっているなどで読み切れないときは legibility を unclear にする。何も書いていなければ blank にして written は空にする
- 少しでも迷ったら confidence を low にする
- 解答欄の位置は、その解答欄（書き取りはマスの並び全体、読みは答えの枠）を囲む長方形を、写真のピクセル座標（左上が原点）で返す
- 写真が暗い、大きく斜め、解答欄が切れている、このテストの用紙ではないときは、その写真の usable を false にし、problem に理由を短く書く`;

/** 解答用紙に印刷されている形で問題を説明する（正答は入れない） */
function describe(q: TestQuestion): string {
  const parts = parseText(q.text).map((s) => {
    if (s.kind === "plain") return s.text;
    if (q.type === "read") return `［${s.word}］`;
    const write = charsToWrite(s.word);
    return [...s.word].map((c, i) => (write[i] ? "□" : c)).join("") + `（よみ: ${s.reading}）`;
  });
  return q.type === "write"
    ? `${q.no}. 書き取り: ${parts.join("")} → □のマスに書かれた字を左から順に`
    : `${q.no}. 読み: ${parts.join("")} → ［］の語の読みとして、右の枠に書かれたひらがな`;
}

export function gradingPrompt(title: string, questions: TestQuestion[], photos: number): string {
  return `「${title}」の解答用紙の写真が ${photos} 枚あります（写真1から順に、上の画像の順）。
問題は次のとおりです。すべての問題について、書かれた字と解答欄の位置を返してください。

${questions.map(describe).join("\n")}`;
}

export type Verdict = "correct" | "wrong" | "unreadable";

export interface GradedAnswer {
  no: number;
  written: string;
  verdict: Verdict;
  /** 保護者の確認が要る（読み取れない、AI の自信が低い、字の形がちがう）（TST-09） */
  needsCheck: boolean;
  note: string;
  /** 切り抜きの位置。photo は 0 から */
  box?: { photo: number; x: number; y: number; width: number; height: number };
}

/** 正答（書き取りはマスに書く字、読みはひらがなの読み） */
export function expectedAnswer(q: TestQuestion): string {
  const { word, reading } = targetOf(q.text);
  if (q.type === "read") return reading;
  const write = charsToWrite(word);
  return [...word].filter((_, i) => write[i]).join("");
}

const sameWriting = (a: string, b: string) => a.normalize("NFKC").replace(/\s+/g, "") === b;

/** 読み取った字と正答を比べる（TST-08）。何も書いていない答えは不正解 */
export function judgeAnswers(questions: TestQuestion[], reading: SheetReading, photos: number): GradedAnswer[] {
  const byNo = new Map(reading.answers.map((a) => [a.no, a]));
  return questions.map((q) => {
    const a = byNo.get(q.no);
    if (!a) return { no: q.no, written: "", verdict: "unreadable", needsCheck: true, note: "写真から見つかりませんでした" };
    const expected = expectedAnswer(q);
    const matches = q.type === "read" ? normalizeReading(a.written) === normalizeReading(expected) : sameWriting(a.written, expected);
    const verdict: Verdict = a.legibility === "unclear" ? "unreadable" : a.legibility === "blank" ? "wrong" : matches && !a.formError ? "correct" : "wrong";
    const box = a.photo >= 1 && a.photo <= photos && a.box.width > 0 && a.box.height > 0 ? { photo: a.photo - 1, ...a.box } : undefined;
    return {
      no: q.no,
      written: a.written,
      verdict,
      needsCheck: verdict === "unreadable" || a.confidence === "low" || a.formError || !box,
      note: a.note,
      box,
    };
  });
}

/** 撮り直しを求める理由（TST-10）。空なら確認に進める */
export function retakeReasons(reading: SheetReading, answers: GradedAnswer[]): string[] {
  const reasons = reading.sheets.filter((s) => !s.usable).map((s) => `写真${s.photo}: ${s.problem || "採点に使えません"}`);
  const missing = answers.filter((a) => !a.box).length;
  if (missing > answers.length / 5) reasons.push(`${missing} 問の解答欄が写真に見つかりませんでした。全部の問題が写るように撮ってください`);
  return reasons;
}

export type FinalVerdict = "correct" | "wrong";

/** 確定する（TST-09）。確認が要る問は、保護者が○か×を選んでいないと確定できない */
export function finalize(answers: GradedAnswer[], decisions: Record<number, FinalVerdict>): { verdicts: Record<number, FinalVerdict>; score: number } | { missing: number[] } {
  const missing = answers.filter((a) => (a.needsCheck || a.verdict === "unreadable") && !decisions[a.no]).map((a) => a.no);
  if (missing.length > 0) return { missing };
  const verdicts = Object.fromEntries(answers.map((a) => [a.no, decisions[a.no] ?? (a.verdict as FinalVerdict)]));
  return { verdicts, score: Object.values(verdicts).filter((v) => v === "correct").length };
}
