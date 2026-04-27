import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { resolve } from "node:path";

/**
 * Build du plugin sous forme de bundle ES réutilisable par bimdata-viewer.
 * exceljs est bundlé dans le plugin (pas externe) pour que le consommateur n'ait
 * pas à l'installer.
 *
 * Sortie : dist/cobie-bimdata-viewer-plugin.es.js  (+ .umd.js)
 */
export default defineConfig({
  plugins: [vue()],
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.js"),
      name: "CobieBIMDataPlugin",
      fileName: (format) => `cobie-bimdata-viewer-plugin.${format}.js`,
      formats: ["es", "umd"],
    },
    rollupOptions: {
      external: ["vue", "@bimdata/viewer"],
      output: {
        exports: "named",
        globals: {
          vue: "Vue",
          "@bimdata/viewer": "BIMDataViewer",
        },
      },
    },
  },
});
