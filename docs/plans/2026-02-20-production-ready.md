# Production-Ready Monorepo Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make @zama-fhe/token-sdk and @zama-fhe/token-react-sdk publishable to npm with proper ESM builds, type declarations, changesets versioning, and GitHub Actions CI/CD.

**Architecture:** tsup builds each package to ESM + .d.ts in `dist/`. Changesets manages versioning across both packages. GitHub Actions runs CI on PR and auto-publishes on merge to main.

**Tech Stack:** tsup, @changesets/cli, GitHub Actions, ESLint flat config, Prettier

---

### Task 1: Install build tooling

**Files:**
- Modify: `package.json` (root)

**Step 1: Install tsup, prettier, and changesets**

Run:
```bash
pnpm add -Dw tsup @changesets/cli @changesets/changelog-github prettier eslint-config-prettier
```

**Step 2: Verify installation**

Run: `pnpm ls tsup @changesets/cli prettier --depth 0`
Expected: All three listed

**Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add tsup, changesets, and prettier"
```

---

### Task 2: Configure tsup for token-sdk

**Files:**
- Create: `packages/token-sdk/tsup.config.ts`
- Modify: `packages/token-sdk/package.json`

**Step 1: Create tsup config**

Create `packages/token-sdk/tsup.config.ts`:
```ts
import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "viem/index": "src/viem/index.ts",
    "ethers/index": "src/ethers/index.ts",
    "node/index": "src/node/index.ts",
  },
  format: ["esm"],
  dts: true,
  splitting: true,
  clean: true,
  outDir: "dist",
  external: ["viem", "ethers", "@zama-fhe/relayer-sdk"],
  treeshake: true,
});
```

**Step 2: Update package.json**

Replace `packages/token-sdk/package.json` with:
```json
{
  "name": "@zama-fhe/token-sdk",
  "version": "0.1.0",
  "description": "TypeScript SDK for Zama confidential ERC-20 tokens (fhEVM)",
  "license": "BSD-3-Clause",
  "repository": {
    "type": "git",
    "url": "https://github.com/zama-ai/token-sdk",
    "directory": "packages/token-sdk"
  },
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./viem": {
      "types": "./dist/viem/index.d.ts",
      "import": "./dist/viem/index.js"
    },
    "./ethers": {
      "types": "./dist/ethers/index.d.ts",
      "import": "./dist/ethers/index.js"
    },
    "./node": {
      "types": "./dist/node/index.d.ts",
      "import": "./dist/node/index.js"
    }
  },
  "files": ["dist", "README.md"],
  "scripts": {
    "build": "tsup"
  },
  "devDependencies": {
    "@zama-fhe/relayer-sdk": "0.4.1"
  },
  "peerDependencies": {
    "viem": ">=2",
    "ethers": ">=6",
    "@zama-fhe/relayer-sdk": ">=0.4"
  },
  "peerDependenciesMeta": {
    "viem": { "optional": true },
    "ethers": { "optional": true },
    "@zama-fhe/relayer-sdk": { "optional": true }
  }
}
```

**Step 3: Build and verify**

Run: `pnpm --filter @zama-fhe/token-sdk build`
Expected: `dist/` directory created with `index.js`, `index.d.ts`, `viem/index.js`, `viem/index.d.ts`, `ethers/index.js`, `ethers/index.d.ts`, `node/index.js`, `node/index.d.ts`

Run: `ls packages/token-sdk/dist/ packages/token-sdk/dist/viem/ packages/token-sdk/dist/ethers/ packages/token-sdk/dist/node/`
Expected: `.js` and `.d.ts` files in each

**Step 4: Commit**

```bash
git add packages/token-sdk/tsup.config.ts packages/token-sdk/package.json
git commit -m "feat(token-sdk): add tsup build config and npm exports"
```

---

### Task 3: Configure tsup for token-react-sdk

**Files:**
- Create: `packages/token-react-sdk/tsup.config.ts`
- Modify: `packages/token-react-sdk/package.json`

**Step 1: Create tsup config**

Create `packages/token-react-sdk/tsup.config.ts`:
```ts
import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "viem/index": "src/viem/index.ts",
    "ethers/index": "src/ethers/index.ts",
    "wagmi/index": "src/wagmi/index.ts",
  },
  format: ["esm"],
  dts: true,
  splitting: true,
  clean: true,
  outDir: "dist",
  external: [
    "react",
    "react-dom",
    "@tanstack/react-query",
    "viem",
    "ethers",
    "wagmi",
    "@zama-fhe/token-sdk",
    "@zama-fhe/relayer-sdk",
  ],
  treeshake: true,
  banner: {
    js: '"use client";',
  },
});
```

Note: `banner: { js: '"use client"' }` marks all chunks as client components since this is a React hooks library.

**Step 2: Update package.json**

Replace `packages/token-react-sdk/package.json` with:
```json
{
  "name": "@zama-fhe/token-react-sdk",
  "version": "0.1.0",
  "description": "React hooks for Zama confidential ERC-20 tokens (fhEVM)",
  "license": "BSD-3-Clause",
  "repository": {
    "type": "git",
    "url": "https://github.com/zama-ai/token-sdk",
    "directory": "packages/token-react-sdk"
  },
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./viem": {
      "types": "./dist/viem/index.d.ts",
      "import": "./dist/viem/index.js"
    },
    "./ethers": {
      "types": "./dist/ethers/index.d.ts",
      "import": "./dist/ethers/index.js"
    },
    "./wagmi": {
      "types": "./dist/wagmi/index.d.ts",
      "import": "./dist/wagmi/index.js"
    }
  },
  "files": ["dist", "README.md"],
  "scripts": {
    "build": "tsup"
  },
  "dependencies": {
    "@zama-fhe/token-sdk": "workspace:*"
  },
  "peerDependencies": {
    "react": ">=18",
    "@tanstack/react-query": ">=4",
    "ethers": ">=6",
    "viem": ">=2",
    "wagmi": ">=2"
  },
  "peerDependenciesMeta": {
    "ethers": { "optional": true },
    "viem": { "optional": true },
    "wagmi": { "optional": true }
  }
}
```

**Step 3: Build and verify**

Run: `pnpm --filter @zama-fhe/token-sdk build && pnpm --filter @zama-fhe/token-react-sdk build`
Expected: `dist/` directory created with `index.js`, `index.d.ts`, `viem/index.js`, `ethers/index.js`, `wagmi/index.js` and their `.d.ts` files

**Step 4: Commit**

```bash
git add packages/token-react-sdk/tsup.config.ts packages/token-react-sdk/package.json
git commit -m "feat(token-react-sdk): add tsup build config and npm exports"
```

---

### Task 4: Add root build and format scripts

**Files:**
- Modify: `package.json` (root)
- Create: `.prettierrc`
- Create: `eslint.config.mjs`

**Step 1: Update root package.json scripts**

Add to the `"scripts"` section of root `package.json`:
```json
{
  "scripts": {
    "build": "pnpm --filter @zama-fhe/token-sdk build && pnpm --filter @zama-fhe/token-react-sdk build",
    "test": "vitest",
    "test:run": "vitest run",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "changeset": "changeset",
    "version-packages": "changeset version",
    "release": "pnpm build && changeset publish"
  }
}
```

**Step 2: Create .prettierrc**

Create `.prettierrc`:
```json
{
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2
}
```

**Step 3: Create .prettierignore**

Create `.prettierignore`:
```
dist
node_modules
pnpm-lock.yaml
coverage
*.tsbuildinfo
```

**Step 4: Create eslint.config.mjs**

Create `eslint.config.mjs`:
```js
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ["**/dist/**", "**/node_modules/**", "coverage/**"],
  },
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
);
```

**Step 5: Install eslint deps**

Run:
```bash
pnpm add -Dw @eslint/js typescript-eslint eslint-config-prettier
```

**Step 6: Verify all scripts work**

Run: `pnpm build`
Expected: Both packages build successfully

Run: `pnpm test:run`
Expected: All 162 tests pass

Run: `pnpm format:check`
Expected: Lists formatted/unformatted files (ok if some need formatting)

**Step 7: Commit**

```bash
git add package.json .prettierrc .prettierignore eslint.config.mjs pnpm-lock.yaml
git commit -m "chore: add root build, lint, and format scripts"
```

---

### Task 5: Initialize changesets

**Files:**
- Create: `.changeset/config.json`

**Step 1: Initialize changesets**

Run: `pnpm changeset init`
Expected: Creates `.changeset/` directory with `config.json` and `README.md`

**Step 2: Update changeset config for linked versioning**

Replace `.changeset/config.json` with:
```json
{
  "$schema": "https://unpkg.com/@changesets/config@3.1.1/schema.json",
  "changelog": "@changesets/changelog-github",
  "commit": false,
  "fixed": [["@zama-fhe/token-sdk", "@zama-fhe/token-react-sdk"]],
  "linked": [],
  "access": "public",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "ignore": []
}
```

Note: `"fixed"` means both packages always get the same version number. `"access": "public"` is required for scoped packages on npm.

**Step 3: Verify**

Run: `pnpm changeset status`
Expected: No changesets found (clean state)

**Step 4: Commit**

```bash
git add .changeset/
git commit -m "chore: initialize changesets with fixed versioning"
```

---

### Task 6: Create GitHub Actions CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

**Step 1: Create CI workflow**

Create `.github/workflows/ci.yml`:
```yaml
name: CI

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      - run: pnpm build

      - run: pnpm typecheck

      - run: pnpm test:run

      - run: pnpm lint

      - run: pnpm format:check
