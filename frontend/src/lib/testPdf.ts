import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { charsToWrite, parseText, targetOf } from "../../../shared/items/text";
import type { TestQuestion } from "../../../shared/test/compose";

// 月例テストの PDF（TST-05、TST-06）。A4 横書き。座標を決めて描くので、どの端末で作っても同じ配置になる

const MM = 72 / 25.4;
const PAGE = { width: 210 * MM, height: 297 * MM };
const MARGIN = 15 * MM;
const BOX = 12 * MM;
const TEXT = 14;
const MIN_TEXT = 10;
const RUBY = 7.5;
const NUMBER_WIDTH = 10 * MM;
const READ_FRAME = { width: 42 * MM, height: 10 * MM };
// 30問（書き取り20・読み10）が2ページに収まる高さ。マス 12mm と、その上のよみが入る
const ROW = { write: 17 * MM, read: 13 * MM };
const HEADER = 22 * MM;
const INK = rgb(0.12, 0.16, 0.22);
const GUIDE = rgb(0.8, 0.82, 0.86);
const ANSWER = rgb(0.85, 0.15, 0.2);

export interface TestPdfOptions {
  title: string;
  questions: TestQuestion[];
  /** 保護者用に答えを赤で入れる（TST-06） */
  withAnswers: boolean;
  fontBytes: ArrayBuffer | Uint8Array;
}

export interface TestPdfResult {
  bytes: Uint8Array;
  pages: number;
  /** はみ出しの検査用: 各問の右端（ポイント） */
  rightEdges: number[];
}

interface Piece {
  kind: "text" | "box" | "under";
  text: string;
  /** 書き取りの答えの字（box のとき） */
  answer?: string;
}

/** 1問を、左から描く部品に分ける */
function pieces(q: TestQuestion): { parts: Piece[]; reading: string; word: string } {
  const { word, reading } = targetOf(q.text);
  const parts: Piece[] = [];
  for (const s of parseText(q.text)) {
    if (s.kind === "plain") parts.push({ kind: "text", text: s.text });
    else if (q.type === "read") parts.push({ kind: "under", text: s.word });
    else {
      const write = charsToWrite(s.word);
      [...s.word].forEach((c, i) => parts.push(write[i] ? { kind: "box", text: "", answer: c } : { kind: "text", text: c }));
    }
  }
  return { parts, reading, word };
}

function widthOf(parts: Piece[], font: PDFFont, size: number): number {
  return parts.reduce((w, p) => w + (p.kind === "box" ? BOX + 2 : font.widthOfTextAtSize(p.text, size)), 0);
}

export async function buildTestPdf(opts: TestPdfOptions): Promise<TestPdfResult> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(opts.fontBytes, { subset: true });
  const rightEdges: number[] = [];
  const contentRight = PAGE.width - MARGIN;

  // ページの割り付けを先に決め、見出しに「（1/2）」を入れる
  const pagesOf: TestQuestion[][] = [[]];
  let used = 0;
  for (const q of opts.questions) {
    const h = ROW[q.type];
    if (used + h > PAGE.height - 2 * MARGIN - HEADER) {
      pagesOf.push([]);
      used = 0;
    }
    pagesOf[pagesOf.length - 1].push(q);
    used += h;
  }

  pagesOf.forEach((qs, pi) => {
    const page = doc.addPage([PAGE.width, PAGE.height]);
    const title = `${opts.title}${pagesOf.length > 1 ? `（${pi + 1}/${pagesOf.length}）` : ""}${opts.withAnswers ? " 答え" : ""}`;
    let y = PAGE.height - MARGIN - 16;
    page.drawText(title, { x: MARGIN, y, size: 16, font, color: INK });
    if (pi === 0) {
      const label = "名前";
      page.drawText(label, { x: contentRight - 70 * MM, y, size: 12, font, color: INK });
      page.drawLine({ start: { x: contentRight - 58 * MM, y: y - 3 }, end: { x: contentRight - 22 * MM, y: y - 3 }, thickness: 0.8, color: INK });
      page.drawRectangle({ x: contentRight - 18 * MM, y: y - 6, width: 18 * MM, height: 12 * MM, borderColor: INK, borderWidth: 0.8 });
      page.drawText(`/${opts.questions.length}`, { x: contentRight - 9 * MM, y: y - 3, size: 9, font, color: INK });
    }
    y = PAGE.height - MARGIN - HEADER;
    for (const q of qs) {
      y -= ROW[q.type];
      rightEdges.push(drawQuestion(page, font, q, y, opts.withAnswers, contentRight));
    }
  });

  const bytes = await doc.save();
  return { bytes, pages: pagesOf.length, rightEdges };
}

