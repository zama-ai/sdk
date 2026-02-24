# SDK Convergence Design: Adopting SDK A Patterns into Token SDK

**Date:** 2026-02-23
**Status:** Approved
**Strategy:** Bottom-up refactor of SDK B (sdk) in-place
**Breaking changes:** Allowed (next major version)
**Library support:** Keep all three (viem/ethers/wagmi)

## Context

SDK A (`confidential-defi/react-sdk`, score 79/100) has superior architecture: state machine provider lifecycle, error hierarchy, mutation dedup, optimistic updates, chain validation, wallet lifecycle handling, and comprehensive React tests. Its signer abstraction (3-field interface) achieves zero adapter duplication.

SDK B (`sdk`, score 67/100) has better foundational architecture (core/react split, worker threads, encrypted credentials, `ContractCallConfig` builders) and dramatically better DX (READMEs, CLAUDE.md, test-app, single import). But it suffers from severe adapter duplication (39 near-identical hook files), zero React unit tests, no mutation dedup, no chain validation, no wallet lifecycle handling, and no optimistic updates.

**Goal:** Refactor SDK B to adopt SDK A's best patterns while preserving SDK B's architecture and DX advantages.

## Phase 1: Signer Boundary Normalization (Adapter Dedup)

**Priority:** Highest (biggest code reduction, most visible win)

### Problem

`react-sdk` has 39+ hook files across `src/viem/`, `src/ethers/`, `src/wagmi/` that are near-identical. Each implements the same contract operation but with library-specific calling conventions.

### Solution

Delete the 39 per-library hook files. The shared provider-based hooks in `src/token/` already exist and use `GenericSigner` via `TokenSDKProvider` context. Library sub-paths become thin re-export layers.

### Changes

**Keep in `sdk` (no change):**

- `GenericSigner` interface (6 methods) — correct abstraction for core SDK
- `ViemSigner`, `EthersSigner` implementations
- `ContractCallConfig` builders in `src/contracts/`
- Library-specific contract wrappers in `src/viem/contracts.ts`, `src/ethers/contracts.ts`

**Change in `react-sdk`:**

1. Delete `src/viem/use-*.ts` (13 hook files)
2. Delete `src/ethers/use-*.ts` (14 hook files)
3. Delete `src/wagmi/use-*.ts` (13 hook files, except `wagmi-signer.ts`)

4. Library sub-paths become re-export layers:

```ts
// src/viem/index.ts
export { ViemSigner } from "@zama-fhe/sdk/viem";
export * from "../token"; // All shared hooks

// src/ethers/index.ts
export { EthersSigner } from "@zama-fhe/sdk/ethers";
export * from "../token";

// src/wagmi/index.ts
export { WagmiSigner } from "./wagmi-signer";
export * from "../token";
```

5. Shared hooks in `src/token/` remain the single source of truth. They use `useTokenSDK()` context for the signer.

**Result:** ~40 files deleted, 3 thin index files remain per library.

## Phase 2: Error Hierarchy

### Changes

**Extend `TokenError` in `sdk`:**

```ts
class TokenError extends Error {
  readonly code: TokenErrorCode;
  readonly cause?: Error;
  readonly expected?: number; // for chain mismatch
  readonly actual?: number; // for chain mismatch
}
```

**Add specific subclasses:**

- `ChainMismatchError extends TokenError` — includes expected/actual chain IDs
- `SignerMissingError extends TokenError`
- `WalletDisconnectedError extends TokenError`
- `InitTimeoutError extends TokenError`

**Add new error codes to `TokenErrorCode`:**

- `ChainMismatch`
- `WalletDisconnected`
- `WalletSwitched`
- `NotReady`
- `InitTimeout`

**Add conversion helper:**

```ts
function toTokenError(error: unknown, code?: TokenErrorCode): TokenError;
```

## Phase 3: Provider Lifecycle (State Machine)

### Changes

**Replace `TokenSDKProvider` with reducer-based state machine.**

**Phases:**

```
idle → wasm_loading → wasm_ready → creating_instance → ready
                                                      ↗
                              chain_mismatch → wasm_ready (recoverable)
```

**Actions:**

- `WASM_LOADING_STARTED`, `WASM_LOADED`, `WASM_FAILED`
- `TRIGGER_INSTANCE`, `INSTANCE_CREATED`, `INSTANCE_FAILED`
- `CHAIN_MATCHED`, `CHAIN_MISMATCH`
- `WALLET_DISCONNECTED`, `WALLET_SWITCHED`

**Provider API change:**

```ts
// Before
<TokenSDKProvider relayer={relayer} signer={signer} storage={storage}>

// After
const config = createTokenSDKConfig({ chain, storage, initTimeout: 30_000 })
<TokenSDKProvider config={config} signer={signer}>
```

**Key behaviors:**

1. **Chain validation:** Check chain ID on mount + listen for `chainChanged` events. Mismatch downgrades to `wasm_ready` (recoverable, not error).
2. **Wallet lifecycle:** Track previous address via ref. Disconnect → clear cache. Switch → clear cache.
3. **Mock chain fast-path:** Skip WASM loading in test environments.
4. **Cache clearing:** On chain/wallet change, `removeQueries({ queryKey: ["tokenSDK"] })`.
5. **Immutable config:** `Object.freeze()` the config object.

