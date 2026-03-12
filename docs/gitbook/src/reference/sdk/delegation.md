# Delegated Decryption

Delegation lets one address grant another address the right to decrypt its confidential balance. Common use cases:

- **Portfolio dashboards** — a read-only service decrypts balances across wallets without holding keys.
- **Fund managers** — a manager monitors positions for multiple depositors.
- **Auditors** — a third party verifies holdings without the token owner being online.

Delegation is enforced on-chain through the ACL contract. The delegate never receives the delegator's private keys — they use their own FHE keypair and a delegated EIP-712 flow to prove they have permission.

## Setup

The ACL contract address is automatically resolved from the relayer's transport configuration. Network presets (`SepoliaConfig`, `MainnetConfig`, `HardhatConfig`) already include the correct ACL address for each chain — no manual configuration needed.

```ts
const sdk = new ZamaSDK({
  relayer,
  signer,
  storage,
});

// Both tokens use the same ACL — resolved automatically from the relayer config
const tokenA = sdk.createToken("0xTokenA");
const tokenB = sdk.createToken("0xTokenB");
```

## Granting delegation

The token owner calls `delegateDecryption` to allow a delegate to decrypt their balance for a specific token.

```ts
// Permanent delegation (no expiration)
await token.delegateDecryption({ delegateAddress: "0xDelegate" });

// Delegation with an expiration date
await token.delegateDecryption({
  delegateAddress: "0xDelegate",
  expirationDate: new Date("2025-12-31T00:00:00Z"),
});
```

Both return `{ txHash, receipt }`.

### How expiration dates work

The SDK accepts a standard JavaScript `Date` object and converts it to a **UTC Unix timestamp** (seconds since epoch) before sending it on-chain. Since `Date.getTime()` always returns UTC milliseconds regardless of the local timezone, you don't need to normalize manually — a `Date` constructed from any timezone produces the same on-chain value.

```ts
// These all produce the same on-chain expiry:
new Date("2025-12-31T00:00:00Z"); // explicit UTC
new Date("2025-12-31T00:00:00+05:30"); // IST → converted to UTC internally
new Date(2025, 11, 31); // local time → .getTime() returns UTC ms
```

If no `expirationDate` is provided, the SDK uses `2^64 - 1` (effectively permanent).

### Batch delegation

Grant delegation across multiple tokens in a single call:

```ts
const tokens = addresses.map((a) => sdk.createToken(a));

const results = await Token.delegateDecryptionBatch({
  tokens,
  delegateAddress: "0xDelegate",
  expirationDate: new Date("2025-12-31"),
});

// results is a Map<Address, TransactionResult | ZamaError>
// Partial success — each token either succeeds or returns an error
for (const [address, result] of results) {
  if (result instanceof ZamaError) {
    console.error(`Failed for ${address}:`, result.message);
  }
}
```

## Revoking delegation

```ts
await token.revokeDelegation({ delegateAddress: "0xDelegate" });
```

Batch revocation works the same way:

```ts
const results = await Token.revokeDelegationBatch({
  tokens,
  delegateAddress: "0xDelegate",
});
```

## Querying delegation status

These read methods are available on both `Token` and `ReadonlyToken`:

```ts
// Check if a delegation is active
const delegated = await readonlyToken.isDelegated({
  delegatorAddress: "0xDelegator",
  delegateAddress: "0xDelegate",
});
// true if delegation exists and hasn't expired

// Get the raw expiry timestamp
const expiry = await readonlyToken.getDelegationExpiry({
  delegatorAddress: "0xDelegator",
  delegateAddress: "0xDelegate",
});
// 0n = no delegation
// 2^64 - 1 = permanent
// otherwise = UTC Unix timestamp in seconds

// Convert to a JavaScript Date if needed:
const expiryDate = new Date(Number(expiry) * 1000);
```

## Decrypting as a delegate

The delegate calls `decryptBalanceAs` to read the delegator's balance. This uses a delegated EIP-712 flow under the hood — the delegate signs with their own wallet, and the relayer verifies the on-chain delegation before decrypting.

```ts
// Decrypt the delegator's balance (owner defaults to delegator)
const balance = await readonlyToken.decryptBalanceAs({
  delegatorAddress: "0xDelegator",
});

// Decrypt a specific owner's balance (when owner differs from delegator).
// Note: the relayer validates ACL permissions against `delegatorAddress`,
// not `owner`. The delegator must have been granted decrypt rights for
// the contract, regardless of whose balance is being read.
const balance = await readonlyToken.decryptBalanceAs({
  delegatorAddress: "0xDelegator",
  owner: "0xOwner",
});
```

Decrypted values are cached in storage, keyed by `(token, owner, handle)`. Because every on-chain balance change produces a new encrypted handle, stale cache entries are never served — no TTL or manual invalidation needed. If the delegator's balance changes in another app, the next `decryptBalanceAs` call will see a different handle and perform a fresh decryption.

### Batch decryption as delegate

Decrypt balances across multiple tokens in a single call:

