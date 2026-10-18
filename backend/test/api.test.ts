import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";
import { describe, expect, it } from "vitest";
import { handler } from "../src/api";
import { getCaller, requireParent } from "../src/lib/auth";
import { HttpError } from "../src/lib/http";

const eventWith = (claims: Record<string, string> | undefined, routeKey = "GET /me") =>
  ({ routeKey, requestContext: { authorizer: claims && { jwt: { claims, scopes: [] } } } }) as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;

const parent = { sub: "p1", "cognito:username": "papa", nickname: "パパ", "cognito:groups": "[parents]" };
const child = { sub: "c1", "cognito:username": "kanji01", nickname: "はなこ", "cognito:groups": "[children]" };

describe("ログインした人", () => {
  it("[NFR-04] 保護者グループなら parent", () => {
    expect(getCaller(eventWith(parent))).toEqual({ sub: "p1", username: "papa", nickname: "パパ", role: "parent" });
  });

  it("[NFR-04] 保護者グループでなければ child", () => {
    expect(getCaller(eventWith(child)).role).toBe("child");
    expect(getCaller(eventWith({ sub: "x", "cognito:username": "x" })).role).toBe("child");
  });

  it("[NFR-04] 認証情報がなければ401", () => {
    expect(() => getCaller(eventWith(undefined))).toThrow(HttpError);
  });

  it("[NFR-04] 保護者の機能は子どもには使えない", () => {
    expect(() => requireParent(getCaller(eventWith(child)))).toThrow(HttpError);
    expect(() => requireParent(getCaller(eventWith(parent)))).not.toThrow();
  });
});

describe("API", () => {
  it("[ACC-02] GET /me でニックネームと役割を返す", async () => {
    const res = (await handler(eventWith(child))) as { statusCode: number; body: string };
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ nickname: "はなこ", role: "child" });
  });

  it("[NFR-04] 子どもはダッシュボード（家族の学習状況）を見られない", async () => {
    const res = (await handler(eventWith(child, "GET /admin/children"))) as { statusCode: number };
    expect(res.statusCode).toBe(403);
  });

  it("[NFR-04] 子どもは月例テストを作れない・見られない", async () => {
    for (const route of ["GET /admin/tests", "POST /admin/tests", "POST /admin/tests/{child}/{month}/photos", "POST /admin/tests/{child}/{month}/grade", "PUT /admin/tests/{child}/{month}"]) {
      const res = (await handler(eventWith(child, route))) as { statusCode: number };
      expect(res.statusCode).toBe(403);
    }
  });

  it("[NFR-04] 知らない経路は404で、内部の情報を出さない", async () => {
    const res = (await handler(eventWith(child, "GET /secret"))) as { statusCode: number; body: string };
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body)).toEqual({ message: "見つかりません" });
  });
});
