import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// ブラウザを使わないテスト（@vitest-environment node）でも読み込まれるため、window があるときだけ設定する
if (typeof window !== "undefined") {
  afterEach(cleanup);
  window.scrollTo = () => undefined;
  Element.prototype.scrollIntoView = () => undefined;
}
