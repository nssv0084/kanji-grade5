import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TodayResponse } from "../../shared/types";

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

  it("[STK-04] 区切りに届いていなければお祝いを出さない", async () => {
    render(<ChildHome nickname="子ども" onSignOut={vi.fn()} />);
    expect(await screen.findByText(/覚えた字 20 \/ 193/)).toBeInTheDocument();
    expect(screen.queryByText("おめでとう！")).not.toBeInTheDocument();
  });
});
