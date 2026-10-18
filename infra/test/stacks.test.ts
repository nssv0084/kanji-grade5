import { readFileSync } from "node:fs";
import { join } from "node:path";
import { App, Tags } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";
import { ROUTE_KEYS } from "../../backend/src/routes";
import { config } from "../config";
import { AppStack } from "../lib/app-stack";
import { CertStack } from "../lib/cert-stack";
import { GithubStack } from "../lib/github-stack";

// テスト用の送り先。実際の送り先は環境変数で渡し、リポジトリには書かない
const TEST_EMAIL = ["alerts", "example.com"].join("@");

// Lambda のバンドル（esbuild）を省いて、構成だけを調べる
function build(alertEmail: string) {
  const app = new App({ context: { "aws:cdk:bundling-stacks": [] } });
  Tags.of(app).add("app", "kanji");
  const cert = new CertStack(app, "Cert", {
    env: { account: config.accountId, region: "us-east-1" },
    crossRegionReferences: true,
    config,
  });
  const appStack = new AppStack(app, "App", {
    env: { account: config.accountId, region: config.region },
    crossRegionReferences: true,
    config,
    alertEmail,
    certificate: cert.certificate,
  });
  const github = new GithubStack(app, "Github", { env: { account: config.accountId, region: config.region }, config });
  return { appT: Template.fromStack(appStack), githubT: Template.fromStack(github) };
}

const { appT, githubT } = build(TEST_EMAIL);

describe("アプリのスタック", () => {
  it("[NFR-04] ルート定義の全経路が API にあり、すべて Cognito の認証つき", () => {
    const routes = appT.findResources("AWS::ApiGatewayV2::Route");
    const keys = Object.values(routes).map((r) => r.Properties.RouteKey as string);
    expect(keys.sort()).toEqual([...ROUTE_KEYS].sort());
    for (const r of Object.values(routes)) {
      expect(r.Properties.AuthorizationType).toBe("JWT");
    }
  });

  it("[NFR-05] データのテーブルとユーザープールは削除時も残り、テーブルは復元可能", () => {
    appT.hasResource("AWS::DynamoDB::GlobalTable", {
      DeletionPolicy: "Retain",
      Properties: { Replicas: Match.arrayWith([Match.objectLike({ PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true } })]) },
    });
    appT.hasResource("AWS::Cognito::UserPool", { DeletionPolicy: "Retain" });
  });

  it("[NFR-04] 画面の保管先は公開されない", () => {
    appT.hasResourceProperties("AWS::S3::Bucket", {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });

  it("[ACC-01] 保護者・子どものグループがあり、自分でアカウントを作れない", () => {
    const names = Object.values(appT.findResources("AWS::Cognito::UserPoolGroup")).map((g) => g.Properties.GroupName);
    expect(names.sort()).toEqual(["children", "parents"]);
    appT.hasResourceProperties("AWS::Cognito::UserPool", {
      AdminCreateUserConfig: Match.objectLike({ AllowAdminCreateUserOnly: true }),
    });
  });

  it("[ACC-06] パスワードは8文字以上で数字を含む", () => {
    appT.hasResourceProperties("AWS::Cognito::UserPool", {
      Policies: { PasswordPolicy: Match.objectLike({ MinimumLength: 8, RequireNumbers: true }) },
    });
  });

  it("独自ドメインを CloudFront に向け、HTTP は HTTPS に転送する", () => {
    appT.hasResourceProperties("AWS::CloudFront::Distribution", {
      DistributionConfig: Match.objectLike({
        Aliases: [config.domainName],
        DefaultCacheBehavior: Match.objectLike({ ViewerProtocolPolicy: "redirect-to-https" }),
      }),
    });
  });

  it("[NFR-06] 予算アラートは、このアプリのタグで絞った費用を見る", () => {
    appT.hasResourceProperties("AWS::Budgets::Budget", {
      Budget: Match.objectLike({ BudgetName: "kanji-app-monthly", CostFilters: { TagKeyValue: ["user:app$kanji"] } }),
    });
  });

  it("[NFR-07] 通知の送り先がなければ通知を作らない", () => {
    const { appT: noAlert } = build("");
    noAlert.resourceCountIs("AWS::Budgets::Budget", 0);
    noAlert.resourceCountIs("AWS::SNS::Topic", 0);
  });

  it("[NFR-07] 通知の送り先のメールアドレスをリポジトリに書かない", () => {
    const email = /[\w.+-]+@[\w-]+\.[\w.]+/;
    for (const f of ["config.ts", "bin/app.ts", "lib/app-stack.ts"]) {
      expect(readFileSync(join(import.meta.dirname, "..", f), "utf8")).not.toMatch(email);
    }
  });

  it("[NFR-04] 英検アプリと同じアカウントのため、名前が kanji で始まる", () => {
    appT.hasResourceProperties("AWS::Cognito::UserPool", { UserPoolName: "kanji-users" });
  });
});

describe("GitHub 連携のスタック", () => {
  it("[NFR-07] 信頼されるのは、このリポジトリの production 環境だけ", () => {
    const roles = Object.values(githubT.findResources("AWS::IAM::Role")).filter((r) => r.Properties.RoleName === "kanji-github-deploy");
    expect(roles).toHaveLength(1);
    const trust = JSON.stringify(roles[0].Properties.AssumeRolePolicyDocument);
    expect(trust).toContain(`${config.githubSubjectPrefix}:environment:production`);
    expect(trust).toContain("sts.amazonaws.com");
    expect(trust).not.toContain('"*"');
  });

  it("OIDC プロバイダーは新しく作らない（英検アプリのものを使う）", () => {
    githubT.resourceCountIs("Custom::AWSCDKOpenIdConnectProvider", 0);
    githubT.resourceCountIs("AWS::IAM::OIDCProvider", 0);
  });

  it("ロール自身の権限は、CDK のロールを引き受けることだけ", () => {
    const policies = Object.values(githubT.findResources("AWS::IAM::Policy")).filter((p) =>
      JSON.stringify(p.Properties.Roles).includes("DeployRole"),
    );
    const statements = policies.flatMap((p) => p.Properties.PolicyDocument.Statement);
    expect(statements).toHaveLength(1);
    expect(statements[0].Action).toBe("sts:AssumeRole");
    expect(JSON.stringify(statements[0].Resource)).toContain("role/cdk-");
  });
});
