# SDK API Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement 10 breaking API improvements across `@zama-fhe/sdk` and `@zama-fhe/react-sdk` — clean break, no deprecation.

**Architecture:** Changes flow bottom-up: core SDK types/errors first, then Token class, then React hooks, then exports/tests. Each task is independently committable.

**Tech Stack:** TypeScript, vitest, Playwright, pnpm workspace, tsup

**Design doc:** `docs/plans/2026-02-25-sdk-api-improvements-design.md`

---

### Task 1: Add `TransactionResult` type and `matchTokenError` utility

New types and utilities that other tasks depend on.

**Files:**

- Modify: `packages/sdk/src/token/token.types.ts`
- Modify: `packages/sdk/src/token/errors.ts`
- Modify: `packages/sdk/src/index.ts`
- Test: `packages/sdk/src/token/__tests__/errors.test.ts`

**Step 1: Add `TransactionResult` to token.types.ts**

In `packages/sdk/src/token/token.types.ts`, add after the `TransactionReceipt` interface (line 10):

```ts
/** Result of a write operation: the tx hash and its mined receipt. */
export interface TransactionResult {
  /** The transaction hash. */
  txHash: Hex;
  /** The mined transaction receipt. */
  receipt: TransactionReceipt;
}
```

**Step 2: Add `matchTokenError` to errors.ts**

At the end of `packages/sdk/src/token/errors.ts` (after `RelayerRequestFailedError`), add:

````ts
/**
 * Pattern-match on a {@link TokenError} by its error code.
 * Falls through to the `_` wildcard handler if no specific handler matches.
 * Returns `undefined` if the error is not a `TokenError` and no `_` handler is provided.
 *
 * @example
 * ```ts
 * matchTokenError(error, {
 *   SIGNING_REJECTED: () => toast("Please approve in wallet"),
 *   TRANSACTION_REVERTED: (e) => toast(`Tx failed: ${e.message}`),
 *   _: () => toast("Unknown error"),
 * });
 * ```
 */
export function matchTokenError<R>(
  error: unknown,
  handlers: Partial<Record<TokenErrorCode, (error: TokenError) => R>> & {
    _?: (error: unknown) => R;
  },
): R | undefined {
  if (error instanceof TokenError) {
    const handler = handlers[error.code];
    if (handler) return handler(error);
  }
  return handlers._?.(error);
}
````

**Step 3: Export new types from sdk index**

In `packages/sdk/src/index.ts`, add to the token.types re-export:

- Add `TransactionResult` to the type export from `./token/token.types`
- Add `matchTokenError` to the value export from `./token/errors`

**Step 4: Add tests for `matchTokenError`**

In `packages/sdk/src/token/__tests__/errors.test.ts`, add tests:

```ts
describe("matchTokenError", () => {
  it("dispatches to the correct handler by error code", () => {
    const error = new SigningRejectedError("rejected");
    const result = matchTokenError(error, {
      SIGNING_REJECTED: (e) => `handled: ${e.message}`,
    });
    expect(result).toBe("handled: rejected");
  });

  it("falls through to wildcard when no specific handler matches", () => {
    const error = new EncryptionFailedError("failed");
    const result = matchTokenError(error, {
      SIGNING_REJECTED: () => "wrong",
      _: () => "wildcard",
    });
    expect(result).toBe("wildcard");
  });

  it("returns undefined for non-TokenError without wildcard", () => {
    const error = new Error("random");
    const result = matchTokenError(error, {
      SIGNING_REJECTED: () => "wrong",
    });
    expect(result).toBeUndefined();
  });

  it("passes non-TokenError to wildcard handler", () => {
    const error = new Error("random");
    const result = matchTokenError(error, {
      _: (e) => `caught: ${(e as Error).message}`,
    });
    expect(result).toBe("caught: random");
  });
});
```

**Step 5: Run tests**

Run: `cd /Users/guillaume.hermet/Documents/zama/token-sdk && pnpm test:run -- packages/sdk/src/token/__tests__/errors.test.ts`
Expected: All tests pass.

**Step 6: Commit**

```bash
git add packages/sdk/src/token/token.types.ts packages/sdk/src/token/errors.ts packages/sdk/src/index.ts packages/sdk/src/token/__tests__/errors.test.ts
git commit -m "feat: add TransactionResult type and matchTokenError utility"
```

---

### Task 2: Rename `wrap`/`wrapETH` to `shield`/`shieldETH` on Token class + update events

