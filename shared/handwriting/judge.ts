import { pathToPoints, type Point } from "./path";

// 手書きの判定（HWR-02、HWR-04、HWR-07）。
// 書いた字と手本を、字全体の外枠で正規化してから画ごとに比べる。マスの中の位置や大きさは使わない。

export type Stroke = Point[];
export type Verdict = "correct" | "unsure" | "wrong";

/** 1画を比べるときの点の数 */
const SAMPLES = 16;
/** 対応する画がない（多い・足りない）ときに、1画あたりに足すずれ */
const UNMATCHED_PENALTY = 0.5;
/** 逆向きの方がこれ以上近ければ「線の向きが逆」とみなす */
const REVERSED_MARGIN = 0.03;

export interface Thresholds {
  /** 正解: 対応した画のずれの平均がこれ以下 */
  correctMean: number;
  /** 正解: 最もずれた画がこれ以下 */
  correctMax: number;
  /** あいまい: 画数の差が1以内で、全体のずれ（足りない・多い画を含む）がこれ以下 */
  unsureScore: number;
  /** 正解でも、ほかの字の方がこれ以上近ければ、あいまいにする */
  rivalMargin: number;
}

// 2026-10-18 の試作の記録（子どもがスマホに指で書いた32件）で決めた値。
// 誤って正解0件・正しいのに不正解0件のまま、あいまい（AI 判定行き）が最も少なくなる値に、最大のずれは少し余裕を持たせた
export const DEFAULT_THRESHOLDS: Thresholds = {
  correctMean: 0.14,
  correctMax: 0.25,
  unsureScore: 0.16,
  rivalMargin: 0.01,
};

/** 字全体の大きさに対してこれより短い線は、うっかり触れた点とみなして捨てる（HWR-09） */
const TAP_RATIO = 0.02;

export interface StrokeMatch {
  /** 書いた画の番号（0から） */
  user: number;
  /** 対応した手本の画の番号（0から） */
  model: number;
  distance: number;
  reversed: boolean;
}

export interface Comparison {
  userCount: number;
  modelCount: number;
  matches: StrokeMatch[];
  /** 書かれなかった手本の画 */
  missing: number[];
  /** 手本にない、余分に書いた画 */
  extra: number[];
  /** 対応した画のずれの平均 */
  meanDistance: number;
  /** 対応した画のずれの最大 */
  maxDistance: number;
  /** 全体のずれ（足りない・多い画を含む）。字どうしの近さの比較に使う */
  score: number;
  /** 手本と同じ順に書いたか */
  orderOk: boolean;
  /** すべての画を手本と同じ向きに書いたか */
  directionOk: boolean;
}

export interface Measurement extends Comparison {
  target: string;
  /** 形が近いほかの字（近い順に3字） */
  nearest: { char: string; score: number }[];
}

export type Models = Map<string, Stroke[]>;

/** 手本（SVG のパス）を、比べられる形にしておく */
export function prepareModels(entries: Record<string, { strokes: string[] }>): Models {
  const models: Models = new Map();
  for (const [char, e] of Object.entries(entries)) {
    models.set(char, prepare(e.strokes.map((d) => pathToPoints(d))));
  }
  return models;
}

/** 字全体の外枠を一辺1の正方形の中央に合わせ、各画を同じ点の数にそろえる */
export function prepare(strokes: Stroke[]): Stroke[] {
  const all = strokes.flat();
  if (all.length === 0) return [];
  const xs = all.map((p) => p.x);
  const ys = all.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const w = Math.max(...xs) - minX;
  const h = Math.max(...ys) - minY;
  const size = Math.max(w, h, 1e-6);
  const ox = (size - w) / 2;
  const oy = (size - h) / 2;
  return strokes.map((s) =>
    resample(s.map((p) => ({ x: (p.x - minX + ox) / size, y: (p.y - minY + oy) / size })), SAMPLES),
  );
}

/** 線の長さに沿って等間隔に n 点を取る */
export function resample(points: Point[], n: number): Point[] {
  if (points.length === 0) return [];
  const seg: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const d = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    seg.push(d);
    total += d;
  }
  if (total === 0) return Array.from({ length: n }, () => ({ ...points[0] }));
  const out: Point[] = [];
  let i = 0;
  let walked = 0;
  for (let k = 0; k < n; k++) {
    const goal = (total * k) / (n - 1);
    while (i < seg.length - 1 && walked + seg[i] < goal) walked += seg[i++];
    const t = seg[i] === 0 ? 0 : Math.min(1, (goal - walked) / seg[i]);
    const a = points[i];
    const b = points[i + 1];
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  return out;
}

function strokeDistance(a: Stroke, b: Stroke): number {
  let sum = 0;
  for (let k = 0; k < a.length; k++) sum += Math.hypot(a[k].x - b[k].x, a[k].y - b[k].y);
  return sum / a.length;
}

