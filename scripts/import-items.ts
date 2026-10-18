import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { checkItem, type ItemDraft } from "../shared/items/check";
import type { ItemStatus } from "../shared/types";
import { arg, checkAccount, documentClient, stackOutput } from "./aws";

// 問題を登録する。機械的な検査（LVL-01、LVL-02）に通らない問題が1つでもあれば何も登録しない
// 使い方: npx tsx scripts/import-items.ts --file samples/seed-items.json --status approved --source "..."
// 同じ問題文は同じ ID になり、二度目は登録しない（何度実行してもよい）

const file = arg("file") ?? "";
const status = (arg("status") ?? "review") as ItemStatus;
const source = arg("source") ?? "手入力";
if (!file || !["approved", "review"].includes(status)) {
  console.error("使い方: npx tsx scripts/import-items.ts --file <問題.json> --status approved|review [--source 説明]");
  process.exit(1);
}

const { items } = JSON.parse(readFileSync(file, "utf8")) as { items: ItemDraft[] };
const bad = items.map((item, i) => ({ i, item, r: checkItem(item) })).filter((x) => x.r.errors.length > 0 || x.r.warnings.length > 0);
if (bad.length > 0) {
  for (const b of bad) console.error(`#${b.i + 1} ${b.item.text} — ${[...b.r.errors, ...b.r.warnings].join(" / ")}`);
  console.error("検査に通らない問題があるため、登録しません。");
  process.exit(1);
}

// 最上位の await は使えない（ルートの package.json が CommonJS のため）ので、関数にまとめる
async function main() {
  checkAccount();
  const table = stackOutput("TableName");
  const ddb = documentClient();
  const createdAt = new Date().toISOString();
  let added = 0;
  for (const item of items) {
    const itemId = `${item.type}-${createHash("sha1").update(item.text).digest("hex").slice(0, 12)}`;
    try {
      await ddb.send(
        new PutCommand({
          TableName: table,
          Item: {
            pk: `ITEM#${itemId}`,
            sk: "META",
            itemId,
            kanji: item.kanji,
            type: item.type,
            text: item.text,
            status,
            source,
            createdAt,
            gsi1pk: `ITEMS#${item.type}#${status}`,
            gsi1sk: `${item.kanji}#${createdAt}`,
          },
          ConditionExpression: "attribute_not_exists(pk)",
        }),
      );
      added++;
    } catch (e) {
      if ((e as Error).name !== "ConditionalCheckFailedException") throw e;
    }
  }
  console.log(`${items.length} 問のうち ${added} 問を登録しました（${status}）。すでにあった問題はそのまま`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