Rename methods on the Token class and update the event system.

**Files:**

- Modify: `packages/sdk/src/token/token.ts` — rename `wrap` → `shield`, `wrapETH` → `shieldETH`
- Modify: `packages/sdk/src/events/sdk-events.ts` — rename `WrapSubmitted` → `ShieldSubmitted`, event string `"wrap:submitted"` → `"shield:submitted"`
- Modify: `packages/sdk/src/token/__tests__/token.test.ts` — update references
- Modify: `packages/sdk/src/token/__tests__/token-events.test.ts` — update references

**Step 1: Rename event in sdk-events.ts**

In `packages/sdk/src/events/sdk-events.ts`:

- Line 22: Change `WrapSubmitted: "wrap:submitted"` → `ShieldSubmitted: "shield:submitted"`
- Rename `WrapSubmittedEvent` interface → `ShieldSubmittedEvent`, change its `type` to `typeof ZamaSDKEvents.ShieldSubmitted`
- Update the `ZamaSDKEvent` union: replace `WrapSubmittedEvent` with `ShieldSubmittedEvent`

**Step 2: Rename methods in token.ts**

In `packages/sdk/src/token/token.ts`:

- Rename method `wrap(` → `shield(` (line 262)
- Rename method `wrapETH(` → `shieldETH(` (line 306)
- Update the internal call from `this.wrapETH(` → `this.shieldETH(` (line 272)
- Update all `ZamaSDKEvents.WrapSubmitted` → `ZamaSDKEvents.ShieldSubmitted` (lines 283, 312)
- Update JSDoc comments to say "shield" instead of "wrap"

**Step 3: Update test files**

In `packages/sdk/src/token/__tests__/token.test.ts` and `token-events.test.ts`:

- Replace all `token.wrap(` → `token.shield(`
- Replace all `token.wrapETH(` → `token.shieldETH(`
- Replace all `"wrap:submitted"` → `"shield:submitted"`
- Replace all `ZamaSDKEvents.WrapSubmitted` → `ZamaSDKEvents.ShieldSubmitted`

**Step 4: Run tests**

Run: `cd /Users/guillaume.hermet/Documents/zama/token-sdk && pnpm test:run -- packages/sdk/src/token/__tests__/`
Expected: All tests pass.

**Step 5: Commit**

```bash
git add packages/sdk/src/token/token.ts packages/sdk/src/events/sdk-events.ts packages/sdk/src/token/__tests__/
git commit -m "feat: rename wrap/wrapETH to shield/shieldETH on Token class"
```

---

### Task 3: Token write methods return `TransactionResult` instead of `Hex`

All Token write methods now wait for receipt and return `{ txHash, receipt }`.

**Files:**

- Modify: `packages/sdk/src/token/token.ts` — all write methods
- Modify: `packages/sdk/src/token/__tests__/token.test.ts`

**Step 1: Update Token class methods**

In `packages/sdk/src/token/token.ts`, import `TransactionResult`:

```ts
import type { UnshieldCallbacks, TransactionResult } from "./token.types";
```

For each write method (`confidentialTransfer`, `confidentialTransferFrom`, `approve`, `shield`, `shieldETH`, `unwrap`, `unwrapAll`, `finalizeUnwrap`, `approveUnderlying`), change:

- Return type from `Promise<Hex>` to `Promise<TransactionResult>`
- After the `writeContract` call, add `const receipt = await this.signer.waitForTransactionReceipt(txHash);`
- Return `{ txHash, receipt }` instead of `txHash`

For `unshield`, `unshieldAll`, `resumeUnshield` — these already orchestrate internally. Update their return types too and propagate the `TransactionResult` from `finalizeUnwrap`.

For `#waitAndFinalizeUnshield`: change return type to `Promise<TransactionResult>`, return the `TransactionResult` from `this.finalizeUnwrap()`.

Update `#ensureAllowance` — this calls `writeContract` internally for approval but doesn't return a result. The internal approval calls should still wait for receipt (they already don't return), so wrap them: `await this.signer.waitForTransactionReceipt(...)`.

**Step 2: Update UnshieldCallbacks**

In `packages/sdk/src/token/token.types.ts`, `onFinalizeSubmitted` should still receive `Hex` (just the hash, not the full result) — keep as-is since callbacks are fire-and-forget notifications.

**Step 3: Update tests**

