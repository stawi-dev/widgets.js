import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const mockServices = resolve(__dirname, "mock-services.ts");

export default defineConfig({
  root: __dirname,
  plugins: [react()],
  resolve: {
    // Swap the network-backed services for the in-memory store so the real
    // IdentityWidgetRoot (auth gate, org gate, tabs) renders unchanged.
    alias: [
      { find: /.*\/services\/identity-client\.js$/, replacement: mockServices },
      {
        find: /.*\/services\/profile-resolver\.js$/,
        replacement: mockServices,
      },
    ],
  },
  server: {
    port: 5181,
    open: true,
  },
});