```

**Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add CI workflow for build, test, lint, and format"
```

---

### Task 7: Create GitHub Actions release workflow

**Files:**
- Create: `.github/workflows/release.yml`

**Step 1: Create release workflow**

Create `.github/workflows/release.yml`:
```yaml
name: Release

on:
  push:
    branches: [main]

concurrency: ${{ github.workflow }}-${{ github.ref }}

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
      id-token: write
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
          registry-url: "https://registry.npmjs.org"

      - run: pnpm install --frozen-lockfile

      - run: pnpm build

      - name: Create Release PR or Publish
        id: changesets
        uses: changesets/action@v1
        with:
          publish: pnpm release
          version: pnpm version-packages
          title: "chore: version packages"
          commit: "chore: version packages"
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

Note: Requires `NPM_TOKEN` secret in the GitHub repo settings.

**Step 2: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: add release workflow with changesets"
```

---

### Task 8: Add package tsconfig for build (separate from root typecheck config)

**Files:**
- Create: `packages/token-sdk/tsconfig.build.json`
- Create: `packages/token-react-sdk/tsconfig.build.json`

Each package needs a build-specific tsconfig that tsup uses for declaration generation. The existing tsconfigs point `main` at `./src/index.ts` which is fine for development but the build tsconfigs exclude test files.