In test files, update assertions from `expect(result).toBe("0xTxHash")` to `expect(result.txHash).toBe("0xTxHash")` and optionally check `result.receipt`.

Mock `waitForTransactionReceipt` to return `{ logs: [] }` where not already mocked.

**Step 4: Run tests**

Run: `cd /Users/guillaume.hermet/Documents/zama/token-sdk && pnpm test:run -- packages/sdk/src/token/__tests__/`
Expected: All tests pass.

**Step 5: Commit**

```bash
git add packages/sdk/src/token/token.ts packages/sdk/src/token/token.types.ts packages/sdk/src/token/__tests__/
git commit -m "feat: Token write methods return TransactionResult instead of Hex"
```

---

### Task 4: Options bags for signer constructors

Change all three signer adapters to accept an options object.

**Files:**

- Modify: `packages/sdk/src/viem/viem-signer.ts`
- Modify: `packages/sdk/src/ethers/ethers-signer.ts`
- Modify: `packages/react-sdk/src/wagmi/wagmi-signer.ts`
- Modify: All test files and consumers

**Step 1: Update ViemSigner**

In `packages/sdk/src/viem/viem-signer.ts`:

```ts
export interface ViemSignerConfig {
  walletClient: WalletClient;
  publicClient: PublicClient;
}

export class ViemSigner implements GenericSigner {
  private readonly walletClient: WalletClient;
  private readonly publicClient: PublicClient;

  constructor(config: ViemSignerConfig) {
    this.walletClient = config.walletClient;
    this.publicClient = config.publicClient;
  }
  // ... rest unchanged
}
```

Export `ViemSignerConfig` from `packages/sdk/src/viem/index.ts`.

**Step 2: Update EthersSigner**

In `packages/sdk/src/ethers/ethers-signer.ts`:

```ts
export interface EthersSignerConfig {
  signer: BrowserProvider | Signer;
}

export class EthersSigner implements GenericSigner {
  private signerPromise: Promise<Signer>;

  constructor(config: EthersSignerConfig) {
    const providerOrSigner = config.signer;
    if ("getSigner" in providerOrSigner) {
      this.signerPromise = providerOrSigner.getSigner();
    } else {
      this.signerPromise = Promise.resolve(providerOrSigner);
    }
  }
  // ... rest unchanged
}
```

Export `EthersSignerConfig` from `packages/sdk/src/ethers/index.ts`.

**Step 3: Update WagmiSigner**

In `packages/react-sdk/src/wagmi/wagmi-signer.ts`:

```ts
export interface WagmiSignerConfig {
  config: Config;
}

export class WagmiSigner implements GenericSigner {
  private readonly config: Config;

  constructor(signerConfig: WagmiSignerConfig) {
    this.config = signerConfig.config;
  }
  // ... rest unchanged
}
```

Export `WagmiSignerConfig` from `packages/react-sdk/src/wagmi/index.ts`.

**Step 4: Update all consumers**

Grep for `new ViemSigner(`, `new EthersSigner(`, `new WagmiSigner(` across the entire repo and update call sites:

- `packages/test-app/src/providers.tsx`: `new WagmiSigner(wagmiConfig)` → `new WagmiSigner({ config: wagmiConfig })`
- All test files in `packages/react-sdk/src/__tests__/` and `packages/sdk/src/`
- Sub-path re-exports (react-sdk viem/ethers signer files) — these just re-export, no code change needed

**Step 5: Run tests**

Run: `cd /Users/guillaume.hermet/Documents/zama/token-sdk && pnpm test:run`
Expected: All tests pass.

**Step 6: Run typecheck**

Run: `cd /Users/guillaume.hermet/Documents/zama/token-sdk && pnpm typecheck`
Expected: No errors.

**Step 7: Commit**

```bash
git add packages/sdk/src/viem/ packages/sdk/src/ethers/ packages/react-sdk/src/wagmi/ packages/test-app/src/providers.tsx packages/react-sdk/src/__tests__/ packages/sdk/src/token/__tests__/
git commit -m "feat: use options bags for ViemSigner, EthersSigner, WagmiSigner constructors"
```

---

### Task 5: Expose `credentialDurationDays` and `onEvent` on ZamaProvider

**Files:**

- Modify: `packages/react-sdk/src/provider.tsx`
- Modify: `packages/react-sdk/src/__tests__/provider.test.tsx`

**Step 1: Update ZamaProviderProps**

