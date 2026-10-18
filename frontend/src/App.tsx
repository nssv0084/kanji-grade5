import { getCurrentUser, signOut } from "aws-amplify/auth";
import { useEffect, useState } from "react";
import type { Me } from "../../shared/types";
import { api } from "./api";
import { ChildHome } from "./pages/ChildHome";
import { HandwritingLab } from "./pages/HandwritingLab";
import { Login } from "./pages/Login";

type AuthState = "loading" | "signedOut" | "signedIn";

export function App() {
  const [state, setState] = useState<AuthState>("loading");

  useEffect(() => {
    getCurrentUser()
      .then(() => setState("signedIn"))
      .catch(() => setState("signedOut"));
  }, []);

  const handleSignOut = async () => {
    await signOut();
    setState("signedOut");
  };

  if (state === "loading") return <p className="page muted">読み込み中…</p>;
  if (state === "signedOut") return <Login onSignedIn={() => setState("signedIn")} />;
  return <Home onSignOut={handleSignOut} />;
}

// 子どもは K-01 ホームへ。保護者の画面（ダッシュボード）はステップ6で作るため、今は手書き判定の試作への入口だけを置く
function Home({ onSignOut }: { onSignOut: () => void }) {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState("");
  const [view, setView] = useState<"home" | "lab">("home");

  useEffect(() => {
    api<Me>("GET", "/me")
      .then(setMe)
      .catch((e: Error) => setError(e.message));
  }, []);

  if (view === "lab") return <HandwritingLab onBack={() => setView("home")} />;
  if (me?.role === "child") return <ChildHome nickname={me.nickname} onSignOut={onSignOut} />;

  return (
    <main className="page">
      <h1>漢字トレーニング</h1>
      <section className="card stack">
        {error && <p className="error">{error}</p>}
        {!me && !error && <p className="muted">読み込み中…</p>}
        {me && (
          <p>
            {me.nickname} さん、こんにちは（{me.role === "parent" ? "保護者" : "子ども"}）
          </p>
        )}
        <button type="button" className="primary" onClick={() => setView("lab")}>
          書き取りの練習（試作）
        </button>
        <button type="button" className="secondary" onClick={onSignOut}>
          ログアウト
        </button>
      </section>
    </main>
  );
}
