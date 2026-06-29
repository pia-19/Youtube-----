import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    emptyOutDir: true,
    rollupOptions: {
      // popup.html と content script を同時にビルドします。
      input: {
        popup: "popup.html",
        content: "src/content.ts"
      },
      output: {
        // manifest.json から固定名で参照できるようにします。
        entryFileNames: "[name].js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name][extname]"
      }
    }
  }
});
