# PRD: Zama Token SDK Architecture Refactor

**Status:** Draft
**Date:** 2026-02-28
**Author:** Architecture review session
**Reference:** wagmi SDK patterns, TanStack Query best practices

---

## 1. Problem Statement

The Zama Token SDK (`@zama-fhe/sdk` + `@zama-fhe/react-sdk`) has grown organically and has architectural issues that make it harder to test, extend, and maintain:

1. **Business logic trapped in React hooks.** Three of the most important hooks (`useConfidentialBalance`, `useConfidentialBalances`, `useActivityFeed`) have no query options factories — their logic is inextricable from React.

2. **Class-based core couples concerns.** The `Token` class bundles contract interaction, FHE encryption, credential management, and event emission. Each concern is hard to test in isolation.

3. **Triple adapter duplication.** ~39 near-duplicate hooks across `wagmi/`, `viem/`, `ethers/` adapter subpaths. The adapter hooks are trivially thin wrappers around contract builders that bypass all the valuable orchestration (cache invalidation, optimistic updates, error handling).

4. **No framework-agnostic query layer.** Query/mutation options factories live in `@zama-fhe/react-sdk`, making them inaccessible to Vue, Solid, or vanilla JS consumers.

5. **Provider requires signer.** Apps cannot render read-only views (token metadata, total supply, balances) before wallet connection.

6. **Credential state is not reactive.** The `CredentialManager` holds state in a class instance. Components cannot reactively subscribe to credential changes (locked/unlocked, expired).

7. **Inconsistent TanStack Query patterns.** No `filterQueryOptions`, no centralized `hashFn`, inconsistent namespace prefixes in query keys, `queryFn` closures instead of key extraction.

---

## 2. Goals

- **Establish a 3-layer architecture** following wagmi's proven pattern: Actions → Query Options → React Hooks
- **Make every operation independently testable** — actions with no framework, query factories with no rendering, hooks with rendering
- **Unify the adapter story** — one set of hooks, signer creation is a separate concern
- **Follow TanStack Query best practices** — proper key design, `filterQueryOptions`, `hashFn`, `enabled` auto-gating, params-from-key in `queryFn`
- **Enable read-only mode** — config works without a signer
- **Make credential state reactive** — observable via the config store

### Breaking Change Policy

Breaking changes are explicitly accepted in this refactor when they simplify architecture or remove legacy duplication.

Requirements for any breaking change:

- Document it in the migration guide with before/after import and API examples
- Include upgrade steps in release notes/changeset entries
- Preserve runtime semantics of existing operations unless a behavior change is explicitly called out

### Non-Goals

- Adding new features (new hooks, new operations)
- Changing the external behavior of existing operations
- Changing the RelayerSDK/WASM loading strategy
- Removing ActivityFeed or other existing functionality
- Supporting Vue/Solid adapters (but the architecture should make this trivial later)

---

## 3. Architecture

### 3.1 Package Structure

```
@zama-fhe/sdk                          (core, framework-agnostic)
├── index.ts                           — createConfig, types, errors, events, ABIs
├── actions/index.ts                   — Layer 1: pure async functions
├── query/index.ts                     — Layer 2: TanStack Query options factories
├── signers/viem.ts                    — createViemSigner()
├── signers/ethers.ts                  — createEthersSigner()
├── signers/wagmi.ts                   — createWagmiSigner()
└── node/index.ts                      — Node.js relayer, worker pool

@zama-fhe/react-sdk                    (React hooks, thin Layer 3)
├── index.ts                           — ZamaProvider, all hooks, re-exports
└── (no adapter subdirectories)
```

### 3.2 Export Map

```
@zama-fhe/sdk               → createConfig, Config type, errors, events, ABIs, contracts, Token facade
@zama-fhe/sdk/actions        → shield, transfer, getConfidentialBalance, decrypt, encrypt, ...
@zama-fhe/sdk/query          → shieldMutationOptions, getConfidentialBalanceQueryOptions, queryKeys, hashFn, ...
@zama-fhe/sdk/signers/viem   → createViemSigner
@zama-fhe/sdk/signers/ethers → createEthersSigner
@zama-fhe/sdk/signers/wagmi  → createWagmiSigner
@zama-fhe/sdk/node           → RelayerNode, NodeWorkerPool, asyncLocalStorage
@zama-fhe/react-sdk          → ZamaProvider, useConfig, all hooks, re-exports @zama-fhe/sdk
```

### 3.3 Layer Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│  Layer 3: @zama-fhe/react-sdk                                   │
│  ┌───────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │ useShield()   │  │ useConfBalance() │  │ useTransfer()    │  │
│  │ ~5-10 lines   │  │ ~5-10 lines      │  │ ~5-10 lines      │  │
│  │ useConfig()   │  │ useConfig()      │  │ useConfig()      │  │
│  │ + useQuery/   │  │ + useQuery()     │  │ + useMutation()  │  │
│  │   Mutation()  │  │                  │  │                  │  │
│  └───────┬───────┘  └────────┬─────────┘  └────────┬─────────┘  │
└──────────┼───────────────────┼──────────────────────┼────────────┘
           │                   │                      │
