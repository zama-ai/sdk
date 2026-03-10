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
await token.revokeDelegation("0xDelegate");
```

Batch revocation works the same way:

```ts
const results = await Token.revokeDelegationBatch(tokens, "0xDelegate");
```

## Querying delegation status

These read methods are available on both `Token` and `ReadonlyToken`:

```ts
// Check if a delegation is active
const delegated = await readonlyToken.isDelegated("0xDelegator", "0xDelegate");
// true if delegation exists and hasn't expired

// Get the raw expiry timestamp
const expiry = await readonlyToken.getDelegationExpiry("0xDelegator", "0xDelegate");
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
const balance = await readonlyToken.decryptBalanceAs("0xDelegator");

// Decrypt a specific owner's balance (when owner differs from delegator)
const balance = await readonlyToken.decryptBalanceAs("0xDelegator", {
  owner: "0xOwner",
});
```

Decrypted values are cached in storage, keyed by `(token, owner, handle)`. Because every on-chain balance change produces a new encrypted handle, stale cache entries are never served — no TTL or manual invalidation needed. If the delegator's balance changes in another app, the next `decryptBalanceAs` call will see a different handle and perform a fresh decryption.

## Error handling

| Error                      | When                                       |
| -------------------------- | ------------------------------------------ |
| `TransactionRevertedError` | Delegation or revocation transaction fails |
| `DecryptionFailedError`    | Delegated decryption fails                 |

```ts
import { TransactionRevertedError, DecryptionFailedError } from "@zama-fhe/sdk";

try {
  await token.delegateDecryption({ delegateAddress: "0xDelegate" });
} catch (error) {
  if (error instanceof TransactionRevertedError) {
    // on-chain transaction failed
  }
}

try {
  const balance = await readonlyToken.decryptBalanceAs("0xDelegator");
} catch (error) {
  if (error instanceof DecryptionFailedError) {
    // delegated decryption failed
  }
}
```
