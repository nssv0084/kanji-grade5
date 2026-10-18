import { useCallback, useEffect, useState } from "react";
import type { MonthlyTest, PhotoUploads, TestStatus, TestsResponse } from "../../../shared/types";
import { api } from "../api";
import { shrinkPhoto, uploadPhotos } from "../lib/photo";
import { GradingReview } from "./GradingReview";

/** 1回のテストで送れる写真の枚数（TST-07。API と同じ値） */
const MAX_PHOTOS = 3;

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

const STATUS: Record<TestStatus, string> = {
  created: "未採点",
  grading: "採点中",
  graded: "確認待ち",
  retake: "撮り直し",
  failed: "採点できませんでした",
  confirmed: "確定",
};

/** 写真を縮めてから S3 に送り、採点を始める（TST-07、TST-08） */
async function grade(t: MonthlyTest, files: File[]) {
  const photos = await Promise.all(files.map(shrinkPhoto));
  const { uploads } = await api<PhotoUploads>("POST", `/admin/tests/${t.childId}/${t.month}/photos`, { count: photos.length });
  await uploadPhotos(uploads, photos);
  await api("POST", `/admin/tests/${t.childId}/${t.month}/grade`);
}

function PhotoPicker({ label, disabled, busy, onPick }: { label: string; disabled: boolean; busy: boolean; onPick: (files: File[]) => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const tooMany = files.length > MAX_PHOTOS;
  return (
    <div className="stack">
      <label className="field">
        <span>{label}（{MAX_PHOTOS}枚まで。全部の問題が写るように、真上から明るい所で）</span>
        <input type="file" accept="image/*" multiple disabled={disabled} onChange={(e) => setFiles([...(e.target.files ?? [])])} />
      </label>
      {tooMany && <p className="error">写真は{MAX_PHOTOS}枚までです</p>}
      {files.length > 0 && !tooMany && (
        <button type="button" className="primary" disabled={disabled} onClick={() => onPick(files)}>
          {busy ? "送っています…" : `${files.length}枚を送って採点する`}
        </button>
      )}
    </div>
  );
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

  // 採点中のテストがあれば、10秒ごとに読み直す
  const grading = data?.children.some((c) => c.tests.some((t) => t.status === "grading"));
  useEffect(() => {
    if (!grading) return;
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, [grading, load]);

  const run =async (key: string, f: () => Promise<unknown>) => {
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
                      {t.title}（{counts(t)}） <span className="tag">{STATUS[t.status]}</span>
                      {t.status === "confirmed" && ` ${t.score} / ${t.questions.length} 点`}
                    </span>
                    {t.problems && t.problems.length > 0 && (
                      <ul className="error">
                        {t.problems.map((p) => (
                          <li key={p}>{p}</li>
                        ))}
                      </ul>
                    )}
                    {t.status !== "confirmed" && t.status !== "grading" && (
                      <PhotoPicker
                        label={t.status === "created" ? "解答用紙の写真を送って採点する" : "写真を撮り直して採点する"}
                        disabled={!!busy}
                        busy={busy === `grade-${t.month}`}
                        onPick={(files) => run(`grade-${t.month}`, () => grade(t, files).then(load))}
                      />
                    )}
                    {t.status === "grading" && <p className="muted">採点しています（1〜2分）…</p>}
                    {(t.status === "graded" || t.status === "retake") && t.answers && (
                      <GradingReview
                        test={t}
                        busy={!!busy}
                        onConfirm={(decisions) => run(`confirm-${t.month}`, () => api("PUT", `/admin/tests/${t.childId}/${t.month}`, { decisions }).then(load))}
                      />
                    )}
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
