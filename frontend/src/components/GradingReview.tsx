import { useEffect, useRef, useState } from "react";
import { expectedAnswer, type FinalVerdict, type GradedAnswer } from "../../../shared/test/grade";
import type { MonthlyTest } from "../../../shared/types";

const VERDICT = { correct: "○", wrong: "×", unreadable: "読み取れない" } as const;

/** 解答欄の切り抜き。AI が返した写真のピクセル座標で、少し余白をつけて描く（TST-09） */
function Crop({ url, box }: { url: string; box: NonNullable<GradedAnswer["box"]> }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const c = ref.current;
      if (!c) return;
      const pad = Math.max(box.height * 0.15, 8);
      const sx = Math.max(0, box.x - pad);
      const sy = Math.max(0, box.y - pad);
      const sw = Math.min(img.naturalWidth - sx, box.width + pad * 2);
      const sh = Math.min(img.naturalHeight - sy, box.height + pad * 2);
      c.width = Math.round(sw);
      c.height = Math.round(sh);
      c.getContext("2d")!.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
    };
    img.src = url;
  }, [url, box]);
  return <canvas ref={ref} className="crop" role="img" aria-label="解答欄の切り抜き" />;
}

// P-11 の採点の確認: 確認が要る問を上に並べ、○×を押して直してから確定する
export function GradingReview({ test, busy, onConfirm }: { test: MonthlyTest; busy: boolean; onConfirm: (decisions: Record<number, FinalVerdict>) => void }) {
  const [decisions, setDecisions] = useState<Record<number, FinalVerdict>>({});
  const answers = [...(test.answers ?? [])].sort((a, b) => Number(b.needsCheck) - Number(a.needsCheck) || a.no - b.no);
  const byNo = new Map(test.questions.map((q) => [q.no, q]));
  const unchecked = answers.filter((a) => a.needsCheck && !decisions[a.no]).length;
  const current = (a: GradedAnswer) => decisions[a.no] ?? (a.needsCheck ? undefined : (a.verdict as FinalVerdict));
  const score = answers.filter((a) => current(a) === "correct").length;

  return (
    <div className="stack">
      <p>
        {answers.length} 問中 {score} 問 ○
        {unchecked > 0 && <span className="error">（確認が要る問があと {unchecked} 問）</span>}
      </p>
      <ul className="grading">
        {answers.map((a) => {
          const q = byNo.get(a.no)!;
          const v = current(a);
          return (
            <li key={a.no} className={a.needsCheck ? "needs-check" : undefined}>
              <div className="grading-head">
                <strong>{a.no}</strong> {q.type === "write" ? "書き" : "読み"} 正答「{expectedAnswer(q)}」 読み取り「{a.written || "（空らん）"}」 → AI: {VERDICT[a.verdict]}
              </div>
              {a.box && test.photoUrls?.[a.box.photo] ? <Crop url={test.photoUrls[a.box.photo]} box={a.box} /> : <p className="muted">切り抜きがありません。解答用紙で確かめてください。</p>}
              {a.note && <p className="muted small">参考: {a.note}</p>}
              <div className="pad-actions">
                {(["correct", "wrong"] as const).map((x) => (
                  <button
                    key={x}
                    type="button"
                    className={v === x ? "primary" : "secondary"}
                    aria-pressed={v === x}
                    onClick={() => setDecisions((d) => ({ ...d, [a.no]: x }))}
                  >
                    {x === "correct" ? "○" : "×"}
                  </button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
      <button type="button" className="primary" disabled={busy || unchecked > 0} onClick={() => onConfirm(decisions)}>
        {score} / {answers.length} 点で確定する
      </button>
    </div>
  );
}
