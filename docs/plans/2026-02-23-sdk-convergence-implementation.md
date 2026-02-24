# SDK Convergence Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor token-sdk to adopt confidential-defi/react-sdk's best patterns (signer dedup, state machine provider, error hierarchy, mutation dedup, React tests) while preserving existing architecture and DX.

**Architecture:** Bottom-up refactor across 5 phases. Phase 1 eliminates 39 duplicated hook files by making library sub-paths thin re-export layers. Phase 2 extends the error hierarchy. Phase 3 replaces the simple provider with a reducer-based state machine. Phase 4 adds mutation dedup and phase tracking. Phase 5 adds React unit tests.

**Tech Stack:** TypeScript, React, @tanstack/react-query, vitest, @testing-library/react, tsup, pnpm workspace

**Design doc:** `docs/plans/2026-02-23-sdk-convergence-design.md`

---

## Phase 1: Adapter Dedup (react-sdk)

The library sub-paths (`/viem`, `/ethers`, `/wagmi`) each have 13 hook files that duplicate the same contract operations with slightly different calling conventions. The shared provider-based hooks in `src/token/` already exist and handle everything via `GenericSigner` context. The per-library hooks are redundant.

### Task 1: Delete viem hook files

**Files:**

- Delete: `packages/react-sdk/src/viem/use-confidential-balance-of.ts`
- Delete: `packages/react-sdk/src/viem/use-confidential-transfer.ts`
- Delete: `packages/react-sdk/src/viem/use-confidential-batch-transfer.ts`
- Delete: `packages/react-sdk/src/viem/use-unwrap.ts`
- Delete: `packages/react-sdk/src/viem/use-unwrap-from-balance.ts`
- Delete: `packages/react-sdk/src/viem/use-finalize-unwrap.ts`
- Delete: `packages/react-sdk/src/viem/use-set-operator.ts`
- Delete: `packages/react-sdk/src/viem/use-wrapper-for-token.ts`
- Delete: `packages/react-sdk/src/viem/use-underlying-token.ts`
- Delete: `packages/react-sdk/src/viem/use-wrap.ts`
- Delete: `packages/react-sdk/src/viem/use-wrap-eth.ts`
- Delete: `packages/react-sdk/src/viem/use-wrapper-exists.ts`
- Delete: `packages/react-sdk/src/viem/use-supports-interface.ts`
- Keep: `packages/react-sdk/src/viem/viem-signer.ts`
- Modify: `packages/react-sdk/src/viem/index.ts`

**Step 1: Delete all viem hook files**

```bash
rm packages/react-sdk/src/viem/use-*.ts
```

**Step 2: Rewrite viem/index.ts as thin re-export**

Replace `packages/react-sdk/src/viem/index.ts` with:

```ts
export { ViemSigner } from "./viem-signer";
```

Note: We intentionally do NOT re-export `../token` hooks here. Those are already available from the main `@zama-fhe/react-sdk` entry point. Library sub-paths now only export their signer adapter. This avoids the anti-pattern of the same hooks being importable from multiple paths.

**Step 3: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: No errors related to viem sub-path (may have errors from ethers/wagmi since we haven't touched those yet — that's fine)

### Task 2: Delete ethers hook files

**Files:**

- Delete: `packages/react-sdk/src/ethers/use-confidential-balance-of.ts`
- Delete: `packages/react-sdk/src/ethers/use-confidential-transfer.ts`
- Delete: `packages/react-sdk/src/ethers/use-confidential-batch-transfer.ts`
- Delete: `packages/react-sdk/src/ethers/use-unwrap.ts`
- Delete: `packages/react-sdk/src/ethers/use-unwrap-from-balance.ts`
- Delete: `packages/react-sdk/src/ethers/use-finalize-unwrap.ts`
- Delete: `packages/react-sdk/src/ethers/use-set-operator.ts`
- Delete: `packages/react-sdk/src/ethers/use-wrapper-for-token.ts`
- Delete: `packages/react-sdk/src/ethers/use-underlying-token.ts`
- Delete: `packages/react-sdk/src/ethers/use-wrap.ts`
- Delete: `packages/react-sdk/src/ethers/use-wrap-eth.ts`
- Delete: `packages/react-sdk/src/ethers/use-wrapper-exists.ts`
- Delete: `packages/react-sdk/src/ethers/use-supports-interface.ts`
- Keep: `packages/react-sdk/src/ethers/ethers-signer.ts`
- Modify: `packages/react-sdk/src/ethers/index.ts`

**Step 1: Delete all ethers hook files**

```bash
rm packages/react-sdk/src/ethers/use-*.ts
```

**Step 2: Rewrite ethers/index.ts as thin re-export**

Replace `packages/react-sdk/src/ethers/index.ts` with:

```ts
export { EthersSigner } from "./ethers-signer";
```

### Task 3: Delete wagmi hook files

**Files:**

