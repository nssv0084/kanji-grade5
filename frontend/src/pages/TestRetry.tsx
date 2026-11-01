import { useRef, useState } from "react";
import type { TestResult } from "../../../shared/types";
import { api } from "../api";
import { ReadQuestion } from "../components/ReadQuestion";
import { WriteQuestion } from "../components/WriteQuestion";

// TST-14: 月例テストで間違えた問題を1回ずつ解き直す。復習・定着度には記録せず、終わったことだけ送る
export function TestRetry({ result, onDone }: { result: TestResult; onDone: () => void }) {
  const questions = result.retry;
  const [i, setI] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const save = () => {
    setError("");
    api("POST", `/tests/${result.month}/retried`)
      .then(() => setSaved(true))
      .catch((e: Error) => setError(`送れませんでした（${e.message}）`));
  };

  // 「つぎへ」をすばやく2回押しても、1問ずつしか進めない
  const current = useRef(0);
  const answer = (no: number, ok: boolean) => {
    if (no !== current.current) return;
    current.current = no + 1;
    if (ok) setCorrect((n) => n + 1);
    setI(no + 1);
    if (no + 1 === questions.length) save();
  };

  if (i >= questions.length) {
    return (
      <main className="page">
        <h1>やりなおしおわり！</h1>
        <section className="card stack">
          <p className="big">
            {correct} / {questions.length} もん せいかい
          </p>
          <p>テストでまちがえた問題は、明日からの「ふくしゅう」にも出るよ。</p>
        </section>
        {error && (
          <p className="error">
            {error}{" "}
            <button type="button" className="secondary" onClick={save}>
              もう一度
            </button>
          </p>
        )}
        <button type="button" className="primary wide" disabled={!saved && !error} onClick={onDone}>
          おわる
        </button>
      </main>
    );
  }

  const q = questions[i];
  return (
    <main className="page">
      <header className="page-header">
        <span className="muted">
          {result.title}のやりなおし {i + 1} / {questions.length} もん
        </span>
        <button type="button" className="secondary" onClick={onDone}>
          やめる
        </button>
      </header>
      {q.type === "write" ? (
        <WriteQuestion key={q.no} text={q.text} onAnswer={(c) => answer(i, c)} />
      ) : (
        <ReadQuestion key={q.no} text={q.text} onAnswer={(c) => answer(i, c)} />
      )}
    </main>
  );
}
