import { execFileSync } from "node:child_process";
import { config } from "../config";

if (!/^\d{12}$/.test(config.accountId)) {
  console.error("infra/config.ts の accountId（12桁）を設定してください。");
  process.exit(1);
}

let actual: string;
try {
  const out = execFileSync(
    "aws",
    ["sts", "get-caller-identity", "--profile", config.awsProfile, "--query", "Account", "--output", "text"],
    { encoding: "utf8" },
  );
  actual = out.trim();
} catch {
  console.error(`プロファイル "${config.awsProfile}" で AWS に接続できません。認証情報を確認してください。`);
  process.exit(1);
}

if (actual !== config.accountId) {
  console.error(`アカウントが違います。想定: ${config.accountId} / 実際: ${actual}（プロファイル "${config.awsProfile}"）`);
  process.exit(1);
}
console.log(`アカウント確認OK: ${actual}（プロファイル "${config.awsProfile}"）`);
