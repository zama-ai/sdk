# Token Operations

This page covers everything you can do with a `Token` or `ReadonlyToken` instance.

## Creating tokens

```ts
const sdk = new ZamaSDK({ relayer, signer, storage });

// Full read/write access — shield, transfer, unshield, decrypt
const token = sdk.createToken("0xEncryptedERC20");

// Read-only — decrypt balances, check metadata (no transactions)
const readonlyToken = sdk.createReadonlyToken("0xEncryptedERC20");
```

The encrypted ERC-20 contract IS the wrapper contract. In the rare case where they differ, pass the wrapper explicitly:

```ts
const token = sdk.createToken("0xTokenAddress", "0xWrapperAddress");
```

## Shielding (public → confidential)

Shield converts public ERC-20 tokens into their encrypted form.

```ts
// Shield with exact approval (default) — approves only the amount being shielded
const { txHash, receipt } = await token.shield(1000n);

// Shield with max approval — avoids repeated approval txs if you shield often
await token.shield(1000n, { approvalStrategy: "max" });

// Skip approval — use when the wrapper is already approved
await token.shield(1000n, { approvalStrategy: "skip" });
```

For ETH wrapper contracts (where the underlying token is native ETH):

```ts
await token.shieldETH(1000n);
```

All write methods return `{ txHash, receipt }`.

## Decrypting balances

The first balance read for a token prompts the user's wallet for a signature. This creates FHE decrypt credentials that are cached in your storage backend. Subsequent reads are silent.

```ts
// Your own balance
const balance = await token.balanceOf();

// Someone else's balance (requires their credentials, or public decrypt)
const balance = await token.balanceOf("0xOwnerAddress");
```

### Working with raw handles

If you need the encrypted handle without decrypting:

```ts
const handle = await token.confidentialBalanceOf();

// Check if the handle is zero (account has never shielded)
if (token.isZeroHandle(handle)) {
  console.log("No confidential balance yet");
}

// Decrypt a handle you already have
const value = await token.decryptBalance(handle);

// Decrypt multiple handles at once
const values = await token.decryptHandles([handle1, handle2, handle3]);
```

### Batch operations across multiple tokens

```ts
const tokens = addresses.map((a) => sdk.createReadonlyToken(a));

// One wallet signature authorizes decryption for all tokens
await ReadonlyToken.authorizeAll(tokens);

// Then decrypt all balances in parallel — no more wallet prompts
const balances = await ReadonlyToken.batchDecryptBalances(tokens, { owner });
// Returns Map<Address, bigint>

// If you already have the handles, pass them to skip the RPC reads
const balances = await ReadonlyToken.batchDecryptBalances(tokens, { handles, owner });
```

## Confidential transfers

The amount is encrypted before it hits the chain. On-chain observers see the transaction but not the value.

```ts
await token.confidentialTransfer("0xRecipient", 500n);
```

For operator transfers (when someone has approved you to act on their behalf):

```ts
await token.confidentialTransferFrom("0xFrom", "0xTo", 500n);
```

## Unshielding (confidential → public)

Unshielding is a two-step process on-chain (unwrap, then finalize with a decryption proof), but the SDK handles both steps in one call:

```ts
await token.unshield(500n);

// Unshield your entire confidential balance
await token.unshieldAll();
```

### Tracking progress

```ts
await token.unshield(500n, {
  onUnwrapSubmitted: (txHash) => updateUI("Unwrap submitted..."),
  onFinalizing: () => updateUI("Waiting for decryption proof..."),
  onFinalizeSubmitted: (txHash) => updateUI("Done!"),
});
```

Callbacks are safe — if one throws, the unshield still completes.

### Handling interrupted unshields

If the user closes the page between the unwrap and finalize steps, you can resume:

```ts
import { savePendingUnshield, loadPendingUnshield, clearPendingUnshield } from "@zama-fhe/sdk";

// Save state before finalization (the SDK doesn't do this automatically)
await savePendingUnshield(storage, wrapperAddress, unwrapTxHash);

// On next page load, check for pending unshields
const pending = await loadPendingUnshield(storage, wrapperAddress);
if (pending) {
  await token.resumeUnshield(pending);
  await clearPendingUnshield(storage, wrapperAddress);
}
```

## Operator approval

Let another address (like a DEX or multisig) operate on your confidential tokens:

```ts
// Approve for 1 hour (default)
await token.approve("0xSpender");

// Approve until a specific timestamp
await token.approve("0xSpender", futureTimestamp);

// Check approval status
const approved = await token.isApproved("0xSpender");
```

## Token metadata and discovery

```ts
const name = await readonlyToken.name();
const symbol = await readonlyToken.symbol();
const decimals = await readonlyToken.decimals();

// Check if a token supports confidential operations (ERC-7984)
const isConfidential = await readonlyToken.isConfidential();

// Check if a contract is a wrapper
const isWrapper = await readonlyToken.isWrapper();

// Find the wrapper for a public token via the deployment coordinator
const wrapper = await readonlyToken.discoverWrapper("0xCoordinatorAddress");

// Read the underlying public token from a wrapper
const underlying = await readonlyToken.underlyingToken();

// Check ERC-20 allowance of the underlying token
const allowance = await readonlyToken.allowance("0xWrapperAddress");
```

## Activity feed

Parse on-chain event logs into a user-friendly list of transfers, shields, and unshields:

```ts
import {
  parseActivityFeed,
  extractEncryptedHandles,
  applyDecryptedValues,
  sortByBlockNumber,
} from "@zama-fhe/sdk";

// 1. Parse raw logs into classified items
const items = parseActivityFeed(logs, userAddress);

// 2. Pull out handles that need decrypting
const handles = extractEncryptedHandles(items);

// 3. Decrypt them
const decryptedMap = await token.decryptHandles(handles);

// 4. Attach the decrypted amounts
const enrichedItems = applyDecryptedValues(items, decryptedMap);

// 5. Sort newest first
const feed = sortByBlockNumber(enrichedItems);
```

## Event decoders

Decode raw `eth_getLogs` entries into typed objects:

```ts
import { decodeOnChainEvents, TOKEN_TOPICS } from "@zama-fhe/sdk";

const logs = await publicClient.getLogs({
  address: tokenAddress,
  topics: [TOKEN_TOPICS],
});

const events = decodeOnChainEvents(logs);
// Each event has a .type: "ConfidentialTransfer" | "Wrapped" | "UnwrapRequested" | etc.
```

Individual decoders are also available: `decodeConfidentialTransfer`, `decodeWrapped`, `decodeUnwrapRequested`, `decodeUnwrappedFinalized`, `decodeUnwrappedStarted`.

Convenience finders for receipt logs:

```ts
import { findWrapped, findUnwrapRequested } from "@zama-fhe/sdk";

const wrappedEvent = findWrapped(receipt.logs);
const unwrapEvent = findUnwrapRequested(receipt.logs);
```
