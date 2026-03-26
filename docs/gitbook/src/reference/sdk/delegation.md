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
  expirationDate: new Date("2027-12-31T00:00:00Z"),
});
```

Both return `{ txHash, receipt }`.

{% hint style="warning" %}
The expiration date must be **at least 1 hour in the future**. The SDK validates this client-side before sending the transaction — passing a closer date throws a `DelegationExpirationTooSoonError`. This mirrors the on-chain `ExpirationDateBeforeOneHour` revert in the ACL contract.
{% endhint %}

{% hint style="warning" %}
**Propagation delay:** After `delegateDecryption` confirms on-chain, the coprocessor needs approximately **10 blocks** (`delegation_block_delay`) to propagate the delegation to the Gateway's `MultichainACL`. Calling `decryptBalanceAs` before propagation completes will fail with a `UserDecryptionNotDelegated` error. Wait at least 10–15 blocks after the delegation transaction before attempting delegated decryption.
{% endhint %}

### How expiration dates work

The SDK accepts a standard JavaScript `Date` object and converts it to a **UTC Unix timestamp** (seconds since epoch) before sending it on-chain. Since `Date.getTime()` always returns UTC milliseconds regardless of the local timezone, you don't need to normalize manually — a `Date` constructed from any timezone produces the same on-chain value.

```ts
// These all produce the same on-chain expiry:
new Date("2027-12-31T00:00:00Z"); // explicit UTC
new Date("2027-12-31T00:00:00+05:30"); // IST → converted to UTC internally
new Date(2027, 11, 31); // local time → .getTime() returns UTC ms
```

If no `expirationDate` is provided, the SDK uses `2^64 - 1` (effectively permanent).

### Batch delegation

Grant delegation across multiple tokens in a single call:

```ts
import { Token, ZamaError } from "@zama-fhe/sdk";

const tokens = addresses.map((a) => sdk.createToken(a));

