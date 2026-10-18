import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import type { Me } from "../../shared/types";
import { getOverview, getReviewItems, reviewItem, startGeneration } from "./admin";
import { getCaller, requireParent, type Caller } from "./lib/auth";
import { HttpError, json } from "./lib/http";
import type { RouteKey } from "./routes";
import { getKanjiMap, getToday, submitAnswer } from "./study";

type Handler = (
  caller: Caller,
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
) => Promise<APIGatewayProxyResultV2>;

const handlers: Record<RouteKey, Handler> = {
  "GET /me": async (caller) => json(200, { nickname: caller.nickname, role: caller.role } satisfies Me),
  "GET /today": async (caller) => json(200, await getToday(caller)),
  "POST /answers": async (caller, event) => json(200, await submitAnswer(caller, event)),
  "GET /kanji": async (caller) => json(200, await getKanjiMap(caller)),
  "GET /admin/overview": async () => json(200, await getOverview()),
  "GET /admin/review": async () => json(200, await getReviewItems()),
  "PUT /admin/items/{id}": async (_c, event) => json(200, await reviewItem(event)),
  "POST /admin/generate": async () => json(202, await startGeneration()),
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
