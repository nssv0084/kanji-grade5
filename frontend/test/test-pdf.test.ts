// @vitest-environment node
/// <reference types="node" />
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import type { TestQuestion } from "../../shared/test/compose";
import { buildTestPdf } from "../src/lib/testPdf";

const fontBytes = readFileSync(join(import.meta.dirname, "../public/fonts/KleeOne-Regular-subset.ttf"));
const A4_RIGHT_LIMIT = (210 - 15) * (72 / 25.4);

const write: TestQuestion = { no: 1, itemId: "w", kanji: "評", type: "write", text: "新しいゲームは{好評|こうひょう}だ。" };
const two: TestQuestion = { no: 2, itemId: "w2", kanji: "護", type: "write", text: "しょう来は{弁護士|べんごし}になりたい。" };
const read: TestQuestion = { no: 3, itemId: "r", kanji: "評", type: "read", text: "先生が作文を{評価|ひょうか}する。" };
const long: TestQuestion = { no: 4, itemId: "l", kanji: "移", type: "write", text: "春になると、たくさんの鳥が南の国から北の国へとむれを作って{移動|いどう}していく様子が見られる。" };

function many(n: number, write: number): TestQuestion[] {
  return Array.from({ length: n }, (_, i) => ({ ...(i < write ? two : read), no: i + 1, itemId: `q${i}` }));
}

describe("月例テストの PDF", () => {
  it("[TST-05] A4 の PDF を作り、30問（書き取り20・読み10）は2ページに収める", async () => {
    const r = await buildTestPdf({ title: "10月の漢字テスト", questions: many(30, 20), withAnswers: false, fontBytes });
    expect(r.pages).toBe(2);
    const doc = await PDFDocument.load(r.bytes);
    const { width, height } = doc.getPage(0).getSize();
    expect(Math.round(width)).toBe(595);
    expect(Math.round(height)).toBe(842);
  });

  it("[TST-05] 50問（復習の月）も作れる", async () => {
    const r = await buildTestPdf({ title: "3月の漢字テスト", questions: many(50, 25), withAnswers: false, fontBytes });
    expect(r.pages).toBeGreaterThanOrEqual(3);
  });

  it("[TST-05] 長い文も字を小さくして、右の余白からはみ出さない", async () => {
    const r = await buildTestPdf({ title: "t", questions: [write, two, read, long], withAnswers: false, fontBytes });
    for (const edge of r.rightEdges) expect(edge).toBeLessThanOrEqual(A4_RIGHT_LIMIT + 1);
  });

  it("[TST-06] 保護者用の答えつきの PDF も作れる", async () => {
    const plain = await buildTestPdf({ title: "t", questions: [write, read], withAnswers: false, fontBytes });
    const withAnswers = await buildTestPdf({ title: "t", questions: [write, read], withAnswers: true, fontBytes });
    expect(withAnswers.bytes.length).toBeGreaterThan(plain.bytes.length);
  });
});
