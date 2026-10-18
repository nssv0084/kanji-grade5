import { Amplify } from "aws-amplify";
import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { setApiUrl } from "./api";
import { App } from "./App";
import { loadConfig } from "./config";
import { HandwritingLab } from "./pages/HandwritingLab";
import "./styles.css";

const root = createRoot(document.getElementById("root")!);
const render = (node: ReactNode) => root.render(<StrictMode>{node}</StrictMode>);

loadConfig()
  .then((config) => {
    Amplify.configure({
      Auth: { Cognito: { userPoolId: config.userPoolId, userPoolClientId: config.userPoolClientId } },
    });
    setApiUrl(config.apiUrl);
    render(<App />);
  })
  .catch((e: Error) => {
    // 手元の開発で config.json がないときは、ログインなしで手書き判定の試作だけを開く（スマホでの試し書き用）
    if (import.meta.env.DEV) render(<HandwritingLab />);
    else render(<p className="page error">{e.message}</p>);
  });
