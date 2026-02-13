import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["src/index.tsx"],
    format: ["cjs", "esm"],
    dts: true,
    clean: true,
    sourcemap: true,
    external: ["react", "react-dom", "react/jsx-runtime"],
  },
  {
    entry: { "profile-ui.iife": "src/bootstrap.ts" },
    format: ["iife"],
    globalName: "AntinvestorProfileUI",
    noExternal: [/.*/],
    minify: true,
    sourcemap: false,
  },
]);
