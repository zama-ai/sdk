# API Extractor Integration — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `@microsoft/api-extractor` for API surface snapshots (`.api.md`) and TSDoc validation across all 8 entry points.

**Architecture:** One shared base config at repo root, 8 entry-point configs (4 per package) that extend it. Reports checked into `etc/` per package. Runs post-build against `.d.ts` files.

**Tech Stack:** `@microsoft/api-extractor` ^7, existing tsup build pipeline.

---

### Task 1: Install api-extractor

**Files:**

- Modify: `package.json` (root)

**Step 1: Install the package**

Run: `pnpm add -Dw @microsoft/api-extractor`

**Step 2: Add scripts to root package.json**

Add to the `scripts` section:

```json
"api-report": "pnpm build && pnpm api-report:sdk && pnpm api-report:react-sdk",
"api-report:sdk": "cd packages/sdk && api-extractor run --local -c api-extractor.json && api-extractor run --local -c api-extractor.viem.json && api-extractor run --local -c api-extractor.ethers.json && api-extractor run --local -c api-extractor.node.json",
"api-report:react-sdk": "cd packages/react-sdk && api-extractor run --local -c api-extractor.json && api-extractor run --local -c api-extractor.viem.json && api-extractor run --local -c api-extractor.ethers.json && api-extractor run --local -c api-extractor.wagmi.json"
```

**Step 3: Add temp dirs to .gitignore**

Append to `.gitignore`:

```
# api-extractor temp files
packages/sdk/temp/
packages/react-sdk/temp/
```

**Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml .gitignore
git commit -m "build: install @microsoft/api-extractor"
```

---

### Task 2: Create base config and SDK entry-point configs

**Files:**

- Create: `api-extractor.base.json`
- Create: `packages/sdk/api-extractor.json`
- Create: `packages/sdk/api-extractor.viem.json`
- Create: `packages/sdk/api-extractor.ethers.json`
- Create: `packages/sdk/api-extractor.node.json`

**Step 1: Create the shared base config**

Create `api-extractor.base.json` at repo root:

```json
{
  "$schema": "https://developer.microsoft.com/json-schemas/api-extractor/v7/api-extractor.schema.json",
  "compiler": {
    "overrideTsconfig": {
      "compilerOptions": {
        "target": "es2022",
        "module": "esnext",
        "moduleResolution": "node",
        "declaration": true,
        "jsx": "react-jsx",
        "strict": true,
        "skipLibCheck": true,
        "paths": {
          "@zama-fhe/sdk": ["./packages/sdk/src"],
          "@zama-fhe/react-sdk": ["./packages/react-sdk/src"]
        }
      }
    }
  },
  "apiReport": {
    "enabled": true,
    "reportFolder": "<projectFolder>/etc/"
  },
  "docModel": {
    "enabled": false
  },
  "dtsRollup": {
    "enabled": false
  },
  "messages": {
    "compilerMessageReporting": {
      "default": { "logLevel": "warning" }
    },
    "extractorMessageReporting": {
      "default": { "logLevel": "warning" },
      "ae-forgotten-export": { "logLevel": "warning", "addToApiReportFile": true },
      "ae-missing-release-tag": { "logLevel": "none" },
      "ae-unresolved-link": { "logLevel": "none" }
    },
    "tsdocMessageReporting": {
      "default": { "logLevel": "warning" }
    }
  }
}
```

Note: `ae-missing-release-tag` is suppressed because we don't use `@public`/`@beta`/`@internal` tags yet. `ae-unresolved-link` is suppressed because `{@link}` targets may not resolve when analyzing a single entry point. `moduleResolution` is overridden from `"bundler"` to `"node"` because api-extractor doesn't support `"bundler"`.

**Step 2: Create SDK main config**

Create `packages/sdk/api-extractor.json`:

```json
{
  "extends": "../../api-extractor.base.json",
  "mainEntryPointFilePath": "<projectFolder>/dist/index.d.ts",
  "apiReport": {
    "enabled": true,
    "reportFileName": "sdk.api.md",
    "reportFolder": "<projectFolder>/etc/"
  }
}
```

**Step 3: Create SDK viem config**

Create `packages/sdk/api-extractor.viem.json`:

```json
{
  "extends": "../../api-extractor.base.json",
  "mainEntryPointFilePath": "<projectFolder>/dist/viem/index.d.ts",
  "apiReport": {
    "enabled": true,
    "reportFileName": "sdk-viem.api.md",
    "reportFolder": "<projectFolder>/etc/"
  }
}
```

**Step 4: Create SDK ethers config**

Create `packages/sdk/api-extractor.ethers.json`:

```json
{
  "extends": "../../api-extractor.base.json",
  "mainEntryPointFilePath": "<projectFolder>/dist/ethers/index.d.ts",
  "apiReport": {
    "enabled": true,
    "reportFileName": "sdk-ethers.api.md",
    "reportFolder": "<projectFolder>/etc/"
  }
}
```

**Step 5: Create SDK node config**

Create `packages/sdk/api-extractor.node.json`:

```json
{
  "extends": "../../api-extractor.base.json",
  "mainEntryPointFilePath": "<projectFolder>/dist/node/index.d.ts",
  "apiReport": {
    "enabled": true,
    "reportFileName": "sdk-node.api.md",
    "reportFolder": "<projectFolder>/etc/"
  }
}
```

**Step 6: Create SDK etc/ directory**

Run: `mkdir -p packages/sdk/etc`

**Step 7: Commit**

```bash
git add api-extractor.base.json packages/sdk/api-extractor*.json
git commit -m "build: add api-extractor base config and SDK entry-point configs"
```

---

### Task 3: Create react-sdk entry-point configs

**Files:**

- Create: `packages/react-sdk/api-extractor.json`
- Create: `packages/react-sdk/api-extractor.viem.json`
- Create: `packages/react-sdk/api-extractor.ethers.json`
- Create: `packages/react-sdk/api-extractor.wagmi.json`

**Step 1: Create react-sdk main config**

Create `packages/react-sdk/api-extractor.json`:

```json
{
  "extends": "../../api-extractor.base.json",
  "mainEntryPointFilePath": "<projectFolder>/dist/index.d.ts",
  "apiReport": {
    "enabled": true,
    "reportFileName": "react-sdk.api.md",
    "reportFolder": "<projectFolder>/etc/"
  }
}
```

**Step 2: Create react-sdk viem config**

Create `packages/react-sdk/api-extractor.viem.json`:

```json
{
  "extends": "../../api-extractor.base.json",
  "mainEntryPointFilePath": "<projectFolder>/dist/viem/index.d.ts",
  "apiReport": {
    "enabled": true,
    "reportFileName": "react-sdk-viem.api.md",
    "reportFolder": "<projectFolder>/etc/"
  }
}
```

**Step 3: Create react-sdk ethers config**

Create `packages/react-sdk/api-extractor.ethers.json`:

```json
{
  "extends": "../../api-extractor.base.json",
  "mainEntryPointFilePath": "<projectFolder>/dist/ethers/index.d.ts",
  "apiReport": {
    "enabled": true,
    "reportFileName": "react-sdk-ethers.api.md",
    "reportFolder": "<projectFolder>/etc/"
  }
}
```

**Step 4: Create react-sdk wagmi config**

Create `packages/react-sdk/api-extractor.wagmi.json`:

```json
{
  "extends": "../../api-extractor.base.json",
  "mainEntryPointFilePath": "<projectFolder>/dist/wagmi/index.d.ts",
  "apiReport": {
    "enabled": true,
    "reportFileName": "react-sdk-wagmi.api.md",
    "reportFolder": "<projectFolder>/etc/"
  }
}
```

**Step 5: Create react-sdk etc/ directory**

Run: `mkdir -p packages/react-sdk/etc`

**Step 6: Commit**

```bash
git add packages/react-sdk/api-extractor*.json
git commit -m "build: add api-extractor configs for react-sdk entry points"
```

---

### Task 4: Generate initial API reports and verify

**Step 1: Build the packages**

Run: `pnpm build`
Expected: Clean build with dist/ output for both packages.

**Step 2: Run api-extractor for SDK**

Run: `pnpm api-report:sdk`
Expected: Generates 4 `.api.md` files in `packages/sdk/etc/`. May show TSDoc warnings — that's OK.

**Step 3: Run api-extractor for react-sdk**

Run: `pnpm api-report:react-sdk`
Expected: Generates 4 `.api.md` files in `packages/react-sdk/etc/`. May show TSDoc warnings — that's OK.

**Step 4: Verify reports exist**

Run: `ls packages/sdk/etc/*.api.md && ls packages/react-sdk/etc/*.api.md`
Expected: 8 files total:

```
packages/sdk/etc/sdk.api.md
packages/sdk/etc/sdk-viem.api.md
packages/sdk/etc/sdk-ethers.api.md
packages/sdk/etc/sdk-node.api.md
packages/react-sdk/etc/react-sdk.api.md
packages/react-sdk/etc/react-sdk-viem.api.md
packages/react-sdk/etc/react-sdk-ethers.api.md
packages/react-sdk/etc/react-sdk-wagmi.api.md
```

**Step 5: Spot-check a report**

Run: `head -30 packages/sdk/etc/sdk.api.md`
Expected: See `## API Report File` header followed by exported symbols like `ZamaSDK`, `Token`, `ReadonlyToken`.

**Step 6: Run existing tests to confirm nothing broke**

Run: `pnpm test:run`
Expected: All 737 tests pass.

**Step 7: Commit the initial reports**

```bash
git add packages/sdk/etc/ packages/react-sdk/etc/
git commit -m "build: generate initial api-extractor reports for all entry points"
```

---

### Task 5: Troubleshoot and fix any api-extractor issues

This task exists because api-extractor is notoriously picky about tsconfig settings and `.d.ts` resolution. If Tasks 2-4 produced errors (not warnings), this task handles debugging.

**Common issues and fixes:**

1. **`moduleResolution: "bundler"` not supported** — Already handled via `overrideTsconfig` in base config.

2. **`ae-wrong-input-file-type` error** — The `.d.ts` file is not in the expected format. Check that `pnpm build` ran successfully and `dist/index.d.ts` exists.

3. **Unresolved external types (viem, ethers, wagmi)** — These are peer deps that may not be installed. Add `"skipLibCheck": true` to the `overrideTsconfig` (already included in base config).

4. **`ae-forgotten-export` warnings** — Symbols used in public API but not explicitly exported. Usually fine for re-exports from external packages. Already set to warning level.

5. **Path resolution failures** — If api-extractor can't resolve `@zama-fhe/sdk` imports in react-sdk, check that the `paths` in `overrideTsconfig` are correct relative to the repo root.

If all went cleanly in Task 4, skip this task entirely.
