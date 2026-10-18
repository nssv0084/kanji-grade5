import { pathToPoints, type Point } from "../../../shared/handwriting/path";

// 手本の字（KanjiVG の 109×109）を描く。画ごとに色を付けたり、書き順のアニメーションをしたりする
export type StrokeMark = "ok" | "bad" | "missing" | undefined;

interface ModelProps {
  strokes: string[];
  marks?: StrokeMark[];
  animate?: boolean;
  numbers?: boolean;
  label: string;
}

export function ModelFigure({ strokes, marks, animate = false, numbers = false, label }: ModelProps) {
  return (
    <svg className="figure" viewBox="0 0 109 109" role="img" aria-label={label}>
      <Guides />
      {strokes.map((d, i) => (
        <path
          key={`${i}-${animate}`}
          d={d}
          pathLength={1}
          className={`model-stroke ${marks?.[i] ?? ""} ${animate ? "animate" : ""}`}
          style={animate ? { animationDelay: `${i * 0.6}s` } : undefined}
        />
      ))}
      {numbers &&
        strokes.map((d, i) => {
          const p = pathToPoints(d, 1)[0];
          return (
            <text key={i} x={p.x - 4} y={p.y - 2} className="stroke-number">
              {i + 1}
            </text>
          );
        })}
    </svg>
  );
}

interface UserProps {
  strokes: Point[][];
  marks?: StrokeMark[];
  label: string;
}

/** 書いた字（マスの一辺を1とした座標）を、手本と同じ大きさで描く */
export function UserFigure({ strokes, marks, label }: UserProps) {
  return (
    <svg className="figure" viewBox="0 0 1 1" role="img" aria-label={label}>
      <Guides size={1} />
      {strokes.map((s, i) => (
        <polyline
          key={i}
          points={s.map((p) => `${p.x},${p.y}`).join(" ")}
          className={`user-stroke ${marks?.[i] ?? ""}`}
        />
      ))}
    </svg>
  );
}

function Guides({ size = 109 }: { size?: number }) {
  return (
    <g className="guides">
      <line x1={size / 2} y1={0} x2={size / 2} y2={size} />
      <line x1={0} y1={size / 2} x2={size} y2={size / 2} />
    </g>
  );
}
