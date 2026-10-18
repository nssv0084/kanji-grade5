import { useEffect, useState } from "react";
import { formatKun, GRADE5 } from "../../../shared/kanji";
import type { KanjiMapEntry } from "../../../shared/types";
import { api } from "../api";
import { ModelFigure } from "../components/KanjiFigure";

const LABEL = { unlearned: "まだ", learning: "練習中", mastered: "覚えた", weak: "苦手" } as const;

// K-05 漢字マップ（MAP-02）: 193字を定着度で色分けし、押すと読みと書き順を出す
export function KanjiMap({ onBack }: { onBack: () => void }) {
  const [entries, setEntries] = useState<KanjiMapEntry[] | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    api<KanjiMapEntry[]>("GET", "/kanji")
      .then(setEntries)
      .catch((e: Error) => setError(e.message));
  }, []);

  const counts = entries?.reduce<Record<string, number>>((c, e) => ({ ...c, [e.mastery]: (c[e.mastery] ?? 0) + 1 }), {});

  return (
    <main className="page">
      <header className="page-header">
        <button type="button" className="secondary" onClick={onBack}>
          ← もどる
        </button>
        <h1>漢字マップ</h1>
      </header>
      {error && <p className="error">{error}</p>}
      {!entries && !error && <p className="muted">読み込み中…</p>}
      {entries && (
        <>
          <p className="legend">
            {(Object.keys(LABEL) as (keyof typeof LABEL)[]).map((m) => (
              <span key={m} className={`chip ${m}`}>
                {LABEL[m]} {counts?.[m] ?? 0}
              </span>
            ))}
          </p>
          <div className="kanji-grid">
            {entries.map((e) => (
              <button key={e.kanji} type="button" className={`cell ${e.mastery}`} onClick={() => setSelected(e.kanji)} aria-label={`${e.kanji} ${LABEL[e.mastery]}`}>
                {e.kanji}
              </button>
            ))}
          </div>
          {selected && (
            <section className="card stack">
              <div className="new-kanji">
                <div className="model-preview">
                  <ModelFigure strokes={GRADE5[selected].strokes} animate numbers label={`${selected}の書き順`} />
                </div>
                <div>
                  <p className="big">{selected}</p>
                  {GRADE5[selected].on.length > 0 && <p>音: {GRADE5[selected].on.join("・")}</p>}
                  {GRADE5[selected].kun.length > 0 && <p>訓: {GRADE5[selected].kun.map(formatKun).join("・")}</p>}
                </div>
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}
