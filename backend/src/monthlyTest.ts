import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";
import { studyDate } from "../../shared/study/dates";
import { composeTest, defaultCounts, isLastWeek, testTitle } from "../../shared/test/compose";
import type { MonthlyTest, TestsResponse } from "../../shared/types";
import { listChildren } from "./lib/children";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, getItem, keys, queryUserPrefix, TABLE_NAME } from "./lib/db";
import { HttpError, parseBody } from "./lib/http";
import { loadItems, loadKanji, loadPlan, loadQuestions } from "./study";

// 月例テスト（TST-03〜06、TST-13）。保護者が作り、問題と並びを保存する。PDF は画面で作る

type TestRecord = MonthlyTest & { pk: string; sk: string; gsi1pk: string; gsi1sk: string };

const toTest = ({ childId, month, title, status, createdAt, questions }: TestRecord): MonthlyTest => ({ childId, month, title, status, createdAt, questions });

export async function listTests(now = new Date()): Promise<TestsResponse> {
  const date = studyDate(now);
  const children = await listChildren();
  return {
    month: date.slice(0, 7),
    reminder: isLastWeek(date),
    children: await Promise.all(
      children.map(async (c) => ({
        childId: c.sub,
        nickname: c.nickname,
        tests: (await queryUserPrefix<TestRecord>(c.sub, "MTEST#")).map(toTest).sort((a, b) => b.month.localeCompare(a.month)),
      })),
    ),
  };
}

export async function createTest(event: APIGatewayProxyEventV2WithJWTAuthorizer, now = new Date()): Promise<MonthlyTest> {
  const { childId } = parseBody(event.body, event.isBase64Encoded) as { childId?: unknown };
  if (typeof childId !== "string" || !(await listChildren()).some((c) => c.sub === childId)) throw new HttpError(400, "子どもが見つかりません");

  const today = studyDate(now);
  const month = today.slice(0, 7);
  const key = keys.monthlyTest(childId, month);
  if (await getItem(key)) throw new HttpError(409, "今月のテストはもう作ってあります");

  const plan = await loadPlan(childId);
  if (!plan) throw new HttpError(400, "学習計画が登録されていません");
  const [items, kanji, questions] = await Promise.all([loadItems(), loadKanji(childId), loadQuestions(childId)]);
  const picked = composeTest({ plan, month, today, items, kanji, questions, counts: defaultCounts(plan, today) });
  if (picked.length === 0) throw new HttpError(400, "出せる問題がありません");

  const test: MonthlyTest = { childId, month, title: testTitle(month), status: "created", createdAt: now.toISOString(), questions: picked };
  try {
    // 2台から同時に押しても、1つの月に1回だけ作る
    await ddb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: { ...key, ...test, gsi1pk: `MTESTS#${test.status}`, gsi1sk: test.createdAt },
        ConditionExpression: "attribute_not_exists(pk)",
      }),
    );
  } catch (e) {
    if ((e as Error).name === "ConditionalCheckFailedException") throw new HttpError(409, "今月のテストはもう作ってあります");
    throw e;
  }
  return test;
}