/** 正規化済みの書いた字と手本を比べる */
export function compare(user: Stroke[], model: Stroke[]): Comparison {
  const nu = user.length;
  const nm = model.length;
  if (nu === 0 || nm === 0) {
    return {
      userCount: nu,
      modelCount: nm,
      matches: [],
      missing: model.map((_, i) => i),
      extra: user.map((_, i) => i),
      meanDistance: 1,
      maxDistance: 1,
      score: 1,
      orderOk: false,
      directionOk: false,
    };
  }

  const forward: number[][] = [];
  const backward: number[][] = [];
  for (const u of user) {
    const rev = [...u].reverse();
    forward.push(model.map((m) => strokeDistance(u, m)));
    backward.push(model.map((m) => strokeDistance(rev, m)));
  }
  // 向きが逆でも同じ画として対応させ、向きは別に調べる
  const cost = forward.map((row, i) => row.map((f, j) => Math.min(f, backward[i][j])));
  const pairs = nu <= nm ? assign(cost).map((j, i) => [i, j]) : assign(transpose(cost)).map((i, j) => [i, j]);

  const matches: StrokeMatch[] = pairs
    .map(([i, j]) => ({
      user: i,
      model: j,
      distance: cost[i][j],
      reversed: backward[i][j] + REVERSED_MARGIN < forward[i][j],
    }))
    .sort((a, b) => a.user - b.user);

  const matchedUser = new Set(matches.map((m) => m.user));
  const matchedModel = new Set(matches.map((m) => m.model));
  const distances = matches.map((m) => m.distance);
  const unmatched = nu + nm - 2 * matches.length;
  const sum = distances.reduce((a, b) => a + b, 0);

  return {
    userCount: nu,
    modelCount: nm,
    matches,
    missing: model.map((_, j) => j).filter((j) => !matchedModel.has(j)),
    extra: user.map((_, i) => i).filter((i) => !matchedUser.has(i)),
    meanDistance: sum / matches.length,
    maxDistance: Math.max(...distances),
    score: (sum + UNMATCHED_PENALTY * unmatched) / Math.max(nu, nm),
    orderOk: matches.every((m, k) => k === 0 || matches[k - 1].model < m.model),
    directionOk: matches.every((m) => !m.reversed),
  };
}

/** 書いた字（生の座標）を、目標の字と全部の手本に対して測る */
export function measure(strokes: Stroke[], target: string, models: Models): Measurement {
  const model = models.get(target);
  if (!model) throw new Error(`手本がありません: ${target}`);
  const user = prepare(dropTaps(strokes.filter((s) => s.length > 0)));
  const nearest = [...models]
    .filter(([char]) => char !== target)
    .map(([char, m]) => ({ char, score: compare(user, m).score }))
    .sort((a, b) => a.score - b.score)
    .slice(0, 3);
  return { target, ...compare(user, model), nearest };
}

/** 測った結果から、しきい値で正誤を決める（しきい値を変えても測り直さずに済むよう分けている） */
export function decide(m: Measurement, t: Thresholds): Verdict {
  let verdict: Verdict = "wrong";
  if (m.userCount === m.modelCount && m.meanDistance <= t.correctMean && m.maxDistance <= t.correctMax) {
    verdict = "correct";
  } else if (Math.abs(m.userCount - m.modelCount) <= 1 && m.score <= t.unsureScore) {
    verdict = "unsure";
  }
  const rival = m.nearest[0];
  if (verdict === "correct" && rival && rival.score + t.rivalMargin < m.score) verdict = "unsure";
  // 逆向きの画は、別の画を書いた（例: 横画をはらいで書いた）ことが多いため、形が近くても正解にしない（HWR-08）
  if (verdict === "correct" && !m.directionOk) verdict = "unsure";
  return verdict;
}

function strokeLength(s: Stroke): number {
  let len = 0;
  for (let i = 1; i < s.length; i++) len += Math.hypot(s[i].x - s[i - 1].x, s[i].y - s[i - 1].y);
  return len;
}

/** うっかり触れただけの点を捨てる。字全体が点だけのときは何もしない */
export function dropTaps(strokes: Stroke[]): Stroke[] {
  const all = strokes.flat();
  if (all.length === 0) return strokes;
  const xs = all.map((p) => p.x);
  const ys = all.map((p) => p.y);
  const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const kept = strokes.filter((s) => strokeLength(s) >= size * TAP_RATIO);
  return kept.length > 0 ? kept : strokes;
}

function transpose(a: number[][]): number[][] {
  return a[0].map((_, j) => a.map((row) => row[j]));
}

/** 割り当て問題（ハンガリー法）。行数 <= 列数の行列で、行ごとに別々の列を選んで合計を最小にする。戻り値は行ごとの列番号 */
function assign(cost: number[][]): number[] {
  const n = cost.length;
  const m = cost[0].length;
  const u = new Array<number>(n + 1).fill(0);
  const v = new Array<number>(m + 1).fill(0);
  const p = new Array<number>(m + 1).fill(0);
  const way = new Array<number>(m + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array<number>(m + 1).fill(Infinity);
    const used = new Array<boolean>(m + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity;
      let j1 = 0;
      for (let j = 1; j <= m; j++) {
        if (used[j]) continue;
        const c = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (c < minv[j]) {
          minv[j] = c;
          way[j] = j0;
        }
        if (minv[j] < delta) {
          delta = minv[j];
          j1 = j;
        }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0 !== 0);
  }
  const result = new Array<number>(n).fill(-1);
  for (let j = 1; j <= m; j++) if (p[j] !== 0) result[p[j] - 1] = j - 1;
  return result;
}
