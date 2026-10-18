import { useMemo, useState } from "react";
import { decide, DEFAULT_THRESHOLDS, measure, prepareModels, type Measurement, type Thresholds, type Verdict } from "../../../shared/handwriting/judge";
import type { Point } from "../../../shared/handwriting/path";
import { formatKun, GRADE5, GRADE5_CHARS } from "../../../shared/kanji";
import { ModelFigure, UserFigure, type StrokeMark } from "../components/KanjiFigure";
import { WritingPad } from "../components/WritingPad";
import { loadSamples, roundStrokes, saveSamples, summarize, type Sample } from "../lib/samples";

// 手書き判定の試作（ステップ1）。AWS を使わず、端末の中だけで判定と記録をする
const THRESHOLD_KEY = "kanji-proto-thresholds";
const VERDICT_LABEL: Record<Verdict, string> = { correct: "○ 正解", unsure: "△ あいまい", wrong: "× ちがう" };

const randomChar = (except?: string) => {
  const pool = GRADE5_CHARS.filter((c) => c !== except);
  return pool[Math.floor(Math.random() * pool.length)];
};

function loadThresholds(): Thresholds {
  try {
    return { ...DEFAULT_THRESHOLDS, ...JSON.parse(localStorage.getItem(THRESHOLD_KEY) ?? "{}") };
  } catch {
    return DEFAULT_THRESHOLDS;
  }
}

