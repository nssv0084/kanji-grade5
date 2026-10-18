// デプロイ先の固定値。別アカウントの認証情報でデプロイしようとすると CDK が止まるよう、accountId を必ず設定する
// 英検アプリ（eiken-pre2）と同じアカウントに、名前を Kanji / kanji で分けて置く
export const config = {
  // アプリ用AWSアカウントの12桁のID（英検アプリと共用）
  accountId: "302961875808",
  // npm スクリプト（infra/package.json）の --profile と同じ名前にする
  awsProfile: "eiken",
  region: "ap-northeast-1",
  hostedZoneName: "ikehiroki.com",
  hostedZoneId: "Z08040743939C4B65P3YE",
  domainName: "kanji.ikehiroki.com",
  monthlyBudgetUsd: 5,
  // GitHub Actions のデプロイを許可するリポジトリの OIDC subject 接頭辞（gh api repos/OWNER/REPO/actions/oidc/customization/sub の sub_claim_prefix）
  githubSubjectPrefix: "repo:nssv0084@218323109/kanji-grade5@1423882633",
};

// 予算アラートとエラー通知の送り先。リポジトリは公開のため、ここには書かず環境変数 ALERT_EMAIL で渡す（NFR-07）。
// 手元: $env:ALERT_EMAIL = "..." / GitHub Actions: リポジトリの Secret ALERT_EMAIL。空なら通知を作らない
export const alertEmail = process.env.ALERT_EMAIL ?? "";

export type AppConfig = typeof config;
