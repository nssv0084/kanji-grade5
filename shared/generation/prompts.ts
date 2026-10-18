import { z } from "zod";
import { KANJI_INFO } from "../items/text";
import { formatKun, GRADE5 } from "../kanji";

// 問題の生成と検証のプロンプト（GEN-04、LVL-03）。変えたら少量を試して、承認率と問題の例を PR に書く

export const GeneratedItems = z.object({
  items: z.array(
    z.object({
      type: z.enum(["write", "read"]),
      text: z.string(),
    }),
  ),
});
export type GeneratedItems = z.infer<typeof GeneratedItems>;

export const Verification = z.object({
  results: z.array(
    z.object({
      no: z.number(),
      answer: z.string(),
      uniqueAnswer: z.boolean(),
      natural: z.boolean(),
      suitableForGrade5: z.boolean(),
      issue: z.string(),
    }),
  ),
});
export type Verification = z.infer<typeof Verification>;

export const GENERATION_SYSTEM = `あなたは小学5年生向けの漢字ドリルの問題を作る、経験のある小学校の先生です。
問題文は子どもがスマホで読む短い一文です。家庭や学校、自然、ニュースなど、5年生が意味の分かる場面にしてください。

問う語の選び方:
- 5年生がふだんの生活や教科書で目にする、よく使う言葉にする。大人向けの言葉、専門用語、四字熟語、古い言い回しは使わない
  （避ける例: 東経、木像、礼状、厚意、象形、喜色満面。使う例: 自然、学校、友だち、天気、ニュースに出てくる言葉）
- 読みは、指定した音読み・訓読み（常用漢字表の読み）だけを使う。指定にない読みや、特別な読みは使わない
- 1回で作る問題は、すべて別の語にする。「すでに使った語」と同じ語も使わない。同じ語で読み方だけ変えるのもしない

問題文の書き方:
- 問う語を {漢字|よみ} の形で1か所だけ囲む。よみはひらがな。送りがなは囲みの外に書く（例: 友だちに本を{貸|か}す。）
- 書き取り（write）は、囲んだ語のよみを見て漢字を書く問題。読み（read）は、囲んだ語の漢字を見てよみを答える問題
- 囲んだ語には、対象の漢字を必ず入れる。対象の漢字の音読み・訓読みがどちらも出るように、問題ごとに語を変える
- 問題文に使ってよい漢字は、指定した「使ってよい漢字」だけ。それ以外の漢字はひらがなで書く
- 答えが1つに決まるようにする（同じ読みの別の語が入らない文にする）`;

export function generationPrompt(args: {
  kanji: string;
  write: number;
  read: number;
  allowedGrade5: string[];
  existing: string[];
}): string {
  const e = GRADE5[args.kanji];
  const lower = Object.entries(KANJI_INFO)
    .filter(([, i]) => i.grade <= 4)
    .map(([k]) => k)
    .join("");
  return `対象の漢字: ${args.kanji}
音読み: ${e.on.join("・") || "なし"}
訓読み: ${e.kun.map(formatKun).join("・") || "なし"}

書き取り（write）を${args.write}問、読み（read）を${args.read}問作ってください。

使ってよい漢字:
- 1〜4年生の漢字: ${lower}
- 5年生の漢字（習った字）: ${args.allowedGrade5.join("")}

すでに使った語（これらの語は使わない）: ${usedWords(args.existing).join("、") || "なし"}

すでにある問題（同じ文を作らない）:
${args.existing.length ? args.existing.map((t) => `- ${t}`).join("\n") : "- なし"}`;
}

function usedWords(texts: string[]): string[] {
  const words = texts.flatMap((t) => [...t.matchAll(/\{([^|{}]+)\|/g)].map((m) => m[1]));
  return [...new Set(words)];
}

export const VERIFICATION_SYSTEM = `あなたは小学5年生の漢字テストを解いて、問題の良し悪しを確かめる先生です。
問題ごとに、答えを書いたうえで、次を判断してください。
- uniqueAnswer: 答えが1つに決まるか（同じ読みの別の語でも文が成り立つなら false）
- natural: 日本語として自然な文か
- suitableForGrade5: 問う語が、小学5年生がふだんの生活や教科書で目にする言葉か。大人向けの言葉・専門用語・四字熟語・古い言い回しなら false。読みが常用漢字表にない読みでも false
- issue: 問題があればその内容。なければ空文字`;

export interface VerifyQuestion {
  no: number;
  type: "write" | "read";
  /** 子どもに見せる形（書き取りは［よみ］、読みは［漢字］） */
  shown: string;
}

export function verificationPrompt(questions: VerifyQuestion[]): string {
  return `次の問題を解いてください。
- 書き取り: ［ ］の中のよみを漢字の言葉にして答える（送りがなは答えに入れない）
- 読み: ［ ］の中の言葉のよみを、ひらがなで答える

${questions.map((q) => `${q.no}. （${q.type === "write" ? "書き取り" : "読み"}）${q.shown}`).join("\n")}`;
}
