import { gradingOverBudget } from "../../shared/generation/cost";
import { GRADING_SYSTEM, gradingPrompt, judgeAnswers, retakeReasons, SheetReading } from "../../shared/test/grade";
import { askStructured } from "./lib/claude";
import { getItem, keys, putItem } from "./lib/db";
import { readPhotoBase64 } from "./lib/photos";
import { getSettings, monthSpent } from "./lib/usage";
import { testRecord, toTest, type TestRecord } from "./monthlyTest";

// 月例テストの採点（TST-08〜10）。API から非同期で起動する。
// 失敗しても自動で再実行しない（二重に課金されるため）。保護者がもう一度「採点する」を押す

export async function handler(event: { childId: string; month: string }): Promise<void> {
  const r = await getItem<TestRecord>(keys.monthlyTest(event.childId, event.month));
  if (!r || r.status !== "grading" || !r.photoKeys?.length) return;
  const save = (patch: Partial<TestRecord>) => putItem({ ...testRecord({ ...toTest(r), photoKeys: r.photoKeys, ...patch }) });

  try {
    const settings = await getSettings();
    if (gradingOverBudget(await monthSpent(), settings)) {
      await save({ status: "failed", problems: ["今月の AI の予算の上限に達したため、採点できません。設定で予算を変えてください"] });
      return;
    }
    const images = await Promise.all(r.photoKeys.map(readPhotoBase64));
    const reading = await askStructured({
      model: settings.gradingModel,
      system: GRADING_SYSTEM,
      prompt: gradingPrompt(r.title, r.questions, images.length),
      schema: SheetReading,
      purpose: "grading",
      images,
    });
    const answers = judgeAnswers(r.questions, reading, images.length);
    const problems = retakeReasons(reading, answers);
    await save({ status: problems.length > 0 ? "retake" : "graded", answers, problems });
  } catch (e) {
    console.error(e);
    await save({ status: "failed", problems: ["採点に失敗しました。もう一度「採点する」を押してください"] });
  }
}
