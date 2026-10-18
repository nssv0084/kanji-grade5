import { confirmSignIn, signIn } from "aws-amplify/auth";
import { useState, type FormEvent } from "react";

interface Props {
  onSignedIn: () => void;
}

const authErrorMessage = (e: unknown): string => {
  const name = (e as Error).name;
  if (name === "NotAuthorizedException" || name === "UserNotFoundException") {
    return "ログインIDまたはパスワードがちがいます";
  }
  if (name === "InvalidPasswordException") return "パスワードは8文字以上で、数字を入れてください";
  return "ログインできませんでした。時間をおいてもう一度ためしてください";
};

// C-01 ログイン、C-02 初回パスワード変更（ACC-04）
export function Login({ onSignedIn }: Props) {
  const [step, setStep] = useState<"signIn" | "newPassword">("signIn");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSignIn = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const { isSignedIn, nextStep } = await signIn({ username: username.trim(), password });
      if (isSignedIn) return onSignedIn();
      if (nextStep.signInStep === "CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED") return setStep("newPassword");
      setError("このアカウントではログインできません。おうちの人に聞いてください");
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleNewPassword = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const { isSignedIn } = await confirmSignIn({ challengeResponse: newPassword });
      if (isSignedIn) onSignedIn();
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page">
      <h1>漢字トレーニング</h1>
      {step === "signIn" ? (
        <form className="card stack" onSubmit={handleSignIn}>
          <label className="field">
            <span>ログインID</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              required
            />
          </label>
          <label className="field">
            <span>パスワード</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button className="primary" disabled={busy}>
            ログイン
          </button>
        </form>
      ) : (
        <form className="card stack" onSubmit={handleNewPassword}>
          <p>はじめてのログインです。自分のパスワードを決めてください（8文字以上、数字を入れる）。</p>
          <label className="field">
            <span>新しいパスワード</span>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button className="primary" disabled={busy}>
            決めてはじめる
          </button>
        </form>
      )}
    </main>
  );
}
