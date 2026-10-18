import { useState } from "react";
import type { AnswerResponse, PracticeQuestion } from "../../../shared/types";
import { api } from "../api";
import { ReadQuestion } from "../components/ReadQuestion";
import { WriteQuestion } from "../components/WriteQuestion";

interface Props {
  date: string;
  set: PracticeQuestion[];
  setNo: number;
  setCount: number;
  onDone: (res: AnswerResponse | null) => void;
}

const REASON_LABEL: Record<PracticeQuestion["reason"], string> = { new: "新しい漢字", review: "ふくしゅう", check: "たしかめ" };

// K-02〜K-04: 小セット（5問）を1問ずつ解き、最後に結果を出す
export function Practice({ date, set, setNo, setCount, onDone }: Props) {
  const todo = set.filter((q) => !q.answered);
  const [i, setI] = useState(0);
  const [results, setResults] = useState<{ q: PracticeQuestion; correct: boolean }[]>([]);
  const [last, setLast] = useState<AnswerResponse | null>(null);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  const answer = async (q: PracticeQuestion, correct: boolean, selfJudged = false) => {
    setSending(true);
    setError("");
    try {
      const res = await api<AnswerResponse>("POST", "/answers", { date, index: q.index, correct, selfJudged });
      setLast(res);
      setResults((r) => [...r, { q, correct }]);
      setI((n) => n + 1);
    } catch (e) {
      setError(`送れませんでした。もう一度おしてね（${(e as Error).message}）`);
    } finally {
      setSending(false);
    }
  };

  if (i >= todo.length) {
    const score = results.filter((r) => r.correct).length;
    return (
      <main className="page">
        <h1>
          セット {setNo} / {setCount} おわり
        </h1>
        <section className="card stack">
          <p className="big">
            {score} / {results.length} もん せいかい
          </p>
          {results.some((r) => !r.correct) && (
            <>
              <p>まちがえた問題は、明日のふくしゅうに出るよ。</p>
              <ul>
                {results
                  .filter((r) => !r.correct)
                  .map((r) => (
                    <li key={r.q.index}>{r.q.kanji}</li>
                  ))}
              </ul>
            </>
          )}
          {last && last.streak > 0 && <p>れんぞく {last.streak} 日！</p>}
          <button type="button" className="primary wide" onClick={() => onDone(last)}>
            {setNo < setCount ? "ホームにもどる" : "おわる"}
          </button>
        </section>
      </main>
    );
  }

  const q = todo[i];
  return (
    <main className="page">
      <header className="page-header">
        <span className="muted">
          セット {setNo} / {setCount}・{set.length - todo.length + i + 1} / {set.length} もん
        </span>
        <span className="tag">{REASON_LABEL[q.reason]}</span>
      </header>
      {q.type === "write" ? (
        <WriteQuestion key={q.index} text={q.text} onAnswer={(c, self) => !sending && answer(q, c, self)} />
      ) : (
        <ReadQuestion key={q.index} text={q.text} onAnswer={(c) => !sending && answer(q, c)} />
      )}
      {error && <p className="error">{error}</p>}
    </main>
  );
}
