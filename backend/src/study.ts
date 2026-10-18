import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";
import { GRADE5_CHARS } from "../../shared/kanji";
import { learnedCount } from "../../shared/study/dashboard";
import { studyDate } from "../../shared/study/dates";
import { newKanjiForDay, planOrder, type Plan } from "../../shared/study/plan";
import { buildSession, siblingForReview, toSets, type KanjiState, type Slot, type StudyItem } from "../../shared/study/session";
import { mastery, nextQuestionState, type QuestionState } from "../../shared/study/srs";
import { currentStreak, isStudyDay, markStudied, milestoneToCelebrate, type Streak } from "../../shared/study/streak";
import type { AnswerRequest, AnswerResponse, KanjiMapEntry, PracticeQuestion, TodayResponse } from "../../shared/types";
import type { Caller } from "./lib/auth";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, getItem, keys, putItem, queryAll, queryUserPrefix, TABLE_NAME } from "./lib/db";
import { HttpError, parseBody } from "./lib/http";

// 子どもの毎日の練習（CUR、REV、MAP、STK）。判断はすべて shared/study の関数で行い、ここでは読み書きだけをする

const KEEP_WRITES = 10;

interface PlanRecord extends Plan {
  pk: string;
  sk: string;
}
interface KanjiRecord extends KanjiState {
  pk: string;
  sk: string;
  kanji: string;
}
interface QuestionRecord extends QuestionState {
  pk: string;
  sk: string;
  itemId: string;
}
interface SessionRecord {
  pk: string;
  sk: string;
  date: string;
  newKanji: string[];
  slots: Slot[];
  answers: { index: number; correct: boolean; selfJudged?: boolean }[];
  done: boolean;
}
interface ProfileRecord extends Streak {
  pk: string;
  sk: string;
  /** お祝いした「覚えた」の字数の区切り（STK-04） */
  celebrated?: number;
}

/** プロフィールの一部だけを書き換える（連続日数とお祝いの記録を互いに消さないため） */
async function updateProfile(sub: string, fields: Partial<Omit<ProfileRecord, "pk" | "sk">>): Promise<void> {
  const names = Object.keys(fields);
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: keys.profile(sub),
      UpdateExpression: `SET ${names.map((n, i) => `#k${i} = :v${i}`).join(", ")}`,
      ExpressionAttributeNames: Object.fromEntries(names.map((n, i) => [`#k${i}`, n])),
      ExpressionAttributeValues: Object.fromEntries(names.map((n, i) => [`:v${i}`, fields[n as keyof typeof fields]])),
    }),
  );
}

export async function loadPlan(sub: string): Promise<Plan | undefined> {
  const plans = await queryUserPrefix<PlanRecord>(sub, "PLAN#");
  return plans.sort((a, b) => b.schoolYear - a.schoolYear)[0];
}

export async function loadKanji(sub: string): Promise<Record<string, KanjiState>> {
  const rows = await queryUserPrefix<KanjiRecord>(sub, "KANJI#");
  return Object.fromEntries(rows.map((r) => [r.kanji, { learnedOn: r.learnedOn, writes: r.writes ?? [], lastAsked: r.lastAsked }]));
}

export async function loadQuestions(sub: string): Promise<Record<string, QuestionState>> {
  const rows = await queryUserPrefix<QuestionRecord>(sub, "QS#");
  return Object.fromEntries(rows.map(({ pk: _pk, sk: _sk, itemId, ...s }) => [itemId, s]));
}

/** 出題できる問題（承認済みと、抜き取り確認中のもの） */
export async function loadItems(): Promise<StudyItem[]> {
  const rows: StudyItem[] = [];
  for (const type of ["write", "read"]) {
    for (const status of ["approved", "review"]) {
      rows.push(
        ...(await queryAll<StudyItem>({
          IndexName: "gsi1",
          KeyConditionExpression: "gsi1pk = :p",
          ExpressionAttributeValues: { ":p": `ITEMS#${type}#${status}` },
        })),
      );
    }
  }
  return rows.map(({ itemId, kanji, type, text }) => ({ itemId, kanji, type, text }));
}

async function saveKanji(sub: string, k: string, s: KanjiState) {
  await putItem({ ...keys.kanji(sub, k), kanji: k, ...s });
}

export async function getToday(caller: Caller, now = new Date()): Promise<TodayResponse> {
  const date = studyDate(now);
  const plan = await loadPlan(caller.sub);
  const profile: Partial<ProfileRecord> & Streak = (await getItem<ProfileRecord>(keys.profile(caller.sub))) ?? { days: 0 };
  const empty = { date, newKanji: [], sets: [], streak: currentStreak(profile, date), learnedCount: 0, masteredCount: 0, total: GRADE5_CHARS.length };
  if (!plan) return { ...empty, needsPlan: true };

  const kanji = await loadKanji(caller.sub);
  let session = await getItem<SessionRecord>(keys.session(caller.sub, date));
  const items = await loadItems();

  if (!session) {
    // 今日の新しい字を「習った」にしてから、練習を組み立てる
    const newKanji = newKanjiForDay(plan, date, learnedCount(plan, kanji));
    for (const k of newKanji) {
      kanji[k] = { ...(kanji[k] ?? { writes: [] }), learnedOn: date };
      await saveKanji(caller.sub, k, kanji[k]);
    }
    const slots = buildSession({ today: date, items, kanji, questions: await loadQuestions(caller.sub) });
    session = { ...keys.session(caller.sub, date), date, newKanji, slots, answers: [], done: slots.length === 0 };
    await putItem({ ...session });
  }

  const byId = new Map(items.map((i) => [i.itemId, i]));
  const answered = new Map(session.answers.map((a) => [a.index, a]));
  const questions: PracticeQuestion[] = session.slots.flatMap((slot, index) => {
    const item = byId.get(slot.itemId);
    if (!item) return [];
    const a = answered.get(index);
    return [{ index, itemId: item.itemId, kanji: item.kanji, type: item.type, text: item.text, reason: slot.reason, answered: a && { correct: a.correct } }];
  });

  const masteredCount = Object.values(kanji).filter((s) => mastery(!!s.learnedOn, s.writes) === "mastered").length;
  // お祝いは1回だけ出す（STK-04）
  const celebrate = milestoneToCelebrate(masteredCount, profile.celebrated);
  if (celebrate) await updateProfile(caller.sub, { celebrated: celebrate });
  return {
    ...empty,
    needsPlan: false,
    newKanji: session.newKanji,
    sets: toSets(questions),
    learnedCount: learnedCount(plan, kanji),
    masteredCount,
    celebrate,
  };
}