**Exposed state:**

```ts
const { phase, error, isReady } = useTokenSDKStatus();
```

**New files:**

- `src/core/reducer.ts` — pure reducer function
- `src/core/types.ts` — phase/action types
- `src/provider.tsx` — updated with state machine
- `src/config.ts` — `createTokenSDKConfig()` factory

## Phase 4: Mutation Dedup & Optimistic Updates

### Mutation Dedup

Add `isActiveRef` + `activePromiseRef` pattern to mutation hooks that trigger wallet popups:

```ts
function useConfidentialTransfer() {
  const isActiveRef = useRef(false)
  const activePromiseRef = useRef<Promise<...> | null>(null)

  return useMutation({
    mutationFn(variables) {
      if (isActiveRef.current && activePromiseRef.current) {
        return activePromiseRef.current
      }
      isActiveRef.current = true
      const op = (async () => { /* encrypt + sign + send */ })()
      activePromiseRef.current = op
      return op.finally(() => {
        activePromiseRef.current = null
        isActiveRef.current = false
      })
    }
  })
}
```

**Applied to:** `useConfidentialTransfer`, `useWrap`, `useUnwrap`, `useConfidentialBatchTransfer`, `useSetOperator`, `useApprove`, `useFinalizeUnwrap`.

### Cache Hydration (Optimistic Updates)

After successful mutations, hydrate related query caches:

```ts
onSuccess(data, variables, context) {
  queryClient.setQueryData(
    balanceQueryKeys.handle(tokenAddress, ownerAddress),
    newHandle
  )
}
```

Avoids unnecessary refetches when the mutation already provides the answer.

### Phase Tracking

Add phase progression to mutation hooks:

```ts
const { mutate, phase } = useConfidentialTransfer();
// phase: "idle" | "encrypting" | "signing" | "submitting" | "confirming" | "done" | "error"
```

Implemented via `useState` + callbacks at each step of the mutation function.

## Phase 5: React Test Suite

### Structure

Phased test structure in `packages/react-sdk/src/__tests__/`:

**Phase 1: Types & Config** (~15 tests)

- Adapter factory tests (ViemSigner, EthersSigner, WagmiSigner produce valid GenericSigner)
- Error code stability (all codes are strings, JSON-serializable)
- `createTokenSDKConfig` validation and immutability

**Phase 2: State Machine** (~40 tests)

- Reducer transitions (happy path, mock fast-path, invalid transitions ignored)
- Chain mismatch → recovery flow
- Wallet disconnect/switch → cache clearing
- Provider rendering with various signer states

**Phase 3: Core Hooks** (~50 tests)

- `useConfidentialTransfer` — mutation dedup, cache invalidation, phase progression
- `useConfidentialBalance` — two-phase polling, handle change detection
- `useWrap`/`useUnwrap` — cache invalidation
- `useEncrypt`/`useDecrypt` — with mocked relayer

**Phase 4: Integration** (~20 tests)

- Multi-hook scenarios (transfer then check balance)
- Wallet switch during mutation
- Chain mismatch during operation

### Test Utilities

```ts
function createProviderWrapper(options?: {
  signer?: GenericSigner;
  config?: Partial<TokenSDKConfig>;
}): { Wrapper: React.ComponentType; queryClient: QueryClient; config: TokenSDKConfig };
```

**Stack:** vitest + @testing-library/react + renderHook/act/waitFor (already configured in workspace).

## Implementation Order

| Phase                 | Scope     | Estimated Files Changed   | Dependencies |
| --------------------- | --------- | ------------------------- | ------------ |
| 1. Adapter Dedup      | react-sdk | ~45 (delete 40, modify 5) | None         |
| 2. Error Hierarchy    | sdk       | ~5 (modify 2, add 3)      | None         |
| 3. Provider Lifecycle | react-sdk | ~8 (add 4, modify 4)      | Phase 2      |
| 4. Mutation Dedup     | react-sdk | ~10 (modify 10)           | Phase 3      |
| 5. React Tests        | react-sdk | ~12 (add 12)              | Phases 1-4   |

Phases 1 and 2 are independent and can run in parallel.
Phases 3-5 are sequential.

## What We Preserve from SDK B

- Core/React split architecture
- `ContractCallConfig` builders (pure functions)
- Worker pool (RelayerWeb, RelayerNode, NodeWorkerPool)
- Encrypted credential storage (AES-GCM)
- Two-phase balance polling
- All DX: READMEs, CLAUDE.md, test-app, single import pattern
- Activity feed, batch operations, fees
- E2E test suite (Playwright + Hardhat)

## What We Adopt from SDK A

- Signer boundary normalization (eliminate hook duplication)
- Reducer-based provider lifecycle (state machine)
- Chain validation with recoverable mismatch
- Wallet lifecycle tracking (connect/disconnect/switch)
- Structured error hierarchy with specific subclasses
- Mutation deduplication (isActiveRef + activePromiseRef)
- Cache hydration post-mutation
- Mutation phase tracking
- Phased React test suite
- Immutable config pattern
