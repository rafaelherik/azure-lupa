import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  root: "src/web",
  plugins: [react(), tailwindcss()],
  build: { outDir: "../../dist/web", emptyOutDir: true },
  // DuckDB-Wasm ships its own worker and wasm, imported with ?url; pre-bundling would break those paths.
  optimizeDeps: { exclude: ["@duckdb/duckdb-wasm"] },
  server: {
    port: 5173,
    proxy: { "/api": "http://127.0.0.1:4517" },
  },
});
