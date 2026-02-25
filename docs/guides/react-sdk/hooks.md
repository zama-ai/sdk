# Hooks Guide

All hooks documented here require a `ZamaProvider` in the component tree. For library-specific adapter hooks that do not require the provider, see [Library Adapters](library-adapters.md).

## SDK Access

### `useZamaSDK`

Returns the `ZamaSDK` instance from context. Use this when you need direct access to the SDK (e.g. for low-level relayer operations).

```ts
function useZamaSDK(): ZamaSDK;
```

### `useToken`

Returns a `Token` instance for a given token address. The encrypted ERC-20 contract IS the wrapper, so `wrapperAddress` defaults to `tokenAddress`. Memoized -- same config returns the same instance.

```ts
function useToken(config: { tokenAddress: Address; wrapperAddress?: Address }): Token;
```

### `useReadonlyToken`

Returns a `ReadonlyToken` instance for a given token address (no wrapper needed). Memoized.

```ts
function useReadonlyToken(tokenAddress: Address): ReadonlyToken;
```

## Balance Hooks

### `useConfidentialBalance`

Single-token balance with automatic decryption. Uses two-phase polling: polls the encrypted handle at a configurable interval, and only triggers the expensive decryption when the handle changes.

```ts
function useConfidentialBalance(
  tokenAddress: Address,
  owner?: Address, // defaults to connected wallet
  options?: UseConfidentialBalanceOptions,
): UseQueryResult<bigint, Error>;
```

Options extend `UseQueryOptions` and add:

| Option                  | Type     | Default | Description                                     |
| ----------------------- | -------- | ------- | ----------------------------------------------- |
| `handleRefetchInterval` | `number` | `10000` | Polling interval (ms) for the encrypted handle. |

```tsx
const {
  data: balance,
  isLoading,
  error,
} = useConfidentialBalance(
  "0xTokenAddress",
  undefined, // use connected wallet
  { handleRefetchInterval: 5_000 },
);
```

### `useConfidentialBalances`

Multi-token batch balance. Same two-phase polling pattern.

```ts
function useConfidentialBalances(
  tokenAddresses: Address[],
  owner?: Address,
  options?: UseConfidentialBalancesOptions,
): UseQueryResult<Map<Address, bigint>, Error>;
```

```tsx
const { data: balances } = useConfidentialBalances(["0xTokenA", "0xTokenB", "0xTokenC"]);

// balances is a Map<Address, bigint>
const tokenABalance = balances?.get("0xTokenA");
```

### Balance Caching and Refresh

Balance queries use two-phase polling:

1. **Phase 1 (cheap)** -- Polls the encrypted balance handle via a read-only RPC call at `handleRefetchInterval` (default: 10s).
2. **Phase 2 (expensive)** -- Only when the handle changes (i.e. balance updated on-chain), triggers an FHE decryption via the relayer.

Mutation hooks (`useConfidentialTransfer`, `useShield`, `useUnshield`, etc.) automatically invalidate the relevant caches on success.

To force a refresh:

```tsx
const queryClient = useQueryClient();
queryClient.invalidateQueries({ queryKey: confidentialBalanceQueryKeys.all });
```

## Authorization

### `useAuthorizeAll`

Pre-authorize FHE decrypt credentials for a list of token addresses with a single wallet signature. Call this early (e.g. after loading the token list) so that subsequent individual decrypt operations reuse cached credentials without prompting the wallet again.

```ts
function useAuthorizeAll(): UseMutationResult<void, Error, Address[]>;
```

```tsx
const { mutateAsync: authorizeAll, isPending } = useAuthorizeAll();

// Pre-authorize all known tokens up front
await authorizeAll(allTokenAddresses);

// Individual balance decrypts now reuse cached credentials
const { data: balance } = useConfidentialBalance("0xTokenA");
```

## Transfer Hooks

### `useConfidentialTransfer`