┌──────────┼───────────────────┼──────────────────────┼────────────┐
│  Layer 2: @zama-fhe/sdk/query                                    │
│  ┌───────┴───────┐  ┌───────┴──────────┐  ┌───────┴──────────┐  │
│  │ shieldMut-    │  │ getConfBalance-  │  │ transferMut-     │  │
│  │ ationOptions()│  │ QueryOptions()   │  │ ationOptions()   │  │
│  │ queryKey,     │  │ queryKey,        │  │ mutationFn,      │  │
│  │ mutationFn,   │  │ queryFn,         │  │ mutationKey,     │  │
│  │ invalidation  │  │ enabled,         │  │ invalidation     │  │
│  │ helpers       │  │ staleTime        │  │ helpers          │  │
│  └───────┬───────┘  └────────┬─────────┘  └────────┬─────────┘  │
│          │  hashFn, filterQueryOptions, queryKeys   │            │
└──────────┼───────────────────┼──────────────────────┼────────────┘
           │                   │                      │
┌──────────┼───────────────────┼──────────────────────┼────────────┐
│  Layer 1: @zama-fhe/sdk/actions                                  │
│  ┌───────┴───────┐  ┌───────┴──────────┐  ┌───────┴──────────┐  │
│  │ shield(       │  │ getConfBalance(  │  │ transfer(        │  │
│  │   config,     │  │   config,        │  │   config,        │  │
│  │   params      │  │   params         │  │   params         │  │
│  │ )             │  │ )                │  │ )                │  │
│  └───────┬───────┘  └────────┬─────────┘  └────────┬─────────┘  │
│          │                   │                      │            │
│  ┌───────┴───────────────────┴──────────────────────┴──────────┐ │
│  │                     Config (zustand store)                  │ │
│  │  relayer: RelayerSDK    signer?: GenericSigner              │ │
│  │  storage: Storage       credentials: CredentialState        │ │
│  └─────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

---

## 4. Config Store

### 4.1 `createConfig()`

Replaces the `ZamaSDK` class. Returns a Config object backed by zustand vanilla (framework-agnostic reactive store).

```ts
// @zama-fhe/sdk

import { createStore } from "zustand/vanilla";

interface CreateConfigParameters {
  relayer: RelayerSDK;
  signer?: GenericSigner; // OPTIONAL — read-only mode without it
  storage?: GenericStringStorage; // defaults to IndexedDBStorage in browser
  credentialDurationDays?: number; // defaults to 1
  onEvent?: ZamaSDKEventListener;
}

// Reactive state (zustand vanilla store).
// Only signer and credential status live here — they change at runtime.
// relayer, storage, durationDays are static and stay on Config directly.
interface ConfigState {
  signer: GenericSigner | undefined;
  credential: CredentialState | null; // ONE credential set per wallet (not per-contract)
}

// A single credential set covers a list of contract addresses.
// The EIP-712 signature authorizes the relayer to decrypt for these contracts.
// If a new contract is needed, credentials are regenerated to cover the expanded list.
interface CredentialState {
  status: "none" | "generating" | "active" | "expired" | "locked";
  coveredContracts: Address[]; // which contracts this credential set covers
  expiresAt: number; // startTimestamp + durationDays * 86400
  hasSessionSignature: boolean; // in-memory session sig exists (lost on page reload)
}

// Credential state changes are triggered by:
// - lock()              → clears session signature, status becomes 'locked'
// - unlock(addresses)   → prompts wallet re-sign, status becomes 'active'
// - create(addresses)   → generates fresh keypair + signature, status becomes 'active'
// - time expiration     → status becomes 'expired' (checked on next access)
// - new contract needed → credentials regenerated with expanded coveredContracts list
// - wallet switch       → different storeKey → different credential entry
// - page reload         → session signature lost → next decrypt prompts re-sign (not regen)
// - clear()             → deletes everything, status becomes 'none'

interface Config {
  // Static config — no reactivity needed
  readonly relayer: RelayerSDK;
  readonly storage: GenericStringStorage;
  readonly credentialDurationDays: number;

  // Reactive state (zustand vanilla store)
  readonly store: StoreApi<ConfigState>;

  // Signer management
  setSigner(signer: GenericSigner): void;
  clearSigner(): void;

  // Credential actions (delegates to CredentialManager internally)
  lock(): void;
  unlock(addresses?: Address[]): Promise<void>;
  isUnlocked(): boolean;

  // Internal
  _internal: {
    credentialManager: CredentialManager;
    emitEvent: (event: ZamaSDKEvent) => void;
  };
}

export function createConfig(params: CreateConfigParameters): Config;
```

### 4.2 Config Usage

```ts
// App setup — outside React, in module scope.
// relayer and storage are static (not in zustand). Only signer/credentials are reactive.
const config = createConfig({
  relayer: new RelayerWeb({ cdnUrl: '...', gatewayUrl: '...' }),
  storage: indexedDBStorage(),
  // No signer yet — read-only mode. Hooks that need a signer sit idle (enabled: false).
});

// Later, when wallet connects — this updates the zustand store, triggering re-renders:
const signer = createViemSigner({ walletClient, publicClient });
config.setSigner(signer);  // → store.setState({ signer }) → hooks re-enable

// In React:
<ZamaProvider config={config}>
  <App />
</ZamaProvider>
```

### 4.3 Credential State in the Store

Credentials become part of the reactive zustand store. React components subscribe to credential changes via `useSyncExternalStore` — no polling needed.

**What triggers a credential state change:**

