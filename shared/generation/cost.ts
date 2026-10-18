// API の費用の計算（COST-01）。料金は Anthropic の料金表（2026-10-06 時点、1M トークンあたりのドル）
// 単位はマイクロドル（1ドル = 1,000,000）の整数で扱い、丸め誤差をためない

export interface ModelPrice {
  input: number;
  output: number;
  /** キャッシュの書き込みは入力の1.25倍、読み込みはモデルごとの値 */
  cacheRead: number;
}

export const PRICES: Record<string, ModelPrice> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01 },
  "claude-fable-5-1": { input: 10, output: 50, cacheRead: 0.25 },
};

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

export function costMicroUsd(model: string, u: TokenUsage): number {
  const p = PRICES[model];
  if (!p) throw new Error(`料金が分からないモデルです: ${model}`);
  const usd =
    (u.input_tokens * p.input + (u.cache_creation_input_tokens ?? 0) * p.input * 1.25 + (u.cache_read_input_tokens ?? 0) * p.cacheRead + u.output_tokens * p.output) /
    1_000_000;
  return Math.ceil(usd * 1_000_000);
}

export interface Settings {
  /** 生成・検証に使うモデル（設定画面で変える。コードに固定しない） */
  generationModel: string;
  verificationModel: string;
  /** 月例テストの解答用紙の読み取り（TST-08） */
  gradingModel: string;
  /** 月の予算（円）と、計算に使う為替レート */
  monthlyBudgetYen: number;
  usdJpy: number;
}

export const DEFAULT_SETTINGS: Settings = {
  generationModel: "claude-opus-5-5",
  verificationModel: "claude-opus-5-5",
  gradingModel: "claude-opus-5-5",
  monthlyBudgetYen: 1500,
  usdJpy: 150,
};

/** 予算の90%に達したら生成を止める（COST-01） */
export const STOP_RATIO = 0.9;

export function budgetMicroUsd(s: Settings): number {
  return Math.round((s.monthlyBudgetYen / s.usdJpy) * 1_000_000);
}

export function overBudget(spentMicroUsd: number, s: Settings): boolean {
  return spentMicroUsd >= budgetMicroUsd(s) * STOP_RATIO;
}

/** 月例テストの採点は月1回で少額のため、予算の100%まで止めない（COST-01） */
export function gradingOverBudget(spentMicroUsd: number, s: Settings): boolean {
  return spentMicroUsd >= budgetMicroUsd(s);
}
