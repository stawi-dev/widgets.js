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
    define: { __STAWI_IDENTITY_VERSION__: JSON.stringify(pkg.version) },
  },
  {
    entry: { "identity.iife": "src/bootstrap.ts" },
    format: ["iife"],
    globalName: "StawiIdentity",
    noExternal: [/.*/],
    minify: true,
    sourcemap: false,
    define: { __STAWI_IDENTITY_VERSION__: JSON.stringify(pkg.version) },
  },
]);
