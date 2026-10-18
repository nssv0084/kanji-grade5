import { randomUUID } from "node:crypto";
import { InvocationType, InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";
import { studyDate } from "../../shared/study/dates";
import { composeTest, defaultCounts, isLastWeek, testTitle } from "../../shared/test/compose";
import { finalize, type FinalVerdict } from "../../shared/test/grade";
import type { MonthlyTest, PhotoUploads, TestResult, TestsResponse } from "../../shared/types";
import type { Caller } from "./lib/auth";
import { listChildren } from "./lib/children";
import { ddb, getItem, keys, putItem, queryUserPrefix, TABLE_NAME } from "./lib/db";
import { HttpError, parseBody } from "./lib/http";
import { presignUpload, presignView } from "./lib/photos";
import { loadItems, loadKanji, loadPlan, loadQuestions, recordResult } from "./study";

// 月例テスト（TST-03〜13）。保護者が作り、問題と並びを保存する。PDF は画面で作る。
// 解答用紙の写真は S3 に直接アップロードし、採点は採点用の Lambda（grader.ts）で行う

/** 1回のテストで送れる写真の枚数（TST-07） */
export const MAX_PHOTOS = 3;

export type TestRecord = MonthlyTest & { pk: string; sk: string; gsi1pk: string; gsi1sk: string; photoKeys?: string[] };

/** 画面に返す形。写真の S3 キーは返さない */
export function toTest({ pk: _pk, sk: _sk, gsi1pk: _g1, gsi1sk: _g2, photoKeys: _p, ...test }: TestRecord): MonthlyTest {
  return test;
}

export function testRecord(test: MonthlyTest & { photoKeys?: string[] }): TestRecord {
  return { ...keys.monthlyTest(test.childId, test.month), ...test, gsi1pk: `MTESTS#${test.status}`, gsi1sk: test.createdAt };
}

/** 確認の画面で切り抜きを出すため、確認待ち・撮り直しのときだけ写真の URL を付ける */
async function withPhotoUrls(r: TestRecord): Promise<MonthlyTest> {
  const test = toTest(r);
  if ((r.status === "graded" || r.status === "retake") && r.photoKeys?.length) test.photoUrls = await Promise.all(r.photoKeys.map(presignView));
  return test;
}

export async function listTests(now = new Date()): Promise<TestsResponse> {
  const date = studyDate(now);
  const children = await listChildren();
  return {
    month: date.slice(0, 7),
    reminder: isLastWeek(date),
    children: await Promise.all(
      children.map(async (c) => {
        const rows = await queryUserPrefix<TestRecord>(c.sub, "MTEST#");
        const tests = await Promise.all(rows.map(withPhotoUrls));
        return { childId: c.sub, nickname: c.nickname, tests: tests.sort((a, b) => b.month.localeCompare(a.month)) };
      }),
    ),
  };
}

export async function createTest(event: APIGatewayProxyEventV2WithJWTAuthorizer, now = new Date()): Promise<MonthlyTest> {
  const { childId } = parseBody(event.body, event.isBase64Encoded) as { childId?: unknown };
  if (typeof childId !== "string" || !(await listChildren()).some((c) => c.sub === childId)) throw new HttpError(400, "子どもが見つかりません");

  const today = studyDate(now);
  const month = today.slice(0, 7);
  const plan = await loadPlan(childId);
  if (!plan) throw new HttpError(400, "学習計画が登録されていません");
  const [items, kanji, questions] = await Promise.all([loadItems(), loadKanji(childId), loadQuestions(childId)]);
  const picked = composeTest({ plan, month, today, items, kanji, questions, counts: defaultCounts(plan, today) });
  if (picked.length === 0) throw new HttpError(400, "出せる問題がありません");

  const test: MonthlyTest = { childId, month, title: testTitle(month), status: "created", createdAt: now.toISOString(), questions: picked };
  try {
    // 2台から同時に押しても、1つの月に1回だけ作る
    await ddb.send(new PutCommand({ TableName: TABLE_NAME, Item: testRecord(test), ConditionExpression: "attribute_not_exists(pk)" }));
  } catch (e) {
    if ((e as Error).name === "ConditionalCheckFailedException") throw new HttpError(409, "今月のテストはもう作ってあります");
    throw e;
  }
  return test;
}

async function loadTest(event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<TestRecord> {
  const { child, month } = event.pathParameters ?? {};
  if (!child || !month || !/^\d{4}-\d{2}$/.test(month)) throw new HttpError(400, "テストの指定が正しくありません");
  const r = await getItem<TestRecord>(keys.monthlyTest(child, month));
  if (!r) throw new HttpError(404, "テストが見つかりません");
  return r;
}

/** 解答用紙の写真のアップロード先を発行する（TST-07）。前に送った写真は使わなくなる（30日で消える） */
export async function createUploads(event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<PhotoUploads> {
  const r = await loadTest(event);
  if (r.status === "grading" || r.status === "confirmed") throw new HttpError(409, r.status === "grading" ? "採点中です" : "確定したテストです");
  const { count } = parseBody(event.body, event.isBase64Encoded) as { count?: unknown };
  if (!Number.isInteger(count) || (count as number) < 1 || (count as number) > MAX_PHOTOS) throw new HttpError(400, `写真は1〜${MAX_PHOTOS}枚です`);

  const photoKeys = Array.from({ length: count as number }, () => `tests/${r.childId}/${r.month}/${randomUUID()}.jpg`);
  await putItem({ ...r, photoKeys });
  return { uploads: await Promise.all(photoKeys.map(presignUpload)) };
}

/** 採点を始める（TST-08）。採点用の Lambda を非同期で起動し、画面は状態を読み直して待つ */
export async function startGrading(event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<MonthlyTest> {
  const r = await loadTest(event);
  if (r.status === "grading" || r.status === "confirmed") throw new HttpError(409, r.status === "grading" ? "採点中です" : "確定したテストです");
  if (!r.photoKeys?.length) throw new HttpError(400, "先に解答用紙の写真を送ってください");

  const next = testRecord({ ...toTest(r), photoKeys: r.photoKeys, status: "grading", problems: [] });
  await putItem({ ...next });
  await new LambdaClient({}).send(
    new InvokeCommand({
      FunctionName: process.env.GRADER_FN_NAME,
      InvocationType: InvocationType.Event,
      Payload: Buffer.from(JSON.stringify({ childId: r.childId, month: r.month })),
    }),
  );
  return toTest(next);
}

/** 保護者が確かめた判定で確定し、復習と定着度に反映する（TST-09、TST-11） */
export async function confirmTest(event: APIGatewayProxyEventV2WithJWTAuthorizer, now = new Date()): Promise<MonthlyTest> {
  const r = await loadTest(event);
  if (r.status !== "graded" && r.status !== "retake") throw new HttpError(409, "確認できる状態ではありません");
  if (!r.answers?.length) throw new HttpError(409, "採点の結果がありません");

  const { decisions } = parseBody(event.body, event.isBase64Encoded) as { decisions?: unknown };
  const parsed: Record<number, FinalVerdict> = {};
  for (const [no, v] of Object.entries(decisions && typeof decisions === "object" ? decisions : {})) {
    if (v !== "correct" && v !== "wrong") throw new HttpError(400, "判定は correct か wrong です");
    parsed[Number(no)] = v;
  }
  const result = finalize(r.answers, parsed);
  if ("missing" in result) throw new HttpError(400, `確認していない問題があります（${result.missing.join("、")}）`);

  const confirmed = testRecord({ ...toTest(r), photoKeys: r.photoKeys, status: "confirmed", verdicts: result.verdicts, score: result.score, confirmedAt: now.toISOString() });
  try {
    // 二重に確定して、復習に二度記録しないようにする
    await ddb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: confirmed,
        ConditionExpression: "#s = :s",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: { ":s": r.status },
      }),
    );
  } catch (e) {
    if ((e as Error).name === "ConditionalCheckFailedException") throw new HttpError(409, "ほかの画面で確定されました");
    throw e;
  }

  const today = studyDate(now);
  const items = await loadItems();
  for (const q of r.questions) {
    await recordResult(r.childId, { itemId: q.itemId, kanji: q.kanji, type: q.type, text: q.text }, result.verdicts[q.no] === "correct", today, items);
  }
  return toTest(confirmed);
}

/** 子どもが見る、確定したテストの結果（K-07、TST-11）。新しい月が先 */
export async function myResults(caller: Caller): Promise<TestResult[]> {
  const rows = await queryUserPrefix<TestRecord>(caller.sub, "MTEST#");
  return rows
    .filter((r) => r.status === "confirmed" && r.verdicts)
    .sort((a, b) => b.month.localeCompare(a.month))
    .map((r) => ({
      month: r.month,
      title: r.title,
      score: r.score ?? 0,
      total: r.questions.length,
      missed: [...new Set(r.questions.filter((q) => r.verdicts?.[q.no] !== "correct").map((q) => q.kanji))],
    }));
}
