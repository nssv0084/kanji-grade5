import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import subsetFont from "subset-font";
import readings from "../shared/kanji/readings.json" with { type: "json" };

// 月例テストの PDF に使うフォント（TST-05）。Klee One（SIL Open Font License 1.1）から、テストに使う字だけを抜き出す。
// 使い方: npx tsx scripts/build-test-font.ts <KleeOne-Regular.ttf> <OFL.txt>
// 元データ: https://github.com/fontworks-fonts/Klee の fonts/ttf/KleeOne-Regular.ttf と OFL.txt
const [fontPath, licensePath] = process.argv.slice(2);
if (!fontPath || !licensePath) {
  console.error("使い方: npx tsx scripts/build-test-font.ts <KleeOne-Regular.ttf> <OFL.txt>");
  process.exit(1);
}

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => String.fromCodePoint(from + i)).join("");
// 1〜5年生の漢字（問題文は5年生までの字だけ。LVL-01）、ひらがな、カタカナ、英数字、記号
const chars = [
  Object.keys(readings).join(""),
  range(0x3041, 0x3096), // ひらがな
  range(0x30a1, 0x30fc), // カタカナ
  range(0x20, 0x7e), // 英数字
  range(0xff01, 0xff5e), // 全角の英数字・記号
  "、。・「」『』（）［］〔〕ー〜…？！○×△□々",
].join("");

const out = join(import.meta.dirname, "../frontend/public/fonts");
mkdirSync(out, { recursive: true });
const subset = await subsetFont(readFileSync(fontPath), chars, { targetFormat: "truetype" });
writeFileSync(join(out, "KleeOne-Regular-subset.ttf"), subset);
copyFileSync(licensePath, join(out, "KleeOne-OFL.txt"));
console.log(`${[...new Set(chars)].length} 字を ${(subset.length / 1024).toFixed(0)} KB のフォントにしました: ${out}`);
