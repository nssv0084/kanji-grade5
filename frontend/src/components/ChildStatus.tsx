import { useEffect, useState } from "react";
import type { ChildDashboard } from "../../../shared/types";
import { api } from "../api";

const WEEKDAY = ["日", "月", "火", "水", "木", "金", "土"];
const dayLabel = (date: string) => `${Number(date.slice(8))}(${WEEKDAY[new Date(`${date}T00:00:00Z`).getUTCDay()]})`;

function Progress({ p }: { p: NonNullable<ChildDashboard["progress"]> }) {
  if (p.reviewMonth) return <p>復習の月です（期の終わりまで {p.daysLeft} 日）。</p>;
  return (
    <p>
      {p.learnedCount} 字目まで習いました。今月末の予定は {p.monthTarget} 字目まで。
      {p.behind > 0 ? <strong className="error"> 予定より {p.behind} 字遅れ</strong> : p.behind < 0 ? ` 予定より ${-p.behind} 字進んでいます` : " 予定どおり"}
      {p.daysLeft !== undefined && `（新しい字を学ぶ期間の残り ${p.daysLeft} 日）`}
    </p>
  );
}

function Child({ c, showName }: { c: ChildDashboard; showName: boolean }) {
  const max = Math.max(15, ...c.week.map((d) => d.answers));
  return (
    <div className="stack">
      {showName && <h3>{c.nickname}</h3>}
      {c.idleAlert && (
        <p className="alert">
          {c.idleDays === undefined ? "まだ一度も学習していません" : `最後の学習から ${c.idleDays} 日たっています`}
        </p>
      )}
      <p>
        習った字 {c.learned} ・ 覚えた字 {c.mastered} ・ 苦手な字 {c.weak}（全 {c.total} 字）
        <br />
        連続 {c.streak} 日{c.lastStudyDate && `（最後の学習: ${Number(c.lastStudyDate.slice(5, 7))}/${Number(c.lastStudyDate.slice(8))}）`}
      </p>
      {c.progress && <Progress p={c.progress} />}

      <div className="week" role="list" aria-label="7日分の学習量">
        {c.week.map((d) => (
          <div key={d.date} className="week-day" role="listitem" aria-label={`${dayLabel(d.date)} ${d.answers}問`}>
            <span className="week-count">{d.answers || ""}</span>
            <span className="week-bar" style={{ height: `${(d.answers / max) * 60}px` }} />
            <span className="week-label">{dayLabel(d.date)}</span>
          </div>
        ))}
      </div>

      {c.testScores.length > 0 && (
        <div className="stack">
          <h3>月例テストの点数</h3>
          <ul className="score-list">
            {c.testScores.map((t) => (
              <li key={t.month}>
                {Number(t.month.slice(5))}月 {t.score} / {t.total}（{Math.round((t.score / t.total) * 100)}%）
              </li>
            ))}
          </ul>
        </div>
      )}

      {c.weakKanji.length > 0 && (
        <div className="stack">
          <h3>苦手な字</h3>
          <ul className="weak-list">
            {c.weakKanji.map((w) => (
              <li key={w.kanji}>
                <span className="weak-kanji">{w.kanji}</span>
                <span className="muted">直近の書き取り {w.recent.map((r) => (r ? "○" : "×")).join("")}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// P-01: 子どもの状況（DSH-01、DSH-02、DSH-05、STK-03）
export function ChildStatus() {
  const [children, setChildren] = useState<ChildDashboard[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<ChildDashboard[]>("GET", "/admin/children")
      .then(setChildren)
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!children) return null;
  return (
    <section className="card stack">
      <h2>子どもの状況</h2>
      {children.length === 0 && <p className="muted">子どものアカウントがありません。</p>}
      {children.map((c) => (
        <Child key={c.childId} c={c} showName={children.length > 1} />
      ))}
    </section>
  );
}
