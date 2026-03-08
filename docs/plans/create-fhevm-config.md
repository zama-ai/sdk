# Plan: createFhevmConfig Factory, Config Types, and wagmiAdapter

**Unit:** create-fhevm-config
**Date:** 2026-03-08
**Research:** docs/research/create-fhevm-config.md

---

## Work Type Assessment

**TDD applies.** This unit introduces new public API surface:

- `createFhevmConfig()` — new factory function with specific default behavior
- `wagmiAdapter()` — new factory function
- Six new exported types (`FhevmConfig`, `FhevmConfigOptions`, `FhevmAdvancedOptions`, `WalletOption`, `WagmiAdapter`, `RelayerOverride`)

All acceptance criteria describe observable behavior (return values, defaults, type resolution). Tests should be written first.

---

## Step-by-Step Plan

### Step 1 — Write unit tests (`packages/react-sdk/src/__tests__/config.test.ts`)

Write tests **before** implementation. Tests import from `../config` and `../wagmi/adapter`.

**Test cases:**

1. **`createFhevmConfig` returns a plain object** — `typeof result === 'object'`, not a class instance, no Promise
2. **Default storage** — omitting `storage` results in `config.storage` being a `MemoryStorage` instance
3. **Explicit storage preserved** — passing `indexedDBStorage` results in that storage on the output
4. **Storage isolation** — two calls to `createFhevmConfig` without `storage` yield different storage instances (`config1.storage !== config2.storage`)
5. **Chains passed through** — `config.chains` matches input
6. **Wallet passed through** — `config.wallet` matches input (both `GenericSigner` and `WagmiAdapter`)
7. **Relayer override passthrough** — `config.relayer` matches input
8. **Advanced options passthrough** — all fields (`threads`, `keypairTTL`, `sessionTTL`, `onEvent`, `integrityCheck`) preserved
9. **`wagmiAdapter()` returns `{ type: 'wagmi' }`** — exact shape check

### Step 2 — Create `packages/react-sdk/src/config.ts`

Define types and implement `createFhevmConfig`:

```ts
import type { GenericSigner, GenericStorage, ZamaSDKEventListener } from "@zama-fhe/sdk";
import { MemoryStorage } from "@zama-fhe/sdk";
import type { FhevmChain } from "@zama-fhe/sdk/chains";

// Re-export FhevmInstanceConfig as a type for RelayerOverride
import type { FhevmInstanceConfig } from "@zama-fhe/sdk";

export interface FhevmAdvancedOptions {
  threads?: number;
  keypairTTL?: number;
  sessionTTL?: number;
  onEvent?: ZamaSDKEventListener;
  integrityCheck?: boolean;
}

export interface WagmiAdapter {
  type: "wagmi";
}

export type WalletOption = GenericSigner | WagmiAdapter;

export interface RelayerOverride {
  transports: Record<number, Partial<FhevmInstanceConfig>>;
}

export interface FhevmConfigOptions {
  chains: FhevmChain[];
  wallet?: WalletOption;
  relayer?: RelayerOverride;
  storage?: GenericStorage;
  advanced?: FhevmAdvancedOptions;
}

export interface FhevmConfig {
  chains: FhevmChain[];
  wallet?: WalletOption;
  relayer?: RelayerOverride;
  storage: GenericStorage; // always resolved
  advanced?: FhevmAdvancedOptions;
}

export function createFhevmConfig(options: FhevmConfigOptions): FhevmConfig {
  return {
    chains: options.chains,
    wallet: options.wallet,
    relayer: options.relayer,
    storage: options.storage ?? new MemoryStorage(),
    advanced: options.advanced,
  };
}
```

### Step 3 — Create `packages/react-sdk/src/wagmi/adapter.ts`

```ts
import type { WagmiAdapter } from "../config";

export function wagmiAdapter(): WagmiAdapter {
  return { type: "wagmi" };
}
```

### Step 4 — Update `packages/react-sdk/src/index.ts`

Add exports after existing provider exports:

```ts
// Config factory & types
export { createFhevmConfig } from "./config";
export type {
  FhevmConfig,
  FhevmConfigOptions,
  FhevmAdvancedOptions,
  WalletOption,
  WagmiAdapter,
  RelayerOverride,
} from "./config";
```

### Step 5 — Update `packages/react-sdk/src/wagmi/index.ts`

Add wagmiAdapter export:

```ts
export { wagmiAdapter } from "./adapter";
```

### Step 6 — Run tests and typecheck

```bash
pnpm vitest run packages/react-sdk/src/__tests__/config.test.ts
pnpm run typecheck
```

---

## Files

### Create

| File                                              | Purpose                       |
| ------------------------------------------------- | ----------------------------- |
| `packages/react-sdk/src/config.ts`                | Types + `createFhevmConfig()` |
| `packages/react-sdk/src/wagmi/adapter.ts`         | `wagmiAdapter()` factory      |
| `packages/react-sdk/src/__tests__/config.test.ts` | Unit tests                    |

### Modify

| File                                    | Change                    |
| --------------------------------------- | ------------------------- |
| `packages/react-sdk/src/index.ts`       | Add config exports        |
| `packages/react-sdk/src/wagmi/index.ts` | Add `wagmiAdapter` export |

---

## Risks & Mitigations

| Risk                                                                       | Mitigation                                                                                                                                                      |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FhevmInstanceConfig` not directly importable from `@zama-fhe/sdk`         | It's already re-exported in `index.ts` as a type — verified ✓                                                                                                   |
| `FhevmChain` import path (`@zama-fhe/sdk/chains`) may not resolve in tests | Vitest alias config maps `@zama-fhe/sdk` — verify `@zama-fhe/sdk/chains` is also aliased. Fallback: import from `@zama-fhe/sdk` if chains are re-exported there |
| `MemoryStorage` constructor import                                         | Already exported from `@zama-fhe/sdk` — verified ✓                                                                                                              |

---

## Acceptance Criteria Verification

| #   | Criterion                                        | How to verify                                             |
| --- | ------------------------------------------------ | --------------------------------------------------------- |
| 1   | `createFhevmConfig(...)` returns plain object    | Test: `typeof result === 'object'`, no `instanceof` class |
| 2   | Default storage is MemoryStorage                 | Test: `config.storage instanceof MemoryStorage`           |
| 3   | Explicit storage preserved                       | Test: pass `indexedDBStorage`, assert identity            |
| 4   | `wagmiAdapter()` returns `{ type: 'wagmi' }`     | Test: deep equal check                                    |
| 5   | `RelayerOverride` type shape                     | TypeScript compilation — type has only `transports` field |
| 6   | Import from `@zama-fhe/react-sdk` resolves       | TypeScript compilation of tests importing from index      |
| 7   | Import from `@zama-fhe/react-sdk/wagmi` resolves | TypeScript compilation of tests importing wagmiAdapter    |
| 8   | Unit tests pass                                  | `pnpm vitest run` on config.test.ts                       |
| 9   | TypeScript compilation                           | `pnpm run typecheck` zero errors                          |
