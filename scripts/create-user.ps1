# 保護者または子どものアカウントを作成する（管理画面ができるまでの間と、最初の保護者アカウント用）
# 例: .\scripts\create-user.ps1 -Role parent -Username papa -Nickname "パパ" -TempPassword "Temp1234"
#     .\scripts\create-user.ps1 -Role child -Username kanji01 -Nickname "はなこ" -TempPassword "Temp5678"
param(
  [Parameter(Mandatory = $true)][ValidateSet("parent", "child")][string]$Role,
  [Parameter(Mandatory = $true)][string]$Username,
  [Parameter(Mandatory = $true)][string]$Nickname,
  [Parameter(Mandatory = $true)][string]$TempPassword,
  [string]$AwsProfile = "eiken",
  [string]$Region = "ap-northeast-1"
)
$ErrorActionPreference = "Stop"
$group = if ($Role -eq "parent") { "parents" } else { "children" }

npm run check-account -w infra --silent
if ($LASTEXITCODE -ne 0) { exit 1 }

$poolId = aws cloudformation describe-stacks --stack-name KanjiApp --profile $AwsProfile --region $Region `
  --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue" --output text
if (-not $poolId) { throw "KanjiApp スタックの UserPoolId が見つかりません。先にデプロイしてください。" }

aws cognito-idp admin-create-user --user-pool-id $poolId --username $Username `
  --temporary-password $TempPassword --message-action SUPPRESS `
  --user-attributes Name=nickname,Value=$Nickname `
  --profile $AwsProfile --region $Region | Out-Null
if ($LASTEXITCODE -ne 0) { exit 1 }

aws cognito-idp admin-add-user-to-group --user-pool-id $poolId --username $Username --group-name $group `
  --profile $AwsProfile --region $Region
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host "$Username（$group）を作成しました。初回ログイン時にパスワードの変更を求められます。"