Encrypted transfer. Encrypts the amount and calls the contract. Automatically invalidates balance caches on success.

```ts
function useConfidentialTransfer(
  config: UseZamaConfig,
  options?: UseMutationOptions<Address, Error, ConfidentialTransferParams>,
): UseMutationResult<Address, Error, ConfidentialTransferParams>;

interface ConfidentialTransferParams {
  to: Address;
  amount: bigint;
}
```

```tsx
const { mutateAsync: transfer, isPending } = useConfidentialTransfer({
  tokenAddress: "0xTokenAddress",
});

const txHash = await transfer({ to: "0xRecipient", amount: 1000n });
```

### `useConfidentialTransferFrom`

Operator transfer on behalf of another address.

```ts
interface ConfidentialTransferFromParams {
  from: Address;
  to: Address;
  amount: bigint;
}
```

## Shield Hooks

### `useShield`

Shield public ERC-20 tokens into confidential tokens. Handles ERC-20 approval automatically.

```ts
interface ShieldParams {
  amount: bigint;
  approvalStrategy?: "max" | "exact" | "skip"; // default: "exact"
}
```

```tsx
const { mutateAsync: shield } = useShield({ tokenAddress: "0xTokenAddress" });

// Shield 1000 tokens with exact approval (default)
await shield({ amount: 1000n });

// Shield with max approval
await shield({ amount: 1000n, approvalStrategy: "max" });
```

### `useShieldETH`

Shield native ETH into confidential tokens. Use when the underlying token is the zero address (native ETH).

```ts
interface ShieldETHParams {
  amount: bigint;
  value?: bigint; // defaults to amount
}
```

## Unshield Hooks (Combined)

These hooks orchestrate the full unshield flow in a single call: unwrap, wait for receipt, parse event, finalizeUnwrap.

### `useUnshield`

Unshield a specific amount. Supports optional progress callbacks.

```tsx
const { mutateAsync: unshield, isPending } = useUnshield({
  tokenAddress: "0xTokenAddress",
});

const finalizeTxHash = await unshield({
  amount: 500n,
  callbacks: {
    onUnwrapSubmitted: (txHash) => console.log("Unwrap tx:", txHash),
    onFinalizing: () => console.log("Finalizing..."),
    onFinalizeSubmitted: (txHash) => console.log("Finalize tx:", txHash),
  },
});
```

### `useUnshieldAll`

Unshield the entire balance.

```tsx
const { mutateAsync: unshieldAll } = useUnshieldAll({
  tokenAddress: "0xTokenAddress",
});

const finalizeTxHash = await unshieldAll();
```

### `useResumeUnshield`

Resume an interrupted unshield from a saved unwrap tx hash. Pair with `savePendingUnshield`/`loadPendingUnshield`/`clearPendingUnshield` for persistence.

```tsx
import { loadPendingUnshield, clearPendingUnshield } from "@zama-fhe/react-sdk";

const { mutateAsync: resumeUnshield } = useResumeUnshield({
  tokenAddress: "0xTokenAddress",
});

// On mount, check for interrupted unshields
const pending = await loadPendingUnshield(storage, wrapperAddress);
if (pending) {
  await resumeUnshield({ unwrapTxHash: pending });
  await clearPendingUnshield(storage, wrapperAddress);
}
```

## Unwrap Hooks (Low-Level)

These hooks expose the individual unwrap steps for fine-grained control.

### `useUnwrap`

Request unwrap for a specific amount (requires manual finalization via `useFinalizeUnwrap`).

### `useUnwrapAll`

Request unwrap for the entire balance (requires manual finalization).

### `useFinalizeUnwrap`

Complete an unwrap by providing the decryption proof.

```ts
interface FinalizeUnwrapParams {
  burnAmountHandle: Address;
}
```

## Approval Hooks

### `useConfidentialApprove`

Set operator approval for the confidential token.

