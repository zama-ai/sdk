# Delegated Decryption

Delegation lets one address grant another address the right to decrypt its confidential balance. Common use cases:

- **Portfolio dashboards** — a read-only service decrypts balances across wallets without holding keys.
- **Fund managers** — a manager monitors positions for multiple depositors.
- **Auditors** — a third party verifies holdings without the token owner being online.

Delegation is enforced on-chain through the ACL contract. The delegate never receives the delegator's private keys — they use their own FHE keypair and a delegated EIP-712 flow to prove they have permission.

## Setup

Pass `aclAddress` when creating the SDK. All delegation methods throw `ConfigurationError` without it.

```ts
const sdk = new ZamaSDK({
  relayer,
  signer,
  storage,
  aclAddress: "0xACL", // required for delegation
});

const token = sdk.createToken("0xToken");
const readonlyToken = sdk.createReadonlyToken("0xToken");
```

## Granting delegation

The token owner calls `delegateDecryption` to allow a delegate to decrypt their balance for a specific token.

```ts
// Permanent delegation (no expiration)
await token.delegateDecryption("0xDelegate");

// Delegation with an expiration date
await token.delegateDecryption("0xDelegate", {
  expirationDate: new Date("2025-12-31T00:00:00Z"),
});
```

Both return `{ txHash, receipt }`.

### Batch delegation

Grant delegation across multiple tokens in a single call:

```ts
const tokens = addresses.map((a) => sdk.createToken(a));

const results = await Token.delegateDecryptionBatch(tokens, "0xDelegate", {
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
// otherwise = Unix timestamp (seconds)
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

Decrypted values are cached in storage (keyed by token + owner + handle), so subsequent reads are instant.

## Error handling

| Error                      | When                                             |
| -------------------------- | ------------------------------------------------ |
| `ConfigurationError`       | `aclAddress` not provided in SDK or token config |
| `TransactionRevertedError` | Delegation or revocation transaction fails       |
| `DecryptionFailedError`    | Delegated decryption fails                       |

```ts
import { ConfigurationError, TransactionRevertedError } from "@zama-fhe/sdk";

try {
  await token.delegateDecryption("0xDelegate");
} catch (error) {
  if (error instanceof ConfigurationError) {
    // aclAddress not configured
  }
  if (error instanceof TransactionRevertedError) {
    // on-chain transaction failed
  }
}
```
