import { defineConfig } from "vite";

// Set VITE_BASE=/<repo>/ when building for GitHub Pages.
export default defineConfig({
  base: process.env.VITE_BASE ?? "/",
});
