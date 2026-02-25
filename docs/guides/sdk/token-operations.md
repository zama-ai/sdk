# Token Operations

## Creating Token Instances

```ts
const sdk = new ZamaSDK({ relayer, signer, storage });

// Read-only — balances, metadata, decryption. No wrapper needed.
const readonlyToken = sdk.createReadonlyToken("0xTokenAddress");

// Full read/write — shield, unshield, transfer, approve.
// The token address IS the wrapper (encrypted ERC20 = wrapper contract).
const token = sdk.createToken("0xTokenAddress");
// Override wrapper if it differs from the token address (rare):
// const token = sdk.createToken("0xTokenAddress", "0xWrapperAddress");
```

## Token (Read/Write)

Full read/write interface for a single confidential ERC-20. Extends `ReadonlyToken`. The encrypted ERC-20 contract IS the wrapper, so `wrapper` defaults to the token `address`. Pass an explicit `wrapper` only if they differ.

All write methods return a [`TransactionResult`](../../api/sdk/src/README.md) object:

```ts
interface TransactionResult {
  txHash: Hex;
  receipt: TransactionReceipt;
}
```

### Shield (Wrap)

Shield public ERC-20 tokens into confidential tokens. Handles ERC-20 approval automatically.

```ts
// Shield with exact approval (default)
const { txHash } = await token.shield(1000n);

// Shield with max approval
await token.shield(1000n, { approvalStrategy: "max" });

// Skip approval (use when already approved)
await token.shield(1000n, { approvalStrategy: "skip" });

// Shield native ETH (for ETH wrapper contracts)
await token.shieldETH(1000n);
```

### Confidential Transfer

Send tokens to another address. The amount is encrypted on-chain.

```ts
await token.confidentialTransfer("0xRecipient", 500n);

// Operator transfer (on behalf of another address)
await token.confidentialTransferFrom("0xFrom", "0xRecipient", 500n);
```

### Unshield (Unwrap + Finalize)

Withdraw confidential tokens back to public ERC-20. Orchestrates unwrap and finalize in a single call.

```ts
// Unshield a specific amount
await token.unshield(500n);

// Unshield entire balance
await token.unshieldAll();
```

#### Progress Callbacks

`unshield()`, `unshieldAll()`, and `resumeUnshield()` accept optional callbacks for tracking progress:

```ts
import type { UnshieldCallbacks } from "@zama-fhe/sdk";

const callbacks: UnshieldCallbacks = {
  onUnwrapSubmitted: (txHash) => console.log("Unwrap tx:", txHash),
  onFinalizing: () => console.log("Waiting for decryption proof..."),
  onFinalizeSubmitted: (txHash) => console.log("Finalize tx:", txHash),
};

await token.unshield(500n, callbacks);
```

Callbacks are safe — a throwing callback will not interrupt the unshield flow.

#### Pending Unshield Persistence

The unshield flow is two-phase: unwrap tx, then finalize. If the page reloads between phases, the unwrap tx hash is lost. Use these utilities to persist it:

```ts
import { savePendingUnshield, loadPendingUnshield, clearPendingUnshield } from "@zama-fhe/sdk";

// Save the unwrap hash before finalization
await savePendingUnshield(storage, wrapperAddress, unwrapTxHash);

// On next load, check for pending unshields
const pending = await loadPendingUnshield(storage, wrapperAddress);
if (pending) {
  await token.resumeUnshield(pending);
  await clearPendingUnshield(storage, wrapperAddress);
}
```

### Balance Decryption

```ts
// Decrypt and return the plaintext balance
const balance = await token.balanceOf();

// Decrypt for a specific owner
const balance = await token.balanceOf("0xOwnerAddress");

// Get raw encrypted handle (no decryption)
const handle = await token.confidentialBalanceOf();

// Decrypt a single handle
const value = await token.decryptBalance(handle);

// Batch-decrypt arbitrary handles
const values = await token.decryptHandles(handles);
```

### Batch Operations