**Step 1: Create token-sdk tsconfig.build.json**

Create `packages/token-sdk/tsconfig.build.json`:
```json
{
  "extends": "./tsconfig.json",
  "exclude": ["node_modules", "**/__tests__/**", "**/*.test.ts"]
}
```

**Step 2: Create token-react-sdk tsconfig.build.json**

Create `packages/token-react-sdk/tsconfig.build.json`:
```json
{
  "extends": "./tsconfig.json",
  "exclude": ["node_modules", "**/__tests__/**", "**/*.test.ts", "**/*.test.tsx"]
}
```

**Step 3: Update tsup configs to use build tsconfigs**

Add `tsconfig: "tsconfig.build.json"` to both `tsup.config.ts` files.

For `packages/token-sdk/tsup.config.ts`, add:
```ts
  tsconfig: "tsconfig.build.json",
```

For `packages/token-react-sdk/tsup.config.ts`, add:
```ts
  tsconfig: "tsconfig.build.json",
```

**Step 4: Rebuild and verify**

Run: `pnpm build`
Expected: Both packages build without errors

Run: `pnpm test:run`
Expected: All 162 tests still pass

**Step 5: Commit**

```bash
git add packages/token-sdk/tsconfig.build.json packages/token-react-sdk/tsconfig.build.json packages/token-sdk/tsup.config.ts packages/token-react-sdk/tsup.config.ts
git commit -m "chore: add build tsconfigs excluding test files"
```

---

### Task 9: Final verification

**Step 1: Clean build from scratch**

Run:
```bash
rm -rf packages/token-sdk/dist packages/token-react-sdk/dist
pnpm build
```
Expected: Both packages build cleanly

**Step 2: Run full CI pipeline locally**

Run:
```bash
pnpm build && pnpm typecheck && pnpm test:run && pnpm lint
```
Expected: All pass

**Step 3: Verify npm pack contents**

Run:
```bash
cd packages/token-sdk && pnpm pack --dry-run && cd ../..
cd packages/token-react-sdk && pnpm pack --dry-run && cd ../..
```
Expected: Only `dist/` files and `README.md` listed (no `src/` files)

**Step 4: Commit any remaining changes**

```bash
git add -A
git commit -m "chore: production-ready monorepo setup complete"
```
