// PreToolUse(Write/Edit): アクセスキーや API キーに見える文字列をファイルに書かせない
import { readFileSync } from "node:fs";

const input = JSON.parse(readFileSync(0, "utf8"));
const ti = input.tool_input ?? {};
const text = [ti.content, ti.new_string, ...(ti.edits ?? []).map((e) => e.new_string)].filter(Boolean).join("\n");

const patterns = [
  [/AKIA[0-9A-Z]{16}/, "AWS アクセスキー ID"],
  [/ASIA[0-9A-Z]{16}/, "AWS 一時アクセスキー ID"],
  [/sk-ant-[A-Za-z0-9_-]{20,}/, "Anthropic API キー"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "秘密鍵"],
  [/aws_secret_access_key\s*[=:]\s*\S{20,}/i, "AWS シークレットアクセスキー"],
  [/gh[pousr]_[A-Za-z0-9]{30,}/, "GitHub トークン"],
];
for (const [re, name] of patterns) {
  if (re.test(text)) {
    console.error(`ブロック: ${name} に見える文字列が含まれています。キーはコードやファイルに書かず、Secrets Manager などを使ってください。`);
    process.exit(2);
  }
}
