import { describe, expect, it } from "vitest";
import { compare, decide, DEFAULT_THRESHOLDS, measure, prepare, prepareModels, type Stroke } from "../../shared/handwriting/judge";
import { pathToPoints } from "../../shared/handwriting/path";
import { GRADE5, GRADE5_CHARS } from "../../shared/kanji";

const models = prepareModels(GRADE5);

// 手本の画を、指で書いたように崩す（再現できるよう乱数は固定）
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function handwrite(char: string, opts: { jitter?: number; scale?: number; dx?: number; dy?: number; seed?: number } = {}): Stroke[] {
  const { jitter = 1.5, scale = 1, dx = 0, dy = 0, seed = 1 } = opts;
  const r = rng(seed);
  return GRADE5[char].strokes.map((d) =>
    pathToPoints(d).map((p) => ({
      x: p.x * scale + dx + (r() - 0.5) * 2 * jitter,
      y: p.y * scale + dy + (r() - 0.5) * 2 * jitter,
    })),
  );
}

const judge = (strokes: Stroke[], target: string) => {
  const m = measure(strokes, target, models);
  return { m, verdict: decide(m, DEFAULT_THRESHOLDS) };
};

describe("SVG パスの読み取り", () => {
  it("相対の命令と、命令を省略した続きの座標を読める", () => {
    const pts = pathToPoints("M10,10 c0,0 10,0 10,0 0,0 0,10 0,10", 1);
    expect(pts).toEqual([
      { x: 10, y: 10 },
      { x: 20, y: 10 },
      { x: 20, y: 20 },
    ]);
  });

  it("S は直前の制御点を折り返して使う", () => {
    const pts = pathToPoints("M0,0 C0,0 5,5 10,0 S20,0 20,0", 1);
    expect(pts.at(-1)).toEqual({ x: 20, y: 0 });
  });

  it("193字すべての手本を読める", () => {
    expect(GRADE5_CHARS).toHaveLength(193);
    for (const char of GRADE5_CHARS) expect(models.get(char)!.length).toBe(GRADE5[char].strokes.length);
  });
});

describe("手書きの判定", () => {
  it("[HWR-02] 手本どおりに書けば正解になる", () => {
    for (const [i, char] of ["招", "輸", "識", "久", "永"].entries()) {
      const { m, verdict } = judge(handwrite(char, { seed: i + 1 }), char);
      expect(verdict, `${char}: mean=${m.meanDistance.toFixed(3)} max=${m.maxDistance.toFixed(3)}`).toBe("correct");
      expect(m.orderOk).toBe(true);
      expect(m.directionOk).toBe(true);
    }
  });

  it("[HWR-07] マスの中の位置や大きさがずれていても、形が同じなら正解になる", () => {
    const small = handwrite("招", { scale: 0.4, dx: 50, dy: 5 });
    const large = handwrite("招", { scale: 1.6, dx: -30, dy: -20, seed: 7 });
    expect(judge(small, "招").verdict).toBe("correct");
    expect(judge(large, "招").verdict).toBe("correct");
  });

  it("[HWR-02] 別の字を書いたら正解にならない", () => {
    for (const [written, target] of [
      ["招", "輸"],
      ["技", "枝"],
      ["性", "情"],
      ["復", "複"],
    ]) {
      expect(judge(handwrite(written), target).verdict, `${written} → ${target}`).not.toBe("correct");
    }
  });

  it("[HWR-02] 1画足りないときは正解にならない", () => {
    const strokes = handwrite("招").slice(0, -1);
    const { m, verdict } = judge(strokes, "招");
    expect(verdict).not.toBe("correct");
    expect(m.missing).toEqual([7]);
  });

  it("[HWR-04] 書き順が違っても形が合っていれば正解とし、書き順の違いを返す", () => {
    const strokes = handwrite("招");
    [strokes[0], strokes[1]] = [strokes[1], strokes[0]];
    const { m, verdict } = judge(strokes, "招");
    expect(verdict).toBe("correct");
    expect(m.orderOk).toBe(false);
  });

  it("[HWR-04] 線を逆向きに書いたら、向きの違いを返す", () => {
    const strokes = handwrite("招");
    strokes[1] = [...strokes[1]].reverse();
    const { m } = judge(strokes, "招");
    expect(m.directionOk).toBe(false);
    expect(m.matches.find((x) => x.user === 1)?.reversed).toBe(true);
  });

  it("[HWR-08] 逆向きの画があるときは、形が近くても正解にしない", () => {
    const strokes = handwrite("招");
    strokes[1] = [...strokes[1]].reverse();
    const { m, verdict } = judge(strokes, "招");
    expect(m.meanDistance).toBeLessThan(DEFAULT_THRESHOLDS.correctMean);
    expect(verdict).toBe("unsure");
  });

  it("[HWR-09] うっかり触れただけの点は画として数えない", () => {
    const strokes = handwrite("招");
    strokes.unshift([{ x: 40, y: 20 }], [{ x: 70, y: 30 }, { x: 70.5, y: 30.2 }]);
    const { m, verdict } = judge(strokes, "招");
    expect(m.userCount).toBe(8);
    expect(verdict).toBe("correct");
  });

  it("形が近いほかの字を、近い順に返す", () => {
    const { m } = judge(handwrite("招"), "招");
    expect(m.nearest).toHaveLength(3);
    expect(m.nearest.map((n) => n.char)).not.toContain("招");
    expect(m.nearest[0].score).toBeGreaterThan(m.score);
  });

  it("何も書いていなければ不正解", () => {
    expect(judge([], "招").verdict).toBe("wrong");
  });

  it("点だけの画（長さ0）でも計算が壊れない", () => {
    const user = prepare([[{ x: 1, y: 1 }], [{ x: 0, y: 0 }, { x: 5, y: 5 }]]);
    const c = compare(user, models.get("招")!);
    expect(Number.isFinite(c.score)).toBe(true);
  });
});
