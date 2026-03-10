---
title: Token
description: Read/write interface for confidential ERC-20 operations.
---

# Token

Read/write interface for confidential ERC-20 operations — shielding, transferring, unshielding, and balance decryption.

## Import

Created via [`ZamaSDK.createToken()`](/reference/sdk/ZamaSDK#createtoken). Not imported directly.

## Usage

{% tabs %}
{% tab title="app.ts" %}

```ts
import { ZamaSDK } from "@zama-fhe/sdk";

const sdk = new ZamaSDK({ relayer, signer, storage });
const token = sdk.createToken("0xEncryptedERC20");

await token.shield(1000n);
const balance = await token.balanceOf();
await token.confidentialTransfer("0xRecipient", 500n);
```

{% endtab %}
{% tab title="config.ts" %}

```ts
import { ZamaSDK, indexedDBStorage, RelayerWeb, MainnetConfig, SepoliaConfig } from "@zama-fhe/sdk";
import { ViemSigner } from "@zama-fhe/sdk/viem";

const signer = new ViemSigner({ walletClient, publicClient });
const relayer = new RelayerWeb({
  getChainId: () => signer.getChainId(),
  transports: {
    [MainnetConfig.chainId]: {
      ...MainnetConfig,
      relayerUrl: "https://your-app.com/api/relayer/1",
      network: "https://mainnet.infura.io/v3/YOUR_KEY",
    },
    [SepoliaConfig.chainId]: {
      ...SepoliaConfig,
      relayerUrl: "https://your-app.com/api/relayer/11155111",
      network: "https://sepolia.infura.io/v3/YOUR_KEY",
    },
  },
});
```

{% endtab %}
{% endtabs %}

## Methods

### shield

`(amount: bigint, opts?: { approvalStrategy?: "exact" | "max" | "skip"; fees?: bigint; to?: Address; callbacks?: ShieldCallbacks }) => Promise<TransactionResult>`

Converts public ERC-20 tokens into their encrypted form. The SDK handles the ERC-20 approval automatically based on the strategy.

```ts
// Exact approval (default) — approves only the shielded amount
await token.shield(1000n);

// Max approval — avoids repeated approval txs
await token.shield(1000n, { approvalStrategy: "max" });

// Skip approval — wrapper is already approved
await token.shield(1000n, { approvalStrategy: "skip" });
```

### shieldETH

`(amount: bigint, value?: bigint) => Promise<TransactionResult>`

Shields native ETH into a confidential ETH wrapper contract. No approval needed. Pass `value` to override the amount of ETH sent (defaults to `amount`).

```ts
await token.shieldETH(1000n);
```

### balanceOf

`(owner?: Address) => Promise<bigint>`

Returns the decrypted confidential balance. The first call prompts a wallet signature to create FHE credentials; subsequent calls use cached credentials silently. Decrypted values are cached in storage automatically.

```ts
// Your own balance
const balance = await token.balanceOf();

// Another address
const balance = await token.balanceOf("0xOwnerAddress");
```

### confidentialBalanceOf

`(owner?: Address) => Promise<Hex>`

Returns the raw encrypted handle without decrypting. Use with `decryptBalance()` or `isZeroHandle()`.

```ts
const handle = await token.confidentialBalanceOf();
```

### confidentialTransfer

`(to: Address, amount: bigint, callbacks?: TransferCallbacks) => Promise<TransactionResult>`

Transfers encrypted tokens. The amount is encrypted before hitting the chain.

```ts
await token.confidentialTransfer("0xRecipient", 500n);
```

### confidentialTransferFrom

`(from: Address, to: Address, amount: bigint, callbacks?: TransferCallbacks) => Promise<TransactionResult>`

Operator transfer on behalf of an address that has approved you.

```ts
await token.confidentialTransferFrom("0xFrom", "0xTo", 500n);
```

### unshield

`(amount: bigint, callbacks?: UnshieldCallbacks) => Promise<{ txHash: Hex; receipt: TransactionReceipt }>`

Withdraws confidential tokens back to public ERC-20. Orchestrates the two-step on-chain process (unwrap + finalize) in a single call.

```ts
await token.unshield(500n);

// With progress callbacks
await token.unshield(500n, {
  onUnwrapSubmitted: (txHash) => updateUI("Unwrap submitted..."),
  onFinalizing: () => updateUI("Waiting for decryption proof..."),
  onFinalizeSubmitted: (txHash) => updateUI("Done!"),
});
```

### unshieldAll

`(callbacks?: UnshieldCallbacks) => Promise<{ txHash: Hex; receipt: TransactionReceipt }>`

Unshields the entire confidential balance. Same callback support as `unshield`.

```ts
await token.unshieldAll();
```

### resumeUnshield

`(unwrapTxHash: Hex, callbacks?: UnshieldCallbacks) => Promise<TransactionResult>`

Resumes an interrupted unshield from the finalize step. Use when the user closed the page between unwrap and finalize.

```ts
import { loadPendingUnshield, clearPendingUnshield } from "@zama-fhe/sdk";

const pending = await loadPendingUnshield(storage, wrapperAddress);
if (pending) {
  await token.resumeUnshield(pending);
  await clearPendingUnshield(storage, wrapperAddress);
}
```

### approve

`(spender: Address, until?: number) => Promise<{ txHash: Hex; receipt: TransactionReceipt }>`

Approves another address to operate on your confidential tokens (e.g. a DEX or multisig). Default duration: 1 hour.

```ts
// Approve for 1 hour (default)
await token.approve("0xSpender");

// Approve until a specific timestamp
await token.approve("0xSpender", futureTimestamp);
```

### isApproved

`(spender: Address, holder?: Address) => Promise<boolean>`

Checks whether a spender is currently approved. Optionally pass `holder` to check on behalf of another address.

```ts
const approved = await token.isApproved("0xSpender");
```

### allow

`() => Promise<void>`

Prompts the wallet to sign and caches session credentials for this token.

```ts
await token.allow();
```

### revoke

`() => Promise<void>`

Clears session credentials for this token.

```ts
await token.revoke();
```

### isAllowed

`() => Promise<boolean>`

Returns whether the session has active credentials for this token.

```ts
const allowed = await token.isAllowed();
```

### decryptBalance

`(handle: Hex, owner?: Address) => Promise<bigint>`

Decrypts a raw encrypted handle into a plaintext balance value. Results are cached automatically.

```ts
const handle = await token.confidentialBalanceOf();
const value = await token.decryptBalance(handle);
```

### decryptHandles

`(handles: Hex[], owner?: Address) => Promise<Map<Hex, bigint>>`

Decrypts multiple encrypted handles in a single call.

```ts
const values = await token.decryptHandles([handle1, handle2, handle3]);
```

### isZeroHandle

`(handle: Hex) => boolean`

Returns `true` if the handle represents a zero balance (account has never shielded).

```ts
const handle = await token.confidentialBalanceOf();
if (token.isZeroHandle(handle)) {
  console.log("No confidential balance yet");
}
```

### approveUnderlying

`(amount?: bigint) => Promise<TransactionResult>`

Approves the wrapper contract to spend the underlying ERC-20. Defaults to max approval. Call before `shield()` with `approvalStrategy: "skip"`.

```ts
await token.approveUnderlying(); // max approval
await token.approveUnderlying(1000n); // exact amount
```

### unwrap

`(amount: bigint) => Promise<TransactionResult>`

Requests an unwrap (phase 1 of unshield). Use `unshield()` for the full orchestrated flow.

```ts
await token.unwrap(500n);
```

### unwrapAll

`() => Promise<TransactionResult>`

Requests an unwrap of the entire confidential balance (phase 1).

```ts
await token.unwrapAll();
```

### finalizeUnwrap

`(burnAmountHandle: Handle) => Promise<TransactionResult>`

Completes an unwrap (phase 2) after the decryption proof is available. Use `unshield()` for the full orchestrated flow.

```ts
await token.finalizeUnwrap(burnAmountHandle);
```

## Related

- [ZamaSDK](/reference/sdk/ZamaSDK) — creates `Token` via `createToken()`
- [ReadonlyToken](/reference/sdk/ReadonlyToken) — read-only variant with batch operations
- [Shield Tokens guide](/guides/shield-tokens) — step-by-step shielding walkthrough