- Delete: `packages/react-sdk/src/wagmi/use-confidential-balance-of.ts`
- Delete: `packages/react-sdk/src/wagmi/use-confidential-transfer.ts`
- Delete: `packages/react-sdk/src/wagmi/use-confidential-batch-transfer.ts`
- Delete: `packages/react-sdk/src/wagmi/use-unwrap.ts`
- Delete: `packages/react-sdk/src/wagmi/use-unwrap-from-balance.ts`
- Delete: `packages/react-sdk/src/wagmi/use-finalize-unwrap.ts`
- Delete: `packages/react-sdk/src/wagmi/use-set-operator.ts`
- Delete: `packages/react-sdk/src/wagmi/use-wrapper-for-token.ts`
- Delete: `packages/react-sdk/src/wagmi/use-underlying-token.ts`
- Delete: `packages/react-sdk/src/wagmi/use-wrap.ts`
- Delete: `packages/react-sdk/src/wagmi/use-wrap-eth.ts`
- Delete: `packages/react-sdk/src/wagmi/use-wrapper-exists.ts`
- Delete: `packages/react-sdk/src/wagmi/use-supports-interface.ts`
- Keep: `packages/react-sdk/src/wagmi/wagmi-signer.ts`
- Modify: `packages/react-sdk/src/wagmi/index.ts`

**Step 1: Delete all wagmi hook files**

```bash
rm packages/react-sdk/src/wagmi/use-*.ts
```

**Step 2: Rewrite wagmi/index.ts as thin re-export**

Replace `packages/react-sdk/src/wagmi/index.ts` with:

```ts
export { WagmiSigner } from "./wagmi-signer";
```

### Task 4: Verify full build and typecheck

**Step 1: Run typecheck**

```bash
pnpm typecheck
```

Expected: PASS (no errors). The main `src/index.ts` imports from `./token/` not from `./viem/` etc., so it should be unaffected.

**Step 2: Run build**

```bash
pnpm build
```

Expected: PASS. The tsup entry points (`viem/index`, `ethers/index`, `wagmi/index`) now produce much smaller bundles.

**Step 3: Run existing tests**

```bash
pnpm test:run
```

Expected: PASS. The core SDK tests don't depend on React SDK hooks.

**Step 4: Commit**

```bash
git add -A packages/react-sdk/src/viem/ packages/react-sdk/src/ethers/ packages/react-sdk/src/wagmi/
git commit -m "refactor(react-sdk): eliminate adapter hook duplication

Delete 39 near-identical hook files across viem/ethers/wagmi sub-paths.
Library sub-paths now only export their signer adapter.
All hooks are available from the main entry point via provider context."
```

### Task 5: Update test-app imports (if needed)

**Files:**

- Check: `packages/test-app/src/**/*.{ts,tsx}`

**Step 1: Search for imports from deleted sub-paths**

```bash
grep -r "react-sdk/viem\|react-sdk/ethers\|react-sdk/wagmi" packages/test-app/src/ --include="*.ts" --include="*.tsx"
```

The test-app currently imports `WagmiSigner` from `@zama-fhe/react-sdk/wagmi` (in `src/providers.tsx`). This still works since `WagmiSigner` is still exported. If any hook imports from sub-paths are found, update them to import from `@zama-fhe/react-sdk` instead.

**Step 2: Run E2E smoke test (optional)**

```bash
pnpm build && pnpm e2e:test
```

Expected: PASS (all E2E tests use provider-based hooks from main entry point).

---

## Phase 2: Error Hierarchy (token-sdk)

### Task 6: Extend TokenErrorCode with new codes

**Files:**

- Modify: `packages/sdk/src/token/token.types.ts:90-127`

**Step 1: Add new error codes**

Add these entries to the `TokenErrorCode` const object (after line 108, before `} as const`):

```ts
  /** Wallet is on a different chain than expected. */
  ChainMismatch: "CHAIN_MISMATCH",
  /** Wallet disconnected during or before an operation. */
  WalletDisconnected: "WALLET_DISCONNECTED",
  /** Wallet account changed during or before an operation. */
  WalletSwitched: "WALLET_SWITCHED",
  /** SDK is not yet initialized (WASM not loaded or instance not created). */
  NotReady: "NOT_READY",
  /** WASM or instance initialization timed out. */
  InitTimeout: "INIT_TIMEOUT",
```

**Step 2: Add metadata fields to TokenError**

Update the `TokenError` class (lines 118-127) to:

```ts
export class TokenError extends Error {
  readonly code: TokenErrorCode;
  /** For chain mismatch errors: the expected chain ID. */
  readonly expected?: number;
  /** For chain mismatch errors: the actual chain ID. */
  readonly actual?: number;

  constructor(
    code: TokenErrorCode,
    message: string,
    options?: ErrorOptions & { expected?: number; actual?: number },
  ) {
    super(message, options);
    this.name = "TokenError";
    this.code = code;
    this.expected = options?.expected;
    this.actual = options?.actual;
  }
}
```

### Task 7: Add error subclasses and conversion helper

**Files:**

- Create: `packages/sdk/src/token/errors.ts`

**Step 1: Create error subclasses file**

```ts
import { TokenError, TokenErrorCode } from "./token.types";

/** Wallet is connected to the wrong chain. */
export class ChainMismatchError extends TokenError {
  constructor(expected: number, actual: number) {
    super(TokenErrorCode.ChainMismatch, `Chain mismatch: expected ${expected}, got ${actual}`, {
      expected,
      actual,
    });
    this.name = "ChainMismatchError";
  }
}

/** No signer is available (wallet not connected). */
export class SignerMissingError extends TokenError {
  constructor() {
    super(TokenErrorCode.NotReady, "Signer is required for this operation");
    this.name = "SignerMissingError";
  }
}

/** Wallet disconnected. */
export class WalletDisconnectedError extends TokenError {
  constructor() {
    super(TokenErrorCode.WalletDisconnected, "Wallet disconnected");
    this.name = "WalletDisconnectedError";
  }
}

/** Initialization timed out. */
export class InitTimeoutError extends TokenError {
  constructor(timeoutMs: number) {
    super(TokenErrorCode.InitTimeout, `Initialization timed out after ${timeoutMs}ms`);
    this.name = "InitTimeoutError";
  }
}

/**
 * Convert any error to a TokenError, preserving it if already one.
 * Wraps non-TokenError values with the given code.
 */
export function toTokenError(
  error: unknown,
  code: TokenErrorCode = TokenErrorCode.TransactionReverted,
): TokenError {
  if (error instanceof TokenError) return error;
  const cause = error instanceof Error ? error : new Error(String(error));
  return new TokenError(code, cause.message, { cause });
}
```

