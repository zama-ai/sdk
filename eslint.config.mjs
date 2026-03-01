import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";
import prettierConfig from "eslint-config-prettier";

export default defineConfig([
  globalIgnores([
    "**/dist/**",
    "**/node_modules/**",
    "coverage/**",
    "hardhat/**",
    "packages/test-nextjs/.next/**",
    "packages/test-nextjs/playwright/**",
    "packages/test-vite/playwright/**",
    "packages/playwright-fixtures/**",
    "docs/api/**",
    "tools/**",
  ]),
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,
  {
    files: ["scripts/**/*.mjs", "*.cjs"],
    languageOptions: {
      globals: {
        console: "readonly",
        module: "readonly",
        process: "readonly",
      },
    },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
    },
  },
]);
