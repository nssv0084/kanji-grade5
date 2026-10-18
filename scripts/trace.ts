import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// 要件定義書の [XXX-00] と、テスト名の [XXX-00] を突き合わせる。
// テストが存在しない番号を参照していたら失敗、要件がテストなしでも失敗はしない（一覧に出す）
const root = join(import.meta.dirname, "..");
const ID = /\[([A-Z]+-\d+)\]/g;

const doc = readFileSync(join(root, "docs/requirements.md"), "utf8");
const defined = new Map<string, string>();
const problems: string[] = [];
for (const line of doc.split("\n")) {
  for (const m of line.matchAll(ID)) {
    if (defined.has(m[1])) problems.push(`要件の番号が重複しています: ${m[1]}`);
    defined.set(m[1], line.replace(ID, "").replace(/\*\*/g, "").replace(/^[-|\s]+/, "").slice(0, 40).trim());
  }
}

function testFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    if (name === "node_modules") return [];
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return testFiles(p);
    return /\.test\.tsx?$/.test(name) ? [p] : [];
  });
}

const covered = new Map<string, number>();
for (const ws of ["backend", "frontend", "infra"]) {
  for (const f of testFiles(join(root, ws, "test"))) {
    for (const m of readFileSync(f, "utf8").matchAll(ID)) {
      if (!defined.has(m[1])) problems.push(`${f.slice(root.length + 1)} が存在しない要件 ${m[1]} を参照しています`);
      covered.set(m[1], (covered.get(m[1]) ?? 0) + 1);
    }
  }
}

const untested = [...defined].filter(([id]) => !covered.has(id));
console.log(`要件 ${defined.size} 件のうち、テストがあるもの ${defined.size - untested.length} 件`);
if (untested.length > 0) {
  console.log("\nテストがない要件（画面操作や運用で確認するものを含む）:");
  for (const [id, text] of untested) console.log(`  ${id}  ${text}`);
}
if (problems.length > 0) {
  console.error("\n" + problems.join("\n"));
  process.exit(1);
}
