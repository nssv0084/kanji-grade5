// API Gateway のルート定義。infra はこの一覧からルートを作り、api.ts は同じキーで処理を振り分ける
// /admin/ で始まる経路は保護者だけが使える（api.ts で確認する）
export const ROUTE_KEYS = ["GET /me", "GET /today", "POST /answers", "GET /kanji"] as const;

export type RouteKey = (typeof ROUTE_KEYS)[number];
