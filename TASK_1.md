# TASK 1: Three-Layer Split — Actions, Query Factories, Thin Hooks

**Parent:** `PRD-ARCHITECTURE-REFACTOR.md`
**Scope:** Extract the 3-layer architecture (Actions → Query Options → React Hooks) without changing the config/provider/signer/credential lifecycle.
**Constraint:** Runtime behavior remains equivalent to today's operations (no net-new features), but this task intentionally includes breaking API/import/query-key changes. Full cutover — no backward compatibility shims, no deprecated re-exports. Breaking changes are acceptable and must be explicitly documented with migration guidance.

---

FIRST INSTRUCTION: Load tanstack-best-practices skill into your context.

## Objective

Split the SDK into proper layers while keeping Token/ReadonlyToken classes and ZamaProvider runtime behavior working exactly as they do today. Public import paths and cache key shapes are allowed to change in this task, with clear migration documentation.

**What changes:**

- New `@zama-fhe/sdk/query` subpath with all query/mutation options factories + utilities
- Query options factories extracted from react-sdk hooks → sdk/query
- Missing factories added for the 3 hooks that lack them
- React hooks become thin wrappers over factories
- Centralized cache invalidation helpers
- Proper TanStack Query utilities (`filterQueryOptions`, `hashFn`, namespaced keys)

**What does NOT change:**

- `ZamaProvider` props and behavior
- `ZamaSDK`, `Token`, `ReadonlyToken` classes
- Signer/credential lifecycle
- Adapter subpaths (`wagmi/`, `viem/`, `ethers/`) — deferred to later task

**Breaking changes policy for Task 1:**

- Breaking import path/export/query-key changes are expected.
- Every breaking change must be documented in a migration section before merge.
- React hook runtime semantics must stay equivalent after migration.

---

## Reference: The Pattern We're Targeting

### wagmi's three-layer pattern (from `tmp/wagmi`)

```
packages/core/src/actions/getBalance.ts     → Layer 1: pure async function
packages/core/src/query/getBalance.ts       → Layer 2: query options factory
packages/react/src/hooks/useBalance.ts      → Layer 3: ~7 lines, calls factory + useQuery
```

**Layer 2 is the workhorse.** It defines queryKey, queryFn, enabled gating, and staleTime. Layer 3 just bridges React context to Layer 2.

### What a wagmi query options factory looks like

```ts
// @wagmi/core/query/getBalance.ts
export function getBalanceQueryOptions(config, options = {}) {
  return {
    ...options.query, // (A) user overrides spread FIRST
    enabled: Boolean(
      // (B) factory sets these — overrides user's
      options.address && (options.query?.enabled ?? true),
    ),
    queryKey: getBalanceQueryKey(options), // (B) can't be overridden
    queryFn: async (context) => {
      // (B) can't be overridden
      const [, { scopeKey: _, ...params }] = context.queryKey; // extract from KEY
      return getBalance(config, params);
    },
  };
}

export function getBalanceQueryKey(options) {
  return ["balance", filterQueryOptions(options)] as const;
}
```

**Key patterns:**

1. `...options.query` spread first, then factory properties override (queryKey, queryFn, enabled always win)
2. `queryFn` extracts params from `context.queryKey`, not from closure
3. `enabled` auto-gates on required params (no manual guards in components)
4. `filterQueryOptions` strips behavioral options from the key

### What a wagmi React hook looks like

```ts
// @wagmi/react/hooks/useBalance.ts
export function useBalance(parameters = {}) {
  const config = useConfig(parameters);
  const chainId = useChainId({ config });
  const options = getBalanceQueryOptions(config, {
    ...parameters,
    chainId: parameters.chainId ?? chainId,
  });
  return useQuery({ ...options, queryKeyHashFn: hashFn });
}
```

That's the entire implementation. ~7 lines.

### What a wagmi mutation options factory looks like

```ts
// @wagmi/core/query/sendTransaction.ts
export function sendTransactionMutationOptions(config, options = {}) {
  return {
    ...(options.mutation as any),
    mutationFn(variables) {
      return sendTransaction(config, variables);
    },
    mutationKey: ["sendTransaction"],
  };
}
```

### TanStack best practices (from loaded skill)

**Cache model:** Query key = cache identity. Two components using the same key share one cache entry. `filterQueryOptions` prevents behavioral options (staleTime, refetchInterval) from contaminating the key.

**`hashFn` for bigint:** Standard JSON.stringify fails on bigint. Custom hashFn sorts object keys (deterministic) and converts bigints to strings.

**Anti-patterns to fix:**

- Close over params in `queryFn` → should extract from `context.queryKey`
- Include behavioral options in key → should use `filterQueryOptions`
- Framework-specific query options → should keep Layer 2 framework-agnostic

---

## Current State (what exists today)

### Hooks WITH query options factories (10 hooks — already partially Layer 2)

These already export a `*QueryOptions()` or `*MutationOptions()` function. They live in `packages/react-sdk/src/token/` and `packages/react-sdk/src/relayer/`.

| Hook                        | Factory                                              | File                                                  |
| --------------------------- | ---------------------------------------------------- | ----------------------------------------------------- |
| `useTokenMetadata`          | `tokenMetadataQueryOptions(token)`                   | `react-sdk/src/token/use-token-metadata.ts`           |
| `useIsConfidential`         | `isConfidentialQueryOptions(token)`                  | `react-sdk/src/token/use-is-confidential.ts`          |
| `useIsWrapper`              | `isWrapperQueryOptions(token)`                       | `react-sdk/src/token/use-is-confidential.ts`          |
| `useTotalSupply`            | `totalSupplyQueryOptions(token)`                     | `react-sdk/src/token/use-total-supply.ts`             |
| `useWrapperDiscovery`       | `wrapperDiscoveryQueryOptions(token, coordinator)`   | `react-sdk/src/token/use-wrapper-discovery.ts`        |
| `useUnderlyingAllowance`    | `underlyingAllowanceQueryOptions(token, wrapper)`    | `react-sdk/src/token/use-underlying-allowance.ts`     |
| `useConfidentialIsApproved` | `confidentialIsApprovedQueryOptions(token, spender)` | `react-sdk/src/token/use-confidential-is-approved.ts` |
| `useShieldFee` / etc.       | `shieldFeeQueryOptions(signer, config)`              | `react-sdk/src/token/use-fees.ts`                     |
| `usePublicKey`              | `publicKeyQueryOptions(sdk)`                         | `react-sdk/src/relayer/use-public-key.ts`             |
| `usePublicParams`           | `publicParamsQueryOptions(sdk, bits)`                | `react-sdk/src/relayer/use-public-params.ts`          |

### Hooks WITHOUT query options factories (3 hooks — need factories)

| Hook                      | File                                               | Why it's harder                                                                                |
| ------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `useConfidentialBalance`  | `react-sdk/src/token/use-confidential-balance.ts`  | Two-phase pattern: Phase 1 polls handle, Phase 2 decrypts. Composes 3 `useQuery` calls inline. |
| `useConfidentialBalances` | `react-sdk/src/token/use-confidential-balances.ts` | Same two-phase, batch variant.                                                                 |
| `useActivityFeed`         | `react-sdk/src/token/use-activity-feed.ts`         | Inline query with complex data transformation.                                                 |

### Mutation hooks (8 hooks — factories exist but lack invalidation)

All mutation hooks export `*MutationOptions(token)` but the factories only contain `mutationKey` + `mutationFn`. Cache invalidation lives exclusively in the React hooks' `onSuccess` callbacks. Example from `useShield`:

```ts
// Current: factory is incomplete
export function shieldMutationOptions(token: Token) {
  return {
    mutationKey: ["shield", token.address] as const,
    mutationFn: async ({ amount, fees, approvalStrategy }: ShieldParams) =>
      token.shield(amount, { fees, approvalStrategy }),
  };
}

// Cache invalidation lives only in the React hook's onSuccess:
onSuccess: (data, variables, onMutateResult, context) => {
  context.client.invalidateQueries({ queryKey: confidentialHandleQueryKeys.token(...) });
  context.client.invalidateQueries({ queryKey: confidentialHandlesQueryKeys.all });
  context.client.resetQueries({ queryKey: confidentialBalanceQueryKeys.token(...) });
  context.client.invalidateQueries({ queryKey: confidentialBalancesQueryKeys.all });
  context.client.invalidateQueries({ predicate: wagmiBalancePredicates.balanceOf });
};
```

### Query key factories (in react-sdk, should move to sdk/query)

Current location: `react-sdk/src/token/balance-query-keys.ts` + co-located in each hook file.

