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

問題文の書き方:
- 問う語を {漢字|よみ} の形で1か所だけ囲む。よみはひらがな。送りがなは囲みの外に書く（例: 友だちに本を{貸|か}す。）
- 書き取り（write）は、囲んだ語のよみを見て漢字を書く問題。読み（read）は、囲んだ語の漢字を見てよみを答える問題
- 囲んだ語には、対象の漢字を必ず入れる。対象の漢字が音読み・訓読みのどちらでも出るように、問題ごとに語や読みを変える
- 問題文に使ってよい漢字は、指定した「使ってよい漢字」だけ。それ以外の漢字はひらがなで書く
- 答えが1つに決まるようにする（同じ読みの別の語が入らない文にする）
- 常用漢字表にない読み・特別な読みは使わない`;

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

すでにある問題（同じ語・同じ文を作らない）:
${args.existing.length ? args.existing.map((t) => `- ${t}`).join("\n") : "- なし"}`;
}

export const VERIFICATION_SYSTEM = `あなたは小学5年生の漢字テストを解いて、問題の良し悪しを確かめる先生です。
問題ごとに、答えを書いたうえで、次を判断してください。
- uniqueAnswer: 答えが1つに決まるか（同じ読みの別の語でも文が成り立つなら false）
- natural: 日本語として自然な文か
- suitableForGrade5: 小学5年生が意味の分かる文か
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
