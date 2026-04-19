import { defineConfig } from "tsup";
import pkg from "./package.json";

const copyCallback =
  "node -e \"require('fs').copyFileSync('public/auth-callback.html', 'dist/auth-callback.html')\"";

export default defineConfig([
  {
    entry: ["src/index.tsx"],
    format: ["cjs", "esm"],
    dts: true,
    clean: true,
    sourcemap: true,
    external: ["react", "react-dom", "react/jsx-runtime"],
    define: { __STAWI_PROFILE_VERSION__: JSON.stringify(pkg.version) },
    onSuccess: copyCallback,
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
