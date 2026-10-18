# 小学5年 漢字トレーニング

家庭向けの小学5年生の漢字（193字）学習 Web アプリ。ドリルの写真から問題を作り、書き取りは画面に手書きして判定する。

- 要件: [docs/requirements.md](docs/requirements.md)
- 画面一覧: [docs/screens.md](docs/screens.md)
- データ設計: [docs/data-model.md](docs/data-model.md)

## クレジット

- 漢字の学年・読み: KANJIDIC2（Electronic Dictionary Research and Development Group、CC BY-SA 4.0）https://www.edrdg.org/edrdg/licence.html
- 筆順・筆跡の手本: KanjiVG（Ulrich Apel、CC BY-SA 3.0）https://kanjivg.tagaini.net/

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

英検アプリと同じ AWS アカウント・プロファイル（`eiken`）を使う。

1. `npm install`
2. デプロイ: `npm run deploy`（`KanjiCert`、`KanjiApp`）
3. Anthropic の API キー（このアプリ専用のキー）を Secrets Manager の `kanji/anthropic-api-key` に登録する。
4. 保護者アカウントを作る: `.\scripts\create-parent.ps1 -Username papa -Nickname "パパ" -TempPassword "Temp1234"`
5. `https://kanji.ikehiroki.com` を開き、仮パスワードでログインして自分のパスワードを設定する。

### GitHub Actions からのデプロイ（初回のみ）

1. GitHub に非公開リポジトリを作り、push する。
2. デプロイ用ロールを作る: `npm run deploy:github -w infra`（`KanjiGithub`。OIDC プロバイダーは英検アプリのものを参照する）
3. `gh api repos/OWNER/REPO/actions/oidc/customization/sub` の値を `infra/config.ts` の `githubSubjectPrefix` に入れ、もう一度 2 を実行する。
4. リポジトリの設定で、`production` 環境（自分の承認を必須にする）と、main のブランチ保護（ステータスチェック `verify` を必須にする）を作る。

## 開発

```powershell
npm run typecheck   # 型チェック
npm test            # テスト
npm run dev         # 画面をローカルで起動（http://localhost:5173）
npm run verify      # CI と同じ確認
```

## ライセンス

- コード: MIT
- `shared/` の漢字データ（KANJIDIC2・KanjiVG から作ったもの）: 元データに合わせて CC BY-SA
