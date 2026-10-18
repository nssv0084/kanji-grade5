import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";
import type { Role } from "../../../shared/types";
import { HttpError } from "./http";

export const PARENT_GROUP = "parents";
export const CHILD_GROUP = "children";

export interface Caller {
  sub: string;
  username: string;
  nickname: string;
  role: Role;
}

// API Gateway は cognito:groups を "[parents children]" のような文字列で渡すことがある
function parseGroups(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw !== "string" || raw === "") return [];
  return raw.replace(/^\[|\]$/g, "").split(/[\s,]+/).filter(Boolean);
}

export function getCaller(event: APIGatewayProxyEventV2WithJWTAuthorizer): Caller {
  const claims = event.requestContext.authorizer?.jwt?.claims;
  if (!claims?.sub) throw new HttpError(401, "ログインが必要です");
  const username = String(claims["cognito:username"] ?? claims.sub);
  return {
    sub: String(claims.sub),
    username,
    nickname: String(claims.nickname ?? username),
    role: parseGroups(claims["cognito:groups"]).includes(PARENT_GROUP) ? "parent" : "child",
  };
}

export function requireParent(caller: Caller): void {
  if (caller.role !== "parent") throw new HttpError(403, "保護者のみ利用できます");
}
