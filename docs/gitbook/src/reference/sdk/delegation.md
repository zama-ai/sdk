---
title: Delegations
description: On-chain delegation management — grant, revoke, and query decryption delegation rights via the ACL contract.
---

# Delegations

`sdk.delegations` manages on-chain decryption delegation through the ACL contract. The delegate never receives the delegator's private keys — they sign with their own wallet, and the relayer verifies the on-chain delegation.

For a step-by-step walkthrough, see the [Delegated decryption](../../guides/delegated-decryption.md) guide.

## Import

Accessed as a namespace on the `ZamaSDK` instance:

```ts
import { ZamaSDK } from "@zama-fhe/sdk";

const sdk = new ZamaSDK(config); // config from createConfig()
sdk.delegations.delegateDecryption(/* ... */);
sdk.delegations.revokeDelegation(/* ... */);
sdk.delegations.isActive(/* ... */);
sdk.delegations.getExpiry(/* ... */);
sdk.delegations.getStatus(/* ... */);
```

## Methods

### delegateDecryption

`(params: { contractAddress: Address; delegateAddress: Address; expirationDate?: Date }) => Promise<TransactionResult>`

Grants decryption rights for a confidential contract to another address. Calls `ACL.delegateForUserDecryption()` on-chain.

```ts
// Permanent delegation
await sdk.delegations.delegateDecryption({
  contractAddress: "0xConfidentialToken",
  delegateAddress: "0xDelegate",
});

// With expiration
await sdk.delegations.delegateDecryption({
  contractAddress: "0xConfidentialToken",
  delegateAddress: "0xDelegate",
  expirationDate: new Date("2027-12-31T00:00:00Z"),
});
```

Returns `{ txHash: Hex; receipt: TransactionReceipt }`.

{% hint style="warning" %}
`expirationDate` must be at least 1 hour in the future. The SDK validates this before sending the transaction.
{% endhint %}

When no `expirationDate` is provided, the SDK uses `2^64 - 1` (effectively permanent). The SDK accepts a standard JavaScript `Date` and converts it to a UTC Unix timestamp internally — timezone normalization is handled automatically.

**Throws:**

- `SignerNotConfiguredError` — no signer configured
- `ChainMismatchError` — signer and provider are on different chains
- `WalletNotConnectedError` — wallet is not connected
- `WalletAccountNotReadyError` — wallet account is not ready
- `DelegationExpirationTooSoonError` — expiration date less than 1 hour in the future
- `DelegationSelfNotAllowedError` — delegate address equals the connected wallet
- `DelegationDelegateEqualsContractError` — delegate address equals the contract address
- `DelegationDelegateCannotBeWildcardError` — delegate address is the wildcard address
- `DelegationExpiryUnchangedError` — new expiry matches the current on-chain expiry
- `DelegationCooldownError` — only one delegate/revoke per `(delegator, delegate, contract)` per block
- `AclPausedError` — the ACL contract is paused
- `TransactionRevertedError` — on-chain revert for an unmapped reason

### revokeDelegation

`(params: { contractAddress: Address; delegateAddress: Address }) => Promise<TransactionResult>`

Revokes decryption delegation for a confidential contract. Calls `ACL.revokeDelegationForUserDecryption()` on-chain.

```ts
await sdk.delegations.revokeDelegation({
  contractAddress: "0xConfidentialToken",
  delegateAddress: "0xDelegate",
});
```

Returns `{ txHash: Hex; receipt: TransactionReceipt }`.

**Throws:**

- `SignerNotConfiguredError` — no signer configured
- `ChainMismatchError` — signer and provider are on different chains
- `WalletNotConnectedError` — wallet is not connected
- `WalletAccountNotReadyError` — wallet account is not ready
- `DelegationNotFoundError` — no delegation exists for this `(delegator, delegate, contract)` tuple
- `DelegationCooldownError` — only one delegate/revoke per tuple per block
- `AclPausedError` — the ACL contract is paused
- `TransactionRevertedError` — on-chain revert for an unmapped reason

### isActive

`(params: { contractAddress: Address; delegatorAddress: Address; delegateAddress: Address }) => Promise<boolean>`

Checks whether a delegation is active. Returns `true` if the delegation exists and has not expired.

Signer-independent — works without a configured signer.

```ts
const active = await sdk.delegations.isActive({
  contractAddress: "0xConfidentialToken",
  delegatorAddress: "0xDelegator",
  delegateAddress: "0xDelegate",
});
```

### getExpiry

`(params: { contractAddress: Address; delegatorAddress: Address; delegateAddress: Address }) => Promise<bigint>`

Returns the expiration timestamp of a delegation as a Unix timestamp in seconds.

Signer-independent — works without a configured signer.

