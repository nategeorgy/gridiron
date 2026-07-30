import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // 5173 by default; PORT lets a second dev server run alongside the first.
    port: Number(process.env.PORT) || 5173,
  },
});
