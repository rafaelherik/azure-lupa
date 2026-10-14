import { defineConfig } from "tsup";

export default defineConfig({
  entry: { cli: "src/server/cli.ts" },
  outDir: "dist/server",
  format: ["esm"],
  platform: "node",
  target: "node20",
  clean: true,
  sourcemap: true,
});
