import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const scriptsDir = join(import.meta.dirname, "../../scripts");

describe("運用スクリプト", () => {
  // Windows PowerShell 5.1 は BOM のない UTF-8 を Shift-JIS として読み、日本語が化けて構文エラーになる
  it("PowerShell スクリプトは BOM つきの UTF-8 で保存する", () => {
    const files = readdirSync(scriptsDir).filter((f) => f.endsWith(".ps1"));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const head = readFileSync(join(scriptsDir, f)).subarray(0, 3);
      expect([...head], f).toEqual([0xef, 0xbb, 0xbf]);
    }
  });
});
