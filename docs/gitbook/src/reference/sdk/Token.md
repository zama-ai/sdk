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

`(amount: bigint, options?: ShieldOptions) => Promise<TransactionResult>`

Converts public ERC-20 tokens into their encrypted form. The SDK handles the ERC-20 approval automatically based on the strategy.

**The ERC-20 balance is always validated before submitting** — this is a public read with no signing requirement, so it works for all wallet types (including smart wallets). For native ETH shields, the check is skipped (the chain validates ETH balance natively).

| Option                | Type                         | Default          | Description                              |
| --------------------- | ---------------------------- | ---------------- | ---------------------------------------- |
| `approvalStrategy`    | `"exact" \| "max" \| "skip"` | `"exact"`        | ERC-20 approval strategy                 |
| `fees`                | `bigint`                     | —                | Extra ETH for native wrappers            |
| `to`                  | `Address`                    | connected wallet | Recipient of shielded tokens             |
| `onApprovalSubmitted` | `(txHash: Hex) => void`      | —                | Fired after the approval tx is submitted |
| `onShieldSubmitted`   | `(txHash: Hex) => void`      | —                | Fired after the shield tx is submitted   |

```ts
// Exact approval (default) — approves only the shielded amount
await token.shield(1000n);

// Max approval — avoids repeated approval txs
await token.shield(1000n, { approvalStrategy: "max" });

// Skip approval — wrapper is already approved
await token.shield(1000n, { approvalStrategy: "skip" });

// With progress callbacks
await token.shield(1000n, {
  onApprovalSubmitted: (txHash) => console.log("Approval:", txHash),
  onShieldSubmitted: (txHash) => console.log("Shield:", txHash),
});
```

**Throws:**

- `InsufficientERC20BalanceError` — if the ERC-20 balance is less than `amount` (exposes `requested`, `available`, `token`)

### balanceOf

`(owner?: Address) => Promise<bigint>`

Returns the decrypted confidential balance. The first call prompts a wallet signature to create FHE credentials; subsequent calls use cached credentials silently. Decrypted values are cached in storage automatically.

```ts
// Your own balance
const balance = await token.balanceOf();

// Another address
const otherBalance = await token.balanceOf("0xOwnerAddress");
```

### confidentialBalanceOf

`(owner?: Address) => Promise<Hex>`

Returns the raw encrypted handle without decrypting. Use with `decryptBalance()` or `isZeroHandle()`.

```ts
const handle = await token.confidentialBalanceOf();
```

### confidentialTransfer

`(to: Address, amount: bigint, options?: TransferOptions) => Promise<TransactionResult>`

Transfers encrypted tokens. The amount is encrypted before hitting the chain.

By default, the SDK validates the confidential balance before submitting. If credentials are cached, it auto-decrypts silently. Set `skipBalanceCheck: true` to bypass (e.g. for smart wallets that cannot produce EIP-712 signatures).

| Option                | Type               | Default | Description                          |
| --------------------- | ------------------ | ------- | ------------------------------------ |
| `skipBalanceCheck`    | `boolean`          | `false` | Skip balance validation              |
| `onEncryptComplete`   | `() => void`       | —       | Fired after FHE encryption completes |
| `onTransferSubmitted` | `(txHash) => void` | —       | Fired after transfer tx submitted    |

```ts
await token.confidentialTransfer("0xRecipient", 500n);

// Smart wallet (skip balance check)
await token.confidentialTransfer("0xRecipient", 500n, { skipBalanceCheck: true });
```

**Throws:**

- `InsufficientConfidentialBalanceError` — if the confidential balance is less than `amount` (exposes `requested`, `available`, `token`)
- `BalanceCheckUnavailableError` — if balance validation is required but decryption is not possible (no cached credentials). Call `allow()` first or use `skipBalanceCheck: true`

### confidentialTransferFrom

`(from: Address, to: Address, amount: bigint, callbacks?: TransferCallbacks) => Promise<TransactionResult>`

Operator transfer on behalf of an address that has approved you.

```ts
await token.confidentialTransferFrom("0xFrom", "0xTo", 500n);
```

### unshield

`(amount: bigint, options?: UnshieldOptions) => Promise<{ txHash: Hex; receipt: TransactionReceipt }>`

Withdraws confidential tokens back to public ERC-20. Orchestrates the two-step on-chain process (unwrap + finalize) in a single call.

By default, the SDK validates the confidential balance before submitting. Set `skipBalanceCheck: true` to bypass (e.g. for smart wallets).

| Option                | Type               | Default | Description                       |
| --------------------- | ------------------ | ------- | --------------------------------- |
| `skipBalanceCheck`    | `boolean`          | `false` | Skip balance validation           |
| `onUnwrapSubmitted`   | `(txHash) => void` | —       | Fired after unwrap tx submitted   |
| `onFinalizing`        | `() => void`       | —       | Fired when finalization begins    |
| `onFinalizeSubmitted` | `(txHash) => void` | —       | Fired after finalize tx submitted |

```ts
await token.unshield(500n);

// With progress callbacks
await token.unshield(500n, {
  onUnwrapSubmitted: (txHash) => updateUI("Unwrap submitted..."),
  onFinalizing: () => updateUI("Waiting for decryption proof..."),
  onFinalizeSubmitted: (txHash) => updateUI("Done!"),
});

// Smart wallet (skip balance check)
await token.unshield(500n, { skipBalanceCheck: true });
```

**Throws:**

- `InsufficientConfidentialBalanceError` — if the confidential balance is less than `amount` (exposes `requested`, `available`, `token`)
- `BalanceCheckUnavailableError` — if balance validation is required but decryption is not possible

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

`(unwrapRequestIdOrAmount: Handle) => Promise<TransactionResult>`

Completes an unwrap (phase 2) after the decryption proof is available. Pass `unwrapRequestId` from upgraded `UnwrapRequested` events, or the legacy encrypted amount handle. Use `unshield()` for the full orchestrated flow.

```ts
const event = findUnwrapRequested(receipt.logs);
await token.finalizeUnwrap(event.unwrapRequestId ?? event.encryptedAmount);
```

## Related

- [ZamaSDK](/reference/sdk/ZamaSDK) — creates `Token` via `createToken()`
- [ReadonlyToken](/reference/sdk/ReadonlyToken) — read-only variant with batch operations
- [Shield Tokens guide](/guides/shield-tokens) — step-by-step shielding walkthrough