In `packages/react-sdk/src/provider.tsx`:

```ts
interface ZamaProviderProps extends PropsWithChildren {
  relayer: RelayerSDK;
  signer: GenericSigner;
  storage: GenericStringStorage;
  /** Number of days FHE credentials remain valid. Default: 1. */
  credentialDurationDays?: number;
  /** Structured event listener for debugging and telemetry. */
  onEvent?: ZamaSDKEventListener;
}
```

Import `ZamaSDKEventListener` from `@zama-fhe/sdk`.

**Step 2: Pass props through to TokenSDK**

```ts
export function ZamaProvider({
  children,
  relayer,
  signer,
  storage,
  credentialDurationDays,
  onEvent,
}: ZamaProviderProps) {
  const sdk = useMemo(
    () =>
      new TokenSDK({
        relayer,
        signer,
        storage,
        credentialDurationDays,
        onEvent,
      }),
    [relayer, signer, storage, credentialDurationDays, onEvent],
  );
  // ... rest unchanged
}
```

**Step 3: Add a test**

In `packages/react-sdk/src/__tests__/provider.test.tsx`, add a test that passes `credentialDurationDays` and `onEvent` props and verifies the `TokenSDK` is created correctly.

**Step 4: Run tests**

Run: `cd /Users/guillaume.hermet/Documents/zama/token-sdk && pnpm test:run -- packages/react-sdk/src/__tests__/provider.test.tsx`
Expected: All tests pass.

**Step 5: Commit**

```bash
git add packages/react-sdk/src/provider.tsx packages/react-sdk/src/__tests__/provider.test.tsx
git commit -m "feat: expose credentialDurationDays and onEvent on ZamaProvider"
```

---

### Task 6: Fix dual error channel in `useConfidentialBalance` and `useConfidentialBalances`

Replace `useEffect`+`useState` signer address resolution with a query.

**Files:**

- Modify: `packages/react-sdk/src/token/use-confidential-balance.ts`
- Modify: `packages/react-sdk/src/token/use-confidential-balances.ts`

**Step 1: Refactor useConfidentialBalance**

Replace lines 49-70 in `packages/react-sdk/src/token/use-confidential-balance.ts`:

```ts
export function useConfidentialBalance(
  config: UseConfidentialBalanceConfig,
  options?: UseConfidentialBalanceOptions,
) {
  const { tokenAddress, handleRefetchInterval } = config;
  const token = useReadonlyToken(tokenAddress);

  // Resolve signer address as a query (single error channel)
  const addressQuery = useQuery<Address, Error>({
    queryKey: ["zama", "signer-address", tokenAddress],
    queryFn: () => token.signer.getAddress(),
  });

  const signerAddress = addressQuery.data;
  const ownerKey = signerAddress ?? "";

  // Phase 1: Poll the encrypted handle (cheap RPC read, no signing)
  const handleQuery = useQuery<Address, Error>({
    queryKey: confidentialHandleQueryKeys.owner(tokenAddress, ownerKey),
    queryFn: () => token.confidentialBalanceOf(),
    enabled: !!signerAddress,
    refetchInterval: handleRefetchInterval ?? DEFAULT_HANDLE_REFETCH_INTERVAL,
  });

  const handle = handleQuery.data;

  // Phase 2: Decrypt only when handle changes (expensive relayer roundtrip)
  const balanceQuery = useQuery<bigint, Error>({
    queryKey: [...confidentialBalanceQueryKeys.owner(tokenAddress, ownerKey), handle ?? ""],
    queryFn: () => token.decryptBalance(handle!),
    enabled: !!signerAddress && !!handle,
    staleTime: Infinity,
    ...options,
  });

  return { ...balanceQuery, handleQuery };
}
```

Remove the `signerError` from the return type — it no longer exists. Errors now flow through `addressQuery` → `handleQuery` → `balanceQuery` chain via the `enabled` flag.

**Step 2: Refactor useConfidentialBalances**

Same pattern in `packages/react-sdk/src/token/use-confidential-balances.ts`. Replace the `useState`/`useEffect` block with:

```ts
const addressQuery = useQuery<Address, Error>({
  queryKey: ["zama", "signer-address"],
  queryFn: () => sdk.signer.getAddress(),
});

const signerAddress = addressQuery.data;
```

Remove `signerError` from the return type.

**Step 3: Update tests**

Any tests checking `signerError` should be updated to check the query error chain instead.