```ts
const tokens = addresses.map((a) => sdk.createReadonlyToken(a));

const balances = await ReadonlyToken.batchDecryptBalancesAs(tokens, {
  delegatorAddress: "0xDelegator",
});

// balances is a Map<Address, bigint>
for (const [address, balance] of balances) {
  console.log(`${address}: ${balance}`);
}
```

#### BatchDecryptAsOptions

| Property           | Type                                                      | Description                                                                      |
| ------------------ | --------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `delegatorAddress` | `Address`                                                 | The address that granted delegation rights.                                      |
| `handles`          | `Handle[] \| undefined`                                   | Pre-fetched encrypted handles. When omitted, handles are fetched from the chain. |
| `owner`            | `Address \| undefined`                                    | Balance owner address. Defaults to the delegator address.                        |
| `maxConcurrency`   | `number \| undefined`                                     | Maximum number of concurrent decrypt calls. Default: `Infinity`.                 |
| `onError`          | `(error: Error, address: Address) => bigint \| undefined` | Called when decryption fails for a single token. Return a fallback value.        |

```ts
// With pre-fetched handles and error handling
const balances = await ReadonlyToken.batchDecryptBalancesAs(tokens, {
  delegatorAddress: "0xDelegator",
  handles: preloadedHandles,
  maxConcurrency: 3,
  onError: (err, addr) => {
    console.error(addr, err);
    return 0n;
  },
});
```

## Events

The SDK emits events during delegation operations. Subscribe via the standard event emitter on `Token`:

| Event                       | When                        |
| --------------------------- | --------------------------- |
| `DelegationSubmitted`       | Delegation transaction sent |
| `RevokeDelegationSubmitted` | Revocation transaction sent |

```ts
import { ZamaSDKEvents } from "@zama-fhe/sdk";

token.on((event) => {
  if (event.type === ZamaSDKEvents.DelegationSubmitted) {
    console.log("Delegation tx:", event.txHash);
  }
  if (event.type === ZamaSDKEvents.RevokeDelegationSubmitted) {
    console.log("Revocation tx:", event.txHash);
  }
});
```

## Error handling

| Error                           | When                                                                        |
| ------------------------------- | --------------------------------------------------------------------------- |
| `TransactionRevertedError`      | Delegation or revocation transaction fails                                  |
| `DecryptionFailedError`         | Delegated decryption fails or relayer returns no value for a handle         |
| `SigningRejectedError`          | User rejects the wallet signature prompt (e.g. clicks "Reject" in MetaMask) |
| `SigningFailedError`            | Signing operation fails for any other reason                                |
| `NoCiphertextError`             | Relayer returns HTTP 400 — no ciphertext exists for this account            |
| `RelayerRequestFailedError`     | Relayer returns a non-400 HTTP error                                        |
| `DelegationSelfNotAllowedError` | Delegation target is the caller (`delegate === msg.sender`)                 |
| `DelegationCooldownError`       | Only one delegate/revoke per (delegator, delegate, contract) per block      |
| `DelegationNotFoundError`       | No active delegation for this (delegator, delegate, contract)               |
| `DelegationExpiredError`        | The delegation has expired                                                  |

```ts
import {
  TransactionRevertedError,
  DecryptionFailedError,
  SigningRejectedError,
} from "@zama-fhe/sdk";

try {
  await token.delegateDecryption({ delegateAddress: "0xDelegate" });
} catch (error) {
  if (error instanceof TransactionRevertedError) {
    // on-chain transaction failed
  }
}

try {
  const balance = await readonlyToken.decryptBalanceAs({
    delegatorAddress: "0xDelegator",
  });
} catch (error) {
  if (error instanceof SigningRejectedError) {
    // user cancelled the wallet prompt — do not retry automatically
  } else if (error instanceof DecryptionFailedError) {
    // delegated decryption failed
  }
}
```

> **Note:** `SigningRejectedError` is always propagated — if the user rejects a wallet prompt, the SDK never silently retries or falls through to a fresh credential flow. This ensures users can always cancel.

> **Note:** The delegation-specific errors (`DelegationSelfNotAllowedError`, `DelegationCooldownError`, etc.) are not auto-mapped from ACL contract reverts. They are exported so dApp code can catch and re-throw them when parsing on-chain revert reasons (e.g. via viem's `decodeErrorResult`).

## Related

- [Contract Builders](/reference/sdk/contract-builders#delegation) — low-level ACL delegation builders
- [useDelegateDecryption](/reference/react/useDelegateDecryption) — React hook to grant delegation
- [useRevokeDelegation](/reference/react/useRevokeDelegation) — React hook to revoke delegation
- [useDelegationStatus](/reference/react/useDelegationStatus) — React hook to query delegation status
- [useDecryptBalanceAs](/reference/react/useDecryptBalanceAs) — React hook to decrypt as a delegate
- [useBatchDecryptBalancesAs](/reference/react/useBatchDecryptBalancesAs) — React hook for batch delegation decryption
