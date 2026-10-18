import { randomInt } from "node:crypto";
import { AdminSetUserPasswordCommand, CognitoIdentityProviderClient, ListUsersInGroupCommand } from "@aws-sdk/client-cognito-identity-provider";
import { CHILD_GROUP } from "./auth";
import { HttpError } from "./http";

// 子どもに口で伝えやすいよう、見まちがえやすい字（i・l・o、0・1）を除く
const LETTERS = "abcdefghjkmnpqrstuvwxyz";
const DIGITS = "23456789";

/** 仮パスワード（英小文字4字 + 数字4字。パスワード規則 ACC-06 の「8文字以上・数字を含む」を満たす） */
export function temporaryPassword(): string {
  const pick = (chars: string, n: number) => Array.from({ length: n }, () => chars[randomInt(chars.length)]).join("");
  return pick(LETTERS, 4) + pick(DIGITS, 4);
}

/**
 * 子どもの仮パスワードを再発行する（ACC-05）。次のログインで新しいパスワードへの変更を求められる（ACC-04）。
 * 保護者のアカウントは対象にしない。パスワードはログに出さない
 */
export async function resetChildPassword(sub: string): Promise<string> {
  if (!(await listChildren()).some((c) => c.sub === sub)) throw new HttpError(404, "子どもが見つかりません");
  const password = temporaryPassword();
  await new CognitoIdentityProviderClient({}).send(
    new AdminSetUserPasswordCommand({ UserPoolId: process.env.USER_POOL_ID, Username: sub, Password: password, Permanent: false }),
  );
  return password;
}

export interface Child {
  sub: string;
  /** 家族が決めた名前のことがあるため、ログに出さない（ACC-03） */
  nickname: string;
}

/** 子どものアカウントの一覧（家庭向けなので数人。ページ送りはしない） */
export async function listChildren(): Promise<Child[]> {
  const cognito = new CognitoIdentityProviderClient({});
  const res = await cognito.send(new ListUsersInGroupCommand({ UserPoolId: process.env.USER_POOL_ID, GroupName: CHILD_GROUP }));
  return (res.Users ?? []).flatMap((u) => {
    const attr = (name: string) => u.Attributes?.find((a) => a.Name === name)?.Value;
    const sub = attr("sub");
    return sub ? [{ sub, nickname: attr("nickname") ?? "" }] : [];
  });
}
