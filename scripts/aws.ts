import { execFileSync } from "node:child_process";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { fromIni } from "@aws-sdk/credential-providers";
import { config } from "../infra/config";

// 運用スクリプトの共通部分。アカウントを確かめてから、KanjiApp スタックの出力と DynamoDB を使う

export function checkAccount(): void {
  execFileSync("npm", ["run", "check-account", "-w", "infra", "--silent"], { stdio: "inherit", shell: true });
}

function aws(args: string[]): string {
  return execFileSync("aws", [...args, "--profile", config.awsProfile, "--region", config.region, "--output", "text"], { encoding: "utf8" }).trim();
}

export function stackOutput(key: string): string {
  const v = aws(["cloudformation", "describe-stacks", "--stack-name", "KanjiApp", "--query", `Stacks[0].Outputs[?OutputKey=='${key}'].OutputValue`]);
  if (!v || v === "None") throw new Error(`KanjiApp スタックの ${key} が見つかりません。先にデプロイしてください。`);
  return v;
}

export function userSub(username: string): string {
  const pool = stackOutput("UserPoolId");
  return aws(["cognito-idp", "admin-get-user", "--user-pool-id", pool, "--username", username, "--query", "UserAttributes[?Name=='sub'].Value"]);
}

export function documentClient(): DynamoDBDocumentClient {
  return DynamoDBDocumentClient.from(new DynamoDBClient({ region: config.region, credentials: fromIni({ profile: config.awsProfile }) }), {
    marshallOptions: { removeUndefinedValues: true },
  });
}

export function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
