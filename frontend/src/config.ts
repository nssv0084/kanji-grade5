export interface RuntimeConfig {
  region: string;
  userPoolId: string;
  userPoolClientId: string;
  apiUrl: string;
}

// デプロイ時に CDK が config.json を書き出す。ローカル開発では public/config.json を置く
export async function loadConfig(): Promise<RuntimeConfig> {
  const res = await fetch("/config.json", { cache: "no-store" });
  if (!res.ok) throw new Error("config.json を読み込めませんでした");
  return res.json();
}
