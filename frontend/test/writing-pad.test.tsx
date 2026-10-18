import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { HandwritingLab } from "../src/pages/HandwritingLab";

// jsdom は canvas の描画とレイアウトを持たないため、線の数と操作だけを確かめる
function drawStroke(pad: HTMLElement, pointerId = 1) {
  fireEvent.pointerDown(pad, { pointerId, clientX: 10, clientY: 10 });
  fireEvent.pointerMove(pad, { pointerId, clientX: 20, clientY: 20 });
  fireEvent.pointerUp(pad, { pointerId, clientX: 20, clientY: 20 });
}

describe("書くマス", () => {
  it("[HWR-06] 1画もどす・書き直すで線を消せる", async () => {
    const user = userEvent.setup();
    render(<HandwritingLab />);
    const pad = screen.getByTestId("writing-pad");
    drawStroke(pad);
    drawStroke(pad);
    expect(screen.getByText("2 画")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "1画もどす" }));
    expect(screen.getByText("1 画")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "書き直す" }));
    expect(screen.getByText("0 画")).toBeInTheDocument();
  });

  it("[HWR-06] 書いている途中に2本目の指が触れても線を書かない", () => {
    render(<HandwritingLab />);
    const pad = screen.getByTestId("writing-pad");
    fireEvent.pointerDown(pad, { pointerId: 1, clientX: 10, clientY: 10 });
    drawStroke(pad, 2);
    fireEvent.pointerUp(pad, { pointerId: 1, clientX: 30, clientY: 30 });
    expect(screen.getByText("1 画")).toBeInTheDocument();
  });

  it("[HWR-05] 判定すると、書いた字と手本を並べて表示する", async () => {
    const user = userEvent.setup();
    render(<HandwritingLab />);
    drawStroke(screen.getByTestId("writing-pad"));
    await user.click(screen.getByRole("button", { name: "判定する" }));
    expect(screen.getByRole("img", { name: "書いた字" })).toBeInTheDocument();
    expect(screen.getAllByRole("img", { name: /の手本$/ }).length).toBeGreaterThan(0);
    expect(screen.getByText("実際は正しく書けていた？")).toBeInTheDocument();
  });
});
