import { getCurrentUser, signOut } from "aws-amplify/auth";
import { useEffect, useState } from "react";
import type { Me } from "../../shared/types";
import { api } from "./api";
import { ChildHome } from "./pages/ChildHome";
import { HandwritingLab } from "./pages/HandwritingLab";
import { Login } from "./pages/Login";
import { ParentHome } from "./pages/ParentHome";

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

// 子どもは K-01 ホーム、保護者は問題の作成と確認（P-06）。ダッシュボード全体はステップ6で作る
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
  if (me?.role === "parent") return <ParentHome nickname={me.nickname} onOpenLab={() => setView("lab")} onSignOut={onSignOut} />;

  return (
    <main className="page">
      <h1>漢字トレーニング</h1>
      {error ? <p className="error">{error}</p> : <p className="muted">読み込み中…</p>}
    </main>
  );
}
