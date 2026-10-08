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

export const sharedResolve = {
  dedupe: ["wagmi", "react", "react-dom", "@tanstack/react-query"],
  alias: [
    {
      find: /^@zama-fhe\/sdk\/cleartext$/,
      replacement: path.resolve(root, "./packages/sdk/src/cleartext/index.ts"),
    },
    { find: /^@zama-fhe\/sdk\/(.+)/, replacement: path.resolve(root, "./packages/sdk/src/$1") },
    { find: "@zama-fhe/sdk", replacement: path.resolve(root, "./packages/sdk/src") },
    {
      find: /^@zama-fhe\/react-sdk\/(.+)/,
      replacement: path.resolve(root, "./packages/react-sdk/src/$1"),
    },
    { find: /^@zama-fhe\/react-sdk$/, replacement: path.resolve(root, "./packages/react-sdk/src") },
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
};
