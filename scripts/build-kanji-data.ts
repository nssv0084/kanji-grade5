import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// KANJIDIC2（学年）、常用漢字表（読み）、KanjiVG（筆順）から、1〜5年生の漢字のデータを作る。
// 使い方: npx tsx scripts/build-kanji-data.ts <kanjidic2.xml> <kanjivg.xml> <常用漢字一覧.wiki>
// 元データ: https://www.edrdg.org/kanjidic/kanjidic2.xml.gz 、https://github.com/KanjiVG/kanjivg/releases の kanjivg-YYYYMMDD.xml.gz 、
// https://ja.wikipedia.org/w/index.php?title=常用漢字一覧&action=raw （常用漢字表の音訓。KANJIDIC2 の読みには表外の読みが混ざるため、こちらを使う）
const [kanjidicPath, kanjivgPath, joyoPath] = process.argv.slice(2);
if (!kanjidicPath || !kanjivgPath || !joyoPath) {
  console.error("使い方: npx tsx scripts/build-kanji-data.ts <kanjidic2.xml> <kanjivg.xml> <常用漢字一覧.wiki>");
  process.exit(1);
}

// 常用漢字表の音訓（「ショウ、まね-く」の形）を、KANJIDIC2 と同じ形（音はカタカナ、訓は「まね.く」）にする
const joyo = new Map<string, { on: string[]; kun: string[] }>();
for (const line of readFileSync(joyoPath, "utf8").split(/\r?\n/)) {
  const m = /\[\[wikt:(.)\|.\]\]/u.exec(line);
  if (!m || !line.startsWith("|")) continue;
  const readings = line
    .split("||")
    .pop()!
    .replace(/<ref[^>/]*>[\s\S]*?<\/ref>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\{\{[^}]*\}\}/g, "")
    // 都道府県名にだけ使う読みは（ ）つきで書かれている
    .replace(/[（）()]/g, "")
    .trim();
  const parts = readings
    .split(/[、,]/)
    .map((r) => r.trim())
    .filter(Boolean);
  joyo.set(m[1], {
    on: parts.filter((r) => /^[ァ-ーー]+$/.test(r)),
    kun: parts.filter((r) => /^[ぁ-ゖー-]+$/.test(r)).map((r) => r.replace("-", ".")),
  });
}
if (joyo.size < 2136) {
  console.error(`常用漢字一覧から ${joyo.size} 字しか読めませんでした（想定 2136 字）。ページの形式を確認してください。`);
  process.exit(1);
}

const GRADE = 5;
const EXPECTED_COUNT = 193;

interface KanjiEntry {
  on: string[];
  kun: string[];
  strokes: string[];
}

// 1〜5年生の漢字の学年と読み。問題文の漢字が習った範囲か（LVL-01）と、読みが正しいか（LVL-02）の検査に使う
const LOWER_COUNTS: Record<number, number> = { 1: 80, 2: 160, 3: 200, 4: 202, 5: EXPECTED_COUNT };

const dic = readFileSync(kanjidicPath, "utf8");
const entries = new Map<string, Omit<KanjiEntry, "strokes">>();
const readingsByChar: Record<string, { grade: number; on: string[]; kun: string[] }> = {};
for (const m of dic.matchAll(/<character>([\s\S]*?)<\/character>/g)) {
  const body = m[1];
  const grade = Number(/<grade>(\d+)<\/grade>/.exec(body)?.[1] ?? 0);
  if (grade < 1 || grade > GRADE) continue;
  const literal = /<literal>(.+?)<\/literal>/.exec(body)![1];
  const j = joyo.get(literal);
  if (!j) {
    console.error(`「${literal}」が常用漢字一覧にありません`);
    process.exit(1);
  }
  readingsByChar[literal] = { grade, on: j.on, kun: j.kun };
  if (grade === GRADE) entries.set(literal, { on: j.on, kun: j.kun });
}
for (const [g, n] of Object.entries(LOWER_COUNTS)) {
  const count = Object.values(readingsByChar).filter((r) => r.grade === Number(g)).length;
  if (count !== n) {
    console.error(`${g}年生の漢字が ${count} 字でした（想定 ${n} 字）。KANJIDIC2 の版を確認してください。`);
    process.exit(1);
  }
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

const readingsDest = join(import.meta.dirname, "../shared/kanji/readings.json");
writeFileSync(readingsDest, JSON.stringify(readingsByChar) + "\n");
console.log(`1〜${GRADE}年生の ${Object.keys(readingsByChar).length} 字の読みを ${readingsDest} に書き出しました`);
