import { InvocationType, InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";
import { budgetMicroUsd, STOP_RATIO } from "../../shared/generation/cost";
import { checkItem } from "../../shared/items/check";
import type { AdminItem, AdminOverview, JobSummary } from "../../shared/types";
import { getItem, keys, putItem } from "./lib/db";
import { HttpError, parseBody } from "./lib/http";
import { itemsByStatus, saveItem, type ItemRecord } from "./lib/items";
import { latestJobs, newJob, toJobSummary } from "./lib/jobs";
import { getSettings, monthSpent } from "./lib/usage";

// 保護者の機能（/admin/ 配下。api.ts で保護者だけに限っている）

const toAdminItem = (i: ItemRecord): AdminItem => ({ itemId: i.itemId, kanji: i.kanji, type: i.type, text: i.text, status: i.status, source: i.source, createdAt: i.createdAt });

export async function getOverview(): Promise<AdminOverview> {
  const [settings, spent, review, jobs] = await Promise.all([
    getSettings(),
    monthSpent(),
    itemsByStatus(["review"]),
    latestJobs(5),
  ]);
  return {
    usage: { spentMicroUsd: spent, budgetMicroUsd: budgetMicroUsd(settings), stopRatio: STOP_RATIO, usdJpy: settings.usdJpy },
    reviewCount: review.length,
    jobs: jobs.map(toJobSummary),
  };
}

export async function getReviewItems(): Promise<AdminItem[]> {
  const items = await itemsByStatus(["review"]);
  return items.sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map(toAdminItem);
}

/** 確認待ちの問題を承認・無効化する。文を直すときは機械的な検査をもう一度通す */
export async function reviewItem(event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<AdminItem> {
  const itemId = event.pathParameters?.id ?? "";
  const body = parseBody(event.body, event.isBase64Encoded) as { status?: string; text?: string };
  if (body.status !== "approved" && body.status !== "disabled") throw new HttpError(400, "status は approved か disabled にしてください");
  const item = await getItem<ItemRecord>(keys.item(itemId));
  if (!item) throw new HttpError(404, "問題が見つかりません");

  const next: ItemRecord = { ...item, status: body.status, reviewedAt: new Date().toISOString() };
  if (body.status === "approved") next.approvedBy = "parent";
  if (typeof body.text === "string" && body.text !== item.text) {
    const r = checkItem({ kanji: item.kanji, type: item.type, text: body.text });
    if (r.errors.length || r.warnings.length) throw new HttpError(400, [...r.errors, ...r.warnings].join(" / "));
    next.text = body.text;
  }
  await saveItem(next);
  return toAdminItem(next);
}

/** 生成を始める。生成用の Lambda を非同期で起動し、すぐに返す */
export async function startGeneration(): Promise<JobSummary> {
  const job = newJob("manual");
  await putItem({ ...job });
  await new LambdaClient({}).send(
    new InvokeCommand({
      FunctionName: process.env.GENERATOR_FN_NAME,
      InvocationType: InvocationType.Event,
      Payload: Buffer.from(JSON.stringify({ jobId: job.jobId, trigger: "manual" })),
    }),
  );
  return toJobSummary(job);
}
