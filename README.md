# 小学5年 漢字トレーニング

家庭向けの小学5年生の漢字（193字）学習 Web アプリ。ドリルの写真から問題を作り、書き取りは画面に手書きして判定する。

- 要件: [docs/requirements.md](docs/requirements.md)
- 画面一覧: [docs/screens.md](docs/screens.md)
- データ設計: [docs/data-model.md](docs/data-model.md)

## クレジット

- 漢字の学年: KANJIDIC2（Electronic Dictionary Research and Development Group、CC BY-SA 4.0）https://www.edrdg.org/edrdg/licence.html
- 筆順・筆跡の手本: KanjiVG（Ulrich Apel、CC BY-SA 3.0）https://kanjivg.tagaini.net/
- 常用漢字表の音訓: ウィキペディア日本語版「常用漢字一覧」（CC BY-SA 4.0）https://ja.wikipedia.org/wiki/常用漢字一覧 。常用漢字表（平成22年内閣告示）を元にしたもの

## 構成

| ディレクトリ | 内容 |
|---|---|
| `shared/` | 画面と API で共通の型、漢字データ、日付計算 |
| `backend/` | Lambda（API）。テストは `backend/test/` |
| `frontend/` | 画面（React + Vite） |
| `infra/` | AWS CDK。デプロイ先は `infra/config.ts` |
| `scripts/` | 運用スクリプト |
| `.github/workflows/` | CI（PR ごとに verify）とデプロイ（手動承認つき、OIDC） |
| `.claude/` | Claude Code の hooks とスキル |

## 初回セットアップ

英検アプリと同じ AWS アカウント・プロファイル（`eiken`）を使う。CDK のブートストラップは英検アプリで済んでいる（東京と us-east-1）。

1. `npm install`
2. 予算アラートとエラー通知の送り先を環境変数で渡す（リポジトリは公開のため、ファイルには書かない）: `$env:ALERT_EMAIL = "（メールアドレス）"`
3. デプロイ: `npm run deploy`（`KanjiCert`、`KanjiApp`）。通知の確認メールが届いたら承認する。
4. 請求のコンソールの「コスト配分タグ」で、ユーザー定義タグ `app` を有効にする（予算アラートは `app=kanji` の費用だけを見る。有効になるまで最大24時間）。
5. 保護者アカウントを作る: `.\scripts\create-user.ps1 -Role parent -Username papa -Nickname "パパ" -TempPassword "Temp1234"`（子どもは `-Role child`）
6. `https://kanji.ikehiroki.com` を開き、仮パスワードでログインして自分のパスワードを設定する。
7. Anthropic の API キー（このアプリ専用のキー）を Secrets Manager の `kanji/anthropic-api-key` に登録する（問題の自動生成に使う）。キーを画面や履歴に残さないよう、入力を伏せて渡す:
   ```powershell
   $s = Read-Host "Anthropic の API キー" -AsSecureString
   $k = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))
   aws secretsmanager put-secret-value --secret-id kanji/anthropic-api-key --secret-string $k --profile eiken --region ap-northeast-1
   Remove-Variable k, s
   ```
   Claude Console で、このキーの月の利用上限も設定しておく（外側の安全策）。

### GitHub Actions からのデプロイ（初回のみ）

1. デプロイ用ロールを作る: `npm run deploy:github -w infra`（`KanjiGithub`。OIDC プロバイダーは英検アプリのものを参照する）
2. リポジトリの Secret `ALERT_EMAIL` に通知の送り先を登録する: `gh secret set ALERT_EMAIL`（入力を求められたら貼り付ける）
3. `production` 環境（自分の承認が必須）と、main のブランチ保護（ステータスチェック `verify` が必須）は設定済み。

## 開発

```powershell
npm run typecheck   # 型チェック
npm test            # テスト
npm run dev         # 画面をローカルで起動（http://localhost:5173）
npm run verify      # CI と同じ確認
```

## ライセンス

- コード: MIT
- `shared/` の漢字データ（KANJIDIC2・KanjiVG・ウィキペディア「常用漢字一覧」から作ったもの）: 元データに合わせて CC BY-SA
