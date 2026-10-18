import { readFileSync } from "node:fs";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { GRADE5_CHARS } from "../shared/kanji";
import { studyDate } from "../shared/study/dates";
import { planOrder, type Lesson, type Plan } from "../shared/study/plan";
import { arg, checkAccount, documentClient, stackOutput, userSub } from "./aws";

// 学習順（ドリル・教科書の順）を子どもの学習計画として登録する（CUR-08 の「手で並べて登録」の代わり。画面ができるまで）
// 使い方: npx tsx scripts/import-plan.ts --file samples/drill-order.json --child <ログインID> --year 2026
// 学習順はリポジトリに入れない。開始位置より前の字は「習った字」にする（CUR-12）

const file = arg("file");
const child = arg("child");
const year = Number(arg("year"));
if (!file || !child || !year) {
  console.error("使い方: npx tsx scripts/import-plan.ts --file <学習順.json> --child <ログインID> --year <年度>");
  process.exit(1);
}

interface OrderFile {
  volumes: { name: "上" | "下"; lessons: { no: number; kanji: string }[] }[];
  start: { index: number };
}
const src = JSON.parse(readFileSync(file, "utf8")) as OrderFile;
const lessons: Lesson[] = src.volumes.flatMap((v) => v.lessons.map((l) => ({ volume: v.name, no: l.no, kanji: l.kanji })));
const today = studyDate(new Date());
const plan: Plan = { schoolYear: year, lessons, startIndex: src.start.index - 1, startedOn: today };

const order = planOrder(plan);
const missing = GRADE5_CHARS.filter((k) => !order.includes(k));
if (order.length !== GRADE5_CHARS.length || missing.length > 0 || new Set(order).size !== order.length) {
  console.error(`学習順が5年生の193字と一致しません（${order.length}字、抜け: ${missing.join("") || "なし"}）`);
  process.exit(1);
}

checkAccount();
const table = stackOutput("TableName");
const sub = userSub(child);
const ddb = documentClient();

await ddb.send(new PutCommand({ TableName: table, Item: { pk: `USER#${sub}`, sk: `PLAN#${year}`, ...plan } }));
console.log(`学習計画を登録しました（${year}年度、${plan.startIndex + 1}字目から、${today} 開始）`);

// 開始位置より前の字は「習った字」にする。すでに記録がある字は上書きしない
let learned = 0;
for (const k of order.slice(0, plan.startIndex)) {
  try {
    await ddb.send(
      new PutCommand({
        TableName: table,
        Item: { pk: `USER#${sub}`, sk: `KANJI#${k}`, kanji: k, learnedOn: `${year}-09-30`, writes: [] },
        ConditionExpression: "attribute_not_exists(pk)",
      }),
    );
    learned++;
  } catch (e) {
    if ((e as Error).name !== "ConditionalCheckFailedException") throw e;
  }
}
console.log(`習った字として ${learned} 字を登録しました（すでにあった字はそのまま）`);