Issues:

- **No `zama.` namespace** — keys like `["confidentialBalance", ...]` could collide in shared QueryClient
- **No `filterQueryOptions`** — behavioral options could leak into keys
- **No `hashFn`** — bigints handled ad-hoc (some keys use `.toString()`)
- **Inconsistent signer-address key** — `["zama", "signer-address", tokenAddress]` vs `["zama", "signer-address"]`

---

## Implementation Plan

### Step 1: Create `@zama-fhe/sdk/query` subpath

Create the new entry point and TanStack Query utilities.

**Files to create:**

```
packages/sdk/src/query/
├── index.ts                    — barrel export for @zama-fhe/sdk/query
├── utils.ts                    — filterQueryOptions, hashFn
├── query-keys.ts               — all query key factories (namespaced)
├── invalidation.ts             — centralized cache invalidation helpers
│
├── token-metadata.ts           — tokenMetadataQueryOptions
├── is-confidential.ts          — isConfidentialQueryOptions, isWrapperQueryOptions
├── total-supply.ts             — totalSupplyQueryOptions
├── wrapper-discovery.ts        — wrapperDiscoveryQueryOptions
├── underlying-allowance.ts     — underlyingAllowanceQueryOptions
├── confidential-is-approved.ts — confidentialIsApprovedQueryOptions
├── fees.ts                     — shieldFeeQueryOptions, unshieldFeeQueryOptions, etc.
├── public-key.ts               — publicKeyQueryOptions
├── public-params.ts            — publicParamsQueryOptions
├── confidential-handle.ts      — NEW: getConfidentialHandleQueryOptions (Phase 1)
├── confidential-balance.ts     — NEW: getConfidentialBalanceQueryOptions (Phase 2)
├── confidential-handles.ts     — NEW: batch handle query options
├── confidential-balances.ts    — NEW: batch balance query options
├── activity-feed.ts            — NEW: activityFeedQueryOptions
│
├── shield.ts                   — shieldMutationOptions (with invalidation helper)
├── shield-eth.ts               — shieldETHMutationOptions
├── transfer.ts                 — confidentialTransferMutationOptions
├── transfer-from.ts            — confidentialTransferFromMutationOptions
├── approve.ts                  — confidentialApproveMutationOptions
├── approve-underlying.ts       — approveUnderlyingMutationOptions
├── unshield.ts                 — unshieldMutationOptions
├── unshield-all.ts             — unshieldAllMutationOptions
├── resume-unshield.ts          — resumeUnshieldMutationOptions
├── unwrap.ts                   — unwrapMutationOptions
├── unwrap-all.ts               — unwrapAllMutationOptions
├── finalize-unwrap.ts          — finalizeUnwrapMutationOptions
├── encrypt.ts                  — encryptMutationOptions
└── authorize-all.ts            — authorizeAllMutationOptions
```

**Key design: partial decoupling from Token class**

Factories are split into two tiers based on what they need from Token:

| Tier              | Takes                       | Examples                                                                                                                                  | Why                                                                                                                                                  |
| ----------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Decoupled**     | `GenericSigner` + `Address` | `tokenMetadataQueryOptions`, `isConfidentialQueryOptions`, `totalSupplyQueryOptions`, `confidentialHandleQueryOptions`, all fee factories | These only call `signer.readContract(contractBuilder(address))`. No FHE, no credentials. Already proven by `use-fees.ts`.                            |
| **Token-coupled** | `ReadonlyToken` / `Token`   | `confidentialBalanceQueryOptions`, `activityFeedQueryOptions`, all mutation factories                                                     | These need Token's decrypt orchestration (`CredentialsManager` + `RelayerSDK`) or multi-step write logic (allowance management, encrypt-then-write). |

This means a consumer using raw viem/ethers (no Token class) can use the decoupled factories directly. FHE-specific factories still require a Token instance.

**`queryFn` param sourcing — two rules:**

1. **Decoupled factories** extract all data params from `context.queryKey`. Only `signer` (infrastructure) is closed over — same as wagmi closing over `config`. This guarantees the fetch always targets the exact cache entry identified by the key, and future-proofs for reactive params (e.g., `chainId` if we add chain-switching support).
2. **Token-coupled factories** close over the `token` instance because Token is not serializable. The `token.address` in the key identifies the cache entry; the Token instance in the closure provides the decrypt/write methods. This is a pragmatic deviation — decoupling Token's internals is a separate future task.

**Decoupled factory example:**

```ts
// packages/sdk/src/query/token-metadata.ts

import type { GenericSigner, Address } from "../types";
import { nameContract, symbolContract, decimalsContract } from "../contracts";
import { zamaQueryKeys } from "./query-keys";

export function tokenMetadataQueryOptions(
  signer: GenericSigner,
  tokenAddress: Address,
  options?: { query?: Record<string, unknown> },
) {
  return {
    ...options?.query,
    queryKey: zamaQueryKeys.tokenMetadata.token(tokenAddress),
    queryFn: async (context: {
      queryKey: ReturnType<typeof zamaQueryKeys.tokenMetadata.token>;
    }) => {
      const [, { tokenAddress }] = context.queryKey; // extract from KEY, not closure
      const [name, symbol, decimals] = await Promise.all([
        signer.readContract<string>(nameContract(tokenAddress)),
        signer.readContract<string>(symbolContract(tokenAddress)),
        signer.readContract<number>(decimalsContract(tokenAddress)),
      ]);
      return { name, symbol, decimals };
    },
    staleTime: Infinity,
  } as const;
}
```

**Token-coupled factory example (the two-phase balance pattern):**

```ts
// packages/sdk/src/query/confidential-handle.ts
// Phase 1: poll the encrypted handle (cheap RPC, no signing)
// DECOUPLED — extracts data params from queryKey, closes over signer only

import type { GenericSigner, Address } from "../types";
import { confidentialBalanceOfContract } from "../contracts";
import { zamaQueryKeys } from "./query-keys";

export function confidentialHandleQueryOptions(
  signer: GenericSigner,
  tokenAddress: Address,
  options?: {
    pollingInterval?: number;
    owner?: string;
    query?: Record<string, unknown>;
  },
) {
  const ownerKey = options?.owner ?? "";
  return {
    ...options?.query,
    queryKey: zamaQueryKeys.confidentialHandle.owner(tokenAddress, ownerKey),
    queryFn: async (context: {
      queryKey: ReturnType<typeof zamaQueryKeys.confidentialHandle.owner>;
    }) => {
      const [, { tokenAddress, owner }] = context.queryKey; // extract from KEY
      return signer.readContract<Address>(confidentialBalanceOfContract(tokenAddress, owner));
    },
    enabled: Boolean(ownerKey && (options?.query?.enabled ?? true)),
    refetchInterval: options?.pollingInterval ?? 10_000,
  };
}

// packages/sdk/src/query/confidential-balance.ts
// Phase 2: decrypt when handle changes (expensive relayer roundtrip)
// TOKEN-COUPLED — closes over token (not serializable, needed for decrypt)

import type { ReadonlyToken } from "../token/readonly-token";
import { zamaQueryKeys } from "./query-keys";

export function confidentialBalanceQueryOptions(
  token: ReadonlyToken,
  options: {
    handle?: string;
    owner?: string;
    query?: Record<string, unknown>;
  },
) {
  const ownerKey = options.owner ?? "";
  return {
    ...options?.query,
    queryKey: zamaQueryKeys.confidentialBalance.owner(
      token.address,
      ownerKey,
      options.handle ?? "",
    ),
    queryFn: async (context: {
      queryKey: ReturnType<typeof zamaQueryKeys.confidentialBalance.owner>;
    }) => {
      const [, params] = context.queryKey;
      // token is closed over (not serializable), but handle comes from the key
      return token.decryptBalance(params.handle!);
    },
    enabled: Boolean(ownerKey && options.handle && (options.query?.enabled ?? true)),
    staleTime: Infinity, // only re-decrypt when handle changes
  };
}
```

The React hook then composes them — note Phase 1 uses signer (decoupled), Phase 2 uses token (coupled):

