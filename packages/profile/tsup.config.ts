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
    entry: { "profile.iife": "src/bootstrap.ts" },
    format: ["iife"],
    globalName: "StawiProfile",
    noExternal: [/.*/],
    minify: true,
    sourcemap: false,
  },
]);
