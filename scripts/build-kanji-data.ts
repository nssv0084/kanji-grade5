import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// KANJIDIC2（学年・読み）と KanjiVG（筆順）から、5年生の配当漢字のデータを作る。
// 使い方: npx tsx scripts/build-kanji-data.ts <kanjidic2.xml> <kanjivg.xml>
// 元データ: https://www.edrdg.org/kanjidic/kanjidic2.xml.gz 、https://github.com/KanjiVG/kanjivg/releases の kanjivg-YYYYMMDD.xml.gz
const [kanjidicPath, kanjivgPath] = process.argv.slice(2);
if (!kanjidicPath || !kanjivgPath) {
  console.error("使い方: npx tsx scripts/build-kanji-data.ts <kanjidic2.xml> <kanjivg.xml>");
  process.exit(1);
}

const GRADE = 5;
const EXPECTED_COUNT = 193;

interface KanjiEntry {
  on: string[];
  kun: string[];
  strokes: string[];
}

const dic = readFileSync(kanjidicPath, "utf8");
const entries = new Map<string, Omit<KanjiEntry, "strokes">>();
for (const m of dic.matchAll(/<character>([\s\S]*?)<\/character>/g)) {
  const body = m[1];
  if (!body.includes(`<grade>${GRADE}</grade>`)) continue;
  const literal = /<literal>(.+?)<\/literal>/.exec(body)![1];
  const readings = (type: string) =>
    [...body.matchAll(new RegExp(`<reading r_type="${type}">(.+?)</reading>`, "g"))].map((r) => r[1]);
  entries.set(literal, { on: readings("ja_on"), kun: readings("ja_kun") });
}
if (entries.size !== EXPECTED_COUNT) {
  console.error(`${GRADE}年生の漢字が ${entries.size} 字でした（想定 ${EXPECTED_COUNT} 字）。KANJIDIC2 の版を確認してください。`);
  process.exit(1);
}

const vg = readFileSync(kanjivgPath, "utf8");
const strokesByChar = new Map<string, string[]>();
for (const m of vg.matchAll(/<kanji id="kvg:kanji_([0-9a-f]+)">([\s\S]*?)<\/kanji>/g)) {
  const char = String.fromCodePoint(parseInt(m[1], 16));
  if (!entries.has(char)) continue;
  const paths = [...m[2].matchAll(/<path id="kvg:[0-9a-f]+-s(\d+)"[^>]*? d="([^"]+)"/g)]
    .map((p) => ({ n: Number(p[1]), d: p[2].replace(/\s+/g, " ").trim() }))
    .sort((a, b) => a.n - b.n);
  strokesByChar.set(char, paths.map((p) => p.d));
}

const out: Record<string, KanjiEntry> = {};
const missing: string[] = [];
for (const [char, e] of entries) {
  const strokes = strokesByChar.get(char);
  if (!strokes || strokes.length === 0) missing.push(char);
  else out[char] = { ...e, strokes };
}
if (missing.length > 0) {
  console.error(`KanjiVG に筆順のない字があります: ${missing.join(" ")}`);
  process.exit(1);
}

const dest = join(import.meta.dirname, "../shared/kanji/grade5.json");
writeFileSync(dest, JSON.stringify(out) + "\n");
console.log(`${Object.keys(out).length} 字を ${dest} に書き出しました`);
