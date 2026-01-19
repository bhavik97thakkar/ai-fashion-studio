import path from "path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  // GitHub Pages usually hosts at /repo-name/
  return {
    base: "/ai-fashion-studio/",
    server: {
      port: 3000,
      host: "0.0.0.0",
    },
    plugins: [react()],
    define: {
      // This ensures that when GitHub Actions runs 'npm run build',
      // it grabs the secret and bakes it into the code.
      "process.env.API_KEY": JSON.stringify(
        env.API_KEY || env.GEMINI_API_KEY || env.VITE_API_KEY,
      ),
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "."),
      },
    },
  };
});
