import type { APIGatewayProxyResultV2 } from "aws-lambda";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function json(status: number, body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode: status,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  };
}

export function parseBody(raw: string | undefined, isBase64Encoded?: boolean): unknown {
  if (!raw) return {};
  try {
    return JSON.parse(isBase64Encoded ? Buffer.from(raw, "base64").toString("utf8") : raw);
  } catch {
    throw new HttpError(400, "リクエストの形式が正しくありません");
  }
}