```ts
// packages/react-sdk/src/token/use-confidential-balance.ts (after refactor)

import { useQuery } from "@tanstack/react-query";
import {
  confidentialHandleQueryOptions,
  confidentialBalanceQueryOptions,
  zamaQueryKeys,
  hashFn,
} from "@zama-fhe/sdk/query";
import { useReadonlyToken } from "./use-readonly-token";

export function useConfidentialBalance(config, options?) {
  const token = useReadonlyToken(config.tokenAddress);

  // Resolve signer address (needed for owner key)
  const addressQuery = useQuery({
    queryKey: zamaQueryKeys.signerAddress.token(config.tokenAddress),
    queryFn: () => token.signer.getAddress(),
    queryKeyHashFn: hashFn,
  });

  const owner = addressQuery.data ?? "";

  // Phase 1: poll handle (decoupled — uses signer directly)
  const handleQuery = useQuery({
    ...confidentialHandleQueryOptions(token.signer, config.tokenAddress, {
      owner,
      pollingInterval: config.handleRefetchInterval,
    }),
    queryKeyHashFn: hashFn,
  });

  // Phase 2: decrypt on handle change (coupled — needs Token for decrypt)
  const balanceQuery = useQuery({
    ...confidentialBalanceQueryOptions(token, {
      handle: handleQuery.data,
      owner,
    }),
    ...options,
    queryKeyHashFn: hashFn,
  });

  return { ...balanceQuery, handleQuery };
}
```

### Step 2: Implement `filterQueryOptions` and `hashFn`

```ts
// packages/sdk/src/query/utils.ts

/**
 * Strip TanStack Query behavioral options and non-serializable objects from query keys.
 * Only "what data am I fetching?" params survive into the key.
 *
 * Without this, two components with different staleTime for the same data
 * would get separate cache entries instead of sharing one.
 */
export function filterQueryOptions(options: Record<string, unknown>) {
  const {
    // TanStack Query options (strip)
    gcTime,
    staleTime,
    enabled,
    select,
    refetchInterval,
    refetchOnMount,
    refetchOnWindowFocus,
    refetchOnReconnect,
    retry,
    retryDelay,
    retryOnMount,
    queryFn,
    queryKey,
    queryKeyHashFn,
    initialData,
    initialDataUpdatedAt,
    placeholderData,
    structuralSharing,
    throwOnError,
    meta,
    // SDK internals (strip)
    query,
    pollingInterval,
    ...rest
  } = options;
  return rest;
}

/**
 * Custom hash function for TanStack Query keys.
 * Handles bigint serialization and deterministic key ordering.
 * Pass as `queryKeyHashFn` to useQuery.
 */
export function hashFn(queryKey: readonly unknown[]): string {
  return JSON.stringify(queryKey, (_, value) => {
    if (isPlainObject(value)) {
      return Object.keys(value)
        .sort()
        .reduce(
          (result, key) => {
            result[key] = (value as Record<string, unknown>)[key];
            return result;
          },
          {} as Record<string, unknown>,
        );
    }
    if (typeof value === "bigint") return value.toString();
    return value;
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
```

### Step 3: Namespace all query keys under `zama.`

```ts
// packages/sdk/src/query/query-keys.ts

export const zamaQueryKeys = {
  // Signer address (replaces inconsistent ["zama", "signer-address", ...] patterns)
  signerAddress: {
    all: ["zama.signerAddress"] as const,
    token: (tokenAddress: string) => ["zama.signerAddress", { tokenAddress }] as const,
  },

  // Confidential handle (Phase 1 of two-phase polling)
  confidentialHandle: {
    all: ["zama.confidentialHandle"] as const,
    token: (tokenAddress: string) => ["zama.confidentialHandle", { tokenAddress }] as const,
    owner: (tokenAddress: string, owner: string) =>
      ["zama.confidentialHandle", { tokenAddress, owner }] as const,
  },

  // Confidential balance (Phase 2 — decrypted)
  // handle is inside the params object to keep the 2-element [label, params] tuple.
  // TanStack's matchQuery does recursive partial matching, so
  // invalidating with { tokenAddress } still matches entries that also have owner + handle.
  confidentialBalance: {
    all: ["zama.confidentialBalance"] as const,
    token: (tokenAddress: string) => ["zama.confidentialBalance", { tokenAddress }] as const,
    owner: (tokenAddress: string, owner: string, handle?: string) =>
      ["zama.confidentialBalance", { tokenAddress, owner, ...(handle ? { handle } : {}) }] as const,
  },

  // Batch variants
  confidentialHandles: {
    all: ["zama.confidentialHandles"] as const,
    tokens: (tokenAddresses: string[], owner: string) =>
      ["zama.confidentialHandles", { tokenAddresses, owner }] as const,
  },
  confidentialBalances: {
    all: ["zama.confidentialBalances"] as const,
    tokens: (tokenAddresses: string[], owner: string) =>
      ["zama.confidentialBalances", { tokenAddresses, owner }] as const,
  },

  // Token metadata
  tokenMetadata: {
    all: ["zama.tokenMetadata"] as const,
    token: (tokenAddress: string) => ["zama.tokenMetadata", { tokenAddress }] as const,
  },

  // ERC-165
  isConfidential: {
    all: ["zama.isConfidential"] as const,
    token: (tokenAddress: string) => ["zama.isConfidential", { tokenAddress }] as const,
  },
  isWrapper: {
    all: ["zama.isWrapper"] as const,
    token: (tokenAddress: string) => ["zama.isWrapper", { tokenAddress }] as const,
  },

  // Wrapper discovery
  wrapperDiscovery: {
    all: ["zama.wrapperDiscovery"] as const,
    token: (tokenAddress: string) => ["zama.wrapperDiscovery", { tokenAddress }] as const,
  },

  // Allowance
  underlyingAllowance: {
    all: ["zama.underlyingAllowance"] as const,
    token: (tokenAddress: string) => ["zama.underlyingAllowance", { tokenAddress }] as const,
  },

  // Approval
  confidentialIsApproved: {
    all: ["zama.confidentialIsApproved"] as const,
    token: (tokenAddress: string) => ["zama.confidentialIsApproved", { tokenAddress }] as const,
  },

  // Total supply
  totalSupply: {
    all: ["zama.totalSupply"] as const,
    token: (tokenAddress: string) => ["zama.totalSupply", { tokenAddress }] as const,
  },

  // Activity feed
  activityFeed: {
    all: ["zama.activityFeed"] as const,
    token: (tokenAddress: string) => ["zama.activityFeed", { tokenAddress }] as const,
    // Full cache identity for feed rendering (prevents cross-user/log collisions).
    // logsKey should be a deterministic fingerprint derived from txHash:logIndex pairs.
    scope: (tokenAddress: string, userAddress: string, logsKey: string, decrypt: boolean) =>
      ["zama.activityFeed", { tokenAddress, userAddress, logsKey, decrypt }] as const,
  },

  // Fees — preserves current key granularity. Shield/unshield fees depend on
  // (amount, from, to), so those params must be in the key to avoid cache collisions.
  // When amount is omitted, the key matches all fee queries for that manager (for invalidation).
  fees: {
    all: ["zama.fees"] as const,
    shieldFee: (feeManagerAddress: string, amount?: string, from?: string, to?: string) =>
      [
        "zama.fees",
        {
          type: "shield",
          feeManagerAddress,
          ...(amount !== undefined ? { amount, from, to } : {}),
        },
      ] as const,
    unshieldFee: (feeManagerAddress: string, amount?: string, from?: string, to?: string) =>
      [
        "zama.fees",
        {
          type: "unshield",
          feeManagerAddress,
          ...(amount !== undefined ? { amount, from, to } : {}),
        },
      ] as const,
    batchTransferFee: (feeManagerAddress: string) =>
      ["zama.fees", { type: "batchTransfer", feeManagerAddress }] as const,
    feeRecipient: (feeManagerAddress: string) =>
      ["zama.fees", { type: "feeRecipient", feeManagerAddress }] as const,
  },

  // Relayer
  publicKey: {
    all: ["zama.publicKey"] as const,
  },
  publicParams: {
    all: ["zama.publicParams"] as const,
    bits: (bits: number) => ["zama.publicParams", { bits }] as const,
  },

  // Decryption cache
  decryption: {
    all: ["zama.decryption"] as const,
    handle: (handle: string, contractAddress: string) =>
      ["zama.decryption", { handle, contractAddress }] as const,
  },
} as const;
```

### Step 4: Centralize cache invalidation