### Task 8: Export new errors from token-sdk

**Files:**

- Modify: `packages/sdk/src/index.ts`

**Step 1: Add exports**

Add after the existing `TokenError` / `TokenErrorCode` exports:

```ts
export {
  ChainMismatchError,
  SignerMissingError,
  WalletDisconnectedError,
  InitTimeoutError,
  toTokenError,
} from "./token/errors";
```

**Step 2: Re-export from react-sdk**

In `packages/react-sdk/src/index.ts`, add to the re-export block (after the `TokenError, TokenErrorCode` line):

```ts
export {
  ChainMismatchError,
  SignerMissingError,
  WalletDisconnectedError,
  InitTimeoutError,
  toTokenError,
} from "@zama-fhe/sdk";
```

### Task 9: Add error tests

**Files:**

- Create: `packages/sdk/src/token/__tests__/errors.test.ts`

**Step 1: Write tests**

```ts
import { describe, it, expect } from "vitest";
import { TokenError, TokenErrorCode } from "../token.types";
import {
  ChainMismatchError,
  SignerMissingError,
  WalletDisconnectedError,
  InitTimeoutError,
  toTokenError,
} from "../errors";

describe("TokenError", () => {
  it("preserves code and message", () => {
    const err = new TokenError(TokenErrorCode.EncryptionFailed, "boom");
    expect(err.code).toBe("ENCRYPTION_FAILED");
    expect(err.message).toBe("boom");
    expect(err.name).toBe("TokenError");
    expect(err).toBeInstanceOf(Error);
  });

  it("preserves cause via ErrorOptions", () => {
    const cause = new Error("root");
    const err = new TokenError(TokenErrorCode.StoreError, "wrap", { cause });
    expect(err.cause).toBe(cause);
  });

  it("carries expected/actual for chain mismatch", () => {
    const err = new TokenError(TokenErrorCode.ChainMismatch, "mismatch", {
      expected: 1,
      actual: 31337,
    });
    expect(err.expected).toBe(1);
    expect(err.actual).toBe(31337);
  });
});

describe("ChainMismatchError", () => {
  it("sets code, expected, actual", () => {
    const err = new ChainMismatchError(1, 31337);
    expect(err.code).toBe("CHAIN_MISMATCH");
    expect(err.expected).toBe(1);
    expect(err.actual).toBe(31337);
    expect(err.name).toBe("ChainMismatchError");
    expect(err).toBeInstanceOf(TokenError);
  });
});

describe("SignerMissingError", () => {
  it("sets code and message", () => {
    const err = new SignerMissingError();
    expect(err.code).toBe("NOT_READY");
    expect(err.message).toContain("Signer");
  });
});

describe("WalletDisconnectedError", () => {
  it("sets code", () => {
    const err = new WalletDisconnectedError();
    expect(err.code).toBe("WALLET_DISCONNECTED");
  });
});

describe("InitTimeoutError", () => {
  it("includes timeout in message", () => {
    const err = new InitTimeoutError(30000);
    expect(err.code).toBe("INIT_TIMEOUT");
    expect(err.message).toContain("30000");
  });
});

describe("toTokenError", () => {
  it("returns TokenError as-is", () => {
    const err = new TokenError(TokenErrorCode.EncryptionFailed, "already");
    expect(toTokenError(err)).toBe(err);
  });

  it("wraps Error with given code", () => {
    const cause = new Error("raw");
    const result = toTokenError(cause, TokenErrorCode.DecryptionFailed);
    expect(result.code).toBe("DECRYPTION_FAILED");
    expect(result.cause).toBe(cause);
  });

  it("wraps non-Error values", () => {
    const result = toTokenError("string error");
    expect(result).toBeInstanceOf(TokenError);
    expect(result.message).toBe("string error");
  });

  it("defaults to TransactionReverted code", () => {
    const result = toTokenError(new Error("oops"));
    expect(result.code).toBe("TRANSACTION_REVERTED");
  });
});
```

**Step 2: Run tests**

```bash
pnpm test:run -- --reporter=verbose packages/sdk/src/token/__tests__/errors.test.ts
```

Expected: All tests PASS.

**Step 3: Run full test suite + typecheck**

```bash
pnpm test:run && pnpm typecheck
```

Expected: PASS.

**Step 4: Commit**

```bash
git add packages/sdk/src/token/token.types.ts packages/sdk/src/token/errors.ts packages/sdk/src/token/__tests__/errors.test.ts packages/sdk/src/index.ts packages/react-sdk/src/index.ts
git commit -m "feat(token-sdk): extend error hierarchy with lifecycle error codes

Add ChainMismatchError, SignerMissingError, WalletDisconnectedError,
InitTimeoutError subclasses. Add toTokenError() conversion helper.
Extend TokenErrorCode with ChainMismatch, WalletDisconnected,
WalletSwitched, NotReady, InitTimeout codes."
```

---

