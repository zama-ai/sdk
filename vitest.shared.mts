import { defaultClientConditions, defaultServerConditions } from "vite";
import type { Plugin } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));

export function iifeStub(): Plugin {
  return {
    name: "iife-stub",
    enforce: "pre",
    resolveId(source) {
      if (source.endsWith("?iife")) {
        return `\0${source}`;
      }
      return null;
    },
    load(id) {
      if (id.startsWith("\0") && id.endsWith("?iife")) {
        return "export default ''; export const filename = 'stub.worker.js';";
      }
      return null;
    },
  };
}

// Setting `conditions` replaces Vite's defaults, so both lists extend them.
const sourceCondition = "@zama-fhe/source";

export const sharedConfig = {
  resolve: {
    conditions: [sourceCondition, ...defaultClientConditions],
    dedupe: ["wagmi", "react", "react-dom", "@tanstack/react-query"],
    alias: [
      {
        find: /^wagmi\/actions$/,
        replacement: path.resolve(
          root,
          "./packages/react-sdk/node_modules/wagmi/dist/esm/exports/actions.js",
        ),
      },
      {
        find: /^wagmi$/,
        replacement: path.resolve(
          root,
          "./packages/react-sdk/node_modules/wagmi/dist/esm/exports/index.js",
        ),
      },
    ],
  },
  // Vite applies `resolve.conditions` to the client environment only; node-environment tests resolve through `ssr.resolve`.
  ssr: { resolve: { conditions: [sourceCondition, ...defaultServerConditions] } },
};
