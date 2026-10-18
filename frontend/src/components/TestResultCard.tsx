import { useEffect, useState } from "react";
import type { TestResult } from "../../../shared/types";
import { api } from "../api";

// K-07: 月例テストの結果（TST-11）。いちばん新しいテストと、前の月との差
export function TestResultCard() {
  const [results, setResults] = useState<TestResult[] | null>(null);

  useEffect(() => {
    // 結果がなくてもホームは使えるので、読めないときは出さない
    api<TestResult[]>("GET", "/tests")
      .then(setResults)
      .catch(() => setResults([]));
  }, []);

  const [latest, prev] = results ?? [];
  if (!latest) return null;
  const rate = (r: TestResult) => Math.round((r.score / r.total) * 100);
  const diff = prev ? rate(latest) - rate(prev) : undefined;

  return (
    <section className="card stack">
      <h2>{latest.title}の結果</h2>
      <p className="big">
        {latest.score} / {latest.total} 点
      </p>
      {diff !== undefined && (
        <p>
          前の月より{" "}
          {diff > 0 ? `${diff}ポイント上がったよ！` : diff === 0 ? "同じだったよ" : `${-diff}ポイント下がったよ。次はがんばろう`}
          <span className="muted">（正しく書けた問題のわりあい）</span>
        </p>
      )}
      {latest.missed.length > 0 ? (
        <p>
          まちがえた字: <span className="missed">{latest.missed.join(" ")}</span>
          <br />
          <span className="muted">練習の「ふくしゅう」に出てくるよ。</span>
        </p>
      ) : (
        <p>ぜんぶ正しく書けたね！</p>
      )}
    </section>
  );
}