```ts
const expiry = await sdk.delegations.getExpiry({
  contractAddress: "0xConfidentialToken",
  delegatorAddress: "0xDelegator",
  delegateAddress: "0xDelegate",
});

// Convert to a JavaScript Date:
const expiryDate = new Date(Number(expiry) * 1000);
```

| Return value | Meaning                              |
| ------------ | ------------------------------------ |
| `0n`         | No delegation (never set or revoked) |
| `2^64 - 1`   | Permanent                            |
| Other        | UTC Unix timestamp in seconds        |

### getStatus

`(params: { contractAddress: Address; delegatorAddress: Address; delegateAddress: Address }) => Promise<DelegationStatus>`

Returns activity and expiry together (`{ isActive: boolean; expiryTimestamp: bigint }`) from a single on-chain read, instead of calling `isActive()` and `getExpiry()` separately.

Signer-independent — works without a configured signer.

```ts
const { isActive, expiryTimestamp } = await sdk.delegations.getStatus({
  contractAddress: "0xConfidentialToken",
  delegatorAddress: "0xDelegator",
  delegateAddress: "0xDelegate",
});
```

## Events

The SDK emits events during delegation operations. Subscribe via the `onEvent` callback in `createConfig`:

| Event                       | When                        |
| --------------------------- | --------------------------- |
| `DelegationSubmitted`       | Delegation transaction sent |
| `RevokeDelegationSubmitted` | Revocation transaction sent |

```ts
import { ZamaSDK, ZamaSDKEvents } from "@zama-fhe/sdk";

const config = createConfig({
  // ...
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
| **Never set** | `0n`                     | `getExpiry()` returns `0n`                                                                                              |
| **Active**    | Future timestamp         | `isActive()` returns `true`                                                                                             |
| **Expired**   | Past non-zero timestamp  | `isActive()` returns `false`, `getExpiry()` returns a non-zero past value                                               |
| **Revoked**   | `0n` (reset by contract) | Indistinguishable from **never set** via state reads — use `RevokedDelegationForUserDecryption` events to differentiate |

The ACL contract resets the expiry to `0n` on revocation, so `DelegationNotFoundError` covers both the never-set and revoked cases. To distinguish them, query `RevokedDelegationForUserDecryption` events using the [ACL event decoders](./event-decoders.md#acl-delegation-events).

## Low-level contract builders

For direct ACL contract calls without the `Delegations` namespace, use the contract builders:

```ts
import { isHandleDelegatedContract } from "@zama-fhe/sdk";

const isDelegated = await publicClient.readContract(
  isHandleDelegatedContract(aclAddress, delegatorAddress, delegateAddress, tokenAddress, handle),
);
```

See [Contract Builders](./contract-builders.md#delegation) for the full list.

## On-chain delegation events

Parse delegation events from transaction receipts or `getLogs` results:

```ts
import {
  ACL_TOPICS,
  decodeDelegatedForUserDecryption,
  decodeRevokedDelegationForUserDecryption,
  findDelegatedForUserDecryption,
  findRevokedDelegationForUserDecryption,
  decodeAclEvents,
} from "@zama-fhe/sdk";

const logs = await publicClient.getLogs({
  address: aclAddress,
  topics: [ACL_TOPICS],
  fromBlock: startBlock,
  toBlock: "latest",
});

const events = decodeAclEvents(logs);

const delegated = findDelegatedForUserDecryption(receipt.logs);
if (delegated) {
  console.log(
    `${delegated.delegator} delegated to ${delegated.delegate}`,
    `for ${delegated.contractAddress}`,
    `expires at ${delegated.newExpirationDate}`,
  );
}
```

See [Event Decoders](./event-decoders.md#acl-delegation-events) for the full list of ACL event decoders.

## Related

- [Delegated decryption guide](../../guides/delegated-decryption.md) — step-by-step walkthrough
- [Token.decryptBalanceAs](./Token.md#decryptbalanceas) — decrypt a delegator's balance
- [Token.batchDecryptBalancesAs](./Token.md#token-batchdecryptbalancesas-static) — batch delegated decryption
- [Contract builders](./contract-builders.md#delegation) — low-level ACL delegation builders
- [useDelegateDecryption](../react/useDelegateDecryption.md) — React hook to grant delegation
- [useRevokeDelegation](../react/useRevokeDelegation.md) — React hook to revoke delegation
- [useDelegationStatus](../react/useDelegationStatus.md) — React hook to query delegation status
- [useDecryptBalanceAs](../react/useDecryptBalanceAs.md) — React hook to decrypt as a delegate
- [useBatchDecryptBalancesAs](../react/useBatchDecryptBalancesAs.md) — React hook for batch delegation decryption
