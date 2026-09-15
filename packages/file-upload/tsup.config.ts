import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.tsx"],
  format: ["esm", "cjs"],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  external: ["react", "react-dom", "@stawi/auth-runtime"],
  treeshake: true,
  minify: false,
  target: "es2020",
  outDir: "dist",
  platform: "neutral",
});