export function HandwritingLab({ onBack }: { onBack?: () => void }) {
  const models = useMemo(() => prepareModels(GRADE5), []);
  const [char, setChar] = useState(() => randomChar());
  const [strokes, setStrokes] = useState<Point[][]>([]);
  const [result, setResult] = useState<{ strokes: Point[][]; m: Measurement } | null>(null);
  const [showModel, setShowModel] = useState(false);
  const [thresholds, setThresholds] = useState(loadThresholds);
  const [samples, setSamples] = useState<Sample[]>(loadSamples);
  const [recorded, setRecorded] = useState(false);
  const [message, setMessage] = useState("");
  const [sendMessage, setSendMessage] = useState("");

  const entry = GRADE5[char];
  const verdict = result ? decide(result.m, thresholds) : null;
  const summary = summarize(samples, thresholds);

  const next = (c = randomChar(char)) => {
    setChar(c);
    setStrokes([]);
    setResult(null);
    setShowModel(false);
    setRecorded(false);
    setMessage("");
  };

  const judge = () => {
    setResult({ strokes, m: measure(strokes, char, models) });
    setRecorded(false);
  };

  const record = (actuallyCorrect: boolean) => {
    if (!result || !verdict) return;
    const sample: Sample = {
      at: new Date().toISOString(),
      char,
      strokes: roundStrokes(result.strokes),
      measurement: result.m,
      verdict,
      actuallyCorrect,
    };
    const updated = [...samples, sample];
    if (!saveSamples(updated)) {
      setMessage("記録を保存できませんでした。書き出してから記録を消してください。");
      return;
    }
    setSamples(updated);
    setRecorded(true);
  };

  const updateThreshold = (key: keyof Thresholds, value: number) => {
    const t = { ...thresholds, [key]: value };
    setThresholds(t);
    try {
      localStorage.setItem(THRESHOLD_KEY, JSON.stringify(t));
    } catch {
      // 保存できなくても、この画面の間は使える
    }
  };

  const exportSamples = () => {
    const blob = new Blob([JSON.stringify({ thresholds, samples }, null, 1)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `kanji-samples-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // 開発サーバーで動かしているときだけ、PC の samples/ に送れる（vite.config.ts の受け口）
  const sendToPc = async () => {
    setSendMessage("送っています…");
    try {
      const res = await fetch("/__samples", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ thresholds, samples }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { count } = (await res.json()) as { count: number };
      setSendMessage(`PC に ${count} 件を送りました。`);
    } catch (e) {
      setSendMessage(`PC に送れませんでした（${(e as Error).message}）。JSON で書き出してください。`);
    }
  };

  const clearSamples = () => {
    if (!window.confirm(`記録 ${samples.length} 件を消します。先に書き出しましたか？`)) return;
    saveSamples([]);
    setSamples([]);
  };

  // 画ごとの色: 手本は「ずれた画・書かなかった画」、書いた字は「ずれた画・余分な画」
  const modelMarks: StrokeMark[] = [];
  const userMarks: StrokeMark[] = [];
  if (result) {
    for (const x of result.m.matches) {
      const bad = x.distance > thresholds.correctMax;
      modelMarks[x.model] = bad ? "bad" : "ok";
      userMarks[x.user] = bad ? "bad" : "ok";
    }
    for (const j of result.m.missing) modelMarks[j] = "missing";
    for (const i of result.m.extra) userMarks[i] = "bad";
  }

  return (
    <main className="page">
      <header className="page-header">
        {onBack && (
          <button type="button" className="secondary" onClick={onBack}>
            ← もどる
          </button>
        )}
        <h1>書き取り判定の試作</h1>
      </header>

      <section className="card prompt">
        <div className="readings">
          {entry.on.length > 0 && <p>音: {entry.on.join("・")}</p>}
          {entry.kun.length > 0 && <p>訓: {entry.kun.map(formatKun).join("・")}</p>}
        </div>
        <div className="prompt-actions">
          <button type="button" className="secondary" onClick={() => setShowModel((v) => !v)}>
            {showModel ? "手本をかくす" : "手本を見る"}
          </button>
          <button type="button" className="secondary" onClick={() => next()}>
            つぎの字
          </button>
          <CharPicker onPick={next} />
        </div>
        {showModel && (
          <div className="model-preview">
            <ModelFigure strokes={entry.strokes} animate numbers label={`${char}の手本`} />
          </div>
        )}
      </section>

      <section className="writing">
        <p className="stroke-count">{strokes.length} 画</p>
        <WritingPad
          strokes={strokes}
          onChange={(s) => {
            setStrokes(s);
            setResult(null);
          }}
        />
        <div className="pad-actions">
          <button type="button" className="secondary" disabled={strokes.length === 0} onClick={() => setStrokes(strokes.slice(0, -1))}>
            1画もどす
          </button>
          <button type="button" className="secondary" disabled={strokes.length === 0} onClick={() => setStrokes([])}>
            書き直す
          </button>
          <button type="button" className="primary" disabled={strokes.length === 0} onClick={judge}>
            判定する
          </button>
        </div>
      </section>

      {result && verdict && (
        <section className="card result" aria-live="polite">
          <p className={`verdict ${verdict}`}>
            {VERDICT_LABEL[verdict]}（{char}）
          </p>
          <ul className="notes">
            <li>
              画数: {result.m.userCount} 画（手本 {result.m.modelCount} 画）
            </li>
            {!result.m.orderOk && <li>書き順をたしかめよう</li>}
            {!result.m.directionOk && <li>線の向きが逆の画があるよ</li>}
          </ul>
          <div className="compare">
            <figure>
              <UserFigure strokes={result.strokes} marks={userMarks} label="書いた字" />
              <figcaption>書いた字</figcaption>
            </figure>
            <figure>
              <ModelFigure strokes={entry.strokes} marks={modelMarks} numbers={!result.m.orderOk} label={`${char}の手本`} />
              <figcaption>手本</figcaption>
            </figure>
          </div>

          <dl className="metrics">
            <dt>ずれの平均 / 最大</dt>
            <dd>
              {result.m.meanDistance.toFixed(3)} / {result.m.maxDistance.toFixed(3)}
            </dd>
            <dt>全体のずれ</dt>
            <dd>{result.m.score.toFixed(3)}</dd>
            <dt>形が近い字</dt>
            <dd>{result.m.nearest.map((n) => `${n.char} ${n.score.toFixed(3)}`).join("、")}</dd>
          </dl>

          <div className="feedback">
            {recorded ? (
              <p>記録しました。</p>
            ) : (
              <>
                <p>実際は正しく書けていた？</p>
                <div className="pad-actions">
                  <button type="button" className="secondary" onClick={() => record(true)}>
                    正しく書けていた
                  </button>
                  <button type="button" className="secondary" onClick={() => record(false)}>
                    まちがっていた
                  </button>
                </div>
              </>
            )}
            {message && <p className="error">{message}</p>}
            <button type="button" className="primary wide" onClick={() => next()}>
              つぎの字
            </button>
          </div>
        </section>
      )}

      <section className="card">
        <h2>記録</h2>
        <p>
          {summary.total} 件（今のしきい値で判定し直すと）: まちがって正解 {summary.falseAccept} 件、正しいのに不正解{" "}
          {summary.falseReject} 件、あいまい {summary.unsure} 件
        </p>
        <div className="pad-actions">
          {import.meta.env.DEV && (
            <button type="button" className="primary" disabled={samples.length === 0} onClick={sendToPc}>
              PC に送る
            </button>
          )}
          <button type="button" className="secondary" disabled={samples.length === 0} onClick={exportSamples}>
            JSON で書き出す
          </button>
          <button type="button" className="secondary" disabled={samples.length === 0} onClick={clearSamples}>
            記録を消す
          </button>
        </div>
        {sendMessage && <p className="send-message">{sendMessage}</p>}
      </section>

      <details className="card">
        <summary>しきい値</summary>
        {(Object.keys(DEFAULT_THRESHOLDS) as (keyof Thresholds)[]).map((key) => (
          <label key={key} className="threshold">
            <span>
              {key}: {thresholds[key].toFixed(3)}
            </span>
            <input
              type="range"
              min={0}
              max={key === "rivalMargin" ? 0.1 : 0.4}
              step={0.005}
              value={thresholds[key]}
              onChange={(e) => updateThreshold(key, Number(e.target.value))}
            />
          </label>
        ))}
        <button
          type="button"
          className="secondary"
          onClick={() => {
            setThresholds(DEFAULT_THRESHOLDS);
            try {
              localStorage.removeItem(THRESHOLD_KEY);
            } catch {
              // 無視してよい
            }
          }}
        >
          初期値にもどす
        </button>
      </details>

      <footer className="credit">
        漢字データ: KANJIDIC2（EDRDG、CC BY-SA 4.0）、KanjiVG（Ulrich Apel、CC BY-SA 3.0）、常用漢字一覧（ウィキペディア日本語版、CC BY-SA 4.0）
      </footer>
    </main>
  );
}

function CharPicker({ onPick }: { onPick: (c: string) => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  return (
    <form
      className="char-picker"
      onSubmit={(e) => {
        e.preventDefault();
        const c = value.trim();
        if (!GRADE5[c]) {
          setError("5年生の漢字を1字入れてください");
          return;
        }
        setError("");
        setValue("");
        onPick(c);
      }}
    >
      <input value={value} onChange={(e) => setValue(e.target.value)} maxLength={2} aria-label="字を指定" placeholder="字" />
      <button type="submit" className="secondary">
        この字
      </button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}
