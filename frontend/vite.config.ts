import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // 同じ Wi-Fi のスマホから開けるようにする（試作の確認用）
  server: { host: true },
});