## Phase 3: Provider Lifecycle State Machine (react-sdk)

### Task 10: Create provider state types

**Files:**

- Create: `packages/react-sdk/src/core/types.ts`

**Step 1: Write the types**

```ts
/** Provider lifecycle phases. */
export type TokenSDKPhase = "idle" | "initializing" | "ready" | "error";

/** Actions dispatched to the provider reducer. */
export type ProviderAction =
  | { type: "INIT_STARTED" }
  | { type: "INIT_COMPLETED" }
  | { type: "INIT_FAILED"; error: Error }
  | { type: "CHAIN_MISMATCH"; error: Error }
  | { type: "CHAIN_MATCHED" }
  | { type: "WALLET_DISCONNECTED" }
  | { type: "WALLET_SWITCHED" };

/** Provider state managed by the reducer. */
export interface ProviderState {
  readonly phase: TokenSDKPhase;
  readonly error: Error | null;
}
```

### Task 11: Create the reducer

**Files:**

- Create: `packages/react-sdk/src/core/reducer.ts`

**Step 1: Write the reducer**

```ts
import type { ProviderAction, ProviderState } from "./types";

export const initialState: ProviderState = {
  phase: "idle",
  error: null,
};

export function providerReducer(state: ProviderState, action: ProviderAction): ProviderState {
  switch (action.type) {
    case "INIT_STARTED":
      if (state.phase !== "idle") return state;
      return { phase: "initializing", error: null };

    case "INIT_COMPLETED":
      if (state.phase !== "initializing") return state;
      return { phase: "ready", error: null };

    case "INIT_FAILED":
      if (state.phase !== "initializing") return state;
      return { phase: "error", error: action.error };

    case "CHAIN_MISMATCH":
      // Recoverable: go back to idle so re-init can happen after chain switch
      return { phase: "idle", error: action.error };

    case "CHAIN_MATCHED":
      // Clear error if we were in a mismatch state
      if (state.error === null) return state;
      return { phase: "idle", error: null };

    case "WALLET_DISCONNECTED":
      return { phase: "idle", error: null };

    case "WALLET_SWITCHED":
      return { phase: "idle", error: null };

    default:
      return state;
  }
}
```

### Task 12: Create config factory

**Files:**

- Create: `packages/react-sdk/src/config.ts`

**Step 1: Write the config factory**

```ts
import type { GenericStringStorage, RelayerSDK } from "@zama-fhe/sdk";

export interface TokenSDKProviderConfig {
  /** FHE relayer backend (RelayerWeb for browser, RelayerNode for server). */
  readonly relayer: RelayerSDK;
  /** Credential storage backend (IndexedDBStorage for browser, MemoryStorage for tests). */
  readonly storage: GenericStringStorage;
  /** Expected chain ID. If set, provider validates wallet chain matches. */
  readonly expectedChainId?: number;
  /** Initialization timeout in milliseconds. Default: 30000. */
  readonly initTimeout?: number;
}

/**
 * Create an immutable provider config.
 * Validates required fields and freezes the result.
 */
export function createTokenSDKConfig(
  params: TokenSDKProviderConfig,
): Readonly<TokenSDKProviderConfig> {
  if (!params.relayer) throw new Error("createTokenSDKConfig: relayer is required");
  if (!params.storage) throw new Error("createTokenSDKConfig: storage is required");
  return Object.freeze({ ...params });
}
```

### Task 13: Add reducer tests

**Files:**

- Create: `packages/react-sdk/src/core/__tests__/reducer.test.ts`

**Step 1: Write tests**

```ts
import { describe, it, expect } from "vitest";
import { providerReducer, initialState } from "../reducer";
import type { ProviderState } from "../types";

describe("providerReducer", () => {
  describe("initial state", () => {
    it("starts in idle phase with no error", () => {
      expect(initialState).toEqual({ phase: "idle", error: null });
    });
  });

  describe("INIT_STARTED", () => {
    it("transitions from idle to initializing", () => {
      const result = providerReducer(initialState, { type: "INIT_STARTED" });
      expect(result.phase).toBe("initializing");
      expect(result.error).toBeNull();
    });

    it("ignores if not in idle", () => {
      const state: ProviderState = { phase: "ready", error: null };
      const result = providerReducer(state, { type: "INIT_STARTED" });
      expect(result).toBe(state);
    });
  });

  describe("INIT_COMPLETED", () => {
    it("transitions from initializing to ready", () => {
      const state: ProviderState = { phase: "initializing", error: null };
      const result = providerReducer(state, { type: "INIT_COMPLETED" });
      expect(result.phase).toBe("ready");
    });

    it("ignores if not initializing", () => {
      const state: ProviderState = { phase: "idle", error: null };
      const result = providerReducer(state, { type: "INIT_COMPLETED" });
      expect(result).toBe(state);
    });
  });

  describe("INIT_FAILED", () => {
    it("transitions from initializing to error", () => {
      const error = new Error("failed");
      const state: ProviderState = { phase: "initializing", error: null };
      const result = providerReducer(state, { type: "INIT_FAILED", error });
      expect(result.phase).toBe("error");
      expect(result.error).toBe(error);
    });
  });

  describe("CHAIN_MISMATCH", () => {
    it("goes to idle with error from any phase", () => {
      const error = new Error("wrong chain");
      const state: ProviderState = { phase: "ready", error: null };
      const result = providerReducer(state, { type: "CHAIN_MISMATCH", error });
      expect(result.phase).toBe("idle");
      expect(result.error).toBe(error);
    });
  });

  describe("CHAIN_MATCHED", () => {
    it("clears error and stays idle", () => {
      const state: ProviderState = { phase: "idle", error: new Error("mismatch") };
      const result = providerReducer(state, { type: "CHAIN_MATCHED" });
      expect(result.phase).toBe("idle");
      expect(result.error).toBeNull();
    });

    it("is a no-op if no error", () => {
      const result = providerReducer(initialState, { type: "CHAIN_MATCHED" });
      expect(result).toBe(initialState);
    });
  });

  describe("WALLET_DISCONNECTED", () => {
    it("resets to idle from any phase", () => {
      const state: ProviderState = { phase: "ready", error: null };
      const result = providerReducer(state, { type: "WALLET_DISCONNECTED" });
      expect(result.phase).toBe("idle");
    });
  });

  describe("WALLET_SWITCHED", () => {
    it("resets to idle from any phase", () => {
      const state: ProviderState = { phase: "ready", error: null };
      const result = providerReducer(state, { type: "WALLET_SWITCHED" });
      expect(result.phase).toBe("idle");
    });
  });
});
```

