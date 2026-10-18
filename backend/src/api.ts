import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import type { Me } from "../../shared/types";
import { getCaller, requireParent, type Caller } from "./lib/auth";
import { HttpError, json } from "./lib/http";
import type { RouteKey } from "./routes";

type Handler = (
  caller: Caller,
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
) => Promise<APIGatewayProxyResultV2>;

const handlers: Record<RouteKey, Handler> = {
  "GET /me": async (caller) => json(200, { nickname: caller.nickname, role: caller.role } satisfies Me),
};

export async function handler(event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<APIGatewayProxyResultV2> {
  try {
    const route = handlers[event.routeKey as RouteKey];
    if (!route) throw new HttpError(404, "見つかりません");
    const caller = getCaller(event);
    if (event.routeKey.split(" ")[1]?.startsWith("/admin/")) requireParent(caller);
    return await route(caller, event);
  } catch (e) {
    if (e instanceof HttpError) return json(e.status, { message: e.message });
    console.error(e);
    return json(500, { message: "サーバーでエラーが発生しました" });
  }
}
