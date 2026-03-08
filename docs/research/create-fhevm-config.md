# Research: create-fhevm-config Unit

**Unit ID:** create-fhevm-config
**Date:** 2026-03-08
**Ticket:** Implement `createFhevmConfig()` factory, config types, and `wagmiAdapter()` in `@zama-fhe/react-sdk`

---

## RFC Source of Truth

**File:** `docs/plans/2026-03-08-config-first-api-design.md`

### §3.1 — `createFhevmConfig` (key constraints)

- Pure function — no side effects, no worker allocation, no network requests
- Returns a plain, inert `FhevmConfig` object
- All instantiation deferred to `FhevmProvider`

**Input type (`FhevmConfigOptions`):**

```ts
interface FhevmConfigOptions {
  chains: FhevmChain[];
  wallet?: GenericSigner | WagmiAdapter;
  relayer?: RelayerOverride;
  storage?: GenericStorage;
  advanced?: FhevmAdvancedOptions;
}
```

**Advanced options:**

```ts
interface FhevmAdvancedOptions {
  threads?: number; // WASM thread count
  keypairTTL?: number; // ML-KEM keypair TTL in seconds (default: 86400)
  sessionTTL?: number; // Session signature TTL in seconds (default: 2592000)
  onEvent?: ZamaSDKEventListener;
  integrityCheck?: boolean; // CDN integrity check (default: true)
}
```

### §3.2 — Storage defaults to `memoryStorage()`

- When `storage` is omitted, defaults to a new `MemoryStorage()` instance
- RFC says `memoryStorage()` — which implies calling it as a factory (not using the singleton)
- Users opt-in to persistence via `indexedDBStorage()` or `chromeSessionStorage()`

> **IMPORTANT:** The current SDK exports `memoryStorage` as a **singleton** (`export const memoryStorage = new MemoryStorage()`), not a factory function. The RFC's `memoryStorage()` notation is aspirational — the actual implementation should use `new MemoryStorage()` for config isolation.

### §3.6 — Wallet types

```ts
/** Lazy wagmi adapter — resolved inside FhevmProvider via useConfig(). */
interface WagmiAdapter {
  type: "wagmi";
}

/** What createFhevmConfig accepts for the wallet field. */
type WalletOption = GenericSigner | WagmiAdapter;
```

**Relayer override type:**

```ts
interface RelayerOverride {
  transports: Record<number, Partial<FhevmInstanceConfig>>;
}
```

---

## Files to Create

### 1. `packages/react-sdk/src/config.ts` (NEW)

Main implementation file containing:

- `FhevmAdvancedOptions` interface
- `WagmiAdapter` interface (`{ type: 'wagmi' }`)
- `WalletOption` type (`GenericSigner | WagmiAdapter`)
- `RelayerOverride` interface (`{ transports: Record<number, Partial<FhevmInstanceConfig>> }`)
- `FhevmConfigOptions` interface (input to `createFhevmConfig`)
- `FhevmConfig` interface (output of `createFhevmConfig`)
- `createFhevmConfig(options: FhevmConfigOptions): FhevmConfig` pure function

The `FhevmConfig` output type should store all options with storage resolved (defaulting to `new MemoryStorage()`).

### 2. `packages/react-sdk/src/wagmi/adapter.ts` (NEW) or add to `wagmi-signer.ts`

`wagmiAdapter()` factory returning `{ type: 'wagmi' } as WagmiAdapter`

Per RFC: `wagmiAdapter()` is the only adapter factory. It returns a `{ type: 'wagmi' }` descriptor.

### 3. `packages/react-sdk/src/__tests__/config.test.ts` (NEW)

Unit tests for `createFhevmConfig`:

- Returns plain object (no class instance methods)
- Storage defaults to `MemoryStorage` when omitted
- Explicit storage is preserved
- Advanced options are passed through
- `wagmiAdapter()` returns `{ type: 'wagmi' }`
- Multiple configs don't share storage instances

---

## Files to Modify

### 4. `packages/react-sdk/src/index.ts`

Add exports:

```ts
export { createFhevmConfig } from "./config";
export type {
  FhevmConfig,
  FhevmConfigOptions,
  WalletOption,
  WagmiAdapter,
  RelayerOverride,
} from "./config";
```

### 5. `packages/react-sdk/src/wagmi/index.ts`

Current content:

```ts
export { WagmiSigner, type WagmiSignerConfig } from "./wagmi-signer";
```

Add:

```ts
export { wagmiAdapter } from "./adapter"; // or from "./wagmi-signer"
```

