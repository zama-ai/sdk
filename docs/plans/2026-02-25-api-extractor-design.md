# API Extractor Integration — Design

**Date:** 2026-02-25
**Status:** Approved

## Problem

The SDK has no mechanism to detect accidental public API surface changes (new exports, removed types, changed signatures). READMEs and TypeDoc catch documentation drift but not API drift. Additionally, `eslint-plugin-tsdoc` is incompatible with ESLint 10, leaving TSDoc syntax unvalidated at lint time.

## Decisions

- **API surface snapshots + TSDoc validation.** No `.d.ts` rollup — tsup already generates clean per-entry-point declarations.
- **One shared base config + 8 entry-point configs** (4 per package).
- **Warnings, not errors** for TSDoc issues initially. Tighten to errors once existing comments are clean.
- **CI integration deferred** to a follow-up.

## Design

### Config Structure

```
api-extractor.base.json              ← shared settings
packages/sdk/
  api-extractor.json                 ← dist/index.d.ts
  api-extractor.viem.json            ← dist/viem/index.d.ts
  api-extractor.ethers.json          ← dist/ethers/index.d.ts
  api-extractor.node.json            ← dist/node/index.d.ts
packages/react-sdk/
  api-extractor.json                 ← dist/index.d.ts
  api-extractor.viem.json            ← dist/viem/index.d.ts
  api-extractor.ethers.json          ← dist/ethers/index.d.ts
  api-extractor.wagmi.json           ← dist/wagmi/index.d.ts
```

### Base Config (`api-extractor.base.json`)

Key settings:

- `apiReport.enabled: true` — generate `.api.md` report files
- `docModel.enabled: false` — skip (TypeDoc handles HTML docs)
- `dtsRollup.enabled: false` — skip (tsup handles declarations)
- `tsdocMessageReporting.default.logLevel: "warning"` — validate TSDoc syntax without blocking

### API Report Files

Convention: `packages/<pkg>/etc/<name>.api.md`

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

Checked into git. Developers review `.api.md` diffs to confirm intentional API changes.

### Scripts

- `pnpm api-report` — run api-extractor for all 8 entry points (requires `pnpm build` first)
- `pnpm api-report:check` — same but fails on stale reports (for future CI)

### Temp Files

api-extractor generates `<name>.api.json` temp files. Output to `temp/` directories (gitignored).

### Not in Scope

- `.d.ts` rollup
- Doc model / API Documenter
- CI pipeline
- Fixing all existing TSDoc warnings
