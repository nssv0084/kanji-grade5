import { readFileSync, writeFileSync } from "node:fs";
import { checkItem, type ItemDraft } from "../shared/items/check";
import { charsToWrite, parseText, requiredKanji, targetOf } from "../shared/items/text";

// 問題のファイルを機械的に検査し（LVL-01、LVL-02）、保護者が確認するための一覧（Markdown）を書き出す
// 使い方: npx tsx scripts/check-items.ts <問題.json> [確認用の一覧.md]
const [file, reviewPath] = process.argv.slice(2);
if (!file) {
  console.error("使い方: npx tsx scripts/check-items.ts <問題.json> [確認用の一覧.md]");
  process.exit(1);
}

const { items } = JSON.parse(readFileSync(file, "utf8")) as { items: ItemDraft[] };
let errors = 0;
let warnings = 0;
const lines: string[] = ["# 問題の確認", "", "子どもに見える形で並べています。おかしい問題があれば番号を教えてください。", ""];
let current = "";

items.forEach((item, i) => {
  const r = checkItem(item);
  errors += r.errors.length;
  warnings += r.warnings.length;
  for (const e of r.errors) console.error(`#${i + 1} ${item.text} — ${e}`);
  for (const w of r.warnings) console.warn(`#${i + 1} ${item.text} — 確認: ${w}`);

  if (item.kanji !== current) {
    current = item.kanji;
    lines.push("", `## ${item.kanji}`, "");
  }
  const { word, reading } = targetOf(item.text);
  const shown = parseText(item.text)
    .map((s) => {
      if (s.kind === "plain") return s.text;
      if (item.type === "read") return `**${s.word}**`;
      const write = charsToWrite(s.word);
      return [...s.word].map((c, k) => (write[k] ? "□" : c)).join("") + `（${s.reading}）`;
    })
    .join("");
  const answer = item.type === "read" ? reading : word;
  const needs = requiredKanji(item.text).filter((k) => k !== item.kanji);
  const note = [...r.errors, ...r.warnings].join(" / ");
  lines.push(
    `${i + 1}. ${item.type === "write" ? "書き" : "読み"}: ${shown} → **${answer}**` +
      (needs.length ? `（${needs.join("・")}を習ってから出題）` : "") +
      (note ? ` ⚠ ${note}` : ""),
  );
});

console.log(`${items.length} 問: 不合格 ${errors} 件、確認が必要 ${warnings} 件`);
if (reviewPath) {
  writeFileSync(reviewPath, lines.join("\n") + "\n");
  console.log(`確認用の一覧: ${reviewPath}`);
}
process.exit(errors > 0 ? 1 : 0);
