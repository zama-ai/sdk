import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), react()],
  // Pre-bundle the fake encrypt worker's only dependency: discovering it lazily
  // makes the dev server reload the page mid-test.
  optimizeDeps: { include: ["comlink"] },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (/node_modules\/(react|react-dom|react-router)\//.test(id)) {
            return "react";
          }
          if (/node_modules\/(viem|wagmi)\//.test(id)) {
            return "web3";
          }
          return undefined;
        },
      },
    },
  },
});
