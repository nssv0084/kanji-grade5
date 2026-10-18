import { describe, expect, it } from "vitest";
import { checkItem } from "../../shared/items/check";
import { charsToWrite, normalizeReading, parseText, requiredKanji, targetOf } from "../../shared/items/text";

describe("問題文の書き方", () => {
  it("問う語を {漢字|よみ} で取り出せる", () => {
    expect(targetOf("友だちに本を{貸|か}す。")).toEqual({ word: "貸", reading: "か" });
    expect(parseText("a{評判|ひょうばん}b")).toEqual([
      { kind: "plain", text: "a" },
      { kind: "target", word: "評判", reading: "ひょうばん" },
      { kind: "plain", text: "b" },
    ]);
  });

  it("[HWR-01] 書き取りで書かせるのは語の中の5年生の漢字だけ", () => {
    expect(charsToWrite("好評")).toEqual([false, true]);
    expect(charsToWrite("評判")).toEqual([true, true]);
  });

  it("[CUR-05] 問題文の5年生の漢字をすべて習ってから出す", () => {
    expect(requiredKanji("みんなの{評判|ひょうばん}を聞く。").sort()).toEqual(["判", "評"]);
    expect(requiredKanji("すばらしい演技が{賞賛|しょうさん}された。").sort()).toEqual(["技", "演", "賛", "賞"].sort());
  });

  it("読みの入力は、カタカナ・全角・空白の違いを気にしない", () => {
    expect(normalizeReading(" ヒョウバン ")).toBe("ひょうばん");
  });
});

describe("問題の機械的な検査", () => {
  it("[LVL-01] 6年生以上の漢字が問題文にあれば不合格", () => {
    const r = checkItem({ kanji: "雑", type: "write", text: "図書館で{雑誌|ざっし}を読む。" });
    expect(r.errors.join()).toContain("誌");
  });

  it("[LVL-01] 対象の字が問う語に入っていなければ不合格", () => {
    expect(checkItem({ kanji: "評", type: "write", text: "{判断|はんだん}する。" }).errors).not.toHaveLength(0);
  });

  it("[LVL-02] 音読み・訓読みの組み合わせ（連濁・促音つき）で読める語は合格", () => {
    for (const [kanji, text] of [
      ["程", "旅行の{日程|にってい}を決める。"],
      ["雑", "庭の{雑草|ざっそう}をぬく。"],
      ["価", "最近は{物価|ぶっか}が高い。"],
      ["貸", "友だちに本を{貸|か}す。"],
      ["増", "水かさが{増|ま}す。"],
      ["護", "しょう来は{弁護士|べんごし}になりたい。"],
    ]) {
      expect(checkItem({ kanji, type: "read", text }), text).toEqual({ errors: [], warnings: [] });
    }
  });

  it("[LVL-02] 読みが組み立てられないときは確認を求める", () => {
    const r = checkItem({ kanji: "評", type: "read", text: "みんなの{評判|ひょばん}を聞く。" });
    expect(r.errors).toHaveLength(0);
    expect(r.warnings).toHaveLength(1);
  });
});
