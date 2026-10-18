import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MonthlyTest, TestResult } from "../../shared/types";

const api = vi.fn();
vi.mock("../src/api", () => ({ api: (...args: unknown[]) => api(...args) }));
const { GradingReview } = await import("../src/components/GradingReview");
const { TestResultCard } = await import("../src/components/TestResultCard");

const test: MonthlyTest = {
  childId: "c1",
  month: "2026-10",
  title: "10月の漢字テスト",
  status: "graded",
  createdAt: "x",
  questions: [
    { no: 1, itemId: "w1", kanji: "評", type: "write", text: "新しいゲームは{好評|こうひょう}だ。" },
    { no: 2, itemId: "r1", kanji: "評", type: "read", text: "先生が作文を{評価|ひょうか}する。" },
  ],
  answers: [
    { no: 1, written: "評", verdict: "correct", needsCheck: false, note: "最後の画をはねている", box: { photo: 0, x: 10, y: 10, width: 100, height: 40 } },
    { no: 2, written: "", verdict: "unreadable", needsCheck: true, note: "" },
  ],
  photoUrls: ["https://example.invalid/photo.jpg"],
};

describe("採点の確認", () => {
  it("[TST-09] 確認が要る問を上に出し、○×を選ぶまで確定できない", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<GradingReview test={test} busy={false} onConfirm={onConfirm} />);
    const rows = screen.getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("2 読み");
    expect(screen.getByText(/確認が要る問があと 1 問/)).toBeInTheDocument();
    expect(screen.getByText("参考: 最後の画をはねている")).toBeInTheDocument();

    const confirm = screen.getByRole("button", { name: /点で確定する/ });
    expect(confirm).toBeDisabled();
    await user.click(screen.getAllByRole("button", { name: "×" })[0]);
    expect(screen.getByRole("button", { name: "1 / 2 点で確定する" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "1 / 2 点で確定する" }));
    expect(onConfirm).toHaveBeenCalledWith({ 2: "wrong" });
  });

  it("[TST-09] AI の判定も押して直せる", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<GradingReview test={test} busy={false} onConfirm={onConfirm} />);
    await user.click(screen.getAllByRole("button", { name: "○" })[0]);
    await user.click(screen.getAllByRole("button", { name: "×" })[1]);
    await user.click(screen.getByRole("button", { name: "1 / 2 点で確定する" }));
    expect(onConfirm).toHaveBeenCalledWith({ 2: "correct", 1: "wrong" });
  });
});

describe("テストの結果（子ども）", () => {
  const results: TestResult[] = [
    { month: "2026-11", title: "11月の漢字テスト", score: 27, total: 30, missed: ["評", "護"] },
    { month: "2026-10", title: "10月の漢字テスト", score: 24, total: 30, missed: [] },
  ];
  beforeEach(() => api.mockReset().mockResolvedValue(results));

  it("[TST-11] 点数、間違えた字、前の月との比較を出す", async () => {
    render(<TestResultCard />);
    expect(await screen.findByText("11月の漢字テストの結果")).toBeInTheDocument();
    expect(screen.getByText("27 / 30 点")).toBeInTheDocument();
    expect(screen.getByText(/10ポイント上がったよ/)).toBeInTheDocument();
    expect(screen.getByText("評 護")).toBeInTheDocument();
  });

  it("[TST-11] 確定したテストがなければ何も出さない", async () => {
    api.mockResolvedValue([]);
    const { container } = render(<TestResultCard />);
    await vi.waitFor(() => expect(api).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