```ts
// packages/sdk/src/query/invalidation.ts

import type { QueryClient, Query } from "@tanstack/query-core";
import { zamaQueryKeys } from "./query-keys";

/** Invalidate all queries related to a token's confidential balance. */
export function invalidateBalanceQueries(queryClient: QueryClient, tokenAddress: string) {
  queryClient.invalidateQueries({ queryKey: zamaQueryKeys.confidentialHandle.token(tokenAddress) });
  queryClient.invalidateQueries({ queryKey: zamaQueryKeys.confidentialHandles.all });
  queryClient.resetQueries({ queryKey: zamaQueryKeys.confidentialBalance.token(tokenAddress) });
  queryClient.invalidateQueries({ queryKey: zamaQueryKeys.confidentialBalances.all });
}

/** Invalidate balance + underlying ERC-20 balance caches (after shield/unshield). */
export function invalidateAfterShield(queryClient: QueryClient, tokenAddress: string) {
  invalidateBalanceQueries(queryClient, tokenAddress);
  queryClient.invalidateQueries({
    queryKey: zamaQueryKeys.underlyingAllowance.token(tokenAddress),
  });
  invalidateWagmiBalanceQueries(queryClient);
}

/** Invalidate balance + underlying + wagmi balance caches (after unshield/finalize). */
export function invalidateAfterUnshield(queryClient: QueryClient, tokenAddress: string) {
  invalidateBalanceQueries(queryClient, tokenAddress);
  queryClient.invalidateQueries({
    queryKey: zamaQueryKeys.underlyingAllowance.token(tokenAddress),
  });
  invalidateWagmiBalanceQueries(queryClient);
}

/** Invalidate approval cache. */
export function invalidateAfterApprove(queryClient: QueryClient, tokenAddress: string) {
  queryClient.invalidateQueries({
    queryKey: zamaQueryKeys.confidentialIsApproved.token(tokenAddress),
  });
}

/**
 * Cross-library invalidation: invalidate wagmi's balance queries.
 * Works by predicate-matching wagmi's query key structure.
 * Requires sharing the same QueryClient between wagmi and ZamaProvider.
 */
export function invalidateWagmiBalanceQueries(queryClient: QueryClient) {
  queryClient.invalidateQueries({
    predicate: (query: Query) =>
      Array.isArray(query.queryKey) &&
      query.queryKey.some(
        (key) =>
          typeof key === "object" &&
          key !== null &&
          "functionName" in key &&
          (key as Record<string, unknown>).functionName === "balanceOf",
      ),
  });
}
```

### Step 5: Update `@zama-fhe/sdk` package/build/API-report config

Add the `./query` subpath export:

```jsonc
// packages/sdk/package.json — add to "exports":
{
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
    "./query": { "types": "./dist/query/index.d.ts", "import": "./dist/query/index.js" },
    "./viem": { "types": "./dist/viem/index.d.ts", "import": "./dist/viem/index.js" },
    "./ethers": { "types": "./dist/ethers/index.d.ts", "import": "./dist/ethers/index.js" },
    "./node": { "types": "./dist/node/index.d.ts", "import": "./dist/node/index.js" },
  },
}
```

Add `query/index` to tsup entry points. Add `@tanstack/query-core` as a peer dependency (NOT `@tanstack/react-query` — the query subpath is framework-agnostic).

```jsonc
// packages/sdk/package.json — add to peerDependencies:
{
  "peerDependencies": {
    "@tanstack/query-core": ">=5", // NEW — for query options factories
    // ... existing
  },
  "peerDependenciesMeta": {
    "@tanstack/query-core": { "optional": true }, // only needed if using sdk/query
  },
}
```

Add API report wiring for the new public entrypoint:

- Create `packages/sdk/api-extractor.query.json` with `mainEntryPointFilePath: "<projectFolder>/dist/query/index.d.ts"` and report file name (e.g. `sdk-query.api.md`)
- Update root `package.json` scripts `api-report:sdk` and `api-report:check:sdk` to run this new config alongside existing sdk configs
- Ensure generated API report artifacts are updated in `packages/sdk/etc/`

### Step 6: Refactor React hooks to use sdk/query factories

For each hook, replace inline query config with the factory from `@zama-fhe/sdk/query`.

**Example: `useTokenMetadata` (already has a factory — just moves)**

Before:

```ts
// react-sdk/src/token/use-token-metadata.ts
import { useQuery } from "@tanstack/react-query";
import { useReadonlyToken } from "./use-readonly-token";

export function tokenMetadataQueryOptions(token) {
  /* ... inline ... */
}

export function useTokenMetadata(tokenAddress, options?) {
  const token = useReadonlyToken(tokenAddress);
  return useQuery({ ...tokenMetadataQueryOptions(token), ...options });
}
```

After:

```ts
// react-sdk/src/token/use-token-metadata.ts
import { useQuery } from "@tanstack/react-query";
import { tokenMetadataQueryOptions, hashFn } from "@zama-fhe/sdk/query";
import { useReadonlyToken } from "./use-readonly-token";

export function useTokenMetadata(tokenAddress, options?) {
  const token = useReadonlyToken(tokenAddress);
  return useQuery({
    ...tokenMetadataQueryOptions(token.signer, tokenAddress),
    ...options,
    queryKeyHashFn: hashFn,
  });
}
```

**Example: `useShield` (mutation — add invalidation helper)**

Before:

```ts
// 50+ lines with inline invalidation in onSuccess
```

After:

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { shieldMutationOptions, invalidateAfterShield, zamaQueryKeys } from "@zama-fhe/sdk/query";
import { useToken } from "./use-token";