---

## Key Dependencies & Types

### From `@zama-fhe/sdk` (already available):

- `GenericSigner` — interface for any wallet signer
- `GenericStorage` — interface for credential/session storage
- `FhevmInstanceConfig` — relayer instance config (used in `RelayerOverride.transports`)
- `ZamaSDKEventListener` — event listener type
- `MemoryStorage` — class for in-memory storage (use `new MemoryStorage()` for defaults)

### From `@zama-fhe/sdk/chains` (already available):

- `FhevmChain` — `{ id: number; name: string }`
- `fhevmSepolia`, `fhevmMainnet`, `fhevmHardhat` — preset chain definitions

---

## Important Design Notes

### `memoryStorage` is a singleton, not a factory

```ts
// packages/sdk/src/token/memory-storage.ts
export const memoryStorage = new MemoryStorage(); // singleton
```

The RFC says default to `memoryStorage()` but there's no factory function. In `createFhevmConfig`, use `new MemoryStorage()` so each config gets its own isolated storage.

### `FhevmConfig` vs `FhevmConfigOptions`

- `FhevmConfigOptions` is the **input** (user-facing, all optional fields optional)
- `FhevmConfig` is the **output** (storage always resolved, ready for `FhevmProvider`)

Possible structure:

```ts
interface FhevmConfig {
  chains: FhevmChain[];
  wallet?: WalletOption;
  relayer?: RelayerOverride;
  storage: GenericStorage; // always resolved (never undefined)
  advanced?: FhevmAdvancedOptions;
}
```

### Clean break — no backward compatibility

The ticket says "full cutover". No need to maintain old exports or backward compat shims.

### `wagmiAdapter()` location

RFC §3.6 says: `import { wagmiAdapter } from "@zama-fhe/react-sdk/wagmi"`. The wagmi entrypoint is `packages/react-sdk/src/wagmi/index.ts`. The implementation can live in:

- `packages/react-sdk/src/wagmi/adapter.ts` (clean separation)
- Or directly in `wagmi-signer.ts` (consolidation)

Recommended: new `wagmi/adapter.ts` file to keep adapter logic separate from the `WagmiSigner` class.

---

## Existing Provider Context

The current `ZamaProvider` in `provider.tsx` accepts:

- `relayer: RelayerSDK`
- `signer: GenericSigner`
- `storage: GenericStorage`
- `keypairTTL?: number`
- `sessionTTL?: number`
- `onEvent?: ZamaSDKEventListener`

The new `FhevmProvider` will replace this with `config: FhevmConfig`. The `FhevmConfig` object needs to carry all these fields in a form that `FhevmProvider` can consume.

---

## Test Infrastructure

- **Test framework:** Vitest (configured at root `vitest.config.ts`)
- **Environment:** jsdom
- **Test pattern:** `packages/**/*.test.{ts,tsx}`
- **No separate vitest.config** in react-sdk; uses root config
- **Alias resolution:** `@zama-fhe/sdk` → `packages/sdk/src`, `@zama-fhe/react-sdk` → `packages/react-sdk/src`
- **Existing test fixture pattern:** See `test-fixtures.tsx` — uses `vitest` extend pattern

For unit tests of `createFhevmConfig`, simple vitest tests without React providers are sufficient (it's a pure function).

---

## Package Export Map

```
@zama-fhe/react-sdk        → main index (createFhevmConfig + types live here)
@zama-fhe/react-sdk/wagmi  → wagmiAdapter lives here (re-exported from wagmi/index.ts)
```

The `react-sdk/package.json` has these exports:

```json
{
  ".": "./dist/index.js",
  "./wagmi": "./dist/wagmi/index.js"
}
```

---

## Summary Checklist

| File                           | Action | Key content                                                                                                                           |
| ------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `src/config.ts`                | CREATE | `FhevmConfig`, `FhevmConfigOptions`, `FhevmAdvancedOptions`, `WagmiAdapter`, `WalletOption`, `RelayerOverride`, `createFhevmConfig()` |
| `src/wagmi/adapter.ts`         | CREATE | `wagmiAdapter()` → `{ type: 'wagmi' }`                                                                                                |
| `src/__tests__/config.test.ts` | CREATE | Unit tests for factory behavior                                                                                                       |
| `src/index.ts`                 | MODIFY | Add exports for new config types and function                                                                                         |
| `src/wagmi/index.ts`           | MODIFY | Add `wagmiAdapter` export                                                                                                             |