**Step 4: Run tests**

Run: `cd /Users/guillaume.hermet/Documents/zama/token-sdk && pnpm test:run -- packages/react-sdk/`
Expected: All tests pass.

**Step 5: Commit**

```bash
git add packages/react-sdk/src/token/use-confidential-balance.ts packages/react-sdk/src/token/use-confidential-balances.ts packages/react-sdk/src/__tests__/
git commit -m "fix: replace dual error channel in useConfidentialBalance with query chain"
```

---

### Task 7: `batchDecryptBalances` fails loudly by default

**Files:**

- Modify: `packages/sdk/src/token/readonly-token.ts`
- Modify: `packages/sdk/src/token/__tests__/readonly-token.test.ts`

**Step 1: Add `BatchDecryptErrorStrategy` type**

In `packages/sdk/src/token/readonly-token.ts`, replace the `onError` field in `BatchDecryptOptions`:

```ts
/** Error handling strategy for batch decryption. */
export type BatchDecryptErrorStrategy =
  | "throw"
  | "zero"
  | ((error: Error, address: Address) => bigint);

export interface BatchDecryptOptions {
  handles?: Address[];
  owner?: Address;
  /** Error strategy. Default: `"throw"` (aggregates errors). */
  onError?: BatchDecryptErrorStrategy;
  maxConcurrency?: number;
}
```

**Step 2: Update `batchDecryptBalances` implementation**

In the `.catch` block of the decrypt loop (line 255-258), replace:

```ts
.catch((error) => {
  onError?.(token.address, error instanceof Error ? error : new Error(String(error)));
  results.set(token.address, BigInt(0));
}),
```

With:

```ts
.catch((error) => {
  const err = error instanceof Error ? error : new Error(String(error));
  if (typeof onError === "function") {
    results.set(token.address, onError(err, token.address));
  } else if (onError === "zero") {
    results.set(token.address, BigInt(0));
  } else {
    // "throw" (default) — collect errors for aggregate throw
    errors.push({ address: token.address, error: err });
  }
}),
```

Add error collection before the loop:

```ts
const errors: Array<{ address: Address; error: Error }> = [];
```

After `await pLimit(decryptFns, maxConcurrency);`, add:

```ts
if (errors.length > 0) {
  const message = errors.map((e) => `${e.address}: ${e.error.message}`).join("; ");
  throw new DecryptionFailedError(
    `Batch decryption failed for ${errors.length} token(s): ${message}`,
  );
}
```

**Step 3: Update tests**

Update any tests that relied on silent `0n` behavior to explicitly pass `onError: "zero"`.

**Step 4: Run tests**

Run: `cd /Users/guillaume.hermet/Documents/zama/token-sdk && pnpm test:run -- packages/sdk/src/token/__tests__/readonly-token.test.ts`
Expected: All tests pass.

**Step 5: Commit**

```bash
git add packages/sdk/src/token/readonly-token.ts packages/sdk/src/token/__tests__/readonly-token.test.ts
git commit -m "feat: batchDecryptBalances throws by default instead of silent 0n"
```

---

### Task 8: Add `sdk.createTokenFromWrapper()` factory

**Files:**

- Modify: `packages/sdk/src/token/token-sdk.ts`
- Modify: `packages/sdk/src/token/__tests__/token-sdk.test.ts`

**Step 1: Add the method**

In `packages/sdk/src/token/token-sdk.ts`, add after `createToken()`:

```ts
/**
 * Create a Token from a wrapper address by auto-discovering the underlying token.
 * Looks up the wrapper via the deployment coordinator contract.
 *
 * @param wrapperAddress - Address of the wrapper (confidential token) contract.
 * @param coordinatorAddress - Address of the deployment coordinator contract.
 * @returns A `Token` instance with both `address` (underlying) and `wrapper` set.
 * @throws If no wrapper is found at the coordinator for this address.
 */
async createTokenFromWrapper(wrapperAddress: Address, coordinatorAddress: Address): Promise<Token> {
  const normalizedWrapper = normalizeAddress(wrapperAddress, "wrapperAddress");
  const normalizedCoordinator = normalizeAddress(coordinatorAddress, "coordinatorAddress");

  const readonlyToken = this.createReadonlyToken(normalizedWrapper);
  const underlying = await readonlyToken.underlyingToken();

  return this.createToken(underlying, normalizedWrapper);
}
```

**Step 2: Add test**

