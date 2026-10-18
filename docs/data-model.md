# データ設計（DynamoDB・S3）

- 関連: [要件定義書](requirements.md)

英検アプリと同じく、テーブルは1つ（単一テーブル設計）。キーは `pk`、`sk`。一覧用の GSI を1つ（`gsi1pk`、`gsi1sk`）持ち、一覧に載せたい項目だけ書き込む（スパースインデックス）。

漢字そのものの情報（学年、読み、筆順の手本）はテーブルに持たず、KANJIDIC2・KanjiVG から抜き出したデータを `shared/` に同梱する。

## エンティティ

| エンティティ | pk | sk | gsi1pk | gsi1sk | 内容 |
|---|---|---|---|---|---|
| 問題（Item） | `ITEM#{itemId}` | `META` | `ITEMS#{type}#{status}` | `{kanji}#{createdAt}` | 対象の漢字、問題文、答え、選択肢、元の写真、生成情報 |
| ユーザー | `USER#{sub}` | `PROFILE` | `USERS#{role}` | `{username}` | ニックネーム、連続学習日数、覚えた字数などの集計 |
| 習った漢字・定着度 | `USER#{sub}` | `KANJI#{kanji}` | — | — | 習った日、定着度、形式別の解答数・正答数、直近の結果、最後に出題した日 |
| 日別の学習量 | `USER#{sub}` | `DAY#{date}` | — | — | 日別の解答数・正答数（形式別） |
| 解答履歴 | `USER#{sub}` | `ANS#{timestamp}#{itemId}` | — | — | 選んだ答え・入力した読み・照合の結果（スコア、書き順の正誤）、子どもが自分で○×を選んだか（HWR-03、HWR-10） |
| 問題ごとの状態 | `USER#{sub}` | `QS#{itemId}` | `REVIEW#{sub}`（復習中のみ） | `{nextReviewDate}` | 解答回数、連続正解数、復習の予定日 |
| その日の学習 | `USER#{sub}` | `SESSION#{date}` | — | — | その日のセット構成と、どこまで解いたか |
| まとめテスト | `USER#{sub}` | `TEST#{timestamp}` | — | — | 出題した問題、解答、得点 |
| 写真の取り込み | `IMPORT#{importId}` | `META` | `IMPORTS` | `{createdAt}` | 写真の S3 キー、状態、読み取り結果（漢字・読み・熟語）、確定日時 |
| 申し立て | `APPEAL#{appealId}` | `META` | `APPEALS#{status}` | `{createdAt}` | 問題、手書きの画像の S3 キー、照合のスコア、保護者の判断 |
| 問題の報告 | `REPORT#{reportId}` | `META` | `REPORTS#{status}` | `{createdAt}` | 問題、理由、コメント |
| 生成ジョブ | `JOB#{jobId}` | `META` | `JOBS` | `{createdAt}` | 種類（読み取り・生成）、対象の漢字、状態、作れた数、費用 |
| 保護者の承認数 | `STATS` | `APPROVED#{type}` | — | — | 確認の進み具合（LVL-04） |
| API 使用額 | `USAGE` | `TOTAL#{yyyy-mm}` | — | — | 月ごとの累計費用（マイクロドル単位の整数） |
| API 使用記録 | `USAGE` | `LOG#{timestamp}` | — | — | 用途、モデル、トークン数、費用 |
| 設定 | `SETTINGS` | `GLOBAL` | — | — | 予算、用途別のモデル、問題数、上限、アラート日数 |

## 主な読み方

| 用途 | 読み方 |
|---|---|
| 出題できる問題 | GSI `ITEMS#{type}#approved` を `begins_with(gsi1sk, "{kanji}#")` で Query |
| 習った漢字と定着度（漢字マップ） | `USER#{sub}` を `begins_with(sk, "KANJI#")` で Query（最大193件） |
| 今日の復習 | GSI `REVIEW#{sub}` を `gsi1sk <= 今日` で Query |
| 確認待ち | GSI `ITEMS#{type}#review`、`APPEALS#open`、`REPORTS#open`、`IMPORTS` を Query |

## 問題の状態（status）

英検アプリと同じ。`pending`（AI 検証の待ち）、`approved`（出題対象）、`review`（保護者の確認待ち。抜き取り確認の分は出題する）、`reported`（報告あり。出さない）、`disabled`（無効）。

## S3（写真のバケット）

| 接頭辞 | 内容 | 保存期間 |
|---|---|---|
| `imports/{importId}/` | ドリルの写真 | 30日で自動削除（PHO-01） |
| `appeals/{appealId}.png` | 申し立てた手書きの画像 | 90日で自動削除 |

- 非公開（パブリックアクセスをすべてブロック）。アップロード・表示は API が発行する署名付き URL（有効期限5分）で行う。

## バックアップと削除

- ポイントインタイムリカバリを有効にする。
- テーブルとユーザープールはスタックを削除しても残す（RemovalPolicy.RETAIN）。
