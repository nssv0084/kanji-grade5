import { useCallback, useEffect, useState } from "react";
import { formatKun, GRADE5 } from "../../../shared/kanji";
import type { TodayResponse } from "../../../shared/types";
import { api } from "../api";
import { ModelFigure } from "../components/KanjiFigure";
import { TestResultCard } from "../components/TestResultCard";
import { KanjiMap } from "./KanjiMap";
import { Practice } from "./Practice";

// K-01 ホーム: 今日の練習、今日の新しい漢字、連続学習日数、覚えた字数
export function ChildHome({ nickname, onSignOut }: { nickname: string; onSignOut: () => void }) {
  const [today, setToday] = useState<TodayResponse | null>(null);
  const [error, setError] = useState("");
  const [view, setView] = useState<"home" | "practice" | "map">("home");
  const [celebrated, setCelebrated] = useState(false);

  const load = useCallback(() => {
    setError("");
    api<TodayResponse>("GET", "/today")
      .then(setToday)
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  if (view === "map") return <KanjiMap onBack={() => setView("home")} />;

  const nextSet = today?.sets.findIndex((s) => s.some((q) => !q.answered)) ?? -1;
  if (view === "practice" && today && nextSet >= 0) {
    return (
      <Practice
        date={today.date}
        set={today.sets[nextSet]}
        setNo={nextSet + 1}
        setCount={today.sets.length}
        onDone={() => {
          setView("home");
          load();
        }}
      />
    );
  }

  const total = today?.sets.flat().length ?? 0;
  const done = today?.sets.flat().filter((q) => q.answered).length ?? 0;

  return (
    <main className="page">
      <h1>{nickname} さん、こんにちは</h1>
      {error && (
        <p className="error">
          {error}{" "}
          <button type="button" className="secondary" onClick={load}>
            もう一度
          </button>
        </p>
      )}
      {!today && !error && <p className="muted">読み込み中…</p>}

      {today?.celebrate && !celebrated && (
        <section className="card stack celebrate" role="status">
          <p className="celebrate-title">おめでとう！</p>
          <p className="big">覚えた字が {today.celebrate} 字になったよ。</p>
          <p>この調子で続けよう。</p>
          <button type="button" className="primary" onClick={() => setCelebrated(true)}>
            やったね
          </button>
        </section>
      )}

      {today?.needsPlan &&<p className="card">おうちの人に学習計画を登録してもらおう。</p>}

      {today && !today.needsPlan && (
        <>
          <section className="card stack">
            <h2>今日の練習</h2>
            {total === 0 ? (
              <p>今日の問題はまだないよ。</p>
            ) : done < total ? (
              <>
                <p>
                  {done} / {total} もん（セット {nextSet + 1} / {today.sets.length}）
                </p>
                <button type="button" className="primary wide" onClick={() => setView("practice")}>
                  {done === 0 ? "はじめる" : "つづきから"}
                </button>
              </>
            ) : (
              <p className="big">今日の練習はおわり！よくがんばったね。</p>
            )}
          </section>

          {today.newKanji.length > 0 && (
            <section className="card stack">
              <h2>今日の新しい漢字</h2>
              {today.newKanji.map((k) => (
                <div key={k} className="new-kanji">
                  <div className="model-preview">
                    <ModelFigure strokes={GRADE5[k].strokes} animate numbers label={`${k}の書き順`} />
                  </div>
                  <div>
                    {GRADE5[k].on.length > 0 && <p>音: {GRADE5[k].on.join("・")}</p>}
                    {GRADE5[k].kun.length > 0 && <p>訓: {GRADE5[k].kun.map(formatKun).join("・")}</p>}
                  </div>
                </div>
              ))}
            </section>
          )}

          <TestResultCard />

          <section className="card stack">
            <p>れんぞく {today.streak} 日</p>
            <p>
              覚えた字 {today.masteredCount} / {today.total}（習った字 {today.learnedCount}）
            </p>
            <button type="button" className="secondary" onClick={() => setView("map")}>
              漢字マップを見る
            </button>
          </section>
        </>
      )}

      <button type="button" className="secondary" onClick={onSignOut}>
        ログアウト
      </button>
      {/* LVL-05: 使ったデータのクレジット */}
      <footer className="credit">
        漢字データ: KANJIDIC2（EDRDG、CC BY-SA 4.0）、KanjiVG（Ulrich Apel、CC BY-SA 3.0）、常用漢字一覧（ウィキペディア日本語版、CC BY-SA 4.0）。テストのフォント: Klee One（Fontworks、SIL Open Font License 1.1）
      </footer>
    </main>
  );
}
