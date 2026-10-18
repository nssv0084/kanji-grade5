import { App, Tags } from "aws-cdk-lib";
import { alertEmail, config } from "../config";
import { AppStack } from "../lib/app-stack";
import { CertStack } from "../lib/cert-stack";
import { GithubStack } from "../lib/github-stack";

const app = new App();
// 英検アプリと同じアカウントのため、費用をアプリごとに見分けるタグを付ける（予算アラートはこのタグで絞る）
Tags.of(app).add("app", "kanji");

if (!/^\d{12}$/.test(config.accountId)) throw new Error("infra/config.ts の accountId（12桁）を設定してください");
if (!config.hostedZoneId) throw new Error("infra/config.ts の hostedZoneId を設定してください");
// 送り先を渡し忘れたままデプロイすると、予算アラートとエラー通知が黙って消えるため止める。通知なしで作るときは -c allowNoAlert=true
if (!alertEmail && app.node.tryGetContext("allowNoAlert") !== "true") {
  throw new Error("環境変数 ALERT_EMAIL（予算アラートとエラー通知の送り先）を設定してください。GitHub Actions ではリポジトリの Secret ALERT_EMAIL");
}

// CloudFront で使う証明書は us-east-1 に置く必要がある
const cert = new CertStack(app, "KanjiCert", {
  env: { account: config.accountId, region: "us-east-1" },
  crossRegionReferences: true,
  config,
});

new AppStack(app, "KanjiApp", {
  env: { account: config.accountId, region: config.region },
  crossRegionReferences: true,
  config,
  alertEmail,
  certificate: cert.certificate,
});

// GitHub Actions からのデプロイ用ロール。最初の1回だけ手元から `npm run deploy:github -w infra` で作る
new GithubStack(app, "KanjiGithub", {
  env: { account: config.accountId, region: config.region },
  config,
});
