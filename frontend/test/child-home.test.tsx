import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PracticeQuestion, TodayResponse } from "../../shared/types";

const api = vi.fn();
vi.mock("../src/api", () => ({ api: (...args: unknown[]) => api(...args) }));
const { ChildHome } = await import("../src/pages/ChildHome");

const today: TodayResponse = { date: "2026-10-20", needsPlan: false, newKanji: [], sets: [], streak: 2, learnedCount: 110, masteredCount: 20, total: 193 };

function mockToday(t: TodayResponse) {
  api.mockReset().mockImplementation(async (_m: string, path: string) => (path === "/today" ? t : []));
}

describe("子どものホーム", () => {
  beforeEach(() => mockToday(today));

  it("[STK-04] 覚えた字が10字の区切りに届いたら、お祝いを出し、閉じられる", async () => {
    const user = userEvent.setup();
    mockToday({ ...today, celebrate: 20 });
    render(<ChildHome nickname="子ども" onSignOut={vi.fn()} />);
    expect(await screen.findByText("覚えた字が 20 字になったよ。")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "やったね" }));
    expect(screen.queryByText("おめでとう！")).not.toBeInTheDocument();
  });

  it("[CUR-13] 今日の問題数と、セットごとの済み・未済、あと何問で終わりかを出す", async () => {
    const q = (index: number, answered: boolean): PracticeQuestion => ({ index, itemId: `i${index}`, kanji: "評", type: "read", text: "{評価|ひょうか}", reason: "check", answered: answered ? { correct: true } : undefined });
    const sets = [0, 1, 2].map((s) => [0, 1, 2, 3, 4].map((i) => q(s * 5 + i, s === 0)));
    mockToday({ ...today, sets });
    render(<ChildHome nickname="子ども" onSignOut={vi.fn()} />);
    expect(await screen.findByText("あと 10 もんで今日はおわり")).toBeInTheDocument();
    expect(screen.getByText("今日は 15 もん（5 もん できた）")).toBeInTheDocument();
    const steps = screen.getByRole("list", { name: "今日のセット" });
    expect(steps.textContent).toBe("✓セット2セット3おわり");
    expect(screen.getByRole("button", { name: "つづきから" })).toBeInTheDocument();
  });

  it("[STK-04] 区切りに届いていなければお祝いを出さない", async () => {
    render(<ChildHome nickname="子ども" onSignOut={vi.fn()} />);
    expect(await screen.findByText(/覚えた字 20 \/ 193/)).toBeInTheDocument();
    expect(screen.queryByText("おめでとう！")).not.toBeInTheDocument();
  });
});
