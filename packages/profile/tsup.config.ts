import { defineConfig } from "tsup";
import pkg from "./package.json";

export default defineConfig([
  {
    entry: ["src/index.tsx"],
    format: ["cjs", "esm"],
    dts: true,
    clean: true,
    sourcemap: true,
    external: ["react", "react-dom", "react/jsx-runtime"],
    define: { __STAWI_PROFILE_VERSION__: JSON.stringify(pkg.version) },
  },
  {
    entry: { "profile.iife": "src/bootstrap.ts" },
    format: ["iife"],
    globalName: "StawiProfile",
    noExternal: [/.*/],
    minify: true,
    sourcemap: false,
    define: { __STAWI_PROFILE_VERSION__: JSON.stringify(pkg.version) },
  },
]);
