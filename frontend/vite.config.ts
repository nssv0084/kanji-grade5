import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const SAMPLES_DIR = join(import.meta.dirname, "../samples");
const MAX_BYTES = 20 * 1024 * 1024;

// 試作（ステップ1）の記録を、スマホから PC の samples/ に送る受け口。開発サーバーのときだけ動く。
// samples/ は .gitignore 済み（子どもの筆跡をリポジトリに入れない）
function samplesReceiver(): Plugin {
  return {
    name: "samples-receiver",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__samples", (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end();
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        req.on("data", (c: Buffer) => {
          size += c.length;
          if (size > MAX_BYTES) req.destroy();
          else chunks.push(c);
        });
        req.on("end", () => {
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { samples?: unknown[] };
            if (!Array.isArray(body.samples)) throw new Error("samples がありません");
            mkdirSync(SAMPLES_DIR, { recursive: true });
            const name = `kanji-samples-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
            writeFileSync(join(SAMPLES_DIR, name), JSON.stringify(body, null, 1));
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ saved: name, count: body.samples.length }));
          } catch (e) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: (e as Error).message }));
          }
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), samplesReceiver()],
  // 同じ Wi-Fi のスマホから開けるようにする（試作の確認用）
  server: { host: true },
});
