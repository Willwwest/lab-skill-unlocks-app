import { defineConfig } from "vite";

// Set VITE_BASE=/<repo>/ when building for GitHub Pages.
export default defineConfig({
  base: process.env.VITE_BASE ?? "/",
  build: {
    rollupOptions: {
      output: {
        // ECharts and three.js change rarely; their own chunks stay cached
        // across app updates.
        manualChunks: (id) =>
          /node_modules[\\/](echarts|zrender)[\\/]/.test(id)
            ? "echarts"
            : /node_modules[\\/]three[\\/]/.test(id)
              ? "three"
              : undefined,
      },
    },
  },
});