- `lock()` → clears session signature, `status: 'locked'`
- `unlock(addresses)` → prompts wallet re-sign, `status: 'active'`
- First decrypt for a contract → generates keypair + EIP-712 signature, `status: 'generating' → 'active'`
- Time expiration (`startTimestamp + durationDays * 86400` exceeded) → `status: 'expired'`
- New contract not in `coveredContracts` → regeneration with expanded list
- Wallet switch → different credential entry (keyed by wallet address hash)
- Page reload → session signature lost (in-memory), next decrypt prompts re-sign (fast, no keypair regen)
- `clear()` → deletes stored + session data, `status: 'none'`

```ts
// CredentialState is defined on Config — see section 4.1

// Config state includes:
{
  credentials: Map<Address, CredentialEntry>,
  credentialStatus: 'locked' | 'unlocked' | 'partial',
}
```

This enables a future `useCredentialStatus()` hook that re-renders when credential state changes — no polling needed.

---

## 5. Layer 1: Actions

### 5.1 Pattern

Every action is a pure async function: `(config, params) => Promise<result>`.

```ts
// @zama-fhe/sdk/actions

export async function getConfidentialBalance(
  config: Config,
  params: GetConfidentialBalanceParameters,
): Promise<GetConfidentialBalanceReturnType> {
  const { tokenAddress } = params;

  // Safety net — in practice this never fires because the Layer 2 query options
  // factory gates with `enabled: Boolean(config.store.getState().signer && ...)`.
  // TanStack Query won't call queryFn when enabled is false.
  // This throw only catches misuse when calling the action directly without a signer.
  const signer = config.store.getState().signer;
  if (!signer) throw new SignerRequiredError("getConfidentialBalance");

  const address = await signer.getAddress();

  // Read encrypted handle from contract
  const handle = await signer.readContract<bigint>(
    confidentialBalanceOfContract(tokenAddress, address),
  );

  if (handle === 0n) return { handle: 0n, decryptedBalance: 0n };

  // Decrypt using credentials
  const credentials = await ensureCredentials(config, { tokenAddress });
  const decrypted = await config.relayer.userDecrypt(handle, tokenAddress, credentials);

  return { handle, decryptedBalance: decrypted };
}
```

### 5.2 Action Inventory

Extracted from current `Token` / `ReadonlyToken` methods and existing hooks:

#### Read Actions (queries)

| Action                                   | Current Source                   | Parameters                                   |
| ---------------------------------------- | -------------------------------- | -------------------------------------------- |
| `getConfidentialBalance`                 | `ReadonlyToken.decryptBalance()` | `{ tokenAddress }`                           |
| `getConfidentialBalances`                | Multi-token balance hook         | `{ tokens: { address, contractAddress }[] }` |
| `getConfidentialHandle`                  | `ReadonlyToken` balance read     | `{ tokenAddress }`                           |
| `getTokenMetadata`                       | `GenericSigner.readContract`     | `{ tokenAddress }`                           |
| `isConfidential`                         | ERC-165 check                    | `{ tokenAddress }`                           |
| `isWrapper`                              | ERC-165 check                    | `{ tokenAddress }`                           |
| `getWrapperForToken`                     | Coordinator read                 | `{ tokenAddress, coordinatorAddress }`       |
| `getUnderlyingAllowance`                 | ERC-20 allowance read            | `{ tokenAddress, wrapperAddress }`           |
| `isApproved`                             | Operator check                   | `{ tokenAddress, spenderAddress }`           |
| `getTotalSupply`                         | Plain + confidential supply      | `{ tokenAddress }`                           |
| `getActivityFeed`                        | Activity feed parsing            | `{ tokenAddress, logs, userAddress }`        |
| `getShieldFee` / `getUnshieldFee` / etc. | Fee reads                        | `{ feeManagerAddress }`                      |
| `getPublicKey`                           | Relayer public key               | `{}`                                         |
| `getPublicParams`                        | Relayer public params            | `{ bits? }`                                  |
| `getDecryptedValue`                      | Cached decryption                | `{ handle, contractAddress }`                |

#### Write Actions (mutations)

| Action                 | Current Source                     | Parameters                                 |
| ---------------------- | ---------------------------------- | ------------------------------------------ |
| `shield`               | `Token.shield()`                   | `{ tokenAddress, amount, recipient? }`     |
| `shieldETH`            | `Token.wrapETH()`                  | `{ tokenAddress, amount }`                 |
| `transfer`             | `Token.confidentialTransfer()`     | `{ tokenAddress, to, amount }`             |
| `transferFrom`         | `Token.confidentialTransferFrom()` | `{ tokenAddress, from, to, amount }`       |
| `approve`              | `Token.setOperator()`              | `{ tokenAddress, spender, approved }`      |
| `approveUnderlying`    | ERC-20 approve                     | `{ tokenAddress, wrapperAddress, amount }` |
| `unshield`             | `Token.unshield()`                 | `{ tokenAddress, amount }`                 |
| `unshieldAll`          | `Token.unshieldAll()`              | `{ tokenAddress }`                         |
| `resumeUnshield`       | `Token.resumeUnshield()`           | `{ tokenAddress, txHash }`                 |
| `unwrap` / `unwrapAll` | `Token.unwrap()`                   | `{ tokenAddress, amount? }`                |
| `finalizeUnwrap`       | `Token.finalizeUnwrap()`           | `{ tokenAddress, amount }`                 |
| `encrypt`              | `RelayerSDK.encrypt()`             | `{ values: EncryptInput[] }`               |
| `decrypt`              | `RelayerSDK.userDecrypt()`         | `{ handles, contractAddress }`             |
| `authorizeAll`         | Batch credential creation          | `{ contractAddresses }`                    |