```ts
interface ConfidentialApproveParams {
  spender: Address;
  until?: number; // Unix timestamp, defaults to now + 1 hour
}
```

### `useConfidentialIsApproved`

Check if a spender is an approved operator. Enabled only when `spender` is defined.

### `useUnderlyingAllowance`

Read the ERC-20 allowance of the underlying token for the wrapper.

## Discovery and Metadata

### `useWrapperDiscovery`

Find the wrapper contract for a given token via the deployment coordinator. Results are cached indefinitely.

### `useTokenMetadata`

Fetch token name, symbol, and decimals in parallel. Cached indefinitely.

```tsx
const { data: meta } = useTokenMetadata("0xTokenAddress");
// meta?.name, meta?.symbol, meta?.decimals
```

## Activity Feed

### `useActivityFeed`

Parse raw event logs into a classified, optionally decrypted activity feed.

```tsx
const { data: feed } = useActivityFeed({
  tokenAddress: "0xTokenAddress",
  logs, // from getLogs or a similar source
  userAddress,
  decrypt: true,
});

feed?.forEach((item) => {
  console.log(item.type, item.direction, item.amount);
});
```

## Fee Hooks

### `useShieldFee`

Read the shield (wrap) fee for a given amount and address pair.

```tsx
const { data: fee } = useShieldFee({
  feeManagerAddress: "0xFeeManager",
  amount: 1000n,
  from: "0xSender",
  to: "0xReceiver",
});
```

### `useUnshieldFee`

Read the unshield (unwrap) fee. Same signature as `useShieldFee`.

### `useBatchTransferFee`

Read the batch transfer fee from the fee manager.

### `useFeeRecipient`

Read the fee recipient address from the fee manager.

## Query Keys

Exported query key factories for manual cache management (invalidation, prefetching, removal).

```ts
import {
  confidentialBalanceQueryKeys,
  confidentialBalancesQueryKeys,
  confidentialHandleQueryKeys,
  confidentialHandlesQueryKeys,
  underlyingAllowanceQueryKeys,
  activityFeedQueryKeys,
  feeQueryKeys,
  decryptionKeys,
} from "@zama-fhe/react-sdk";
```

| Factory                         | Keys                                                                                     | Description                         |
| ------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------- |
| `confidentialBalanceQueryKeys`  | `.all`, `.token(address)`, `.owner(address, owner)`                                      | Single-token decrypted balance.     |
| `confidentialBalancesQueryKeys` | `.all`, `.tokens(addresses, owner)`                                                      | Multi-token batch balances.         |
| `confidentialHandleQueryKeys`   | `.all`, `.token(address)`, `.owner(address, owner)`                                      | Single-token encrypted handle.      |
| `confidentialHandlesQueryKeys`  | `.all`, `.tokens(addresses, owner)`                                                      | Multi-token batch handles.          |
| `underlyingAllowanceQueryKeys`  | `.all`, `.token(address, wrapper)`                                                       | Underlying ERC-20 allowance.        |
| `activityFeedQueryKeys`         | `.all`, `.token(address)`                                                                | Activity feed items.                |
| `feeQueryKeys`                  | `.shieldFee(...)`, `.unshieldFee(...)`, `.batchTransferFee(addr)`, `.feeRecipient(addr)` | Fee manager queries.                |
| `decryptionKeys`                | `.value(handle)`                                                                         | Individual decrypted handle values. |

```tsx
import { useQueryClient } from "@tanstack/react-query";
import { confidentialBalanceQueryKeys } from "@zama-fhe/react-sdk";

const queryClient = useQueryClient();

// Invalidate all balances
queryClient.invalidateQueries({ queryKey: confidentialBalanceQueryKeys.all });

// Invalidate a specific token's balance
queryClient.invalidateQueries({
  queryKey: confidentialBalanceQueryKeys.token("0xTokenAddress"),
});
```

For the full API details, see the [React SDK API Reference](../../api/react-sdk/src/README.md).
