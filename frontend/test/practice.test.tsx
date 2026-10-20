import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PracticeQuestion } from "../../shared/types";

const api = vi.fn();
vi.mock("../src/api", () => ({ api: (...args: unknown[]) => api(...args) }));

const { Practice } = await import("../src/pages/Practice");

const read: PracticeQuestion = { index: 0, itemId: "r1", kanji: "評", type: "read", text: "先生が作文を{評価|ひょうか}する。", reason: "new" };
const write: PracticeQuestion = { index: 1, itemId: "w1", kanji: "評", type: "write", text: "新しいゲームは{好評|こうひょう}だ。", reason: "check" };

function draw(pad: HTMLElement) {
  fireEvent.pointerDown(pad, { pointerId: 1, clientX: 10, clientY: 10 });
  fireEvent.pointerMove(pad, { pointerId: 1, clientX: 30, clientY: 30 });
  fireEvent.pointerUp(pad, { pointerId: 1, clientX: 30, clientY: 30 });
}

describe("練習", () => {
  beforeEach(() => api.mockReset().mockResolvedValue({ streak: 3, done: false }));

  it("読み: ひらがなで答え、カタカナでも正解になり、結果を送る", async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    render(<Practice date="2026-10-20" set={[read]} setNo={1} setCount={2} dayDone={0} dayTotal={1} onDone={onDone} />);
    expect(screen.getByText("評価")).toBeInTheDocument();
    await user.type(screen.getByRole("textbox"), "ヒョウカ");
    await user.click(screen.getByRole("button", { name: "こたえる" }));
    expect(screen.getByText("○ せいかい！")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "つぎへ" }));
    expect(api).toHaveBeenCalledWith("POST", "/answers", { date: "2026-10-20", index: 0, correct: true, selfJudged: false });
    expect(await screen.findByText("1 / 1 もん せいかい")).toBeInTheDocument();
    expect(screen.getByText("れんぞく 3 日！")).toBeInTheDocument();
  });

  it("[CUR-13] 問題の画面に今日全体の何問目かを出し、セットの終わりに残りと「つぎのセットへ」を出す", async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    render(<Practice date="2026-10-20" set={[read]} setNo={2} setCount={3} dayDone={5} dayTotal={15} onDone={onDone} />);
    expect(screen.getByText("今日 6 / 15 もん（セット 2 / 3）")).toBeInTheDocument();
    await user.type(screen.getByRole("textbox"), "ひょうか");
    await user.click(screen.getByRole("button", { name: "こたえる" }));
    await user.click(screen.getByRole("button", { name: "つぎへ" }));
    expect(await screen.findByText("あと 9 もんで今日の練習はおわり！")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "つぎのセットへ" }));
    expect(onDone).toHaveBeenCalledWith(true);
    await user.click(screen.getByRole("button", { name: "あとでやる" }));
    expect(onDone).toHaveBeenLastCalledWith(false);
  });

  it("[CUR-13] 最後のセットを終えたら「今日の練習はぜんぶおわり」と出す", async () => {
    const user = userEvent.setup();
    render(<Practice date="2026-10-20" set={[read]} setNo={3} setCount={3} dayDone={14} dayTotal={15} onDone={vi.fn()} />);
    await user.type(screen.getByRole("textbox"), "ひょうか");
    await user.click(screen.getByRole("button", { name: "こたえる" }));
    await user.click(screen.getByRole("button", { name: "つぎへ" }));
    expect(await screen.findByRole("heading", { name: "今日の練習はぜんぶおわり！" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "つぎのセットへ" })).not.toBeInTheDocument();
  });

  it("[HWR-01] 書き取り: 4年生までの字は印刷し、5年生の字だけ書かせる", async () => {
    const user = userEvent.setup();
    render(<Practice date="2026-10-20" set={[write]} setNo={1} setCount={1} dayDone={0} dayTotal={1} onDone={vi.fn()} />);
    expect(screen.getByText("好")).toBeInTheDocument();
    expect(screen.getByText("□の漢字を書こう（0 画）")).toBeInTheDocument();
    draw(screen.getByTestId("writing-pad"));
    await user.click(screen.getByRole("button", { name: "こたえる" }));
    // jsdom では本物の字を書けないため、判定は × か △ になる。どちらでも結果を送って次へ進める
    const next = screen.queryByRole("button", { name: "つぎへ" }) ?? screen.getByRole("button", { name: "× ちがってた" });
    await user.click(next);
    if (!api.mock.calls.length) await user.click(screen.getByRole("button", { name: "つぎへ" }));
    await waitFor(() => expect(api).toHaveBeenCalledWith("POST", "/answers", expect.objectContaining({ index: 1, correct: false })));
  });

  it("送れなかったときは、その問題にとどまって知らせる", async () => {
    api.mockRejectedValueOnce(new Error("通信エラー"));
    const user = userEvent.setup();
    render(<Practice date="2026-10-20" set={[read]} setNo={1} setCount={1} dayDone={0} dayTotal={1} onDone={vi.fn()} />);
    await user.type(screen.getByRole("textbox"), "ひょうか");
    await user.click(screen.getByRole("button", { name: "こたえる" }));
    await user.click(screen.getByRole("button", { name: "つぎへ" }));
    expect(await screen.findByText(/送れませんでした/)).toBeInTheDocument();
    expect(screen.queryByText(/もん せいかい/)).not.toBeInTheDocument();
  });
});