export function useShield(config, options?) {
  const token = useToken(config);
  const queryClient = useQueryClient();

  return useMutation({
    ...shieldMutationOptions(token),
    ...options,
    onMutate: config.optimistic
      ? async (variables) => {
          // Optimistic update — keep in React layer (it uses queryClient)
          const balanceKey = zamaQueryKeys.confidentialBalance.token(config.tokenAddress);
          await queryClient.cancelQueries({ queryKey: balanceKey });
          const previous = queryClient.getQueriesData<bigint>({ queryKey: balanceKey });
          for (const [key, value] of previous) {
            if (value !== undefined) queryClient.setQueryData(key, value + variables.amount);
          }
          return config.tokenAddress;
        }
      : options?.onMutate,
    onError: (error, variables, context) => {
      if (config.optimistic) {
        queryClient.invalidateQueries({
          queryKey: zamaQueryKeys.confidentialBalance.token(config.tokenAddress),
        });
      }
      options?.onError?.(error, variables, context);
    },
    onSuccess: (data, variables, context) => {
      invalidateAfterShield(queryClient, config.tokenAddress);
      options?.onSuccess?.(data, variables, context);
    },
  });
}
```

### Step 7: Delete old files, update exports (full cutover)

No backward compatibility. Old imports break — consumers must update to the new paths.

**Delete:**

- `react-sdk/src/token/balance-query-keys.ts` — replaced by `@zama-fhe/sdk/query` `zamaQueryKeys`

**Update `react-sdk/src/index.ts`:**

- Remove all `*QueryKeys`, `*QueryOptions`, `*MutationOptions` exports from hook files
- Export them from `@zama-fhe/sdk/query` instead:

```ts
// react-sdk/src/index.ts — query layer now comes from sdk/query
export {
  zamaQueryKeys,
  hashFn,
  filterQueryOptions,
  tokenMetadataQueryOptions,
  shieldMutationOptions,
  confidentialTransferMutationOptions,
  confidentialHandleQueryOptions,
  confidentialBalanceQueryOptions,
  invalidateBalanceQueries,
  invalidateAfterShield,
  invalidateAfterUnshield,
  invalidateAfterApprove,
  // ... all factories
} from "@zama-fhe/sdk/query";
```

**Query key shape changes (breaking):**

- `["confidentialBalance", tokenAddress]` → `["zama.confidentialBalance", { tokenAddress }]`
- `["tokenMetadata", tokenAddress]` → `["zama.tokenMetadata", { tokenAddress }]`
- etc.

The old per-domain key factories (`confidentialBalanceQueryKeys`, `tokenMetadataQueryKeys`, etc.) are gone. The single `zamaQueryKeys` object is the canonical source.

**Required breaking-change documentation:**

- Add a migration section to this PR describing import path moves (`react-sdk` local factories/keys → `@zama-fhe/sdk/query`)
- Document query key shape migration examples for cache invalidation code
- Include a Changeset entry with a clear `BREAKING CHANGE:` note and upgrade steps

---

## Checklist

### New files to create

- [ ] `packages/sdk/src/query/utils.ts` — `filterQueryOptions`, `hashFn`, `isPlainObject`
- [ ] `packages/sdk/src/query/query-keys.ts` — `zamaQueryKeys` with `zama.` namespace
- [ ] `packages/sdk/src/query/invalidation.ts` — centralized cache invalidation helpers
- [ ] `packages/sdk/src/query/index.ts` — barrel export
- [ ] `packages/sdk/api-extractor.query.json` — API Extractor config for `@zama-fhe/sdk/query`
- [ ] One `.ts` file per query/mutation options factory (see Step 1 file list)

### Files to modify

- [ ] `packages/sdk/package.json` — add `./query` export, add `@tanstack/query-core` peer dep
- [ ] `packages/sdk/tsup.config.ts` — add `query/index` entry point
- [ ] root `package.json` — include query API extractor in `api-report:sdk` and `api-report:check:sdk`
- [ ] Each `react-sdk/src/token/use-*.ts` hook — import factory from `@zama-fhe/sdk/query`, thin down, remove inline factory definitions
- [ ] Each `react-sdk/src/relayer/use-*.ts` hook — import factory from `@zama-fhe/sdk/query`, thin down, remove inline factory definitions
- [ ] `react-sdk/src/index.ts` — replace old query key/factory exports with re-exports from `@zama-fhe/sdk/query`

### Files to delete

- [ ] `react-sdk/src/token/balance-query-keys.ts` — fully replaced by `zamaQueryKeys` in `@zama-fhe/sdk/query`

### Verification

- [ ] `pnpm typecheck` passes
- [ ] `pnpm test:run` passes (all tests updated)
- [ ] `pnpm build` succeeds (both packages)
- [ ] `import { zamaQueryKeys, hashFn, tokenMetadataQueryOptions } from '@zama-fhe/sdk/query'` works
- [ ] `pnpm api-report` succeeds with the new `sdk-query.api.md` output
- [ ] Migration notes for all breaking changes are present in PR + Changeset

---

## Testing Strategy

### Philosophy

Following wagmi's testing model and TanStack best practices, we test in four layers:

```
Layer 4:  Type Tests            (*.test-d.ts)      — compile-time type assertions (instant)
Layer 3:  Hook Integration      (*.test.tsx)        — render + fetch + assert lifecycle
Layer 2:  Query Options         (query/*.test.ts)   — factory output: key shape, enabled, staleTime (ms)
Layer 1:  Utility Unit Tests    (query/*.test.ts)   — filterQueryOptions, hashFn, query keys (ms)
```

**Key principle from wagmi:** Layer 2 tests are synchronous unit tests — they call the factory and snapshot the returned object. They never execute `queryFn`, never render React, never hit the network. Layer 3 tests use the existing `renderWithProviders` infrastructure.

### Test file list

```
packages/sdk/src/query/__tests__/
├── utils.test.ts                    — filterQueryOptions, hashFn, isPlainObject
├── query-keys.test.ts               — zamaQueryKeys structure, hierarchy, prefix matching
├── invalidation.test.ts             — all invalidation helpers
├── token-metadata.test.ts           — decoupled factory
├── is-confidential.test.ts          — both isConfidential + isWrapper factories
├── total-supply.test.ts             — decoupled factory
├── wrapper-discovery.test.ts        — decoupled factory
├── underlying-allowance.test.ts     — decoupled factory
├── confidential-is-approved.test.ts — decoupled factory
├── fees.test.ts                     — all 4 fee factories (already decoupled)
├── public-key.test.ts               — relayer factory
├── public-params.test.ts            — relayer factory
├── confidential-handle.test.ts      — NEW: decoupled, enabled gating, refetchInterval
├── confidential-balance.test.ts     — NEW: token-coupled, enabled gating, staleTime
├── confidential-handles.test.ts     — NEW: batch variant
├── confidential-balances.test.ts    — NEW: batch variant
├── activity-feed.test.ts            — NEW: token-coupled
├── shield.test.ts                   — mutation factory
├── shield-eth.test.ts               — mutation factory
├── transfer.test.ts                 — mutation factory
├── transfer-from.test.ts            — mutation factory
├── approve.test.ts                  — mutation factory
├── approve-underlying.test.ts       — mutation factory
├── unshield.test.ts                 — mutation factory
├── unshield-all.test.ts             — mutation factory
├── resume-unshield.test.ts          — mutation factory
├── unwrap.test.ts                   — mutation factory
├── unwrap-all.test.ts               — mutation factory
├── finalize-unwrap.test.ts          — mutation factory
├── encrypt.test.ts                  — mutation factory
└── authorize-all.test.ts            — mutation factory
```

Total: **29 test files** in `packages/sdk/src/query/__tests__/`.

Plus updates to existing test files in `packages/react-sdk/src/__tests__/`:

- `query-options.test.ts` — update imports to `@zama-fhe/sdk/query`, verify re-exports work
- `mutation-options.test.ts` — same import update
- `query-hooks.test.tsx` — update key shape assertions in snapshots
- `mutation-hooks.test.tsx` — update key shape assertions, verify invalidation helper integration
- `balance-query-keys.test.ts` — **delete** (replaced by `query-keys.test.ts` in sdk)

### Layer 1: Utility unit tests

#### `utils.test.ts` — `filterQueryOptions`

```ts
import { describe, test, expect } from "vitest";
import { filterQueryOptions, hashFn } from "../utils";

describe("filterQueryOptions", () => {
  test("strips TanStack Query behavioral options", () => {
    const filtered = filterQueryOptions({
      staleTime: 1000,
      gcTime: 5000,
      enabled: true,
      refetchInterval: 10_000,
      address: "0xabc",
      chainId: 1,
    });
    expect(filtered).toEqual({ address: "0xabc", chainId: 1 });
  });

  test("strips SDK internals (query, pollingInterval)", () => {
    const filtered = filterQueryOptions({
      query: { staleTime: 1000 },
      pollingInterval: 5000,
      tokenAddress: "0xabc",
    });
    expect(filtered).toEqual({ tokenAddress: "0xabc" });
  });

  test("preserves all non-behavioral options", () => {
    const filtered = filterQueryOptions({
      address: "0xabc",
      owner: "0xdef",
      amount: "100",
      from: "0x111",
      to: "0x222",
    });
    expect(filtered).toEqual({
      address: "0xabc",
      owner: "0xdef",
      amount: "100",
      from: "0x111",
      to: "0x222",
    });
  });

  test("returns empty object when all options are behavioral", () => {
    const filtered = filterQueryOptions({
      staleTime: 1000,
      gcTime: 5000,
      enabled: true,
    });
    expect(filtered).toEqual({});
  });
});
```

#### `utils.test.ts` — `hashFn`

```ts
describe("hashFn", () => {
  test("handles bigint values", () => {
    const result = hashFn(["balance", { value: 100n }]);
    expect(result).toBe(JSON.stringify(["balance", { value: "100" }]));
  });

  test("deterministic key ordering", () => {
    expect(hashFn([{ b: 2, a: 1 }])).toBe(hashFn([{ a: 1, b: 2 }]));
  });

  test("handles nested objects with consistent ordering", () => {
    const result = hashFn(["test", { outer: { z: 1, a: 2 } }]);
    // a should sort before z
    expect(result).toContain('"a":2');
    const idx_a = result.indexOf('"a"');
    const idx_z = result.indexOf('"z"');
    expect(idx_a).toBeLessThan(idx_z);
  });

  test("handles null and undefined without throwing", () => {
    expect(() => hashFn(["test", null])).not.toThrow();
    expect(() => hashFn(["test", undefined])).not.toThrow();
  });

  test("handles arrays in keys", () => {
    const result = hashFn(["tokens", { addresses: ["0xa", "0xb"] }]);
    expect(result).toBe(JSON.stringify(["tokens", { addresses: ["0xa", "0xb"] }]));
  });

  test("same logical key produces same hash regardless of object creation order", () => {
    const key1 = ["zama.fees", { type: "shield", feeManagerAddress: "0xabc", amount: "100" }];
    const key2 = ["zama.fees", { amount: "100", feeManagerAddress: "0xabc", type: "shield" }];
    expect(hashFn(key1)).toBe(hashFn(key2));
  });
});
```

### Layer 1: Query key structure tests

#### `query-keys.test.ts`

```ts
import { describe, test, expect } from "vitest";
import { zamaQueryKeys } from "../query-keys";

describe("zamaQueryKeys", () => {
  describe("namespace prefix", () => {
    // Every key starts with 'zama.' to avoid collisions in shared QueryClient
    test.each([
      ["signerAddress", zamaQueryKeys.signerAddress.all],
      ["confidentialHandle", zamaQueryKeys.confidentialHandle.all],
      ["confidentialBalance", zamaQueryKeys.confidentialBalance.all],
      ["tokenMetadata", zamaQueryKeys.tokenMetadata.all],
      ["isConfidential", zamaQueryKeys.isConfidential.all],
      ["fees", zamaQueryKeys.fees.all],
      ["publicKey", zamaQueryKeys.publicKey.all],
    ])("%s starts with zama.", (_, key) => {
      expect(key[0]).toMatch(/^zama\./);
    });
  });

  describe("2-element tuple shape", () => {
    // All parameterized keys should be [label, params] tuples
    test("tokenMetadata.token", () => {
      const key = zamaQueryKeys.tokenMetadata.token("0xabc");
      expect(key).toHaveLength(2);
      expect(key).toEqual(["zama.tokenMetadata", { tokenAddress: "0xabc" }]);
    });

    test("confidentialBalance.owner with handle", () => {
      const key = zamaQueryKeys.confidentialBalance.owner("0xabc", "0xowner", "0xhandle");
      expect(key).toHaveLength(2);
      expect(key[1]).toEqual({
        tokenAddress: "0xabc",
        owner: "0xowner",
        handle: "0xhandle",
      });
    });

    test("confidentialBalance.owner without handle", () => {
      const key = zamaQueryKeys.confidentialBalance.owner("0xabc", "0xowner");
      expect(key).toHaveLength(2);
      expect(key[1]).not.toHaveProperty("handle");
    });

    test("fees.shieldFee with all params", () => {
      const key = zamaQueryKeys.fees.shieldFee("0xfee", "100", "0xfrom", "0xto");
      expect(key).toHaveLength(2);
      expect(key[1]).toEqual({
        type: "shield",
        feeManagerAddress: "0xfee",
        amount: "100",
        from: "0xfrom",
        to: "0xto",
      });
    });

    test("fees.shieldFee without amount (for invalidation matching)", () => {
      const key = zamaQueryKeys.fees.shieldFee("0xfee");
      expect(key).toHaveLength(2);
      expect(key[1]).toEqual({ type: "shield", feeManagerAddress: "0xfee" });
      expect(key[1]).not.toHaveProperty("amount");
    });

    test("activityFeed.scope includes full cache identity inputs", () => {
      const key = zamaQueryKeys.activityFeed.scope("0xtoken", "0xuser", "0xtx1:0,0xtx2:1", true);
      expect(key).toHaveLength(2);
      expect(key).toEqual([
        "zama.activityFeed",
        {
          tokenAddress: "0xtoken",
          userAddress: "0xuser",
          logsKey: "0xtx1:0,0xtx2:1",
          decrypt: true,
        },
      ]);
    });
  });

  describe("prefix matching for invalidation", () => {
    // TanStack Query uses array prefix matching for invalidation.
    // Broader keys should be prefixes of narrower keys.
    test("token key is prefix of owner key", () => {
      const tokenKey = zamaQueryKeys.confidentialHandle.token("0xabc");
      const ownerKey = zamaQueryKeys.confidentialHandle.owner("0xabc", "0xowner");
      // Same label
      expect(tokenKey[0]).toBe(ownerKey[0]);
      // Token params are a subset of owner params (for partial matching)
      expect(ownerKey[1]).toMatchObject(tokenKey[1]);
    });

    test("all key is prefix of token key", () => {
      const allKey = zamaQueryKeys.confidentialBalance.all;
      const tokenKey = zamaQueryKeys.confidentialBalance.token("0xabc");
      expect(allKey[0]).toBe(tokenKey[0]);
    });
  });
});
```

### Layer 2: Query options factory tests

**Pattern:** Call factory → snapshot the returned object. Never execute `queryFn`. Mock only what's needed for the factory call (signer or token).

#### `token-metadata.test.ts` (decoupled factory)

```ts
import { describe, test, expect, vi } from "vitest";
import { tokenMetadataQueryOptions } from "../token-metadata";
import type { GenericSigner } from "../../types";

function createMockSigner(): GenericSigner {
  return {
    readContract: vi.fn(),
    getAddress: vi.fn(),
    // ... other required GenericSigner methods as vi.fn()
  } as unknown as GenericSigner;
}

describe("tokenMetadataQueryOptions", () => {
  const signer = createMockSigner();
  const tokenAddress = "0xabc";

  test("returns correct shape", () => {
    const options = tokenMetadataQueryOptions(signer, tokenAddress);
    expect(options).toMatchInlineSnapshot(`
      {
        "queryFn": [Function],
        "queryKey": ["zama.tokenMetadata", { "tokenAddress": "0xabc" }],
        "staleTime": Infinity,
      }
    `);
  });

  test("staleTime is Infinity (metadata is immutable)", () => {
    const options = tokenMetadataQueryOptions(signer, tokenAddress);
    expect(options.staleTime).toBe(Infinity);
  });

  test("user query overrides do not replace queryKey or queryFn", () => {
    const options = tokenMetadataQueryOptions(signer, tokenAddress, {
      query: { staleTime: 1000, queryKey: ["evil"] as any, queryFn: vi.fn() },
    });
    // Factory's queryKey and queryFn win (spread order: user first, factory after)
    expect(options.queryKey).toEqual(["zama.tokenMetadata", { tokenAddress: "0xabc" }]);
    expect(options.staleTime).toBe(Infinity);
  });

  test("user behavioral overrides that factory does not set are preserved", () => {
    const selectFn = vi.fn();
    const options = tokenMetadataQueryOptions(signer, tokenAddress, {
      query: { select: selectFn, gcTime: 0 },
    });
    // These should pass through since the factory doesn't set them
    expect((options as any).select).toBe(selectFn);
    expect((options as any).gcTime).toBe(0);
  });

  test("queryFn calls signer.readContract for name, symbol, decimals", async () => {
    const mockSigner = createMockSigner();
    vi.mocked(mockSigner.readContract)
      .mockResolvedValueOnce("TestToken")
      .mockResolvedValueOnce("TT")
      .mockResolvedValueOnce(18);

    const options = tokenMetadataQueryOptions(mockSigner, tokenAddress);
    // Pass context with queryKey, as TanStack Query would
    const result = await options.queryFn({ queryKey: options.queryKey });

    expect(result).toEqual({ name: "TestToken", symbol: "TT", decimals: 18 });
    expect(mockSigner.readContract).toHaveBeenCalledTimes(3);
  });

  test("queryFn extracts tokenAddress from key, not closure", async () => {
    const mockSigner = createMockSigner();
    vi.mocked(mockSigner.readContract).mockResolvedValue("mock");

    const options = tokenMetadataQueryOptions(mockSigner, "0xoriginal");
    // Simulate TanStack calling with a different key (e.g., after key change)
    const differentKey = zamaQueryKeys.tokenMetadata.token("0xdifferent");
    await options.queryFn({ queryKey: differentKey });

    // Should have called readContract with 0xdifferent (from key), not 0xoriginal (from closure)
    expect(mockSigner.readContract).toHaveBeenCalledWith(
      expect.objectContaining({ address: "0xdifferent" }),
    );
  });
});
```

#### `confidential-handle.test.ts` (decoupled, with enabled gating)

```ts
import { describe, test, expect, vi } from "vitest";
import { confidentialHandleQueryOptions } from "../confidential-handle";

describe("confidentialHandleQueryOptions", () => {
  const signer = createMockSigner();
  const tokenAddress = "0xabc";

  test("returns correct shape with all params", () => {
    const options = confidentialHandleQueryOptions(signer, tokenAddress, {
      owner: "0xowner",
    });
    expect(options).toMatchInlineSnapshot(`
      {
        "enabled": true,
        "queryFn": [Function],
        "queryKey": ["zama.confidentialHandle", { "owner": "0xowner", "tokenAddress": "0xabc" }],
        "refetchInterval": 10000,
      }
    `);
  });

  test("disabled when owner is empty string", () => {
    const options = confidentialHandleQueryOptions(signer, tokenAddress, { owner: "" });
    expect(options.enabled).toBe(false);
  });

  test("disabled when owner is undefined (default)", () => {
    const options = confidentialHandleQueryOptions(signer, tokenAddress);
    expect(options.enabled).toBe(false);
  });

  test("respects user enabled: false override", () => {
    const options = confidentialHandleQueryOptions(signer, tokenAddress, {
      owner: "0xowner",
      query: { enabled: false },
    });
    expect(options.enabled).toBe(false);
  });

  test("custom pollingInterval overrides default 10_000", () => {
    const options = confidentialHandleQueryOptions(signer, tokenAddress, {
      owner: "0xowner",
      pollingInterval: 5_000,
    });
    expect(options.refetchInterval).toBe(5_000);
  });

  test("default refetchInterval is 10_000", () => {
    const options = confidentialHandleQueryOptions(signer, tokenAddress, {
      owner: "0xowner",
    });
    expect(options.refetchInterval).toBe(10_000);
  });
});
```

#### `confidential-balance.test.ts` (token-coupled, with enabled gating)

```ts
import { describe, test, expect, vi } from "vitest";
import { confidentialBalanceQueryOptions } from "../confidential-balance";

function createMockToken(address = "0xabc") {
  return {
    address,
    decryptBalance: vi.fn(),
    signer: createMockSigner(),
  } as any;
}

describe("confidentialBalanceQueryOptions", () => {
  test("returns correct shape with all params", () => {
    const token = createMockToken();
    const options = confidentialBalanceQueryOptions(token, {
      handle: "0xhandle",
      owner: "0xowner",
    });
    expect(options).toMatchInlineSnapshot(`
      {
        "enabled": true,
        "queryFn": [Function],
        "queryKey": ["zama.confidentialBalance", {
          "handle": "0xhandle", "owner": "0xowner", "tokenAddress": "0xabc",
        }],
        "staleTime": Infinity,
      }
    `);
  });

  test("disabled when handle is undefined", () => {
    const token = createMockToken();
    const options = confidentialBalanceQueryOptions(token, { owner: "0xowner" });
    expect(options.enabled).toBe(false);
  });

  test("disabled when owner is empty", () => {
    const token = createMockToken();
    const options = confidentialBalanceQueryOptions(token, {
      handle: "0xhandle",
      owner: "",
    });
    expect(options.enabled).toBe(false);
  });

  test("disabled when both handle and owner are missing", () => {
    const token = createMockToken();
    const options = confidentialBalanceQueryOptions(token, {});
    expect(options.enabled).toBe(false);
  });

  test("staleTime is Infinity (only re-decrypt when handle changes)", () => {
    const token = createMockToken();
    const options = confidentialBalanceQueryOptions(token, {
      handle: "0xhandle",
      owner: "0xowner",
    });
    expect(options.staleTime).toBe(Infinity);
  });

  test("queryFn calls token.decryptBalance with handle", async () => {
    const token = createMockToken();
    token.decryptBalance.mockResolvedValue(1000n);
    const options = confidentialBalanceQueryOptions(token, {
      handle: "0xhandle",
      owner: "0xowner",
    });
    const result = await options.queryFn();
    expect(result).toBe(1000n);
    expect(token.decryptBalance).toHaveBeenCalledWith("0xhandle");
  });

  test("key changes when handle changes (triggers re-decrypt)", () => {
    const token = createMockToken();
    const opts1 = confidentialBalanceQueryOptions(token, {
      handle: "0xhandle1",
      owner: "0xowner",
    });
    const opts2 = confidentialBalanceQueryOptions(token, {
      handle: "0xhandle2",
      owner: "0xowner",
    });
    expect(opts1.queryKey).not.toEqual(opts2.queryKey);
  });
});
```

#### `shield.test.ts` (mutation factory)

```ts
import { describe, test, expect, vi } from "vitest";
import { shieldMutationOptions } from "../shield";

function createMockToken(address = "0xabc") {
  return {
    address,
    shield: vi.fn(),
  } as any;
}

describe("shieldMutationOptions", () => {
  test("returns correct shape", () => {
    const token = createMockToken();
    const options = shieldMutationOptions(token);
    expect(options).toMatchInlineSnapshot(`
      {
        "mutationFn": [Function],
        "mutationKey": ["shield", "0xabc"],
      }
    `);
  });

  test("mutationKey includes token address", () => {
    const token = createMockToken("0xdef");
    const options = shieldMutationOptions(token);
    expect(options.mutationKey).toEqual(["shield", "0xdef"]);
  });

  test("mutationFn calls token.shield with correct params", async () => {
    const token = createMockToken();
    token.shield.mockResolvedValue("0xtxhash");
    const options = shieldMutationOptions(token);

    await options.mutationFn({
      amount: 100n,
      fees: undefined,
      approvalStrategy: "auto",
    });

    expect(token.shield).toHaveBeenCalledWith(100n, {
      fees: undefined,
      approvalStrategy: "auto",
    });
  });
});
```

### Layer 2: Invalidation helper tests

#### `invalidation.test.ts`

```ts
import { describe, test, expect, vi, beforeEach } from "vitest";
import { QueryClient } from "@tanstack/query-core";
import {
  invalidateBalanceQueries,
  invalidateAfterShield,
  invalidateAfterUnshield,
  invalidateAfterApprove,
  invalidateWagmiBalanceQueries,
} from "../invalidation";
import { zamaQueryKeys } from "../query-keys";

describe("invalidation helpers", () => {
  let qc: QueryClient;
  let invalidateSpy: ReturnType<typeof vi.spyOn>;
  let resetSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    qc = new QueryClient();
    invalidateSpy = vi.spyOn(qc, "invalidateQueries").mockResolvedValue();
    resetSpy = vi.spyOn(qc, "resetQueries").mockResolvedValue();
  });

  describe("invalidateBalanceQueries", () => {
    test("invalidates handle queries for the token", () => {
      invalidateBalanceQueries(qc, "0xabc");
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: zamaQueryKeys.confidentialHandle.token("0xabc"),
      });
    });

    test("invalidates all batch handle queries", () => {
      invalidateBalanceQueries(qc, "0xabc");
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: zamaQueryKeys.confidentialHandles.all,
      });
    });

    test("resets (not just invalidates) balance queries for the token", () => {
      invalidateBalanceQueries(qc, "0xabc");
      expect(resetSpy).toHaveBeenCalledWith({
        queryKey: zamaQueryKeys.confidentialBalance.token("0xabc"),
      });
    });

    test("invalidates all batch balance queries", () => {
      invalidateBalanceQueries(qc, "0xabc");
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: zamaQueryKeys.confidentialBalances.all,
      });
    });
  });

  describe("invalidateAfterShield", () => {
    test("calls invalidateBalanceQueries + allowance + wagmi", () => {
      invalidateAfterShield(qc, "0xabc");

      // Balance invalidation
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: zamaQueryKeys.confidentialHandle.token("0xabc"),
      });
      // Allowance invalidation
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: zamaQueryKeys.underlyingAllowance.token("0xabc"),
      });
      // Wagmi predicate invalidation
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ predicate: expect.any(Function) }),
      );
    });
  });

  describe("invalidateAfterApprove", () => {
    test("invalidates approval cache for the token", () => {
      invalidateAfterApprove(qc, "0xabc");
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: zamaQueryKeys.confidentialIsApproved.token("0xabc"),
      });
    });
  });

  describe("invalidateAfterUnshield", () => {
    test("invalidates balance + underlying allowance + wagmi balance caches", () => {
      invalidateAfterUnshield(qc, "0xabc");
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: zamaQueryKeys.confidentialHandle.token("0xabc"),
      });
      expect(resetSpy).toHaveBeenCalledWith({
        queryKey: zamaQueryKeys.confidentialBalance.token("0xabc"),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: zamaQueryKeys.underlyingAllowance.token("0xabc"),
      });
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ predicate: expect.any(Function) }),
      );
    });
  });

  describe("invalidateWagmiBalanceQueries", () => {
    test("predicate matches wagmi balanceOf key structure", () => {
      invalidateWagmiBalanceQueries(qc);
      const predicateCall = invalidateSpy.mock.calls.find(([arg]) => "predicate" in arg);
      expect(predicateCall).toBeDefined();

      const predicate = predicateCall![0].predicate!;
      // Should match wagmi's balance query key shape
      const wagmiBalanceQuery = {
        queryKey: ["readContract", { functionName: "balanceOf", address: "0x..." }],
      };
      expect(predicate(wagmiBalanceQuery as any)).toBe(true);

      // Should NOT match unrelated queries
      const unrelatedQuery = {
        queryKey: ["readContract", { functionName: "name", address: "0x..." }],
      };
      expect(predicate(unrelatedQuery as any)).toBe(false);
    });
  });
});
```

### Layer 3: Hook integration tests (updates to existing)

The existing test files in `packages/react-sdk/src/__tests__/` need these updates:

#### Changes to `query-hooks.test.tsx`

1. **Import path changes:** No import changes needed in hooks themselves (hooks still export from react-sdk). The hooks internally import from `@zama-fhe/sdk/query` but tests consume the hooks, not the factories.

2. **Key shape assertion updates:** Any test that asserts `queryKey` in snapshots needs to match the new namespaced format:

```ts
// Before:
expect(queryClient.getQueryData(['tokenMetadata', '0xabc'])).toEqual(...)
// After:
expect(queryClient.getQueryData(['zama.tokenMetadata', { tokenAddress: '0xabc' }])).toEqual(...)
```

3. **New test: hashFn integration** — verify hooks pass `queryKeyHashFn: hashFn` and bigint keys work:

```ts
test("handles bigint in query keys via hashFn", async () => {
  const { result } = await renderWithProviders(
    () =>
      useShieldFee({
        feeManagerAddress: "0xfee",
        amount: 1000n, // bigint — would fail without hashFn
        from: "0xfrom",
        to: "0xto",
      }),
    { signer: mockSignerWithFeeResponse },
  );
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data).toBeDefined();
});
```

4. **New test: activity feed identity keying** — verify different `userAddress` or `logs` produce distinct cache entries:

```ts
test("useActivityFeed keys by token + user + logs fingerprint + decrypt", async () => {
  const q1 = queryClient.getQueryData([
    "zama.activityFeed",
    { tokenAddress: "0xabc", userAddress: "0x1", logsKey: "tx1:0", decrypt: true },
  ]);
  const q2 = queryClient.getQueryData([
    "zama.activityFeed",
    { tokenAddress: "0xabc", userAddress: "0x2", logsKey: "tx1:0", decrypt: true },
  ]);
  expect(q1).not.toBe(q2);
});
```

#### Changes to `mutation-hooks.test.tsx`

1. **Cache invalidation assertions:** Tests that verify `queryClient.invalidateQueries` should now check for the new key shapes:

```ts
// Before:
expect(invalidateSpy).toHaveBeenCalledWith({
  queryKey: ["confidentialHandle", "0xabc"],
});
// After:
expect(invalidateSpy).toHaveBeenCalledWith({
  queryKey: ["zama.confidentialHandle", { tokenAddress: "0xabc" }],
});
```

2. **New test: invalidation helper integration** — verify that mutation `onSuccess` calls the centralized helper:

```ts
test("shield onSuccess calls invalidateAfterShield", async () => {
  const { result, queryClient } = await renderWithProviders(() =>
    useShield({ tokenAddress: "0xabc" }),
  );
  const spy = vi.spyOn(queryClient, "invalidateQueries");

  await act(() => result.current.mutate({ amount: 100n }));
  await waitFor(() => expect(result.current.isSuccess).toBe(true));

  // Should have called invalidateAfterShield which triggers these
  expect(spy).toHaveBeenCalledWith(
    expect.objectContaining({
      queryKey: ["zama.confidentialHandle", { tokenAddress: "0xabc" }],
    }),
  );
});
```

#### Changes to `query-options.test.ts` and `mutation-options.test.ts`

These files currently test factories as pure functions. After the refactor:

1. **Factories are re-exported from `@zama-fhe/sdk/query`** — update imports:

```ts
// Before:
import { tokenMetadataQueryOptions } from "../token/use-token-metadata";
// After:
import { tokenMetadataQueryOptions } from "@zama-fhe/sdk/query";
```

2. **Signature changes for decoupled factories** — tests now pass `signer + address` instead of `token`:

```ts
// Before:
const options = tokenMetadataQueryOptions(mockToken);
// After:
const options = tokenMetadataQueryOptions(mockSigner, "0xabc");
```

3. **Key shape assertions** — update all `toEqual` / snapshot assertions to new namespaced keys.

#### Vitest config: add alias for `@zama-fhe/sdk/query`

The existing vitest alias `@zama-fhe/sdk` maps to `./packages/sdk/src`. The subpath alias needs adding:

```ts
// vitest.config.ts — already has:
{ find: /^@zama-fhe\/sdk\/(.+)/, replacement: path.resolve(__dirname, "./packages/sdk/src/$1") }
```

This wildcard alias already handles `@zama-fhe/sdk/query` → `./packages/sdk/src/query`. **No vitest config change needed.**

### Layer 4: Type tests (optional, recommended for public API)

Create `packages/sdk/src/query/__tests__/types.test-d.ts` using `expectTypeOf` from vitest:

```ts
import { expectTypeOf, test } from "vitest";
import {
  tokenMetadataQueryOptions,
  confidentialBalanceQueryOptions,
  shieldMutationOptions,
  zamaQueryKeys,
} from "../index";

test("tokenMetadataQueryOptions accepts GenericSigner + Address", () => {
  expectTypeOf(tokenMetadataQueryOptions).parameter(0).toMatchTypeOf<GenericSigner>();
  expectTypeOf(tokenMetadataQueryOptions).parameter(1).toBeString();
});

test("confidentialBalanceQueryOptions requires ReadonlyToken", () => {
  expectTypeOf(confidentialBalanceQueryOptions).parameter(0).toMatchTypeOf<ReadonlyToken>();
});

test("zamaQueryKeys produces readonly tuples", () => {
  const key = zamaQueryKeys.tokenMetadata.token("0x");
  expectTypeOf(key).toEqualTypeOf<
    readonly ["zama.tokenMetadata", { readonly tokenAddress: string }]
  >();
});

test("shieldMutationOptions requires Token (not ReadonlyToken)", () => {
  expectTypeOf(shieldMutationOptions).parameter(0).toMatchTypeOf<Token>();
});
```

### Test infrastructure: shared mock factory

Create `packages/sdk/src/query/__tests__/test-helpers.ts`:

```ts
import { vi } from "vitest";
import type { GenericSigner } from "../../types";

/**
 * Create a mock GenericSigner for decoupled factory tests.
 * Only readContract and getAddress are needed — other methods are no-ops.
 */
export function createMockSigner(overrides?: Partial<GenericSigner>): GenericSigner {
  return {
    readContract: vi.fn(),
    writeContract: vi.fn(),
    getAddress: vi.fn().mockResolvedValue("0xdefaultSigner"),
    getChainId: vi.fn().mockResolvedValue(1),
    waitForTransactionReceipt: vi.fn(),
    signTypedData: vi.fn(),
    ...overrides,
  } as unknown as GenericSigner;
}

/**
 * Create a mock ReadonlyToken for token-coupled factory tests.
 * Includes both signer pass-through and decrypt methods.
 */
export function createMockReadonlyToken(address = "0xabc") {
  return {
    address,
    signer: createMockSigner(),
    decryptBalance: vi.fn(),
    decryptHandles: vi.fn(),
    confidentialBalanceOf: vi.fn(),
    name: vi.fn(),
    symbol: vi.fn(),
    decimals: vi.fn(),
  } as any;
}

/**
 * Create a mock Token for mutation factory tests.
 * Extends ReadonlyToken mock with write operations.
 */
export function createMockToken(address = "0xabc") {
  return {
    ...createMockReadonlyToken(address),
    shield: vi.fn(),
    shieldETH: vi.fn(),
    unshield: vi.fn(),
    unshieldAll: vi.fn(),
    confidentialTransfer: vi.fn(),
    confidentialTransferFrom: vi.fn(),
    approve: vi.fn(),
    approveUnderlying: vi.fn(),
    unwrap: vi.fn(),
    unwrapAll: vi.fn(),
    finalizeUnwrap: vi.fn(),
    resumeUnshield: vi.fn(),
  } as any;
}
```

### What each factory test MUST verify (checklist per file)

For **query options factories**:

- [ ] Returns correct `queryKey` shape (inline snapshot)
- [ ] `queryFn` is a function (existence check)
- [ ] `queryFn` calls the right signer/token method with correct args
- [ ] `queryFn` extracts data params from `context.queryKey`, not closure (decoupled factories only — pass a modified key and verify the fetch uses the key's params)
- [ ] `staleTime` value matches expected (Infinity for immutable data, 30_000 for fees, etc.)
- [ ] `enabled` gating: true when all required params present
- [ ] `enabled` gating: false when any required param missing (one test per missing param)
- [ ] `enabled` gating: false when user passes `query: { enabled: false }`
- [ ] User `query` overrides don't replace `queryKey`/`queryFn` (spread order test)
- [ ] Non-conflicting user overrides pass through (e.g., `select`, `gcTime`)

For **mutation options factories**:

- [ ] Returns correct `mutationKey` shape (inline snapshot)
- [ ] `mutationFn` is a function (existence check)
- [ ] `mutationFn` calls the right token method with correct args
- [ ] `mutationFn` returns the token method's return value

For **invalidation helpers**:

- [ ] Calls `invalidateQueries` / `resetQueries` with the correct key shapes
- [ ] Composes correctly (e.g., `invalidateAfterShield` calls `invalidateBalanceQueries`)
- [ ] Wagmi predicate matches real wagmi key structures
- [ ] Wagmi predicate rejects non-balance queries
