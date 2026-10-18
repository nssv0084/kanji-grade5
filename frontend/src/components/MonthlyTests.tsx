import { useCallback, useEffect, useState } from "react";
import type { MonthlyTest, TestsResponse } from "../../../shared/types";
import { api } from "../api";

/** PDF をブラウザで作って保存する（TST-05、TST-06）。pdf-lib は大きいので、使うときに読み込む */
async function downloadPdf(test: MonthlyTest, withAnswers: boolean) {
  const [{ buildTestPdf }, fontBytes] = await Promise.all([
    import("../lib/testPdf"),
    fetch(`${import.meta.env.BASE_URL}fonts/KleeOne-Regular-subset.ttf`).then((r) => {
      if (!r.ok) throw new Error("フォントを読み込めませんでした");
      return r.arrayBuffer();
    }),
  ]);
  const { bytes } = await buildTestPdf({ title: test.title, questions: test.questions, withAnswers, fontBytes });
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `kanji-test-${test.month}${withAnswers ? "-answers" : ""}.pdf`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

const counts = (t: MonthlyTest) => {
  const w = t.questions.filter((q) => q.type === "write").length;
  return `書き取り ${w} 問・読み ${t.questions.length - w} 問`;
};

// P-11（一部）: 月例テストの作成と PDF の印刷（TST-03〜06）
export function MonthlyTests() {
  const [data, setData] = useState<TestsResponse | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(() => {
    api<TestsResponse>("GET", "/admin/tests")
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const run = async (key: string, f: () => Promise<unknown>) => {
    setBusy(key);
    setError("");
    try {
      await f();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  if (!data) return error ? <p className="error">{error}</p> : null;
  return (
    <section className="card stack">
      <h2>月例テスト</h2>
      {error && <p className="error">{error}</p>}
      {data.reminder && <p className="notice">今月のテストを印刷しよう</p>}
      {data.children.length === 0 && <p className="muted">子どものアカウントがありません。</p>}
      {data.children.map((c) => {
        const current = c.tests.find((t) => t.month === data.month);
        return (
          <div key={c.childId} className="stack">
            {data.children.length > 1 && <h3>{c.nickname}</h3>}
            {!current && (
              <button
                type="button"
                className="primary"
                disabled={!!busy}
                onClick={() => run(`create-${c.childId}`, () => api("POST", "/admin/tests", { childId: c.childId }).then(load))}
              >
                {busy === `create-${c.childId}` ? "作成中…" : "今月のテストを作る"}
              </button>
            )}
            {c.tests.length > 0 && (
              <ul className="tests">
                {c.tests.map((t) => (
                  <li key={t.month} className="stack">
                    <span>
                      {t.title}（{counts(t)}）
                    </span>
                    <div className="pad-actions">
                      <button type="button" className="secondary" disabled={!!busy} onClick={() => run(`q-${t.month}`, () => downloadPdf(t, false))}>
                        {busy === `q-${t.month}` ? "作成中…" : "問題の PDF"}
                      </button>
                      <button type="button" className="secondary" disabled={!!busy} onClick={() => run(`a-${t.month}`, () => downloadPdf(t, true))}>
                        {busy === `a-${t.month}` ? "作成中…" : "答えの PDF"}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </section>
  );
}
