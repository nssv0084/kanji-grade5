import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import type { z } from "zod";
import { recordUsage } from "./usage";

// Anthropic API の呼び出し（GEN-02: Bedrock は使わない）。キーは Secrets Manager から読む

let client: Anthropic | undefined;

async function getClient(): Promise<Anthropic> {
  if (!client) {
    const res = await new SecretsManagerClient({}).send(new GetSecretValueCommand({ SecretId: process.env.ANTHROPIC_SECRET_ID }));
    if (!res.SecretString) throw new Error("Anthropic の API キーが登録されていません（Secrets Manager の kanji/anthropic-api-key）");
    client = new Anthropic({ apiKey: res.SecretString });
  }
  return client;
}

export class RefusalError extends Error {}

/**
 * 決まった形（zod のスキーマ）の JSON を返してもらう。費用は応答を確かめる前に記録する（COST-01）。
 * 安全上の理由で断られたときは、サーバー側で別のモデルに回す（fallbacks: "default"）
 */
export async function askStructured<T>(args: {
  model: string;
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  purpose: string;
  effort?: "low" | "medium" | "high";
}): Promise<T> {
  const c = await getClient();
  const res = await c.beta.messages.parse({
    model: args.model,
    max_tokens: 16000,
    system: args.system,
    messages: [{ role: "user", content: args.prompt }],
    output_config: { format: betaZodOutputFormat(args.schema), effort: args.effort ?? "medium" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  });
  await recordUsage(args.purpose, res.model || args.model, args.model, res.usage);
  if (res.stop_reason === "refusal") throw new RefusalError("AI が問題の作成を断りました");
  if (!res.parsed_output) throw new Error("AI の応答が決まった形になっていません");
  return res.parsed_output;
}
