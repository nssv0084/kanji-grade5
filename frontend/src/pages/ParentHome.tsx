import { useCallback, useEffect, useState } from "react";
import { charsToWrite, parseText, targetOf } from "../../../shared/items/text";
import type { AdminItem, AdminOverview, JobSummary } from "../../../shared/types";
import { api } from "../api";
import { ChildStatus } from "../components/ChildStatus";
import { MonthlyTests } from "../components/MonthlyTests";

const JOB_STATUS: Record<JobSummary["status"], string> = { running: "作成中", done: "完了", failed: "失敗", budget: "予算で停止" };

const yen = (microUsd: number, rate: number) => `${Math.round((microUsd / 1_000_000) * rate).toLocaleString()}円`;

/** 子どもに見える形（書き取りは□、読みは太字）と答え */
function ItemPreview({ item }: { item: AdminItem }) {
  const { word, reading } = targetOf(item.text);
  const write = charsToWrite(word);
  return (
    <p className="item-preview">
      <span className="tag">{item.type === "write" ? "書き" : "読み"}</span>{" "}
      {parseText(item.text).map((s, i) =>
        s.kind === "plain" ? (
          <span key={i}>{s.text}</span>
        ) : item.type === "read" ? (
          <strong key={i} className="target read">
            {s.word}
          </strong>
        ) : (
          <span key={i}>
            {[...s.word].map((c, k) => (write[k] ? "□" : c)).join("")}（{s.reading}）
          </span>
        ),
      )}
      <span className="muted"> → {item.type === "write" ? word : reading}</span>
    </p>
  );
}

// P-01（一部）・P-06: 使用額、問題の生成、確認待ちの問題
export function ParentHome({ nickname, onOpenLab, onSignOut }: { nickname: string; onOpenLab: () => void; onSignOut: () => void }) {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [review, setReview] = useState<AdminItem[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(() => {
    setError("");
    Promise.all([api<AdminOverview>("GET", "/admin/overview"), api<AdminItem[]>("GET", "/admin/review")])
      .then(([o, r]) => {
        setOverview(o);
        setReview(r);
      })
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  // 作成中のジョブがあれば、15秒ごとに読み直す
  const running = overview?.jobs.some((j) => j.status === "running");
  useEffect(() => {
    if (!running) return;
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [running, load]);

  const generate = async () => {
    setBusy("generate");
    try {
      await api("POST", "/admin/generate");
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  const decide = async (item: AdminItem, status: "approved" | "disabled") => {
    setBusy(item.itemId);
    try {
      await api("PUT", `/admin/items/${item.itemId}`, { status });
      setReview((r) => r?.filter((x) => x.itemId !== item.itemId) ?? null);
      setOverview((o) => (o ? { ...o, reviewCount: o.reviewCount - 1 } : o));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  const u = overview?.usage;
  return (
    <main className="page">
      <h1>{nickname} さん（保護者）</h1>
      {error && <p className="error">{error}</p>}
      {!overview && !error && <p className="muted">読み込み中…</p>}

      <ChildStatus />

      {overview && u && (
        <section className="card stack">
          <h2>問題の作成</h2>
          <p>
            今月の AI の使用額: {yen(u.spentMicroUsd, u.usdJpy)} / 予算 {yen(u.budgetMicroUsd, u.usdJpy)}（{Math.round(u.stopRatio * 100)}%で生成を止めます）
          </p>
          <p className="muted">毎日 午前4時に、足りない問題を自動で作ります（1回に10字まで）。</p>
          <button type="button" className="primary" disabled={!!busy || running} onClick={generate}>
            {running ? "作成中…" : "今すぐ問題を作る"}
          </button>
          {overview.jobs.length > 0 && (
            <ul className="jobs">
              {overview.jobs.map((j) => (
                <li key={j.jobId}>
                  {new Date(j.createdAt).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} {JOB_STATUS[j.status]}
                  {j.kanji.length > 0 && `（${j.kanji.join("")}）`} 作成 {j.created} 問・除外 {j.rejected} 問{j.message && ` — ${j.message}`}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <MonthlyTests />

      {review && (
        <section className="card stack">
          <h2>確認待ちの問題（{review.length}）</h2>
          {review.length === 0 && <p className="muted">ありません。</p>}
          {review.map((item) => (
            <div key={item.itemId} className="review-item">
              <ItemPreview item={item} />
              <div className="pad-actions">
                <button type="button" className="secondary" disabled={!!busy} onClick={() => decide(item, "disabled")}>
                  使わない
                </button>
                <button type="button" className="primary" disabled={!!busy} onClick={() => decide(item, "approved")}>
                  承認
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      <button type="button" className="secondary" onClick={onOpenLab}>
        書き取り判定の試作
      </button>
      <button type="button" className="secondary" onClick={onSignOut}>
        ログアウト
      </button>
    </main>
  );
}
