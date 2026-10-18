import { describe, expect, it } from "vitest";
import { budgetMicroUsd, costMicroUsd, DEFAULT_SETTINGS, overBudget } from "../../shared/generation/cost";
import { initialStatus, kanjiNeedingItems, passed, screen, toVerifyQuestions } from "../../shared/generation/pipeline";
import { generationPrompt } from "../../shared/generation/prompts";

describe("問題のふるい分け", () => {
  it("[LVL-01] 6年生以上の漢字が入った問題は落とす", () => {
    const { kept, rejected } = screen("雑", { items: [{ type: "write", text: "図書館で{雑誌|ざっし}を読む。" }, { type: "write", text: "庭の{雑草|ざっそう}をぬく。" }] }, []);
    expect(kept.map((k) => k.text)).toEqual(["庭の{雑草|ざっそう}をぬく。"]);
    expect(rejected[0].reason).toContain("誌");
  });

  it("[GEN-04] すでにある問題と同じ形式・同じ語の問題は作らない", () => {
    const existing = [{ type: "write" as const, text: "庭の{雑草|ざっそう}をぬく。" }];
    const { kept } = screen(
      "雑",
      {
        items: [
          { type: "write", text: "道ばたの{雑草|ざっそう}を見る。" },
          { type: "read", text: "道ばたの{雑草|ざっそう}を見る。" },
          { type: "write", text: "まどの外から{雑音|ざつおん}が聞こえる。" },
        ],
      },
      existing,
    );
    expect(kept.map((k) => `${k.type}:${k.text}`)).toEqual(["read:道ばたの{雑草|ざっそう}を見る。", "write:まどの外から{雑音|ざつおん}が聞こえる。"]);
  });

  it("[LVL-03] 検証では答えを伏せる", () => {
    const qs = toVerifyQuestions([
      { kanji: "貸", type: "write", text: "友だちに本を{貸|か}す。" },
      { kanji: "評", type: "read", text: "先生が作文を{評価|ひょうか}する。" },
    ]);
    expect(qs[0].shown).toBe("友だちに本を［か］す。");
    expect(qs[1].shown).toBe("先生が作文を［評価］する。");
  });

  it("[LVL-03] 正答と一致し、答えが1つに決まり、自然な問題だけを合格にする", () => {
    const cands = [
      { kanji: "貸", type: "write" as const, text: "友だちに本を{貸|か}す。" },
      { kanji: "評", type: "read" as const, text: "先生が作文を{評価|ひょうか}する。" },
      { kanji: "過", type: "write" as const, text: "{過去|かこ}の記録を調べる。" },
    ];
    const ok = { uniqueAnswer: true, natural: true, suitableForGrade5: true, issue: "" };
    const { ok: pass, failed } = passed(cands, {
      results: [
        { no: 1, answer: "貸", ...ok },
        { no: 2, answer: "ヒョウカ", ...ok },
        { no: 3, answer: "過去", ...ok, uniqueAnswer: false, issue: "加古とも読める" },
      ],
    });
    expect(pass.map((p) => p.kanji)).toEqual(["貸", "評"]);
    expect(failed[0].reason).toBe("加古とも読める");
  });

  it("[LVL-04] 保護者の承認が20問に届くまでは確認待ち、その後は約1割を抜き取り", () => {
    expect(initialStatus(19, 0.99)).toBe("review");
    expect(initialStatus(20, 0.05)).toBe("review");
    expect(initialStatus(20, 0.5)).toBe("approved");
  });
});

describe("問題が足りない字", () => {
  it("[GEN-06] 習った字を先に、次に2週間先までの字を、上限まで選ぶ", () => {
    const order = [..."ABCDEFGH"];
    const counts = { A: { write: 4, read: 3 }, B: { write: 2, read: 3 } };
    const need = kanjiNeedingItems({ order, learnedCount: 3, aheadCount: 2, counts, limit: 3 });
    expect(need).toEqual([
      { kanji: "B", write: 2, read: 0 },
      { kanji: "C", write: 4, read: 3 },
      { kanji: "D", write: 4, read: 3 },
    ]);
    expect(kanjiNeedingItems({ order, learnedCount: 3, aheadCount: 2, counts, limit: 10 }).map((n) => n.kanji)).toEqual(["B", "C", "D", "E"]);
  });
});

describe("費用", () => {
  it("[COST-01] トークン数から費用を計算する（マイクロドル）", () => {
    expect(costMicroUsd("claude-opus-5-5", { input_tokens: 1_000_000, output_tokens: 0 })).toBe(4_000_000);
    expect(costMicroUsd("claude-opus-5-5", { input_tokens: 0, output_tokens: 1000, cache_read_input_tokens: 1_000_000 })).toBe(20_000 + 200_000);
    expect(() => costMicroUsd("unknown-model", { input_tokens: 1, output_tokens: 1 })).toThrow();
  });

  it("[COST-01] 予算の90%に達したら止める", () => {
    const budget = budgetMicroUsd(DEFAULT_SETTINGS);
    expect(budget).toBe(10_000_000);
    expect(overBudget(budget * 0.89, DEFAULT_SETTINGS)).toBe(false);
    expect(overBudget(budget * 0.9, DEFAULT_SETTINGS)).toBe(true);
  });
});

describe("プロンプト", () => {
  it("[GEN-09] 使ってよい5年生の漢字（習った字と対象の字）と、すでにある問題を渡す", () => {
    const p = generationPrompt({ kanji: "評", write: 4, read: 3, allowedGrade5: ["評", "判"], existing: ["この店は{評判|ひょうばん}がいい。"] });
    expect(p).toContain("5年生の漢字（習った字）: 評判");
    expect(p).toContain("- この店は{評判|ひょうばん}がいい。");
    expect(p).toContain("ヒョウ");
  });
});

describe("保護者の承認数", () => {
  it("[LVL-04] AI が作り保護者が承認した問題だけを数える（手作業で作った問題は数えない）", async () => {
    const { parentApprovedCount } = await import("../src/lib/items");
    const base = { kanji: "貸", type: "write" as const, text: "t", createdAt: "x" };
    const items = [
      { ...base, itemId: "1", status: "approved" as const, source: "ai", approvedBy: "parent" as const },
      { ...base, itemId: "2", status: "approved" as const, source: "ai" },
      { ...base, itemId: "3", status: "approved" as const, source: "下巻1〜3回の最初の問題" },
      { ...base, itemId: "4", status: "review" as const, source: "ai" },
    ];
    expect(parentApprovedCount(items, "write")).toBe(1);
  });
});

describe("問う語の重なり", () => {
  it("[GEN-04] すでに使った語を、使わない語として渡す", () => {
    const p = generationPrompt({ kanji: "喜", write: 1, read: 1, allowedGrade5: ["喜"], existing: ["母を{喜|よろこ}ばせる。", "{喜|よろこ}びの声。"] });
    expect(p).toContain("すでに使った語（これらの語は使わない）: 喜");
  });

  it("[LVL-02] 生成に渡す読みは常用漢字表の読みだけ（表外訓を渡さない）", () => {
    const p = generationPrompt({ kanji: "象", write: 1, read: 1, allowedGrade5: ["象"], existing: [] });
    expect(p).toContain("音読み: ショウ・ゾウ");
    expect(p).toContain("訓読み: なし");
  });
});