```ts
it("createTokenFromWrapper resolves underlying and returns a Token", async () => {
  const mockReadonlyToken = { underlyingToken: vi.fn().mockResolvedValue("0xUnderlying") };
  // ... test that createTokenFromWrapper calls underlyingToken and creates correct Token
});
```

**Step 3: Run tests**

Run: `cd /Users/guillaume.hermet/Documents/zama/token-sdk && pnpm test:run -- packages/sdk/src/token/__tests__/token-sdk.test.ts`

**Step 4: Commit**

```bash
git add packages/sdk/src/token/token-sdk.ts packages/sdk/src/token/__tests__/token-sdk.test.ts
git commit -m "feat: add sdk.createTokenFromWrapper() factory"
```

---

### Task 9: RelayerWeb convenience factories

**Files:**

- Modify: `packages/sdk/src/relayer/relayer-web.ts`
- Modify: `packages/sdk/src/index.ts` (export new types if needed)

**Step 1: Add static factory methods**

In `packages/sdk/src/relayer/relayer-web.ts`, import configs:

```ts
import { MainnetConfig, SepoliaConfig, HardhatConfig } from "./relayer-utils";
```

Add static methods to `RelayerWeb`:

````ts
/** Known chain names for convenience factories. */
static readonly ChainConfigs = {
  mainnet: { chainId: 1, config: MainnetConfig },
  sepolia: { chainId: 11155111, config: SepoliaConfig },
  hardhat: { chainId: 31337, config: HardhatConfig },
} as const;

/**
 * Create a RelayerWeb for a single known chain.
 *
 * @example
 * ```ts
 * const relayer = RelayerWeb.create("mainnet", {
 *   getChainId: () => Promise.resolve(1),
 * });
 * ```
 */
static create(
  chain: "mainnet" | "sepolia" | "hardhat",
  options: {
    getChainId: () => Promise<number>;
    csrfToken?: () => string;
    logger?: import("../worker/worker.types").GenericLogger;
  },
): RelayerWeb {
  const { chainId, config } = RelayerWeb.ChainConfigs[chain];
  return new RelayerWeb({
    getChainId: options.getChainId,
    transports: { [chainId]: config },
    security: options.csrfToken ? { getCsrfToken: options.csrfToken } : undefined,
    logger: options.logger,
  });
}

/**
 * Create a RelayerWeb supporting multiple known chains.
 *
 * @example
 * ```ts
 * const relayer = RelayerWeb.createMultiChain(["mainnet", "sepolia"], {
 *   getChainId: () => wallet.getChainId(),
 * });
 * ```
 */
static createMultiChain(
  chains: ("mainnet" | "sepolia" | "hardhat")[],
  options: {
    getChainId: () => Promise<number>;
    csrfToken?: () => string;
    logger?: import("../worker/worker.types").GenericLogger;
  },
): RelayerWeb {
  const transports: Record<number, typeof MainnetConfig> = {};
  for (const chain of chains) {
    const { chainId, config } = RelayerWeb.ChainConfigs[chain];
    transports[chainId] = config;
  }
  return new RelayerWeb({
    getChainId: options.getChainId,
    transports,
    security: options.csrfToken ? { getCsrfToken: options.csrfToken } : undefined,
    logger: options.logger,
  });
}
````

**Step 2: Run typecheck**

Run: `cd /Users/guillaume.hermet/Documents/zama/token-sdk && pnpm typecheck`

**Step 3: Commit**

```bash
git add packages/sdk/src/relayer/relayer-web.ts
git commit -m "feat: add RelayerWeb.create and RelayerWeb.createMultiChain convenience factories"
```

---

### Task 10: Rename React hooks (useWrap → useShield, etc.) and fee hooks

**Files:**

- Modify: `packages/react-sdk/src/token/use-wrap.ts` — rename hook, types, mutation options
- Modify: `packages/react-sdk/src/token/use-wrap-eth.ts` — same
- Delete: `packages/react-sdk/src/token/use-shield.ts` (old alias)
- Delete: `packages/react-sdk/src/token/use-shield-eth.ts` (old alias)
- Modify: `packages/react-sdk/src/token/use-fees.ts` — rename `useWrapFee` → `useShieldFee`, `useUnwrapFee` → `useUnshieldFee`, query keys/options
- Modify: `packages/react-sdk/src/index.ts` — update all exports
- Modify: `packages/react-sdk/src/__tests__/mutation-hooks.test.tsx` — update references
- Modify: `packages/react-sdk/src/__tests__/mutation-options.test.ts` — update references
- Modify: `packages/react-sdk/src/__tests__/query-options.test.ts` — update references