const results = await Token.batchDelegateDecryption({
  tokens,
  delegateAddress: "0xDelegate",
  expirationDate: new Date("2027-12-31"),
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
const results = await Token.batchRevokeDelegation({
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

The SDK emits events during delegation operations. Subscribe via the `onEvent` callback in the `ZamaSDK` constructor:

| Event                       | When                        |
| --------------------------- | --------------------------- |
| `DelegationSubmitted`       | Delegation transaction sent |
| `RevokeDelegationSubmitted` | Revocation transaction sent |

```ts
import { createZamaSDK, ZamaSDKEvents } from "@zama-fhe/sdk";

const sdk = createZamaSDK({
  // ... other config
  onEvent: (event) => {
    if (event.type === ZamaSDKEvents.DelegationSubmitted) {
      console.log("Delegation tx:", event.txHash);
    }
    if (event.type === ZamaSDKEvents.RevokeDelegationSubmitted) {
      console.log("Revocation tx:", event.txHash);
    }
  },
});
```

## Delegation states

A delegation between `(delegator, delegate, contract)` can be in one of four states:

| State         | On-chain expiry          | How to detect                                                                                                           |
| ------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| **Never set** | `0n`                     | `getDelegationExpiry()` returns `0n`                                                                                    |
| **Active**    | Future timestamp         | `isDelegated()` returns `true`                                                                                          |
| **Expired**   | Past non-zero timestamp  | `isDelegated()` returns `false`, `getDelegationExpiry()` returns a non-zero past value                                  |
| **Revoked**   | `0n` (reset by contract) | Indistinguishable from **never set** via state reads — use `RevokedDelegationForUserDecryption` events to differentiate |

Because the ACL contract resets the expiry to `0n` on revocation, `DelegationNotFoundError` covers both the never-set and revoked cases. To distinguish them, query `RevokedDelegationForUserDecryption` events using the [ACL event decoders](/reference/sdk/event-decoders#acl-delegation-events).

## Error handling

### Client-side pre-flight errors

These are caught **before** submitting a transaction, saving gas and providing actionable messages:

| Error                                   | When                                                                          |
| --------------------------------------- | ----------------------------------------------------------------------------- |
| `DelegationExpirationTooSoonError`      | Expiration date is less than 1 hour in the future                             |
| `DelegationSelfNotAllowedError`         | Delegate address equals the connected wallet (`delegate === msg.sender`)      |
| `DelegationDelegateEqualsContractError` | Delegate address equals the token contract address                            |
| `DelegationExpiryUnchangedError`        | New expiration date matches the current one (no on-chain change needed)       |
| `DelegationNotFoundError`               | Attempting to revoke a delegation that was never established (expiry is zero) |

### On-chain revert errors

These are caught from Solidity reverts and re-thrown as typed errors:

| Error                           | Solidity revert                        | When                                                                        |
| ------------------------------- | -------------------------------------- | --------------------------------------------------------------------------- |
| `DelegationCooldownError`       | `AlreadyDelegatedOrRevokedInSameBlock` | Only one delegate/revoke per (delegator, delegate, contract) per block      |
| `DelegationContractIsSelfError` | `SenderCannotBeContractAddress`        | The contract address equals the caller address                              |
| `AclPausedError`                | `EnforcedPause`                        | The ACL contract is paused — delegation operations are temporarily disabled |
| `TransactionRevertedError`      | _(any other revert)_                   | Delegation or revocation transaction fails for an unmapped reason           |

### Other errors

| Error                       | When                                                                        |
| --------------------------- | --------------------------------------------------------------------------- |
| `DecryptionFailedError`     | Delegated decryption fails or relayer returns no value for a handle         |
| `SigningRejectedError`      | User rejects the wallet signature prompt (e.g. clicks "Reject" in MetaMask) |
| `SigningFailedError`        | Signing operation fails for any other reason                                |
| `NoCiphertextError`         | Relayer returns HTTP 400 — no ciphertext exists for this account            |
| `RelayerRequestFailedError` | Relayer returns a non-400 HTTP error                                        |
| `DelegationExpiredError`    | The delegation has expired                                                  |

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

> **Note:** The SDK automatically maps known ACL Solidity revert reasons (e.g. `AlreadyDelegatedOrRevokedInSameBlock`, `EnforcedPause`) to typed `ZamaError` subclasses. Unmapped reverts fall through to `TransactionRevertedError`.

## Checking per-handle delegation

To check whether a specific ciphertext handle is covered by an active delegation, use the `isHandleDelegatedContract` builder:

```ts
import { isHandleDelegatedContract } from "@zama-fhe/sdk";

const isDelegated = await publicClient.readContract(
  isHandleDelegatedContract(aclAddress, delegatorAddress, delegateAddress, tokenAddress, handle),
);
```

This calls `ACL.isHandleDelegatedForUserDecryption()` on-chain and returns `true` if the delegation covers that handle.

## On-chain delegation events

The ACL contract emits events when delegations are created or revoked. Use the ACL event decoders to parse these from transaction receipts or `getLogs` results:

```ts
import {
  ACL_TOPICS,
  decodeDelegatedForUserDecryption,
  decodeRevokedDelegationForUserDecryption,
  findDelegatedForUserDecryption,
  decodeAclEvents,
} from "@zama-fhe/sdk";

// Fetch all delegation events from the ACL contract
const logs = await publicClient.getLogs({
  address: aclAddress,
  topics: [ACL_TOPICS],
  fromBlock: startBlock,
  toBlock: "latest",
});

// Decode all delegation events at once
const events = decodeAclEvents(logs);

// Or find a specific event in a transaction receipt
const delegated = findDelegatedForUserDecryption(receipt.logs);
if (delegated) {
  console.log(
    `${delegated.delegator} delegated to ${delegated.delegate}`,
    `for ${delegated.contractAddress}`,
    `expires at ${delegated.newExpirationDate}`,
  );
}
```

See [Event Decoders](/reference/sdk/event-decoders#acl-delegation-events) for the full list of ACL event decoders and types.

## Related

- [Contract Builders](/reference/sdk/contract-builders#delegation) — low-level ACL delegation builders
- [useDelegateDecryption](/reference/react/useDelegateDecryption) — React hook to grant delegation
- [useRevokeDelegation](/reference/react/useRevokeDelegation) — React hook to revoke delegation
- [useDelegationStatus](/reference/react/useDelegationStatus) — React hook to query delegation status
- [useDecryptBalanceAs](/reference/react/useDecryptBalanceAs) — React hook to decrypt as a delegate
- [useBatchDecryptBalancesAs](/reference/react/useBatchDecryptBalancesAs) — React hook for batch delegation decryption