### 5.3 `EncryptInput` Type (Fixes useEncrypt types)

The current `useEncrypt` only accepts `bigint[]` and hardcodes `add64()`. Actions fix this:

```ts
// Input types are plaintext (bool, uint, address) — encryption produces the `e` variants.
type EncryptInput =
  | { type: "bool"; value: boolean }
  | { type: "uint4"; value: bigint }
  | { type: "uint8"; value: bigint }
  | { type: "uint16"; value: bigint }
  | { type: "uint32"; value: bigint }
  | { type: "uint64"; value: bigint }
  | { type: "uint128"; value: bigint }
  | { type: "uint256"; value: bigint }
  | { type: "address"; value: Address };

interface EncryptParameters {
  values: EncryptInput[];
  contractAddress: Address;
}
```

### 5.4 Decrypt Return Types (Fixes decrypt return types)

```ts
// Decrypted values are plaintext — the `e` prefix denotes the encrypted on-chain type
// that was decrypted, but the returned value is the plaintext form.
type DecryptedValue =
  | { type: "bool"; value: boolean }
  | {
      type: "uint4" | "uint8" | "uint16" | "uint32" | "uint64" | "uint128" | "uint256";
      value: bigint;
    }
  | { type: "address"; value: Address };
```

### 5.5 Token Class Facade

The `Token` class becomes a thin facade that delegates to actions:

```ts
// @zama-fhe/sdk

export class Token {
  constructor(
    private config: Config,
    public readonly tokenAddress: Address,
  ) {}

  async shield(amount: bigint, recipient?: Address) {
    return shield(this.config, {
      tokenAddress: this.tokenAddress,
      amount,
      recipient,
    });
  }

  async confidentialTransfer(to: Address, amount: bigint) {
    return transfer(this.config, {
      tokenAddress: this.tokenAddress,
      to,
      amount,
    });
  }

  // ... delegates to all actions
}
```

---

## 6. Layer 2: Query Options Factories

### 6.1 Pattern

Every query/mutation gets a factory function in `@zama-fhe/sdk/query`. The factory is framework-agnostic — it returns a plain object that any TanStack Query adapter can consume.

```ts
// @zama-fhe/sdk/query/getConfidentialBalance.ts

export function getConfidentialBalanceQueryOptions<TSelectData = GetConfidentialBalanceData>(
  config: Config,
  options: GetConfidentialBalanceOptions<TSelectData> = {},
) {
  return {
    ...options.query, // user overrides spread first
    enabled: Boolean(
      // then factory sets these (wins)
      options.tokenAddress &&
      config.store.getState().signer &&
      config.isUnlocked([options.tokenAddress]) &&
      (options.query?.enabled ?? true),
    ),
    queryKey: getConfidentialBalanceQueryKey(options),
    queryFn: async (context: QueryFunctionContext) => {
      const [, { scopeKey: _, ...params }] = context.queryKey; // extract from KEY
      if (!params.tokenAddress) throw new Error("tokenAddress required");
      return getConfidentialBalance(config, params);
    },
    staleTime: Infinity, // only re-decrypt when handle changes
  };
}

export function getConfidentialBalanceQueryKey(options: GetConfidentialBalanceKeyOptions) {
  return ["zama.confidentialBalance", filterQueryOptions(options)] as const;
}
```

### 6.2 Query Key Design

#### Structure: `['zama.<domain>', filteredParams]`

All keys are namespaced with `zama.` to avoid collisions with wagmi/other libs sharing a `QueryClient`.

```ts
// Query key examples:
["zama.confidentialBalance", { tokenAddress: "0x...", owner: "0x..." }][
  ("zama.confidentialHandle", { tokenAddress: "0x..." })
][("zama.tokenMetadata", { tokenAddress: "0x..." })][
  ("zama.isConfidential", { tokenAddress: "0x..." })
][("zama.publicKey", {})][("zama.shieldFee", { feeManagerAddress: "0x..." })];
```

#### `filterQueryOptions()`

Strips TanStack Query behavioral options and non-serializable objects from the key:

```ts
// @zama-fhe/sdk/query/utils.ts

export function filterQueryOptions(options: Record<string, unknown>) {
  const {
    // TanStack Query options (strip from key)
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
    queryFn,
    queryKey,
    queryKeyHashFn,
    // SDK internals (strip from key)
    config,
    query,
    scopeKey,
    ...rest
  } = options;

  // Include scopeKey in key if provided (for manual cache isolation)
  if (scopeKey) return { scopeKey, ...rest };
  return rest;
}
```

#### `hashFn()`

Handles bigint serialization and deterministic key ordering:

```ts
// @zama-fhe/sdk/query/utils.ts

export function hashFn(queryKey: QueryKey): string {
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
```

#### Query Key Factories (exported)

```ts
// @zama-fhe/sdk/query/queryKeys.ts

export const zamaQueryKeys = {
  // Balance
  confidentialBalance: {
    all: ["zama.confidentialBalance"] as const,
    token: (addr: Address) => ["zama.confidentialBalance", { tokenAddress: addr }] as const,
    owner: (addr: Address, owner: Address) =>
      ["zama.confidentialBalance", { tokenAddress: addr, owner }] as const,
  },

  // Handle (the encrypted on-chain value, polled separately from decryption)
  confidentialHandle: {
    all: ["zama.confidentialHandle"] as const,
    token: (addr: Address) => ["zama.confidentialHandle", { tokenAddress: addr }] as const,
    owner: (addr: Address, owner: Address) =>
      ["zama.confidentialHandle", { tokenAddress: addr, owner }] as const,
  },

  // Token metadata
  tokenMetadata: {
    all: ["zama.tokenMetadata"] as const,
    token: (addr: Address) => ["zama.tokenMetadata", { tokenAddress: addr }] as const,
  },

  // ... all other domains
} as const;
```

