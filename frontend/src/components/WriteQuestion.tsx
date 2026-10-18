import { useMemo, useState } from "react";
import { decide, DEFAULT_THRESHOLDS, measure, prepareModels, type Models, type Verdict } from "../../../shared/handwriting/judge";
import type { Point } from "../../../shared/handwriting/path";
import { charsToWrite, parseText, targetOf } from "../../../shared/items/text";
import { GRADE5 } from "../../../shared/kanji";
import { ModelFigure, UserFigure } from "./KanjiFigure";
import { WritingPad } from "./WritingPad";

let models: Models | undefined;
const getModels = () => (models ??= prepareModels(GRADE5));

interface Props {
  text: string;
  /** 最終的な正誤と、子どもが自分で選んだか */
  onAnswer: (correct: boolean, selfJudged: boolean) => void;
}

interface CharResult {
  char: string;
  strokes: Point[][];
  verdict: Verdict;
  orderOk: boolean;
}

// K-02 書き取り（HWR-01: 1字ずつ書く。語の中の5年生の漢字だけを書かせ、ほかの字は印刷して見せる）
export function WriteQuestion({ text, onAnswer }: Props) {
  const { word, reading } = targetOf(text);
  const chars = [...word];
  const toWrite = charsToWrite(word);
  const writeIdx = chars.map((_, i) => i).filter((i) => toWrite[i]);
  const [pos, setPos] = useState(0);
  const [drawn, setDrawn] = useState<Point[][][]>(() => writeIdx.map(() => []));
  const [results, setResults] = useState<CharResult[] | null>(null);
  const [override, setOverride] = useState<boolean | null>(null);

  const current = drawn[pos];
  const isLast = pos === writeIdx.length - 1;

  const judgeAll = () => {
    setResults(
      writeIdx.map((ci, k) => {
        const m = measure(drawn[k], chars[ci], getModels());
        return { char: chars[ci], strokes: drawn[k], verdict: decide(m, DEFAULT_THRESHOLDS), orderOk: m.orderOk };
      }),
    );
  };

  const overall: Verdict | null = useMemo(() => {
    if (!results) return null;
    if (results.some((r) => r.verdict === "wrong")) return "wrong";
    if (results.some((r) => r.verdict === "unsure")) return "unsure";
    return "correct";
  }, [results]);

  const setStrokes = (s: Point[][]) => setDrawn((d) => d.map((x, k) => (k === pos ? s : x)));

  return (
    <div className="question stack">
      <p className="sentence">
        {parseText(text).map((s, i) =>
          s.kind === "plain" ? (
            <span key={i}>{s.text}</span>
          ) : (
            <span key={i} className="target">
              {chars.map((c, k) =>
                toWrite[k] ? (
                  <span key={k} className={`box ${writeIdx[pos] === k && !results ? "current" : ""}`} onClick={() => !results && setPos(writeIdx.indexOf(k))}>
                    {results ? c : "　"}
                  </span>
                ) : (
                  <span key={k}>{c}</span>
                ),
              )}
              <span className="ruby">（{reading}）</span>
            </span>
          ),
        )}
      </p>

      {!results && (
        <>
          <p className="muted">
            {writeIdx.length > 1 ? `${pos + 1}字目 / ${writeIdx.length}字` : "□の漢字を書こう"}（{current.length} 画）
          </p>
          <WritingPad key={pos} strokes={current} onChange={setStrokes} />
          <div className="pad-actions">
            <button type="button" className="secondary" disabled={current.length === 0} onClick={() => setStrokes(current.slice(0, -1))}>
              1画もどす
            </button>
            <button type="button" className="secondary" disabled={current.length === 0} onClick={() => setStrokes([])}>
              書き直す
            </button>
            {isLast ? (
              <button type="button" className="primary" disabled={drawn.some((d) => d.length === 0)} onClick={judgeAll}>
                こたえる
              </button>
            ) : (
              <button type="button" className="primary" disabled={current.length === 0} onClick={() => setPos(pos + 1)}>
                つぎの字へ
              </button>
            )}
          </div>
        </>
      )}

      {results && overall && (
        <div className="card stack" aria-live="polite">
          <div className="compare">
            {results.map((r, k) => (
              <div key={k} className="compare-pair">
                <figure>
                  <UserFigure strokes={r.strokes} label="書いた字" />
                  <figcaption>書いた字</figcaption>
                </figure>
                <figure>
                  <ModelFigure strokes={GRADE5[r.char].strokes} numbers={!r.orderOk} label={`${r.char}の手本`} />
                  <figcaption>手本</figcaption>
                </figure>
              </div>
            ))}
          </div>
          {results.some((r) => !r.orderOk) && <p>書き順をたしかめよう（手本の数字の順）</p>}

          {overall === "correct" && override === null && (
            <>
              <p className="verdict correct">○ せいかい！</p>
              {/* HWR-10: 照合では細部の違いを見分けられないため、必ず見比べさせる */}
              <p>手本とくらべてみよう。ちがっていたら「ちがってた」をおしてね。</p>
              <div className="pad-actions">
                <button type="button" className="secondary" onClick={() => onAnswer(false, true)}>
                  ちがってた
                </button>
                <button type="button" className="primary" onClick={() => onAnswer(true, false)}>
                  つぎへ
                </button>
              </div>
            </>
          )}
          {overall === "unsure" && override === null && (
            <>
              <p className="verdict unsure">△ 手本とくらべてみよう</p>
              {/* HWR-03: あいまいなときは子どもが見比べて選ぶ */}
              <p>合っていたら○、ちがっていたら×をえらんでね。</p>
              <div className="pad-actions">
                <button type="button" className="secondary" onClick={() => setOverride(false)}>
                  × ちがってた
                </button>
                <button type="button" className="primary" onClick={() => setOverride(true)}>
                  ○ 合ってた
                </button>
              </div>
            </>
          )}
          {overall === "wrong" && override === null && (
            <>
              <p className="verdict wrong">× 手本をよく見て、もう一度書いてみよう</p>
              <button type="button" className="primary wide" onClick={() => onAnswer(false, false)}>
                つぎへ
              </button>
            </>
          )}
          {override !== null && (
            <button type="button" className="primary wide" onClick={() => onAnswer(override, true)}>
              つぎへ
            </button>
          )}
        </div>
      )}
    </div>
  );
}
