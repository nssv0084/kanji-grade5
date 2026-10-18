import { describe, expect, it } from "vitest";
import { temporaryPassword } from "../src/lib/children";

describe("仮パスワードの再発行", () => {
  it("[ACC-05] [ACC-06] 仮パスワードは8文字で数字を含み、見まちがえやすい字を使わない", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const p = temporaryPassword();
      expect(p).toMatch(/^[a-z]{4}[2-9]{4}$/);
      expect(p).not.toMatch(/[ilo01]/);
      seen.add(p);
    }
    // 毎回ちがう値になる
    expect(seen.size).toBeGreaterThan(190);
  });
});
