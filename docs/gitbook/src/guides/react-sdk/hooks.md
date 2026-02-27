# Hooks

All hooks on this page require a `ZamaProvider` ancestor. For low-level hooks that work without a provider, see [Library Adapters](library-adapters.md).

## Balances

### `useConfidentialBalance`

Decrypt and poll a single token's balance. Uses two-phase polling — cheaply checks the encrypted handle every 10 seconds, only decrypts when it changes. Decrypted values are persisted in storage, so page reloads show the balance instantly without a "Decrypting..." spinner.

```tsx
const {
  data: balance,
  isLoading,
  error,
} = useConfidentialBalance({
  tokenAddress: "0xToken",
  handleRefetchInterval: 5_000, // optional (default: 10s)
});
```

### `useConfidentialBalances`

Same thing, but for multiple tokens at once. Returns a `Map<Address, bigint>`.

```tsx
const { data: balances } = useConfidentialBalances({
  tokenAddresses: ["0xTokenA", "0xTokenB", "0xTokenC"],
});

const tokenABalance = balances?.get("0xTokenA");
```

### Forcing a refresh

Mutations automatically invalidate balance caches, but if you need manual control:

```tsx
import { useQueryClient } from "@tanstack/react-query";
import { confidentialBalanceQueryKeys } from "@zama-fhe/react-sdk";

const queryClient = useQueryClient();

// Invalidate everything
queryClient.invalidateQueries({ queryKey: confidentialBalanceQueryKeys.all });

// Invalidate one token
queryClient.invalidateQueries({
  queryKey: confidentialBalanceQueryKeys.token("0xToken"),
});
```

## Transfers

### `useConfidentialTransfer`

Send tokens privately. The amount is encrypted before hitting the chain.

```tsx
const { mutateAsync: transfer, isPending } = useConfidentialTransfer({
  tokenAddress: "0xToken",
});

const txHash = await transfer({ to: "0xRecipient", amount: 1000n });
```

### `useConfidentialTransferFrom`

Operator transfer — send on behalf of someone who approved you.

```tsx
const { mutateAsync: transferFrom } = useConfidentialTransferFrom({
  tokenAddress: "0xToken",
});

await transferFrom({ from: "0xOwner", to: "0xRecipient", amount: 500n });
```

## Shielding (public → confidential)

### `useShield`

Shield public ERC-20 tokens. Handles the approval transaction automatically.

```tsx
const { mutateAsync: shield } = useShield({ tokenAddress: "0xToken" });

await shield({ amount: 1000n });

// Skip repeated approvals
await shield({ amount: 1000n, approvalStrategy: "max" });
```

### `useShieldETH`

Shield native ETH (for ETH wrapper contracts).

```tsx
const { mutateAsync: shieldETH } = useShieldETH({ tokenAddress: "0xToken" });

await shieldETH({ amount: 1000n });
```

## Unshielding (confidential → public)

### `useUnshield`

Unshield a specific amount. Orchestrates the full two-step flow (unwrap + finalize) in one call.

```tsx
const { mutateAsync: unshield, isPending } = useUnshield({
  tokenAddress: "0xToken",
});

await unshield({
  amount: 500n,
  callbacks: {
    onUnwrapSubmitted: (txHash) => console.log("Step 1:", txHash),
    onFinalizing: () => console.log("Waiting for proof..."),
    onFinalizeSubmitted: (txHash) => console.log("Done:", txHash),
  },
});
```

### `useUnshieldAll`

Unshield the entire balance.

```tsx
const { mutateAsync: unshieldAll } = useUnshieldAll({ tokenAddress: "0xToken" });
await unshieldAll();
```

### `useResumeUnshield`

Resume an unshield that was interrupted (e.g. page closed between unwrap and finalize).

```tsx
import { loadPendingUnshield, clearPendingUnshield } from "@zama-fhe/react-sdk";

const { mutateAsync: resumeUnshield } = useResumeUnshield({ tokenAddress: "0xToken" });

// On mount
const pending = await loadPendingUnshield(storage, wrapperAddress);
if (pending) {
  await resumeUnshield({ unwrapTxHash: pending });
  await clearPendingUnshield(storage, wrapperAddress);
}
```

### Low-level unwrap hooks

If you need to control each step separately:

- **`useUnwrap`** — request unwrap for a specific amount (you finalize manually)
- **`useUnwrapAll`** — request unwrap for the full balance (you finalize manually)
- **`useFinalizeUnwrap`** — finalize with the decryption proof

## Authorization

### `useAuthorizeAll`

