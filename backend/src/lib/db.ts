import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, type QueryCommandInput } from "@aws-sdk/lib-dynamodb";

export const TABLE_NAME = process.env.TABLE_NAME ?? "";

export const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

// キーの組み立て（docs/data-model.md）
export const keys = {
  item: (itemId: string) => ({ pk: `ITEM#${itemId}`, sk: "META" }),
  profile: (sub: string) => ({ pk: `USER#${sub}`, sk: "PROFILE" }),
  plan: (sub: string, schoolYear: number) => ({ pk: `USER#${sub}`, sk: `PLAN#${schoolYear}` }),
  kanji: (sub: string, kanji: string) => ({ pk: `USER#${sub}`, sk: `KANJI#${kanji}` }),
  question: (sub: string, itemId: string) => ({ pk: `USER#${sub}`, sk: `QS#${itemId}` }),
  session: (sub: string, date: string) => ({ pk: `USER#${sub}`, sk: `SESSION#${date}` }),
  day: (sub: string, date: string) => ({ pk: `USER#${sub}`, sk: `DAY#${date}` }),
};

export async function getItem<T>(key: { pk: string; sk: string }): Promise<T | undefined> {
  const res = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: key }));
  return res.Item as T | undefined;
}

export async function putItem(item: Record<string, unknown>): Promise<void> {
  await ddb.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
}

/** ページをまたいで全件を読む */
export async function queryAll<T>(input: Omit<QueryCommandInput, "TableName" | "ExclusiveStartKey">): Promise<T[]> {
  const out: T[] = [];
  let start: Record<string, unknown> | undefined;
  do {
    const res = await ddb.send(new QueryCommand({ ...input, TableName: TABLE_NAME, ExclusiveStartKey: start }));
    out.push(...((res.Items ?? []) as T[]));
    start = res.LastEvaluatedKey;
  } while (start);
  return out;
}

export function queryUserPrefix<T>(sub: string, prefix: string): Promise<T[]> {
  return queryAll<T>({
    KeyConditionExpression: "pk = :pk AND begins_with(sk, :p)",
    ExpressionAttributeValues: { ":pk": `USER#${sub}`, ":p": prefix },
  });
}