### 6.3 Mutation Options Factories (with Invalidation)

Mutation factories include invalidation helpers — this is the key improvement over the current architecture.

```ts
// @zama-fhe/sdk/query/shield.ts

export function shieldMutationOptions(config: Config, options: ShieldMutationOptionsParams = {}) {
  return {
    ...(options.mutation as any),
    mutationFn: (variables: ShieldVariables) => {
      return shield(config, variables);
    },
    mutationKey: ["zama.shield"],
    // Invalidation helper — callable by any framework
    onSuccess: composeCallbacks(options.mutation?.onSuccess, (_data, variables) => {
      // Return the query keys to invalidate (framework hook applies them)
      return {
        invalidate: [
          zamaQueryKeys.confidentialHandle.token(variables.tokenAddress),
          zamaQueryKeys.confidentialBalance.token(variables.tokenAddress),
        ],
        // Signal that external balance caches (wagmi) may also be stale
        externalInvalidations: ["balance"],
      };
    }),
  };
}
```

### 6.4 Cache Invalidation Helpers

Centralized helpers for common invalidation patterns:

```ts
// @zama-fhe/sdk/query/invalidation.ts

export function invalidateAfterBalanceChange(queryClient: QueryClient, tokenAddress: Address) {
  queryClient.invalidateQueries({
    queryKey: zamaQueryKeys.confidentialHandle.token(tokenAddress),
  });
  queryClient.resetQueries({
    queryKey: zamaQueryKeys.confidentialBalance.token(tokenAddress),
  });
  // Batch variants
  queryClient.invalidateQueries({
    queryKey: zamaQueryKeys.confidentialHandle.all,
  });
  queryClient.invalidateQueries({
    queryKey: zamaQueryKeys.confidentialBalance.all,
  });
}

export function invalidateAfterShield(queryClient: QueryClient, tokenAddress: Address) {
  invalidateAfterBalanceChange(queryClient, tokenAddress);
  queryClient.invalidateQueries({
    queryKey: zamaQueryKeys.underlyingAllowance.token(tokenAddress),
  });
  // Cross-library: invalidate wagmi balance queries
  invalidateWagmiBalanceQueries(queryClient);
}

export function invalidateAfterUnshield(queryClient: QueryClient, tokenAddress: Address) {
  invalidateAfterBalanceChange(queryClient, tokenAddress);
  invalidateWagmiBalanceQueries(queryClient);
}

// Wagmi interop (predicate-based, same pattern as current)
function invalidateWagmiBalanceQueries(queryClient: QueryClient) {
  queryClient.invalidateQueries({
    predicate: (query) => {
      const key = query.queryKey;
      return Array.isArray(key) && key[0]?.queryKey?.[0] === "balance";
    },
  });
}
```

### 6.5 Two-Phase Query Pattern (Confidential Balance)

The most complex pattern. Decomposed into two separate query options factories:

```ts
// Phase 1: Poll the encrypted handle (cheap RPC read)
export function getConfidentialHandleQueryOptions(config, options) {
  return {
    ...options.query,
    enabled: Boolean(
      options.tokenAddress && config.store.getState().signer && (options.query?.enabled ?? true),
    ),
    queryKey: zamaQueryKeys.confidentialHandle.owner(options.tokenAddress, options.owner),
    queryFn: async (context) => {
      const [, params] = context.queryKey;
      return getConfidentialHandle(config, params);
    },
    refetchInterval: options.pollingInterval ?? 10_000, // poll every 10s
  };
}

// Phase 2: Decrypt when handle changes (expensive relayer call)
export function getConfidentialBalanceQueryOptions(config, options) {
  return {
    ...options.query,
    enabled: Boolean(
      options.handle &&
      options.handle !== 0n &&
      config.isUnlocked([options.tokenAddress]) &&
      (options.query?.enabled ?? true),
    ),
    queryKey: zamaQueryKeys.confidentialBalance.owner(options.tokenAddress, options.owner),
    queryFn: async (context) => {
      const [, params] = context.queryKey;
      return decryptHandle(config, {
        handle: options.handle!,
        contractAddress: params.tokenAddress,
      });
    },
    staleTime: Infinity, // only re-decrypt when handle changes
  };
}
```

The React hook composes them:

```ts
// @zama-fhe/react-sdk
export function useConfidentialBalance(params) {
  const config = useConfig();
  const handle = useQuery(getConfidentialHandleQueryOptions(config, params));
  const balance = useQuery(getConfidentialBalanceQueryOptions(config, {
    ...params,
    handle: handle.data,
  }));
  return { handle, balance, ... };
}
```

---

## 7. Layer 3: React Hooks

### 7.1 Pattern

Every hook is ~5-10 lines. It resolves config from context, builds query options, calls `useQuery`/`useMutation`.

```ts
// @zama-fhe/react-sdk/hooks/useShield.ts

export function useShield(parameters: UseShieldParameters = {}) {
  const config = useConfig(parameters);
  const queryClient = useQueryClient();
  const options = shieldMutationOptions(config, parameters);

  const mutation = useMutation({
    ...options,
    onSuccess: (data, variables, context) => {
      invalidateAfterShield(queryClient, variables.tokenAddress);
      parameters.mutation?.onSuccess?.(data, variables, context);
    },
  });

  return {
    ...mutation,
    shield: mutation.mutate,
    shieldAsync: mutation.mutateAsync,
  };
}
```

