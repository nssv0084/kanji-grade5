import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminItem, AdminOverview, ChildDashboard, TestsResponse } from "../../shared/types";

const api = vi.fn();
vi.mock("../src/api", () => ({ api: (...args: unknown[]) => api(...args) }));
const { ParentHome } = await import("../src/pages/ParentHome");

const overview: AdminOverview = {
  usage: { spentMicroUsd: 1_000_000, budgetMicroUsd: 10_000_000, stopRatio: 0.9, usdJpy: 150 },
  reviewCount: 1,
  jobs: [{ jobId: "j1", status: "done", trigger: "manual", createdAt: "2026-10-18T05:00:00Z", kanji: ["像", "厚"], created: 12, rejected: 2 }],
};
const tests: TestsResponse = {
  month: "2026-10",
  reminder: true,
  children: [
    {
      childId: "c1",
      nickname: "子ども",
      tests: [
        {
          childId: "c1",
          month: "2026-09",
          title: "9月の漢字テスト",
          status: "created",
          createdAt: "2026-09-25T00:00:00Z",
          questions: [
            { no: 1, itemId: "w", kanji: "評", type: "write", text: "新しいゲームは{好評|こうひょう}だ。" },
            { no: 2, itemId: "r", kanji: "評", type: "read", text: "先生が作文を{評価|ひょうか}する。" },
          ],
        },
      ],
    },
  ],
};
const child: ChildDashboard = {
  childId: "c1",
  nickname: "子ども",
  learned: 22,
  mastered: 1,
  weak: 1,
  total: 193,
  streak: 0,
  lastStudyDate: "2026-10-17",
  idleDays: 3,
  idleAlert: true,
  week: Array.from({ length: 7 }, (_, i) => ({ date: `2026-10-${14 + i}`, answers: i === 3 ? 15 : 0, correct: i === 3 ? 12 : 0 })),
  weakKanji: [{ kanji: "護", recent: [true, false, false] }],
  testScores: [{ month: "2026-09", score: 24, total: 30 }],
  progress: { learnedCount: 22, monthTarget: 30, behind: 2, reviewMonth: false, daysLeft: 128 },
};
const item: AdminItem = { itemId: "write-1", kanji: "評", type: "write", text: "新しいゲームは{好評|こうひょう}だ。", status: "review", source: "ai", createdAt: "x" };

describe("保護者のホーム", () => {
  beforeEach(() => {
    api.mockReset().mockImplementation(async (method: string, path: string) => {
      if (path === "/admin/overview") return overview;
      if (path === "/admin/review") return [item];
      if (path === "/admin/tests") return tests;
      if (path === "/admin/children") return [child];
      return {};
    });
  });

  it("[DSH-01] [STK-03] 子どもの状況を出し、学習が空いたら目立たせる", async () => {
    render(<ParentHome nickname="パパ" onOpenLab={vi.fn()} onSignOut={vi.fn()} />);
    expect(await screen.findByText("最後の学習から 3 日たっています")).toBeInTheDocument();
    expect(screen.getByText(/習った字 22 ・ 覚えた字 1 ・ 苦手な字 1（全 193 字）/)).toBeInTheDocument();
    expect(screen.getByRole("listitem", { name: "17(土) 15問" })).toBeInTheDocument();
  });

  it("[ACC-05] 確かめてから子どもの仮パスワードを再発行し、一度だけ表示する", async () => {
    const user = userEvent.setup();
    const fake = ["abcd", "2345"].join("");
    api.mockImplementation(async (method: string, path: string) => {
      if (path === "/admin/children") return [child];
      if (method === "POST" && path === "/admin/children/c1/password") return { temporaryPassword: fake };
      return path === "/admin/overview" ? overview : path === "/admin/tests" ? tests : [];
    });
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(<ParentHome nickname="パパ" onOpenLab={vi.fn()} onSignOut={vi.fn()} />);
    const button = await screen.findByRole("button", { name: /仮パスワードを再発行/ });

    await user.click(button);
    expect(api).not.toHaveBeenCalledWith("POST", "/admin/children/c1/password");

    await user.click(button);
    expect(await screen.findByText(fake)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "閉じる" }));
    expect(screen.queryByText(fake)).not.toBeInTheDocument();
    confirm.mockRestore();
  });

  it("[DSH-02] [DSH-05] 苦手な字と直近の結果、予定との差を出す", async () => {
    render(<ParentHome nickname="パパ" onOpenLab={vi.fn()} onSignOut={vi.fn()} />);
    expect(await screen.findByText("護")).toBeInTheDocument();
    expect(screen.getByText("直近の書き取り ○××")).toBeInTheDocument();
    expect(screen.getByText("予定より 2 字遅れ")).toBeInTheDocument();
    expect(screen.getByText("9月 24 / 30（80%）")).toBeInTheDocument();
  });

  it("[TST-03] 月の最終週に印刷をうながし、今月のテストを作れる", async () => {
    const user = userEvent.setup();
    render(<ParentHome nickname="パパ" onOpenLab={vi.fn()} onSignOut={vi.fn()} />);
    expect(await screen.findByText("今月のテストを印刷しよう")).toBeInTheDocument();
    expect(screen.getByText("9月の漢字テスト（書き取り 1 問・読み 1 問）")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "今月のテストを作る" }));
    expect(api).toHaveBeenCalledWith("POST", "/admin/tests", { childId: "c1" });
  });

  it("[TST-06] テストごとに問題用と答えつきの PDF を出せる", async () => {
    render(<ParentHome nickname="パパ" onOpenLab={vi.fn()} onSignOut={vi.fn()} />);
    expect(await screen.findByRole("button", { name: "問題の PDF" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "答えの PDF" })).toBeInTheDocument();
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
