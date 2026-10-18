// API Gateway のルート定義。infra はこの一覧からルートを作り、api.ts は同じキーで処理を振り分ける
// /admin/ で始まる経路は保護者だけが使える（api.ts で確認する）
export const ROUTE_KEYS = [
  "GET /me",
  "GET /today",
  "POST /answers",
  "GET /kanji",
  "GET /admin/overview",
  "GET /admin/review",
  "PUT /admin/items/{id}",
  "POST /admin/generate",
  "GET /admin/children",
  "GET /admin/tests",
  "POST /admin/tests",
  "POST /admin/tests/{child}/{month}/photos",
  "POST /admin/tests/{child}/{month}/grade",
  "PUT /admin/tests/{child}/{month}",
  "GET /tests",
] as const;

export type RouteKey = (typeof ROUTE_KEYS)[number];