### 7.2 Custom `useQuery` Wrapper

Injects `hashFn` automatically:

```ts
// @zama-fhe/react-sdk/utils/query.ts

import { useQuery as tanstack_useQuery } from "@tanstack/react-query";
import { hashFn } from "@zama-fhe/sdk/query";

export function useQuery(parameters: any) {
  return tanstack_useQuery({
    ...parameters,
    queryKeyHashFn: hashFn,
  });
}
```

### 7.3 `useConfig()` and `useSigner()`

```ts
// @zama-fhe/react-sdk/hooks/useConfig.ts

export function useConfig(parameters?: { config?: Config }) {
  const contextConfig = useContext(ZamaContext);
  const config = parameters?.config ?? contextConfig;
  if (!config) throw new ZamaProviderNotFoundError();
  return config;
}

// @zama-fhe/react-sdk/hooks/useSigner.ts
// Reactive bridge to config store's signer state

export function useSigner() {
  const config = useConfig();
  return useSyncExternalStore(
    (onChange) => config.subscribe((state) => onChange()),
    () => config.store.getState().signer,
    () => config.store.getState().signer,
  );
}
```

### 7.4 `useCredentialStatus()`

New reactive hook enabled by credentials-in-store:

```ts
export function useCredentialStatus(tokenAddress?: Address) {
  const config = useConfig();
  return useSyncExternalStore(
    (onChange) => config.subscribe((state) => onChange()),
    () =>
      tokenAddress
        ? config.store.getState().credential?.coveredContracts.includes(tokenAddress)
          ? (config.store.getState().credential?.status ?? "none")
          : "none"
        : (config.store.getState().credential?.status ?? "none"),
  );
}
```

### 7.5 Complete Hook Inventory

#### Query Hooks

| Hook                        | Factory (in sdk/query)                                                       | Suspense Variant |
| --------------------------- | ---------------------------------------------------------------------------- | ---------------- |
| `useConfidentialBalance`    | `getConfidentialHandleQueryOptions` + `getConfidentialBalanceQueryOptions`   | Yes              |
| `useConfidentialBalances`   | `getConfidentialHandlesQueryOptions` + `getConfidentialBalancesQueryOptions` | Yes              |
| `useTokenMetadata`          | `getTokenMetadataQueryOptions`                                               | Yes              |
| `useIsConfidential`         | `getIsConfidentialQueryOptions`                                              | Yes              |
| `useIsWrapper`              | `getIsWrapperQueryOptions`                                                   | Yes              |
| `useWrapperDiscovery`       | `getWrapperDiscoveryQueryOptions`                                            | Yes              |
| `useUnderlyingAllowance`    | `getUnderlyingAllowanceQueryOptions`                                         | Yes              |
| `useConfidentialIsApproved` | `getIsApprovedQueryOptions`                                                  | Yes              |
| `useTotalSupply`            | `getTotalSupplyQueryOptions`                                                 | Yes              |
| `useActivityFeed`           | `getActivityFeedQueryOptions`                                                | No               |
| `useShieldFee` / etc.       | `getShieldFeeQueryOptions` / etc.                                            | Yes              |
| `usePublicKey`              | `getPublicKeyQueryOptions`                                                   | Yes              |
| `usePublicParams`           | `getPublicParamsQueryOptions`                                                | Yes              |
| `useDecryptedValue`         | `getDecryptedValueQueryOptions`                                              | No               |
| `useCredentialStatus`       | (useSyncExternalStore)                                                       | No               |
| `useSigner`                 | (useSyncExternalStore)                                                       | No               |

#### Mutation Hooks

| Hook                         | Factory (in sdk/query)                               |
| ---------------------------- | ---------------------------------------------------- |
| `useShield`                  | `shieldMutationOptions`                              |
| `useShieldETH`               | `shieldETHMutationOptions`                           |
| `useTransfer`                | `transferMutationOptions`                            |
| `useTransferFrom`            | `transferFromMutationOptions`                        |
| `useApprove`                 | `approveMutationOptions`                             |
| `useApproveUnderlying`       | `approveUnderlyingMutationOptions`                   |
| `useUnshield`                | `unshieldMutationOptions`                            |
| `useUnshieldAll`             | `unshieldAllMutationOptions`                         |
| `useResumeUnshield`          | `resumeUnshieldMutationOptions`                      |
| `useUnwrap` / `useUnwrapAll` | `unwrapMutationOptions` / `unwrapAllMutationOptions` |
| `useFinalizeUnwrap`          | `finalizeUnwrapMutationOptions`                      |
| `useEncrypt`                 | `encryptMutationOptions`                             |
| `useDecrypt`                 | `decryptMutationOptions`                             |
| `useAuthorizeAll`            | `authorizeAllMutationOptions`                        |

---

## 8. Signer Unification

### 8.1 Single Adapter Layer

Drop the `wagmi/`, `viem/`, `ethers/` adapter hook directories. Keep only:

1. **Signer classes** (already exist, just reorganize):
   - `@zama-fhe/sdk/signers/viem` → `createViemSigner(walletClient, publicClient)`
   - `@zama-fhe/sdk/signers/ethers` → `createEthersSigner(signer)`
   - `@zama-fhe/sdk/signers/wagmi` → `createWagmiSigner(wagmiConfig)`