function parseAnswer(event: APIGatewayProxyEventV2WithJWTAuthorizer): AnswerRequest {
  const b = parseBody(event.body, event.isBase64Encoded) as Partial<AnswerRequest>;
  if (typeof b.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(b.date)) throw new HttpError(400, "日付が正しくありません");
  if (!Number.isInteger(b.index) || (b.index as number) < 0) throw new HttpError(400, "問題の番号が正しくありません");
  if (typeof b.correct !== "boolean") throw new HttpError(400, "正誤が正しくありません");
  return { date: b.date, index: b.index as number, correct: b.correct, selfJudged: b.selfJudged === true };
}

/**
 * 1問の結果を、問題ごとの復習（REV-01〜04）と漢字の定着度（MAP-01）に記録する。毎日の練習と月例テスト（TST-11）で使う。
 * items を渡すと、間違えたときの同じ字の別の問題を探すのに使う（何問もまとめて記録するとき、毎回読み直さないため）
 */
export async function recordResult(sub: string, item: StudyItem, correct: boolean, today: string, items?: StudyItem[]): Promise<void> {
  const prevQ = await getItem<QuestionRecord>(keys.question(sub, item.itemId));
  const nextQ = nextQuestionState(prevQ, correct, today);
  await putItem({ ...keys.question(sub, item.itemId), itemId: item.itemId, ...nextQ });

  // 書き取りの結果だけを定着度に使う
  const k = await getItem<KanjiRecord>(keys.kanji(sub, item.kanji));
  const writes = k?.writes ?? [];
  if (item.type === "write") writes.push({ date: today, correct });
  await saveKanji(sub, item.kanji, { learnedOn: k?.learnedOn ?? today, writes: writes.slice(-KEEP_WRITES), lastAsked: today });

  // 書き取りで間違えたら、同じ字の別の書き取り問題も翌日の復習に入れる（REV-04）
  if (!correct && item.type === "write") {
    const [all, kanji, questions] = await Promise.all([items ?? loadItems(), loadKanji(sub), loadQuestions(sub)]);
    const sibling = siblingForReview(item, all, kanji, questions);
    if (sibling) {
      const s = nextQuestionState(questions[sibling.itemId], false, today);
      await putItem({ ...keys.question(sub, sibling.itemId), itemId: sibling.itemId, ...s, attempts: questions[sibling.itemId]?.attempts ?? 0, correct: questions[sibling.itemId]?.correct ?? 0 });
    }
  }
}

export async function submitAnswer(caller: Caller, event: APIGatewayProxyEventV2WithJWTAuthorizer, now = new Date()): Promise<AnswerResponse> {
  const req = parseAnswer(event);
  const today = studyDate(now);
  const session = await getItem<SessionRecord>(keys.session(caller.sub, req.date));
  if (!session) throw new HttpError(404, "その日の練習が見つかりません");
  const slot = session.slots[req.index];
  if (!slot) throw new HttpError(400, "問題の番号が正しくありません");
  if (session.answers.some((a) => a.index === req.index)) throw new HttpError(409, "この問題はもう答えています");

  const item = await getItem<StudyItem & { pk: string }>(keys.item(slot.itemId));
  if (!item) throw new HttpError(404, "問題が見つかりません");
  await recordResult(caller.sub, item, req.correct, today);

  session.answers.push({ index: req.index, correct: req.correct, selfJudged: req.selfJudged });
  session.done = session.answers.length >= session.slots.length;
  await putItem({ ...session });

  // 日別の学習量と、連続学習日数（STK-01）
  const day = (await getItem<{ answers: number; correct: number }>(keys.day(caller.sub, today))) ?? { answers: 0, correct: 0 };
  day.answers += 1;
  if (req.correct) day.correct += 1;
  await putItem({ ...keys.day(caller.sub, today), answers: day.answers, correct: day.correct });

  let profile: Streak = (await getItem<ProfileRecord>(keys.profile(caller.sub))) ?? { days: 0 };
  if (isStudyDay(day.answers, session.done && session.date === today)) {
    profile = markStudied(profile, today);
    await updateProfile(caller.sub, { days: profile.days, lastStudyDate: profile.lastStudyDate });
  }
  return { streak: currentStreak(profile, today), done: session.done };
}

export async function getKanjiMap(caller: Caller): Promise<KanjiMapEntry[]> {
  const [plan, kanji] = await Promise.all([loadPlan(caller.sub), loadKanji(caller.sub)]);
  const order = plan ? planOrder(plan) : GRADE5_CHARS;
  return order.map((k) => ({ kanji: k, mastery: mastery(!!kanji[k]?.learnedOn, kanji[k]?.writes ?? []) }));
}