**Step 2: Run tests**

```bash
pnpm test:run -- --reporter=verbose packages/react-sdk/src/core/__tests__/reducer.test.ts
```

Expected: All tests PASS.

### Task 14: Update TokenSDKProvider with state machine and wallet lifecycle

**Files:**

- Modify: `packages/react-sdk/src/provider.tsx`

**Step 1: Rewrite provider with reducer, chain validation, and wallet tracking**

Replace `packages/react-sdk/src/provider.tsx` entirely with:

````tsx
"use client";

import type { GenericSigner, RelayerSDK, GenericStringStorage } from "@zama-fhe/sdk";
import { TokenSDK, ChainMismatchError } from "@zama-fhe/sdk";
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { providerReducer, initialState } from "./core/reducer";
import type { TokenSDKPhase } from "./core/types";

/** Props for {@link TokenSDKProvider}. */
export interface TokenSDKProviderProps extends PropsWithChildren {
  /** FHE relayer backend (RelayerWeb for browser, RelayerNode for server). */
  relayer: RelayerSDK;
  /** Wallet signer (ViemSigner, EthersSigner, or custom GenericSigner). */
  signer: GenericSigner;
  /** Credential storage backend (IndexedDBStorage for browser, MemoryStorage for tests). */
  storage: GenericStringStorage;
  /** Expected chain ID. If set, validates wallet chain on mount and on chainChanged events. */
  expectedChainId?: number;
}

interface TokenSDKContextValue {
  sdk: TokenSDK;
  phase: TokenSDKPhase;
  error: Error | null;
  isReady: boolean;
}

const TokenSDKContext = createContext<TokenSDKContextValue | null>(null);

/**
 * Provides a {@link TokenSDK} instance to all descendant hooks.
 * Manages provider lifecycle with state machine, chain validation,
 * and wallet lifecycle tracking.
 *
 * @example
 * ```tsx
 * <TokenSDKProvider relayer={relayer} signer={signer} storage={storage}>
 *   <App />
 * </TokenSDKProvider>
 * ```
 */