2. **Contract call builders** (already exist in `@zama-fhe/sdk`):
   - Users who want raw contract access use builders directly + their framework's native hooks
   - This is the "escape hatch" — no Zama hooks needed

### 8.2 Usage Examples

```tsx
// With wagmi
import { createConfig } from "@zama-fhe/sdk";
import { createWagmiSigner } from "@zama-fhe/sdk/signers/wagmi";
import { useAccount } from "wagmi";

function App() {
  const { address } = useAccount();
  const wagmiConfig = useWagmiConfig();

  useEffect(() => {
    if (address) {
      zamaConfig.setSigner(createWagmiSigner(wagmiConfig));
    } else {
      zamaConfig.clearSigner();
    }
  }, [address]);

  return (
    <ZamaProvider config={zamaConfig}>
      <TokenDashboard />
    </ZamaProvider>
  );
}
```

```tsx
// With viem
import { createViemSigner } from "@zama-fhe/sdk/signers/viem";

const signer = createViemSigner({ walletClient, publicClient });
zamaConfig.setSigner(signer);
```

```tsx
// With ethers
import { createEthersSigner } from "@zama-fhe/sdk/signers/ethers";

const signer = createEthersSigner({ signer: ethersProvider.getSigner() });
zamaConfig.setSigner(signer);
```

### 8.3 Deprecation of Adapter Hooks

The adapter subpath exports (`@zama-fhe/react-sdk/wagmi`, `/viem`, `/ethers`) are deprecated and re-export from the main entry point with console warnings:

```ts
// @zama-fhe/react-sdk/wagmi/index.ts (deprecated)
export { useShield, useTransfer, ... } from '../index';
export { createWagmiSigner as WagmiSigner } from '@zama-fhe/sdk/signers/wagmi';
// console.warn on import
```

---

## 9. Provider Changes

### 9.1 New `ZamaProvider`

```tsx
interface ZamaProviderProps {
  config: Config; // created via createConfig(), not raw relayer/signer/storage
  children: React.ReactNode;
}

export function ZamaProvider({ config, children }: ZamaProviderProps) {
  return <ZamaContext.Provider value={config}>{children}</ZamaContext.Provider>;
}
```

The provider is now trivially simple — it just puts config in context. No `useMemo`, no relayer termination (config lifecycle is managed by the app, not by React).

### 9.2 Read-Only Mode

Without a signer, read-only hooks work:

- `useTokenMetadata` — reads name/symbol/decimals via RPC (signer needed for contract reads, but we can use a public client)
- `useIsConfidential`, `useIsWrapper` — ERC-165 checks
- `useTotalSupply` — public contract reads

Hooks requiring a signer (`useShield`, `useTransfer`, `useConfidentialBalance`) are auto-gated via `enabled: Boolean(config.store.getState().signer && ...)`. They sit idle until a signer is set.

> **Note:** Read-only mode requires the config to have a way to do public contract reads without a signer. This means either:
> (a) Accept a `publicClient` / `provider` in `createConfig` for reads, OR
> (b) Use the signer's `readContract` when available, disable read hooks when not.
>
> Recommendation: Option (b) for simplicity. Read hooks that require on-chain data are `enabled: false` without a signer. Truly static data (public key, public params) works via the relayer without a signer.

---

## 10. Testing Strategy

### 10.1 Four-Layer Testing

```
Layer 4:  Type Tests           (*.test-d.ts)   — compile-time type assertions
Layer 3:  Hook Integration     (*.test.tsx)     — render + fetch + assert lifecycle
Layer 2:  Query Options        (query/*.test.ts) — factory output verification
Layer 1:  Action Unit Tests    (actions/*.test.ts) — pure functions with mocked config
```

### 10.2 Layer 1 Tests (Actions)

Pure function tests with a mock config:

```ts
// actions/shield.test.ts
import { shield } from "@zama-fhe/sdk/actions";
import { createMockConfig } from "../test-utils";

test("shield calls writeContract with correct args", async () => {
  const config = createMockConfig({ signer: mockSigner });
  const result = await shield(config, {
    tokenAddress: "0xToken",
    amount: 100n,
  });
  expect(mockSigner.writeContract).toHaveBeenCalledWith(
    expect.objectContaining({ functionName: "wrap" }),
  );
});
```

### 10.3 Layer 2 Tests (Query Options)

Synchronous output verification:

```ts
// query/getConfidentialBalance.test.ts

test("query key structure", () => {
  const options = getConfidentialBalanceQueryOptions(mockConfig, {
    tokenAddress: "0xToken",
  });
  expect(options.queryKey).toEqual(["zama.confidentialBalance", { tokenAddress: "0xToken" }]);
});

test("enabled is false without signer", () => {
  const config = createMockConfig({ signer: undefined });
  const options = getConfidentialBalanceQueryOptions(config, {
    tokenAddress: "0xToken",
  });
  expect(options.enabled).toBe(false);
});

test("enabled is false without tokenAddress", () => {
  const options = getConfidentialBalanceQueryOptions(mockConfig, {});
  expect(options.enabled).toBe(false);
});

test("staleTime is Infinity for balance", () => {
  const options = getConfidentialBalanceQueryOptions(mockConfig, {
    tokenAddress: "0xToken",
  });
  expect(options.staleTime).toBe(Infinity);
});
```

### 10.4 Layer 3 Tests (Hooks)

Render with providers, verify lifecycle:

