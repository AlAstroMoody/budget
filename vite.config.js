import { fileURLToPath, URL } from "node:url";

import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import vueDevTools from "vite-plugin-vue-devtools";
import { VitePWA } from "vite-plugin-pwa";
import UnoCSS from "unocss/vite";
import { visualizer } from "rollup-plugin-visualizer";

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  base: "/budget",
  plugins: [
    vue(),
    vueDevTools(),
    UnoCSS(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "favicon.svg", "favicon-16x16.png", "favicon-32x32.png"],
      manifest: {
        name: "Семейный бюджет",
        short_name: "Бюджет",
        description: "Local-first PWA приложение для управления семейными финансами",
        theme_color: "#2563eb",
        background_color: "#ffffff",
        display: "standalone",
        orientation: "portrait",
        scope: "/budget/",
        start_url: "/budget/",
        categories: ["finance", "productivity"],
        lang: "ru",
        dir: "ltr",
        icons: [
          {
            src: "/favicon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
          {
            src: "/favicon-32x32.png",
            sizes: "32x32",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/favicon-16x16.png",
            sizes: "16x16",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/favicon.ico",
            sizes: "64x64 32x32 24x24 16x16",
            type: "image/x-icon",
          },
        ],
      },
    }),
    mode === "analyze" &&
      visualizer({
        filename: "dist/stats.html",
        open: true,
        gzipSize: true,
        brotliSize: true,
      }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Vue core
          if (id.includes("vue") && !id.includes("unocss")) {
            return "vue";
          }
          // UnoCSS
          if (id.includes("unocss")) {
            return "unocss";
          }
          // Icons
          if (id.includes("@iconify")) {
            return "icons";
          }
          // Excel parsing
          if (id.includes("exceljs") || id.includes("excelParser")) {
            return "excel";
          }
          // PDF parsing
          if (id.includes("pdfjs") || id.includes("pdfParser")) {
            return "pdf";
          }
          // Database
          if (id.includes("idb-keyval")) {
            return "database";
          }
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
}));
