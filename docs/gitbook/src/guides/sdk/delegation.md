# Delegated Decryption

Delegation lets one address grant another address the right to decrypt its confidential balance. Common use cases:

- **Portfolio dashboards** — a read-only service decrypts balances across wallets without holding keys.
- **Fund managers** — a manager monitors positions for multiple depositors.
- **Auditors** — a third party verifies holdings without the token owner being online.

Delegation is enforced on-chain through the ACL contract. The delegate never receives the delegator's private keys — they use their own FHE keypair and a delegated EIP-712 flow to prove they have permission.

## Setup

Pass `aclAddress` when creating the SDK. This is the address of the **global ACL contract** deployed on your chain — it's the same contract for all tokens on that chain. All delegation methods throw `ConfigurationError` without it.

Each network has a single ACL contract:

| Network | ACL address                                  |
| ------- | -------------------------------------------- |
| Mainnet | `0xcA2E8f1F656CD25C01F05d0b243Ab1ecd4a8ffb6` |
| Sepolia | `0xf0Ffdc93b7E186bC2f8CB3dAA75D86d1930A433D` |
| Hardhat | `0x50157CFfD6bBFA2DECe204a89ec419c23ef5755D` |

```ts
import { SepoliaConfig } from "@zama-fhe/sdk";

const sdk = new ZamaSDK({
  relayer,
  signer,
  storage,
  aclAddress: SepoliaConfig.aclContractAddress, // one per chain, shared by all tokens
});

// Both tokens use the same ACL — aclAddress is not per-token
const tokenA = sdk.createToken("0xTokenA");
const tokenB = sdk.createToken("0xTokenB");
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
