import { fetchAuthSession } from "aws-amplify/auth";

let apiUrl = "";

export function setApiUrl(url: string) {
  apiUrl = url.replace(/\/$/, "");
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const session = await fetchAuthSession();
  const token = session.tokens?.idToken?.toString();
  if (!token) throw new ApiError(401, "ログインが必要です");

  const res = await fetch(`${apiUrl}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.message ?? "通信エラーが発生しました");
  return data as T;
}
