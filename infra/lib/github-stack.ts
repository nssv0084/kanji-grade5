import { Duration, Stack, type StackProps } from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import type { Construct } from "constructs";
import type { AppConfig } from "../config";

export class GithubStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps & { config: AppConfig }) {
    super(scope, id, props);
    const { config } = props;

    // OIDC プロバイダーはアカウントに1つしか作れない。英検アプリのスタック（EikenGithub）が作ったものを参照する
    const provider = iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(
      this,
      "GithubOidc",
      `arn:aws:iam::${this.account}:oidc-provider/token.actions.githubusercontent.com`,
    );

    // environment "production"（手動承認つき）のジョブだけが引き受けられる
    const role = new iam.Role(this, "DeployRole", {
      roleName: "kanji-github-deploy",
      maxSessionDuration: Duration.hours(1),
      assumedBy: new iam.WebIdentityPrincipal(provider.openIdConnectProviderArn, {
        StringEquals: {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": `${config.githubSubjectPrefix}:environment:production`,
        },
      }),
    });

    // CDK のデプロイは、ブートストラップが作った専用ロールを引き受けて行う。このロール自体は他の権限を持たない
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ["sts:AssumeRole"],
        resources: [`arn:aws:iam::${this.account}:role/cdk-*`],
      }),
    );
  }
}
