// PreToolUse(Bash): 取り返しのつかない操作・別アカウントへの操作を止める。止めるときは exit 2 と理由を stderr に出す
import { readFileSync } from "node:fs";

const input = JSON.parse(readFileSync(0, "utf8"));
const cmd = String(input.tool_input?.command ?? "");

const rules = [
  [/git\s+push\b[^\n;|&]*(--force\b|--force-with-lease\b|\s-f\b)/, "force push は禁止です。"],
  [/git\s+(commit|push|merge|rebase)\b[^\n;|&]*--no-verify/, "--no-verify でフックを飛ばすのは禁止です。"],
  [/\bcdk\s+destroy\b/, "cdk destroy は禁止です（データを残す設計のスタックがあります。英検アプリと同じアカウントです）。"],
  [/aws\s+dynamodb\s+delete-table\b|aws\s+cognito-idp\s+delete-user-pool\b|aws\s+s3\s+rb\b/, "データを持つ AWS リソースの削除は手動で行ってください。"],
  [/aws\s+secretsmanager\s+get-secret-value\b/, "シークレットの値を取り出すコマンドは禁止です（値が会話に残ります）。"],
];
for (const [re, msg] of rules) {
  if (re.test(cmd)) {
    console.error(`ブロック: ${msg}`);
    process.exit(2);
  }
}

// aws / cdk に別のプロファイルを指定していたら止める（取り違え防止。許可するのは eiken のみ）
if (/\b(aws|cdk)\b/.test(cmd)) {
  for (const m of cmd.matchAll(/--profile[=\s]+(\S+)/g)) {
    if (m[1].replace(/["']/g, "") !== "eiken") {
      console.error(`ブロック: プロファイル "${m[1]}" は使えません。このプロジェクトは eiken（英検アプリと共用のアカウント）のみです。`);
      process.exit(2);
    }
  }
  if (/AWS_PROFILE\s*=/.test(cmd) && !/AWS_PROFILE\s*=\s*["']?eiken\b/.test(cmd)) {
    console.error("ブロック: AWS_PROFILE は eiken のみ使えます。");
    process.exit(2);
  }
}