/** 1問を描き、右端の x を返す。y は行の下端 */
function drawQuestion(page: PDFPage, font: PDFFont, q: TestQuestion, y: number, withAnswers: boolean, right: number): number {
  const { parts, reading } = pieces(q);
  const left = MARGIN + NUMBER_WIDTH;
  const avail = right - left - (q.type === "read" ? READ_FRAME.width + 4 * MM : 0);
  // 長い文は字を小さくして1行に収める
  let size = TEXT;
  while (size > MIN_TEXT && widthOf(parts, font, size) > avail) size -= 0.5;

  const base = y + (q.type === "write" ? 4 * MM : 4 * MM);
  page.drawText(`${q.no}`, { x: MARGIN, y: base, size: 12, font, color: INK });

  let x = left;
  let rubyFrom = -1;
  let rubyTo = -1;
  for (const p of parts) {
    if (p.kind === "text") {
      page.drawText(p.text, { x, y: base, size, font, color: INK });
      x += font.widthOfTextAtSize(p.text, size);
    } else if (p.kind === "under") {
      const w = font.widthOfTextAtSize(p.text, size);
      page.drawText(p.text, { x, y: base, size, font, color: INK });
      page.drawLine({ start: { x, y: base - 3 }, end: { x: x + w, y: base - 3 }, thickness: 1, color: INK });
      x += w;
    } else {
      // 書き取りの1マス。十字の補助線を薄く入れる
      const bx = x + 1;
      const by = base - (BOX - size) / 2 - 2;
      page.drawRectangle({ x: bx, y: by, width: BOX, height: BOX, borderColor: INK, borderWidth: 1 });
      page.drawLine({ start: { x: bx + BOX / 2, y: by + 1 }, end: { x: bx + BOX / 2, y: by + BOX - 1 }, thickness: 0.4, color: GUIDE, dashArray: [2, 2] });
      page.drawLine({ start: { x: bx + 1, y: by + BOX / 2 }, end: { x: bx + BOX - 1, y: by + BOX / 2 }, thickness: 0.4, color: GUIDE, dashArray: [2, 2] });
      if (withAnswers && p.answer) page.drawText(p.answer, { x: bx + (BOX - 24) / 2, y: by + (BOX - 24) / 2 + 3, size: 24, font, color: ANSWER });
      if (rubyFrom < 0) rubyFrom = bx;
      rubyTo = bx + BOX;
      x += BOX + 2;
    }
  }

  if (q.type === "write" && rubyFrom >= 0) {
    // よみを、マスの上に小さく添える
    const w = font.widthOfTextAtSize(reading, RUBY);
    const boxTop = base - (BOX - size) / 2 - 2 + BOX;
    page.drawText(reading, { x: (rubyFrom + rubyTo) / 2 - w / 2, y: boxTop + 2, size: RUBY, font, color: INK });
  }

  if (q.type === "read") {
    // 読みの答えを書く枠
    const fx = right - READ_FRAME.width;
    page.drawRectangle({ x: fx, y: base - 3 * MM, width: READ_FRAME.width, height: READ_FRAME.height, borderColor: INK, borderWidth: 1 });
    if (withAnswers) page.drawText(reading, { x: fx + 3 * MM, y: base, size: 12, font, color: ANSWER });
    return Math.max(x, right);
  }
  return x;
}