**Step 1: Rename use-wrap.ts internals**

In `packages/react-sdk/src/token/use-wrap.ts`:

- Rename `WrapParams` → `ShieldParams`
- Rename `UseWrapConfig` → `UseShieldConfig`
- Rename `wrapMutationOptions` → `shieldMutationOptions`
- Rename `useWrap` → `useShield`
- Update mutation key from `["wrap", ...]` to `["shield", ...]`
- Update the `mutationFn` to call `token.shield(...)` instead of `token.wrap(...)`

**Step 2: Rename use-wrap-eth.ts internals**

In `packages/react-sdk/src/token/use-wrap-eth.ts`:

- Rename `WrapETHParams` → `ShieldETHParams`
- Rename `wrapETHMutationOptions` → `shieldETHMutationOptions`
- Rename `useWrapETH` → `useShieldETH`
- Update mutation key from `["wrapETH", ...]` to `["shieldETH", ...]`
- Update `mutationFn` to call `token.shieldETH(...)` instead of `token.wrapETH(...)`

**Step 3: Delete old alias files**

Delete `packages/react-sdk/src/token/use-shield.ts` and `packages/react-sdk/src/token/use-shield-eth.ts`.

**Step 4: Rename fee hooks**

In `packages/react-sdk/src/token/use-fees.ts`:

- Rename `useWrapFee` → `useShieldFee`
- Rename `useUnwrapFee` → `useUnshieldFee`
- Rename `wrapFeeQueryOptions` → `shieldFeeQueryOptions`
- Rename `unwrapFeeQueryOptions` → `unshieldFeeQueryOptions`
- Update `feeQueryKeys.wrapFee` → `feeQueryKeys.shieldFee`
- Update `feeQueryKeys.unwrapFee` → `feeQueryKeys.unshieldFee`

**Step 5: Update react-sdk main index.ts**

In `packages/react-sdk/src/index.ts`:

- Replace `useWrap, wrapMutationOptions, WrapParams, UseWrapConfig` with `useShield, shieldMutationOptions, ShieldParams, UseShieldConfig`
- Replace `useShield` import from `./token/use-shield` — delete this line (old alias)
- Replace `useWrapETH, wrapETHMutationOptions, WrapETHParams` with `useShieldETH, shieldETHMutationOptions, ShieldETHParams`
- Replace `useShieldETH` import from `./token/use-shield-eth` — delete this line (old alias)
- Replace `useWrapFee` → `useShieldFee`, `useUnwrapFee` → `useUnshieldFee`
- Replace `wrapFeeQueryOptions` → `shieldFeeQueryOptions`, `unwrapFeeQueryOptions` → `unshieldFeeQueryOptions`

**Step 6: Update sub-path indexes**

In `packages/react-sdk/src/viem/index.ts`, `packages/react-sdk/src/ethers/index.ts`, `packages/react-sdk/src/wagmi/index.ts`:

- Rename `useWrap` → `useShield`, `useWrapETH` → `useShieldETH` exports
- Rename `WrapParams` → `ShieldParams`, `WrapETHParams` → `ShieldETHParams` type exports

**Step 7: Update tests**

All test files in `packages/react-sdk/src/__tests__/` that reference the renamed hooks/types.

**Step 8: Run tests**

Run: `cd /Users/guillaume.hermet/Documents/zama/token-sdk && pnpm test:run`
Expected: All tests pass.

**Step 9: Commit**

```bash
git add packages/react-sdk/
git commit -m "feat: rename useWrap to useShield, useWrapETH to useShieldETH, fee hooks"
```

---

### Task 11: Unify sub-path hook exports (re-export high-level hooks)

**Files:**

- Modify: `packages/react-sdk/src/viem/index.ts`
- Modify: `packages/react-sdk/src/ethers/index.ts`
- Modify: `packages/react-sdk/src/wagmi/index.ts`

**Step 1: Add high-level hook re-exports to each sub-path**

Add to each of the three sub-path index files:

