import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), react()],
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
        },
      },
    },
  },
});
