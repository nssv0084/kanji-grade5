import { randomUUID } from "node:crypto";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { JobSummary } from "../../../shared/types";
import { ddb, TABLE_NAME } from "./db";

// 生成ジョブ（JOB#）の記録

export interface JobRecord extends JobSummary {
  pk: string;
  sk: string;
  gsi1pk: "JOBS";
  gsi1sk: string;
}

export const jobKey = (jobId: string) => ({ pk: `JOB#${jobId}`, sk: "META" });

export function newJob(trigger: JobSummary["trigger"], jobId = randomUUID()): JobRecord {
  const createdAt = new Date().toISOString();
  return { ...jobKey(jobId), jobId, status: "running", trigger, createdAt, kanji: [], created: 0, rejected: 0, gsi1pk: "JOBS", gsi1sk: createdAt };
}

export function toJobSummary({ pk: _pk, sk: _sk, gsi1pk: _g, gsi1sk: _s, ...j }: JobRecord): JobSummary {
  return j;
}

export async function latestJobs(limit: number): Promise<JobRecord[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: "gsi1",
      KeyConditionExpression: "gsi1pk = :p",
      ExpressionAttributeValues: { ":p": "JOBS" },
      ScanIndexForward: false,
      Limit: limit,
    }),
  );
  return (res.Items ?? []) as JobRecord[];
}
