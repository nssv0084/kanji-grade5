import { useEffect, useState } from "react";
import type { Tally } from "../../../shared/study/dashboard";
import type { ChildDashboard, PasswordReset } from "../../../shared/types";
import { api } from "../api";

const WEEKDAY = ["日", "月", "火", "水", "木", "金", "土"];
const dayLabel = (date: string) => `${Number(date.slice(8))}(${WEEKDAY[new Date(`${date}T00:00:00Z`).getUTCDay()]})`;

const percent = (t: Tally) => Math.round((t.correct / t.answers) * 100);
const rate = (t: Tally) => `${percent(t)}%（${t.correct} / ${t.answers}問）`;

/** 7日分を合わせた正答率（DSH-06） */
function WeekRate({ t }: { t: ChildDashboard["weekTotal"] }) {
  if (!t.answers) return null;
  const { write, read } = t.byType;
  return (
    <p>
      この7日の正答率 {rate(t)}
      {(write.answers > 0 || read.answers > 0) && (
        <>
          <br />
          {[write.answers > 0 && `書き取り ${rate(write)}`, read.answers > 0 && `読み ${rate(read)}`].filter(Boolean).join(" ・ ")}
        </>
      )}
    </p>
  );
}

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
          <div
            key={d.date}
            className="week-day"
            role="listitem"
            aria-label={`${dayLabel(d.date)} ${d.answers}問${d.answers ? ` 正解${d.correct}（${percent(d)}%）` : ""}`}
          >
            <span className="week-count">{d.answers || ""}</span>
            <span className="week-bar" style={{ height: `${(d.answers / max) * 60}px` }} />
            <span className="week-label">{dayLabel(d.date)}</span>
            <span className="week-rate">{d.answers ? `${percent(d)}%` : ""}</span>
          </div>
        ))}
      </div>
      <WeekRate t={c.weekTotal} />

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

      <PasswordResetButton childId={c.childId} />
    </div>
  );
}

/** 子どもの仮パスワードの再発行（ACC-05）。仮パスワードは一度だけ表示し、どこにも保存しない */
function PasswordResetButton({ childId }: { childId: string }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = async () => {
    if (!window.confirm("仮パスワードを再発行しますか？ 今のパスワードは使えなくなります。")) return;
    setBusy(true);
    setError("");
    try {
      setPassword((await api<PasswordReset>("POST", `/admin/children/${childId}/password`)).temporaryPassword);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (password)
    return (
      <div className="notice stack">
        <p>
          仮パスワード: <code className="temp-password">{password}</code>
        </p>
        <p className="small">子どもに伝えてください。ログインすると、新しいパスワードを決める画面になります。この表示を閉じると、もう一度は見られません（7日で使えなくなります）。</p>
        <button type="button" className="secondary" onClick={() => setPassword("")}>
          閉じる
        </button>
      </div>
    );
  return (
    <div>
      {error && <p className="error">{error}</p>}
      <button type="button" className="secondary" disabled={busy} onClick={reset}>
        {busy ? "再発行しています…" : "パスワードを忘れたとき: 仮パスワードを再発行"}
      </button>
    </div>
  );
}

// P-01: 子どもの状況（DSH-01、DSH-02、DSH-05、DSH-06、STK-03）
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
