import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react()],
    base: "./",                                    // required for file:// in packaged app
    server: {
      port: Number(env.VITE_DEV_PORT) || 5180,
      strictPort: true,
    },
    build: { outDir: "dist" },
  };
});