```ts
// High-level token hooks (re-exported from main path for convenience)
export {
  useShield,
  useShieldETH,
  useUnshield,
  useUnshieldAll,
  useResumeUnshield,
  useConfidentialTransfer,
  useConfidentialTransferFrom,
  useConfidentialApprove,
  useConfidentialBalance,
  useConfidentialBalances,
  useAuthorizeAll,
  useTokenMetadata,
  useActivityFeed,
  useApproveUnderlying,
  useUnwrap,
  useUnwrapAll,
  useFinalizeUnwrap,
} from "../index";
```

Note: Import from `"../index"` (the react-sdk main entry) since these hooks are defined there.

**Step 2: Run typecheck**

Run: `cd /Users/guillaume.hermet/Documents/zama/token-sdk && pnpm typecheck`
Expected: No errors.

**Step 3: Commit**

```bash
git add packages/react-sdk/src/viem/index.ts packages/react-sdk/src/ethers/index.ts packages/react-sdk/src/wagmi/index.ts
git commit -m "feat: re-export high-level hooks from viem, ethers, wagmi sub-paths"
```

---

### Task 12: Update exports + update react-sdk re-exports from sdk

**Files:**

- Modify: `packages/sdk/src/index.ts` — export `TransactionResult`, `matchTokenError`, `ShieldSubmittedEvent`, `BatchDecryptErrorStrategy`
- Modify: `packages/react-sdk/src/index.ts` — re-export new types

**Step 1: Update sdk index.ts**

In `packages/sdk/src/index.ts`:

- Add `TransactionResult` to the type export from `./token/token.types`
- Add `matchTokenError` to the value export from `./token/errors`
- Rename `WrapSubmittedEvent` → `ShieldSubmittedEvent` in event type exports (if exported)
- Add `BatchDecryptErrorStrategy` to the export from `./token/readonly-token`

**Step 2: Update react-sdk index.ts**

In `packages/react-sdk/src/index.ts`:

- Re-export `TransactionResult`, `matchTokenError`, `BatchDecryptErrorStrategy` from `@zama-fhe/sdk`

**Step 3: Run typecheck and build**

Run: `cd /Users/guillaume.hermet/Documents/zama/token-sdk && pnpm typecheck && pnpm build`
Expected: No errors.

**Step 4: Commit**

```bash
git add packages/sdk/src/index.ts packages/react-sdk/src/index.ts
git commit -m "feat: export TransactionResult, matchTokenError, BatchDecryptErrorStrategy"
```

---

### Task 13: Update test-app components and E2E tests

**Files:**

- Modify: `packages/test-app/src/components/shield-form.tsx`
- Modify: `packages/test-app/src/components/token-table.tsx`
- Modify: `packages/test-app/src/components/wrapper-discovery-panel.tsx`
- Modify: `packages/test-app/src/providers.tsx`
- Modify: `packages/test-app/src/components/unwrap-manual-form.tsx`
- Modify: E2E test files as needed

**Step 1: Update shield-form.tsx**

Replace `useShield` import (was aliased from `useWrap`) — now import directly from `@zama-fhe/react-sdk` (which exports the renamed `useShield`). Update `ShieldParams` type if used.

**Step 2: Update providers.tsx**

Update `new WagmiSigner(wagmiConfig)` → `new WagmiSigner({ config: wagmiConfig })`.

**Step 3: Update unwrap-manual-form.tsx**

If it imports `useWrap`-related types, update to `useShield`.

**Step 4: Update any other components**

Search for any remaining references to old names and update.

**Step 5: Run full test suite**

Run: `cd /Users/guillaume.hermet/Documents/zama/token-sdk && pnpm test:run && pnpm typecheck && pnpm lint`
Expected: All pass.

**Step 6: Commit**

```bash
git add packages/test-app/
git commit -m "feat: update test-app to use new SDK API names"
```

---

### Task 14: Final verification — build and full test pass

**Step 1: Build all packages**

Run: `cd /Users/guillaume.hermet/Documents/zama/token-sdk && pnpm build`
Expected: All three packages build successfully.

**Step 2: Run all unit tests**

Run: `cd /Users/guillaume.hermet/Documents/zama/token-sdk && pnpm test:run`
Expected: All tests pass.

**Step 3: Run typecheck**

Run: `cd /Users/guillaume.hermet/Documents/zama/token-sdk && pnpm typecheck`
Expected: No errors.

**Step 4: Run lint**

Run: `cd /Users/guillaume.hermet/Documents/zama/token-sdk && pnpm lint`
Expected: No errors.

**Step 5: Commit any remaining fixes**

If any issues found, fix and commit.
