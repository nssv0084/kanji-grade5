import type { ItemType } from "../../../shared/items/text";
import type { ItemStatus } from "../../../shared/types";
import { keys, putItem, queryAll } from "./db";

// 問題（ITEM#）の読み書き

export interface ItemRecord {
  itemId: string;
  kanji: string;
  type: ItemType;
  text: string;
  status: ItemStatus;
  source: string;
  createdAt: string;
  model?: string;
  /** 保護者が承認したか（LVL-04 の承認数に数える） */
  approvedBy?: "parent";
  reviewedAt?: string;
}

export async function itemsByStatus(statuses: ItemStatus[]): Promise<ItemRecord[]> {
  const out: ItemRecord[] = [];
  for (const type of ["write", "read"]) {
    for (const status of statuses) {
      out.push(
        ...(await queryAll<ItemRecord>({
          IndexName: "gsi1",
          KeyConditionExpression: "gsi1pk = :p",
          ExpressionAttributeValues: { ":p": `ITEMS#${type}#${status}` },
        })),
      );
    }
  }
  return out;
}

export async function saveItem(item: ItemRecord): Promise<void> {
  await putItem({
    ...keys.item(item.itemId),
    ...item,
    gsi1pk: `ITEMS#${item.type}#${item.status}`,
    gsi1sk: `${item.kanji}#${item.createdAt}`,
  });
}

/** 保護者が承認した AI の問題の数（LVL-04）。生成の品質を確かめるための数なので、手作業で作った問題は数えない */
export function parentApprovedCount(items: ItemRecord[], type: ItemType): number {
  return items.filter((i) => i.type === type && i.status === "approved" && i.source === "ai" && i.approvedBy === "parent").length;
}
