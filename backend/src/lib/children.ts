import { CognitoIdentityProviderClient, ListUsersInGroupCommand } from "@aws-sdk/client-cognito-identity-provider";
import { CHILD_GROUP } from "./auth";

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
