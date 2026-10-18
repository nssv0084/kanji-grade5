import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { costMicroUsd, DEFAULT_SETTINGS, PRICES, type Settings, type TokenUsage } from "../../../shared/generation/cost";
import { ddb, getItem, putItem, TABLE_NAME } from "./db";

// API の使用額の記録と、設定（COST-01）。月は日本時間で区切る

export function monthKey(now = new Date()): string {
  return new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 7);
}

/** 実際に応答したモデルの料金で計算する（安全上の理由で別のモデルに回ったときも） */
export async function recordUsage(purpose: string, servedModel: string, requestedModel: string, usage: TokenUsage): Promise<number> {
  const model = PRICES[servedModel] ? servedModel : requestedModel;
  const cost = costMicroUsd(model, usage);
  const now = new Date();
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk: "USAGE", sk: `TOTAL#${monthKey(now)}` },
      UpdateExpression: "ADD costMicroUsd :c, calls :one",
      ExpressionAttributeValues: { ":c": cost, ":one": 1 },
    }),
  );
  await putItem({
    pk: "USAGE",
    sk: `LOG#${now.toISOString()}`,
    purpose,
    model,
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    costMicroUsd: cost,
  });
  return cost;
}

export async function monthSpent(now = new Date()): Promise<number> {
  const t = await getItem<{ costMicroUsd?: number }>({ pk: "USAGE", sk: `TOTAL#${monthKey(now)}` });
  return t?.costMicroUsd ?? 0;
}

export async function getSettings(): Promise<Settings> {
  const s = await getItem<Partial<Settings>>({ pk: "SETTINGS", sk: "GLOBAL" });
  return { ...DEFAULT_SETTINGS, ...(s ?? {}) };
}
