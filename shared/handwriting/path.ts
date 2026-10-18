export interface Point {
  x: number;
  y: number;
}

const TOKEN = /[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g;

// SVG のパス（KanjiVG が使う M・L・C・S・Z と、その相対形）を折れ線の点列にする
export function pathToPoints(d: string, stepsPerCurve = 8): Point[] {
  const tokens = d.match(TOKEN) ?? [];
  const points: Point[] = [];
  let i = 0;
  let cmd = "";
  let cur: Point = { x: 0, y: 0 };
  let start: Point = { x: 0, y: 0 };
  let lastCtrl: Point | null = null;

  const num = () => {
    const n = Number(tokens[i++]);
    if (Number.isNaN(n)) throw new Error(`パスの数値が読めません: ${d}`);
    return n;
  };

  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++];
    const rel = cmd === cmd.toLowerCase();
    const at = () => {
      const x = num();
      const y = num();
      return rel ? { x: cur.x + x, y: cur.y + y } : { x, y };
    };
    switch (cmd.toUpperCase()) {
      case "M":
        cur = start = at();
        points.push(cur);
        lastCtrl = null;
        // M の後に続く座標は L として扱う（SVG の仕様）
        cmd = rel ? "l" : "L";
        break;
      case "L":
        cur = at();
        points.push(cur);
        lastCtrl = null;
        break;
      case "C": {
        const c1 = at();
        const c2 = at();
        const end = at();
        points.push(...bezier(cur, c1, c2, end, stepsPerCurve));
        lastCtrl = c2;
        cur = end;
        break;
      }
      case "S": {
        const c1 = lastCtrl ? { x: 2 * cur.x - lastCtrl.x, y: 2 * cur.y - lastCtrl.y } : cur;
        const c2 = at();
        const end = at();
        points.push(...bezier(cur, c1, c2, end, stepsPerCurve));
        lastCtrl = c2;
        cur = end;
        break;
      }
      case "Z":
        cur = start;
        points.push(cur);
        lastCtrl = null;
        cmd = "";
        break;
      default:
        throw new Error(`対応していないパスの命令です: "${cmd}"（${d}）`);
    }
  }
  return points;
}

function bezier(p0: Point, p1: Point, p2: Point, p3: Point, steps: number): Point[] {
  const out: Point[] = [];
  for (let s = 1; s <= steps; s++) {
    const t = s / steps;
    const a = (1 - t) ** 3;
    const b = 3 * (1 - t) ** 2 * t;
    const c = 3 * (1 - t) * t ** 2;
    const e = t ** 3;
    out.push({
      x: a * p0.x + b * p1.x + c * p2.x + e * p3.x,
      y: a * p0.y + b * p1.y + c * p2.y + e * p3.y,
    });
  }
  return out;
}