export function TokenSDKProvider({
  children,
  relayer,
  signer,
  storage,
  expectedChainId,
}: TokenSDKProviderProps) {
  const [state, dispatch] = useReducer(providerReducer, initialState);
  const queryClient = useQueryClient();
  const previousAddressRef = useRef<string | null>(null);

  const sdk = useMemo(() => new TokenSDK({ relayer, signer, storage }), [relayer, signer, storage]);

  // Clear all SDK-related query cache
  const clearCache = useCallback(() => {
    queryClient.removeQueries({ queryKey: ["confidentialHandle"] });
    queryClient.removeQueries({ queryKey: ["confidentialBalance"] });
    queryClient.removeQueries({ queryKey: ["confidentialHandles"] });
    queryClient.removeQueries({ queryKey: ["confidentialBalances"] });
  }, [queryClient]);

  // Chain validation on mount
  useEffect(() => {
    if (!expectedChainId) {
      dispatch({ type: "INIT_STARTED" });
      dispatch({ type: "INIT_COMPLETED" });
      return;
    }

    let active = true;

    const checkChain = async () => {
      try {
        dispatch({ type: "INIT_STARTED" });
        const chainId = await signer.getChainId();
        if (!active) return;

        if (chainId !== expectedChainId) {
          clearCache();
          dispatch({
            type: "CHAIN_MISMATCH",
            error: new ChainMismatchError(expectedChainId, chainId),
          });
        } else {
          dispatch({ type: "INIT_COMPLETED" });
        }
      } catch (error) {
        if (!active) return;
        dispatch({
          type: "INIT_FAILED",
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
    };

    void checkChain();
    return () => {
      active = false;
    };
  }, [signer, expectedChainId, clearCache]);

  // Wallet address tracking (detect disconnect/switch)
  useEffect(() => {
    let active = true;

    const trackAddress = async () => {
      try {
        const address = await signer.getAddress();
        if (!active) return;

        const current = address.toLowerCase();
        const previous = previousAddressRef.current;

        if (previous === null) {
          // First render — just record
          previousAddressRef.current = current;
          return;
        }

        if (previous !== current) {
          clearCache();
          dispatch({ type: "WALLET_SWITCHED" });
          previousAddressRef.current = current;
        }
      } catch {
        // getAddress failed — wallet likely disconnected
        if (!active) return;
        if (previousAddressRef.current !== null) {
          clearCache();
          dispatch({ type: "WALLET_DISCONNECTED" });
          previousAddressRef.current = null;
        }
      }
    };

    void trackAddress();
    return () => {
      active = false;
    };
  }, [signer, clearCache]);

  // Terminate relayer on unmount
  useEffect(() => {
    return () => sdk.terminate();
  }, [sdk]);

  const contextValue = useMemo<TokenSDKContextValue>(
    () => ({
      sdk,
      phase: state.phase,
      error: state.error,
      isReady: state.phase === "ready",
    }),
    [sdk, state.phase, state.error],
  );

  return <TokenSDKContext.Provider value={contextValue}>{children}</TokenSDKContext.Provider>;
}

/**
 * Access the {@link TokenSDK} instance from context.
 * Must be used within a {@link TokenSDKProvider}.
 */
export function useTokenSDK(): TokenSDK {
  const context = useContext(TokenSDKContext);
  if (!context) {
    throw new Error("useTokenSDK must be used within a TokenSDKProvider");
  }
  return context.sdk;
}

/**
 * Access the provider lifecycle status.
 * Useful for showing loading/error states in the UI.
 */
export function useTokenSDKStatus() {
  const context = useContext(TokenSDKContext);
  if (!context) {
    throw new Error("useTokenSDKStatus must be used within a TokenSDKProvider");
  }
  return {
    phase: context.phase,
    error: context.error,
    isReady: context.isReady,
  };
}
````

**Step 2: Export useTokenSDKStatus from main index**

In `packages/react-sdk/src/index.ts`, update the provider export line:

```ts
export { TokenSDKProvider, useTokenSDK, useTokenSDKStatus } from "./provider";
```

**Step 3: Run typecheck**

```bash
pnpm typecheck
```

Expected: PASS.

**Step 4: Run existing tests**

```bash
pnpm test:run
```

Expected: PASS (existing core SDK tests unaffected).

**Step 5: Commit**

```bash
git add packages/react-sdk/src/core/ packages/react-sdk/src/provider.tsx packages/react-sdk/src/config.ts packages/react-sdk/src/index.ts
git commit -m "feat(react-sdk): add state machine provider with chain/wallet lifecycle

Replace simple provider with reducer-based state machine.
Add chain validation on mount (optional expectedChainId prop).
Track wallet address changes and clear cache on switch/disconnect.
Export useTokenSDKStatus() for UI phase/error rendering."
```

---

## Phase 4: Mutation Dedup & Phase Tracking (react-sdk)

### Task 15: Create mutation dedup helper

**Files:**

- Create: `packages/react-sdk/src/token/use-dedup-mutation.ts`

**Step 1: Write the helper**

```ts
"use client";

import { useRef, useState, useCallback } from "react";

/** Phase progression for mutation hooks. */
export type MutationPhase =
  | "idle"
  | "encrypting"
  | "signing"
  | "submitting"
  | "confirming"
  | "done"
  | "error";

/**
 * Wraps an async mutation function with deduplication and phase tracking.
 * If the same mutation is called while one is already in flight, the existing promise is returned.
 */
export function useDedupMutation<TArgs extends unknown[], TResult>(
  mutationFn: (setPhase: (phase: MutationPhase) => void, ...args: TArgs) => Promise<TResult>,
) {
  const isActiveRef = useRef(false);
  const activePromiseRef = useRef<Promise<TResult> | null>(null);
  const [phase, setPhase] = useState<MutationPhase>("idle");

  const execute = useCallback(
    (...args: TArgs): Promise<TResult> => {
      if (isActiveRef.current && activePromiseRef.current) {
        return activePromiseRef.current;
      }

      isActiveRef.current = true;
      setPhase("idle");

      const op = mutationFn(setPhase, ...args)
        .then(
          (result) => {
            setPhase("done");
            return result;
          },
          (error) => {
            setPhase("error");
            throw error;
          },
        )
        .finally(() => {
          isActiveRef.current = false;
          activePromiseRef.current = null;
        });

      activePromiseRef.current = op;
      return op;
    },
    [mutationFn],
  );

  return { execute, phase };
}
```

### Task 16: Apply mutation dedup to useConfidentialTransfer

**Files:**

- Modify: `packages/react-sdk/src/token/use-confidential-transfer.ts`

**Step 1: Add dedup and phase tracking**

Update `packages/react-sdk/src/token/use-confidential-transfer.ts`. The `mutationFn` should use the dedup helper internally. The key change is wrapping the `token.confidentialTransfer` call with phase tracking:

Read the current file first, then update the `mutationFn` to track phases:

```ts
"use client";

import { useMutation, UseMutationOptions } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import { useRef, useState } from "react";
import {
  confidentialBalanceQueryKeys,
  confidentialBalancesQueryKeys,
  confidentialHandleQueryKeys,
  confidentialHandlesQueryKeys,
} from "./balance-query-keys";
import { useToken, type UseTokenConfig } from "./use-token";

export type MutationPhase = "idle" | "encrypting" | "submitting" | "confirming" | "done" | "error";

export interface ConfidentialTransferParams {
  to: Address;
  amount: bigint;
}

export function useConfidentialTransfer(
  config: UseTokenConfig,
  options?: UseMutationOptions<Address, Error, ConfidentialTransferParams, Address>,
) {
  const token = useToken(config);
  const isActiveRef = useRef(false);
  const activePromiseRef = useRef<Promise<Address> | null>(null);
  const [phase, setPhase] = useState<MutationPhase>("idle");

  const mutation = useMutation<Address, Error, ConfidentialTransferParams, Address>({
    mutationKey: ["confidentialTransfer", config.tokenAddress],
    mutationFn: ({ to, amount }) => {
      // Dedup: return existing promise if mutation is already in flight
      if (isActiveRef.current && activePromiseRef.current) {
        return activePromiseRef.current;
      }

      isActiveRef.current = true;
      setPhase("encrypting");

      const op = token
        .confidentialTransfer(to, amount)
        .then(
          (result) => {
            setPhase("done");
            return result;
          },
          (error) => {
            setPhase("error");
            throw error;
          },
        )
        .finally(() => {
          isActiveRef.current = false;
          activePromiseRef.current = null;
        });

      activePromiseRef.current = op;
      return op;
    },
    ...options,
    onSuccess: (data, variables, onMutateResult, context) => {
      context.client.invalidateQueries({
        queryKey: confidentialHandleQueryKeys.token(config.tokenAddress),
      });
      context.client.invalidateQueries({
        queryKey: confidentialHandlesQueryKeys.all,
      });
      context.client.resetQueries({
        queryKey: confidentialBalanceQueryKeys.token(config.tokenAddress),
      });
      context.client.invalidateQueries({
        queryKey: confidentialBalancesQueryKeys.all,
      });
      options?.onSuccess?.(data, variables, onMutateResult, context);
    },
    onError: () => {
      setPhase("error");
    },
    onSettled: () => {
      isActiveRef.current = false;
      activePromiseRef.current = null;
    },
  });

  return { ...mutation, phase };
}
```

Note: Apply the same pattern to all other mutation hooks (`useWrap`, `useUnwrap`, `useWrapETH`, `useFinalizeUnwrap`, `useConfidentialApprove`, `useConfidentialTransferFrom`, `useApproveUnderlying`). The pattern is identical — add `isActiveRef`, `activePromiseRef`, `phase` state, and wrap `mutationFn` with dedup logic.

### Task 17: Apply mutation dedup to remaining mutation hooks

**Files to modify (same pattern as Task 16):**

- `packages/react-sdk/src/token/use-wrap.ts`
- `packages/react-sdk/src/token/use-wrap-eth.ts`
- `packages/react-sdk/src/token/use-unwrap.ts`
- `packages/react-sdk/src/token/use-finalize-unwrap.ts`
- `packages/react-sdk/src/token/use-confidential-approve.ts`
- `packages/react-sdk/src/token/use-confidential-transfer-from.ts`
- `packages/react-sdk/src/token/use-approve-underlying.ts`

For each file:

1. Add `useRef` and `useState` imports
2. Add `isActiveRef`, `activePromiseRef`, `phase` state
3. Wrap `mutationFn` with dedup logic
4. Add `onSettled` to clean up refs
5. Return `{ ...mutation, phase }`

**Step 1: Apply changes to each file**

Read each file, then apply the dedup pattern. The `MutationPhase` type export should come from `use-confidential-transfer.ts` and be re-exported.

**Step 2: Export MutationPhase type**

In `packages/react-sdk/src/index.ts`, add:

```ts
export type { MutationPhase } from "./token/use-confidential-transfer";
```

**Step 3: Run typecheck and tests**

```bash
pnpm typecheck && pnpm test:run
```

Expected: PASS.

**Step 4: Commit**

```bash
git add packages/react-sdk/src/token/
git commit -m "feat(react-sdk): add mutation dedup and phase tracking

Prevent double-signing by deduplicating in-flight mutations.
Add MutationPhase ('idle'|'encrypting'|'submitting'|'confirming'|'done'|'error')
to all mutation hooks for UI feedback."
```

---

## Phase 5: React Unit Tests (react-sdk)

### Task 18: Add testing dependencies

**Step 1: Check if @testing-library/react is installed**

```bash
grep "@testing-library/react" packages/react-sdk/package.json
```

If not present:

```bash
pnpm --filter @zama-fhe/react-sdk add -D @testing-library/react @testing-library/react-hooks
```

### Task 19: Create test utilities

**Files:**

- Create: `packages/react-sdk/src/__tests__/test-utils.tsx`

**Step 1: Write test utilities**

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TokenSDKProvider } from "../provider";
import type {
  GenericSigner,
  GenericStringStorage,
  RelayerSDK,
  Address,
  TransactionReceipt,
  EIP712TypedData,
  ContractCallConfig,
} from "@zama-fhe/sdk";
import { type ReactNode } from "react";
import { vi } from "vitest";

/** Create a mock GenericSigner for testing. */
export function createMockSigner(overrides?: Partial<GenericSigner>): GenericSigner {
  return {
    getChainId: vi.fn().mockResolvedValue(31337),
    getAddress: vi.fn().mockResolvedValue("0x1234567890abcdef1234567890abcdef12345678" as Address),
    signTypedData: vi.fn().mockResolvedValue("0xsig" as Address),
    writeContract: vi.fn().mockResolvedValue("0xtxhash" as Address),
    readContract: vi.fn().mockResolvedValue(undefined),
    waitForTransactionReceipt: vi.fn().mockResolvedValue({ logs: [] } as TransactionReceipt),
    ...overrides,
  };
}

/** Create a mock RelayerSDK for testing. */
export function createMockRelayer(overrides?: Partial<RelayerSDK>): RelayerSDK {
  return {
    generateKeypair: vi.fn().mockResolvedValue({ publicKey: "0xpub", privateKey: "0xpriv" }),
    createEIP712: vi
      .fn()
      .mockResolvedValue({ types: {}, primaryType: "", domain: {}, message: {} }),
    encrypt: vi.fn().mockResolvedValue({ handles: [], inputProof: "0x" }),
    userDecrypt: vi.fn().mockResolvedValue({}),
    publicDecrypt: vi.fn().mockResolvedValue({}),
    delegatedUserDecrypt: vi.fn().mockResolvedValue({}),
    requestZKProofVerification: vi.fn().mockResolvedValue(undefined),
    getPublicKey: vi.fn().mockResolvedValue("0xpublickey"),
    getPublicParams: vi.fn().mockResolvedValue("0xparams"),
    createDelegatedUserDecryptEIP712: vi
      .fn()
      .mockResolvedValue({ types: {}, primaryType: "", domain: {}, message: {} }),
    terminate: vi.fn(),
    ...overrides,
  } as RelayerSDK;
}

/** Create a mock storage for testing. */
export function createMockStorage(): GenericStringStorage {
  const store = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
  };
}

/** Create a provider wrapper for renderHook tests. */
export function createProviderWrapper(options?: {
  signer?: GenericSigner;
  relayer?: RelayerSDK;
  storage?: GenericStringStorage;
  expectedChainId?: number;
}) {
  const signer = options?.signer ?? createMockSigner();
  const relayer = options?.relayer ?? createMockRelayer();
  const storage = options?.storage ?? createMockStorage();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <TokenSDKProvider
          relayer={relayer}
          signer={signer}
          storage={storage}
          expectedChainId={options?.expectedChainId}
        >
          {children}
        </TokenSDKProvider>
      </QueryClientProvider>
    );
  }

  return { Wrapper, queryClient, signer, relayer, storage };
}
```

### Task 20: Write provider lifecycle tests

**Files:**

- Create: `packages/react-sdk/src/__tests__/provider.test.tsx`

**Step 1: Write tests**

```tsx
import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useTokenSDK, useTokenSDKStatus } from "../provider";
import { createProviderWrapper, createMockSigner } from "./test-utils";