```ts
// Pre-authorize all tokens with a single wallet signature
const tokens = addresses.map((a) => sdk.createReadonlyToken(a));
await ReadonlyToken.authorizeAll(tokens);
// All subsequent decrypts reuse cached credentials — no more wallet prompts

// Decrypt balances for multiple tokens in parallel
const balances = await ReadonlyToken.batchDecryptBalances(tokens, { owner });

// Decrypt pre-fetched handles for multiple tokens
const balances = await ReadonlyToken.batchDecryptBalances(tokens, { handles, owner });
```

### Operator Approval

```ts
// Set operator approval (default: +1 hour)
await token.approve("0xSpender");

// Set custom duration
await token.approve("0xSpender", untilTimestamp);

// Check approval status
const approved = await token.isApproved("0xSpender");
```

## ReadonlyToken

Read-only subset. No wrapper address needed.

| Method                                | Description                                                       |
| ------------------------------------- | ----------------------------------------------------------------- |
| `balanceOf(owner?)`                   | Decrypt and return the plaintext balance.                         |
| `confidentialBalanceOf(owner?)`       | Return the raw encrypted balance handle (no decryption).          |
| `decryptBalance(handle, owner?)`      | Decrypt a single encrypted handle.                                |
| `decryptHandles(handles, owner?)`     | Batch-decrypt handles in a single relayer call.                   |
| `authorize()`                         | Ensure FHE decrypt credentials exist (generates/signs if needed). |
| `authorizeAll(tokens)` _(static)_     | Pre-authorize multiple tokens with a single wallet signature.     |
| `isConfidential()`                    | ERC-165 check for ERC-7984 support.                               |
| `isWrapper()`                         | ERC-165 check for wrapper interface.                              |
| `discoverWrapper(coordinatorAddress)` | Look up a wrapper for this token via the deployment coordinator.  |
| `underlyingToken()`                   | Read the underlying ERC-20 address from a wrapper.                |
| `allowance(wrapper, owner?)`          | Read ERC-20 allowance of the underlying token.                    |
| `isZeroHandle(handle)`                | Returns `true` if the handle is the zero sentinel.                |
| `name()` / `symbol()` / `decimals()`  | Read token metadata.                                              |

## Activity Feed

Transform raw event logs into a user-friendly activity feed with decrypted amounts.

```ts
import {
  parseActivityFeed,
  extractEncryptedHandles,
  applyDecryptedValues,
  sortByBlockNumber,
} from "@zama-fhe/sdk";

// 1. Parse raw logs into classified activity items
const items = parseActivityFeed(logs, userAddress);

// 2. Extract encrypted handles that need decryption
const handles = extractEncryptedHandles(items);

// 3. Decrypt handles (using your token instance)
const decryptedMap = await token.decryptHandles(handles);

// 4. Apply decrypted values back to activity items
const enrichedItems = applyDecryptedValues(items, decryptedMap);

// 5. Sort by block number (most recent first)
const sorted = sortByBlockNumber(enrichedItems);
```

## Event Decoders

Decode raw log entries from `eth_getLogs` into typed event objects.

```ts
import { TOKEN_TOPICS } from "@zama-fhe/sdk";

const logs = await publicClient.getLogs({
  address: tokenAddress,
  topics: [TOKEN_TOPICS],
});
```

| Function                          | Returns                                                  |
| --------------------------------- | -------------------------------------------------------- |
| `decodeConfidentialTransfer(log)` | `ConfidentialTransferEvent \| null`                      |
| `decodeWrapped(log)`              | `WrappedEvent \| null`                                   |
| `decodeUnwrapRequested(log)`      | `UnwrapRequestedEvent \| null`                           |
| `decodeUnwrappedFinalized(log)`   | `UnwrappedFinalizedEvent \| null`                        |
| `decodeUnwrappedStarted(log)`     | `UnwrappedStartedEvent \| null`                          |
| `decodeOnChainEvent(log)`         | `OnChainEvent \| null` — tries all decoders              |
| `decodeOnChainEvents(logs)`       | `OnChainEvent[]` — batch decode, skips unrecognized logs |

Convenience finder helpers:

```ts
import { findWrapped, findUnwrapRequested } from "@zama-fhe/sdk";

const wrappedEvent = findWrapped(receipt.logs);
const unwrapEvent = findUnwrapRequested(receipt.logs);
```
