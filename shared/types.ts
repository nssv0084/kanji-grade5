// 画面と API で共通の型

/** 保護者（parents グループ）か子ども（children グループ） */
export type Role = "parent" | "child";

/** GET /me の応答 */
export interface Me {
  nickname: string;
  role: Role;
}
