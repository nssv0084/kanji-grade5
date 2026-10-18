import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminItem, AdminOverview } from "../../shared/types";

const api = vi.fn();
vi.mock("../src/api", () => ({ api: (...args: unknown[]) => api(...args) }));
const { ParentHome } = await import("../src/pages/ParentHome");

const overview: AdminOverview = {
  usage: { spentMicroUsd: 1_000_000, budgetMicroUsd: 10_000_000, stopRatio: 0.9, usdJpy: 150 },
  reviewCount: 1,
  jobs: [{ jobId: "j1", status: "done", trigger: "manual", createdAt: "2026-10-18T05:00:00Z", kanji: ["像", "厚"], created: 12, rejected: 2 }],
};
const item: AdminItem = { itemId: "write-1", kanji: "評", type: "write", text: "新しいゲームは{好評|こうひょう}だ。", status: "review", source: "ai", createdAt: "x" };

describe("保護者のホーム", () => {
  beforeEach(() => {
    api.mockReset().mockImplementation(async (method: string, path: string) => {
      if (path === "/admin/overview") return overview;
      if (path === "/admin/review") return [item];
      return {};
    });
  });

  it("[DSH-04] 今月の使用額と予算を円で出す", async () => {
    render(<ParentHome nickname="パパ" onOpenLab={vi.fn()} onSignOut={vi.fn()} />);
    expect(await screen.findByText(/今月の AI の使用額: 150円 \/ 予算 1,500円/)).toBeInTheDocument();
    expect(screen.getByText(/完了（像厚） 作成 12 問・除外 2 問/)).toBeInTheDocument();
  });

  it("[LVL-04] 確認待ちの問題を子どもに見える形と答えで出し、承認できる", async () => {
    const user = userEvent.setup();
    render(<ParentHome nickname="パパ" onOpenLab={vi.fn()} onSignOut={vi.fn()} />);
    expect(await screen.findByText(/好□（こうひょう）/)).toBeInTheDocument();
    expect(screen.getByText("→ 好評")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "承認" }));
    expect(api).toHaveBeenCalledWith("PUT", "/admin/items/write-1", { status: "approved" });
    expect(await screen.findByText("ありません。")).toBeInTheDocument();
  });

  it("[GEN-08] 「今すぐ問題を作る」で生成を始める", async () => {
    const user = userEvent.setup();
    render(<ParentHome nickname="パパ" onOpenLab={vi.fn()} onSignOut={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: "今すぐ問題を作る" }));
    expect(api).toHaveBeenCalledWith("POST", "/admin/generate");
  });
});
