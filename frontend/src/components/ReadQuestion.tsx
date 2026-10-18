import { useState, type FormEvent } from "react";
import { normalizeReading, parseText, targetOf } from "../../../shared/items/text";

interface Props {
  text: string;
  onAnswer: (correct: boolean) => void;
}

// K-02 読み（太字の言葉の読みをひらがなで入力する）
export function ReadQuestion({ text, onAnswer }: Props) {
  const { reading } = targetOf(text);
  const [value, setValue] = useState("");
  const [result, setResult] = useState<boolean | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!value.trim()) return;
    setResult(normalizeReading(value) === reading);
  };

  return (
    <div className="question stack">
      <p className="sentence">
        {parseText(text).map((s, i) =>
          s.kind === "plain" ? (
            <span key={i}>{s.text}</span>
          ) : (
            <strong key={i} className="target read">
              {s.word}
            </strong>
          ),
        )}
      </p>
      <form className="stack" onSubmit={submit}>
        <label className="field">
          <span>線を引いた言葉の読みを、ひらがなで書こう</span>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={result !== null}
            autoComplete="off"
            autoCapitalize="none"
            lang="ja"
          />
        </label>
        {result === null && (
          <button className="primary" disabled={!value.trim()}>
            こたえる
          </button>
        )}
      </form>
      {result !== null && (
        <div className="card stack" aria-live="polite">
          <p className={`verdict ${result ? "correct" : "wrong"}`}>{result ? "○ せいかい！" : `× 正しい読みは「${reading}」`}</p>
          <button type="button" className="primary wide" onClick={() => onAnswer(result)}>
            つぎへ
          </button>
        </div>
      )}
    </div>
  );
}