Pre-authorize FHE credentials for multiple tokens with one wallet signature. Call this early so balance decrypts don't prompt the wallet individually.

```tsx
const { mutateAsync: authorizeAll } = useAuthorizeAll();

await authorizeAll(["0xTokenA", "0xTokenB", "0xTokenC"]);
// All subsequent balance reads reuse the cached credential
```

## Approval

### `useConfidentialApprove`

Approve an operator for your confidential tokens.

```tsx
const { mutateAsync: approve } = useConfidentialApprove({ tokenAddress: "0xToken" });

await approve({ spender: "0xDEX" }); // 1 hour default
await approve({ spender: "0xDEX", until: futureTimestamp });
```

### `useConfidentialIsApproved`

Check if a spender is approved.

```tsx
const { data: isApproved } = useConfidentialIsApproved({
  tokenAddress: "0xToken",
  spender: "0xDEX",
});
```

### `useUnderlyingAllowance`

Read the ERC-20 allowance of the underlying token for the wrapper.

## Discovery and metadata

### `useWrapperDiscovery`

Find the wrapper contract for a token via the deployment coordinator. Cached indefinitely.

### `useTokenMetadata`

Get name, symbol, and decimals in one call. Cached indefinitely.

```tsx
const { data: meta } = useTokenMetadata("0xToken");
// meta?.name, meta?.symbol, meta?.decimals
```

## Activity feed

### `useActivityFeed`

Parse event logs into a classified, optionally decrypted feed.

```tsx
const { data: feed } = useActivityFeed({
  tokenAddress: "0xToken",
  logs,
  userAddress,
  decrypt: true,
});

feed?.forEach((item) => {
  console.log(item.type, item.direction, item.amount);
});
```

## Fees

| Hook                                                      | What it reads         |
| --------------------------------------------------------- | --------------------- |
| `useShieldFee({ feeManagerAddress, amount, from, to })`   | Shield (wrap) fee     |
| `useUnshieldFee({ feeManagerAddress, amount, from, to })` | Unshield (unwrap) fee |
| `useBatchTransferFee("0xFeeManager")`                     | Batch transfer fee    |
| `useFeeRecipient("0xFeeManager")`                         | Fee recipient address |

## SDK access

### `useZamaSDK`

Get the raw `ZamaSDK` instance from context for advanced use.

```ts
const sdk = useZamaSDK();
```

### `useToken`

Get a memoized `Token` instance.

```ts
const token = useToken({ tokenAddress: "0xToken" });
```

### `useReadonlyToken`

Get a memoized `ReadonlyToken` instance (no write access).

```ts
const readonlyToken = useReadonlyToken("0xToken");
```

## Error handling in components

Map SDK errors to user-friendly messages:

```tsx
import { matchZamaError } from "@zama-fhe/react-sdk";

function ErrorMessage({ error }: { error: Error | null }) {
  if (!error) return null;

  const message = matchZamaError(error, {
    SIGNING_REJECTED: () => "Transaction cancelled — please approve in your wallet.",
    ENCRYPTION_FAILED: () => "Encryption failed — please try again.",
    TRANSACTION_REVERTED: () => "Transaction failed on-chain — check your balance.",
    _: () => "Something went wrong.",
  });

  return <p className="error">{message ?? error.message}</p>;
}
```

## Query keys

For manual cache control (prefetching, invalidation, removal):

| Factory                         | Keys                                                                                   | What it controls               |
| ------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------ |
| `confidentialBalanceQueryKeys`  | `.all`, `.token(addr)`, `.owner(addr, owner)`                                          | Single-token decrypted balance |
| `confidentialBalancesQueryKeys` | `.all`, `.tokens(addrs, owner)`                                                        | Multi-token batch balances     |
| `confidentialHandleQueryKeys`   | `.all`, `.token(addr)`, `.owner(addr, owner)`                                          | Single-token encrypted handle  |
| `confidentialHandlesQueryKeys`  | `.all`, `.tokens(addrs, owner)`                                                        | Multi-token batch handles      |
| `underlyingAllowanceQueryKeys`  | `.all`, `.token(addr, wrapper)`                                                        | ERC-20 allowance               |
| `activityFeedQueryKeys`         | `.all`, `.token(addr)`                                                                 | Activity feed                  |
| `feeQueryKeys`                  | `.shieldFee(...)`, `.unshieldFee(...)`, `.batchTransferFee(...)`, `.feeRecipient(...)` | Fee queries                    |
| `decryptionKeys`                | `.value(handle)`                                                                       | Cached decrypted values        |