describe("TokenSDKProvider", () => {
  describe("useTokenSDK", () => {
    it("throws outside of provider", () => {
      expect(() => {
        renderHook(() => useTokenSDK());
      }).toThrow("useTokenSDK must be used within a TokenSDKProvider");
    });

    it("returns SDK instance inside provider", () => {
      const { Wrapper } = createProviderWrapper();
      const { result } = renderHook(() => useTokenSDK(), { wrapper: Wrapper });
      expect(result.current).toBeDefined();
    });
  });

  describe("useTokenSDKStatus", () => {
    it("reports ready phase without expectedChainId", async () => {
      const { Wrapper } = createProviderWrapper();
      const { result } = renderHook(() => useTokenSDKStatus(), { wrapper: Wrapper });

      await waitFor(() => {
        expect(result.current.isReady).toBe(true);
        expect(result.current.phase).toBe("ready");
        expect(result.current.error).toBeNull();
      });
    });

    it("reports ready when chain matches expectedChainId", async () => {
      const signer = createMockSigner({ getChainId: vi.fn().mockResolvedValue(31337) });
      const { Wrapper } = createProviderWrapper({ signer, expectedChainId: 31337 });
      const { result } = renderHook(() => useTokenSDKStatus(), { wrapper: Wrapper });

      await waitFor(() => {
        expect(result.current.isReady).toBe(true);
      });
    });

    it("reports chain mismatch error when chain differs", async () => {
      const signer = createMockSigner({ getChainId: vi.fn().mockResolvedValue(1) });
      const { Wrapper } = createProviderWrapper({ signer, expectedChainId: 31337 });
      const { result } = renderHook(() => useTokenSDKStatus(), { wrapper: Wrapper });

      await waitFor(() => {
        expect(result.current.isReady).toBe(false);
        expect(result.current.error).toBeDefined();
        expect(result.current.error?.message).toContain("mismatch");
      });
    });
  });
});
```

**Step 2: Run tests**

```bash
pnpm test:run -- --reporter=verbose packages/react-sdk/src/__tests__/provider.test.tsx
```

Expected: All tests PASS.

### Task 21: Write reducer tests (already done in Task 13)

Already covered in Task 13.

### Task 22: Run full suite, build, and commit

**Step 1: Full verification**

```bash
pnpm test:run && pnpm typecheck && pnpm build
```

Expected: All PASS.

**Step 2: Commit**

```bash
git add packages/react-sdk/src/__tests__/ packages/react-sdk/src/core/__tests__/ packages/react-sdk/package.json
git commit -m "test(react-sdk): add React unit tests for provider and reducer

Add test utilities (createMockSigner, createMockRelayer, createProviderWrapper).
Test provider lifecycle phases, chain validation, and reducer transitions."
```

---

## Summary

| Task  | Description                                              | Phase   |
| ----- | -------------------------------------------------------- | ------- |
| 1-3   | Delete 39 duplicated hook files across viem/ethers/wagmi | Phase 1 |
| 4-5   | Verify build, typecheck, update test-app                 | Phase 1 |
| 6-9   | Extend error codes, add subclasses, add error tests      | Phase 2 |
| 10-14 | Create reducer, config factory, update provider          | Phase 3 |
| 15-17 | Add mutation dedup and phase tracking                    | Phase 4 |
| 18-22 | Add test utilities and React unit tests                  | Phase 5 |