```tsx
// hooks/useShield.test.tsx

test("useShield invalidates balance cache on success", async () => {
  const queryClient = new QueryClient();
  const { result } = renderWithProviders(() => useShield({ tokenAddress: "0xToken" }), {
    queryClient,
    config: mockConfig,
  });

  // Pre-populate cache
  queryClient.setQueryData(zamaQueryKeys.confidentialBalance.token("0xToken"), 100n);

  // Execute mutation
  await act(() => result.current.shield({ amount: 50n }));

  // Verify cache was invalidated
  const state = queryClient.getQueryState(zamaQueryKeys.confidentialBalance.token("0xToken"));
  expect(state?.isInvalidated).toBe(true);
});
```

### 10.5 Test Utilities (in sdk)

```ts
// @zama-fhe/sdk/test-utils (exported for consumers)

export function createMockConfig(overrides?: Partial<CreateConfigParameters>): Config;
export function createMockSigner(overrides?: Partial<GenericSigner>): GenericSigner;
export function createMockRelayer(overrides?: Partial<RelayerSDK>): RelayerSDK;
```

---

## 11. Migration Path

### Phase 1: Extract Actions (breaking changes allowed)

1. Create `@zama-fhe/sdk/actions` subpath
2. Extract pure functions from `Token`/`ReadonlyToken` methods
3. Make `Token` class delegate to actions
4. Add typed `EncryptInput` / `DecryptedValue` types
5. All existing tests continue to pass — Token class is unchanged externally

### Phase 2: Extract Query Layer (breaking changes allowed)

1. Create `@zama-fhe/sdk/query` subpath
2. Move existing query options factories from react-sdk to sdk/query
3. Add missing factories (confidentialBalance, confidentialBalances, activityFeed)
4. Add `filterQueryOptions`, `hashFn`, `zamaQueryKeys`
5. Add cache invalidation helpers
6. React hooks import from `@zama-fhe/sdk/query` instead of local definitions
7. Hook runtime behavior remains equivalent, but query key shapes and public factory/key import paths may change with documented migration steps

### Phase 3: Config Store (breaking)

1. Replace `ZamaSDK` class with `createConfig()` function
2. Move credential state into config store
3. Change `ZamaProvider` to accept `config` prop instead of `relayer`/`signer`/`storage`
4. Make signer optional
5. Add `useCredentialStatus`, `useSigner` hooks
6. Move signer classes to `@zama-fhe/sdk/signers/*` subpaths

### Phase 4: Unify Adapters (breaking)

1. Deprecate `@zama-fhe/react-sdk/wagmi`, `/viem`, `/ethers` subpaths
2. Remove adapter hook directories
3. All hooks come from `@zama-fhe/react-sdk` main entry
4. Signer creation is the only framework-specific code

### Phase 5: Cleanup

1. Remove deprecated adapter subpaths
2. Update all documentation
3. Update test-app to use new patterns
4. Add type tests (`.test-d.ts`)

---

## 12. Approval Handling Fix

Keep approvals bundled in `useShield` but fix edge cases:

```ts
// In the shield action:
async function shield(config: Config, params: ShieldParameters) {
  const { tokenAddress, amount, recipient } = params;
  const signer = requireSigner(config);
  const address = await signer.getAddress();

  // Check current allowance
  const currentAllowance = await signer.readContract<bigint>(
    allowanceContract(tokenAddress, address, wrapperAddress),
  );

  if (currentAllowance < amount) {
    // Handle USDT-style tokens: reset to 0 first if non-zero
    if (currentAllowance > 0n) {
      await signer.writeContract(approveContract(tokenAddress, wrapperAddress, 0n));
    }
    await signer.writeContract(approveContract(tokenAddress, wrapperAddress, amount));
  }

  // Proceed with wrap
  return signer.writeContract(wrapContract(wrapperAddress, amount, recipient ?? address));
}
```

---

## 13. Summary of Breaking Changes

| Change                                                                  | Type         | Migration                                                       |
| ----------------------------------------------------------------------- | ------------ | --------------------------------------------------------------- |
| `ZamaProvider` accepts `config` instead of `relayer`/`signer`/`storage` | Breaking     | `createConfig({ relayer, signer, storage })` → pass to provider |
| `ZamaSDK` class replaced by `createConfig()`                            | Breaking     | Replace `new ZamaSDK(...)` with `createConfig(...)`             |
| Adapter subpaths deprecated                                             | Breaking     | Import hooks from main entry, create signer separately          |
| `useEncrypt` accepts typed inputs                                       | Breaking     | `{ values: bigint[] }` → `{ values: EncryptInput[] }`           |
| Query keys namespaced with `zama.`                                      | Breaking     | External cache management code must update key references       |
| Signer optional in provider                                             | Non-breaking | Existing code continues to work                                 |

---

## 14. Success Criteria

- [ ] Every action is independently testable without React
- [ ] Every query options factory is testable without rendering
- [ ] React hooks are ≤10 lines of real logic
- [ ] `@zama-fhe/sdk/query` has zero React dependencies
- [ ] Config works without a signer (read-only mode)
- [ ] Credential state is reactive (components re-render on lock/unlock)
- [ ] One set of hooks — no adapter duplication
- [ ] All query keys are namespaced, use `filterQueryOptions`, support `hashFn`
- [ ] Cache invalidation is centralized (not duplicated across hooks)
- [ ] Existing test-app works with new architecture after migration
- [ ] Type tests verify generic inference for all public APIs
