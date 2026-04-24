---
title: Event decoders
description: Decode on-chain logs into typed event objects.
---

# Event decoders

Utilities for decoding raw `eth_getLogs` entries into typed event objects.

## Import

```ts
import {
  decodeOnChainEvents,
  TOKEN_TOPICS,
  decodeConfidentialTransfer,
  decodeWrapped,
  decodeUnwrapRequested,
  decodeUnwrapFinalized,
  decodeUnwrappedFinalized,
  decodeUnwrappedStarted,
  findWrapped,
  findUnwrapRequested,
  // ACL delegation events
  ACL_TOPICS,
  decodeDelegatedForUserDecryption,
  decodeRevokedDelegationForUserDecryption,
  decodeAclEvent,
  decodeAclEvents,
  findDelegatedForUserDecryption,
  findRevokedDelegationForUserDecryption,
} from "@zama-fhe/sdk";
```

## decodeOnChainEvents

`(logs: Log[]) => DecodedEvent[]`

Decodes an array of raw log entries into typed event objects. Each returned event has an `.eventName` discriminator.

```ts
const logs = await publicClient.getLogs({
  address: tokenAddress,
  topics: [TOKEN_TOPICS],
});

const events = decodeOnChainEvents(logs);

for (const event of events) {
  switch (event.eventName) {
    case "ConfidentialTransfer":
      console.log(event.from, event.to, event.encryptedAmount);
      break;
    case "Wrapped":
      console.log(event.account, event.amount);
      break;
    case "UnwrapRequested":
      console.log(event.receiver, event.unwrapRequestId ?? event.encryptedAmount);
      break;
    case "UnwrapFinalized":
      // Emitted by upgraded wrappers (unwrapRequestId present)
      console.log(event.receiver, event.cleartextAmount);
      break;
    case "UnwrappedFinalized":
      // Emitted by legacy wrappers (no unwrapRequestId) — handle during protocol transition
      console.log(event.receiver, event.cleartextAmount);
      break;
  }
}
```

| Parameter | Type    | Description                                                 |
| --------- | ------- | ----------------------------------------------------------- |
| `logs`    | `Log[]` | Raw log entries from `eth_getLogs` or a transaction receipt |

**Returns:** `DecodedEvent[]` — each event has an `.eventName` of `"ConfidentialTransfer"`, `"Wrapped"`, `"UnwrapRequested"`, `"UnwrapFinalized"`, `"UnwrappedFinalized"` (legacy), or `"UnwrappedStarted"`. During the protocol transition, finalize events from pre-upgrade wrappers have `eventName: "UnwrappedFinalized"`; those from upgraded wrappers have `eventName: "UnwrapFinalized"`.

## TOKEN_TOPICS

`Hex[]`

Array of topic hashes for all supported token events, including both legacy and upgraded unwrap event signatures during the protocol transition. Pass this to `eth_getLogs` to fetch relevant logs in a single RPC call.

```ts
const logs = await publicClient.getLogs({
  address: tokenAddress,
  topics: [TOKEN_TOPICS],
  fromBlock: startBlock,
  toBlock: "latest",
});
```

## Individual decoders

Each decoder takes a single log entry and returns a typed event object, or `null` if the log does not match.

| Decoder                           | Event type             | Description                                                                    |
| --------------------------------- | ---------------------- | ------------------------------------------------------------------------------ |
| `decodeConfidentialTransfer(log)` | `ConfidentialTransfer` | Encrypted transfer between accounts                                            |
| `decodeWrapped(log)`              | `Wrapped`              | Tokens wrapped (shielded)                                                      |
| `decodeUnwrapRequested(log)`      | `UnwrapRequested`      | Unwrap initiated; returns `unwrapRequestId` when emitted by upgraded wrappers  |
| `decodeUnwrapFinalized(log)`      | `UnwrapFinalized`      | Unwrap completed; returns `unwrapRequestId` when emitted by upgraded wrappers  |
| `decodeUnwrappedFinalized(log)`   | `UnwrappedFinalized`   | Deprecated compatibility decoder; not a transparent alias for switch consumers |
| `decodeUnwrappedStarted(log)`     | `UnwrappedStarted`     | Unwrap decryption started                                                      |

```ts
import { decodeConfidentialTransfer } from "@zama-fhe/sdk";

for (const log of receipt.logs) {
  const transfer = decodeConfidentialTransfer(log);
  if (transfer) {
    console.log(`Transfer from ${transfer.from} to ${transfer.to}`);
  }
}
```

## Convenience finders

Search a log array and return the first matching event.

### findWrapped

`(logs: Log[]) => WrappedEvent | undefined`

Finds the first `Wrapped` event in a set of logs. Useful after a shield transaction.

```ts
import { findWrapped } from "@zama-fhe/sdk";

const receipt = await walletClient.waitForTransactionReceipt({ hash: txHash });
const wrappedEvent = findWrapped(receipt.logs);
if (wrappedEvent) {
  console.log(`Wrapped ${wrappedEvent.amount} tokens`);
}
```

### findUnwrapRequested

`(logs: Log[]) => UnwrapRequestedEvent | undefined`

Finds the first `UnwrapRequested` event in a set of logs. Useful after an unshield initiation.

```ts
import { findUnwrapRequested } from "@zama-fhe/sdk";

const unwrapEvent = findUnwrapRequested(receipt.logs);
if (unwrapEvent) {
  console.log(`Unwrap requested for ${unwrapEvent.encryptedAmount}`);
}
```

## ACL delegation events

The ACL contract emits events when delegations are created or revoked. These are separate from token events — they use their own topic hashes and decoders.

### Import

```ts
import {
  ACL_TOPICS,
  AclTopics,
  decodeDelegatedForUserDecryption,
  decodeRevokedDelegationForUserDecryption,
  decodeAclEvent,
  decodeAclEvents,
  findDelegatedForUserDecryption,
  findRevokedDelegationForUserDecryption,
} from "@zama-fhe/sdk";
```

### ACL_TOPICS

`Hex[]`

Array of topic hashes for both ACL delegation events. Pass this to `eth_getLogs` to fetch delegation events from the ACL contract.

```ts
const logs = await publicClient.getLogs({
  address: aclAddress,
  topics: [ACL_TOPICS],
  fromBlock: startBlock,
  toBlock: "latest",
});
```

### Individual decoders

| Decoder                                         | Event type                           | Description                   |
| ----------------------------------------------- | ------------------------------------ | ----------------------------- |
| `decodeDelegatedForUserDecryption(log)`         | `DelegatedForUserDecryption`         | Delegation created or renewed |
| `decodeRevokedDelegationForUserDecryption(log)` | `RevokedDelegationForUserDecryption` | Delegation revoked            |

### DelegatedForUserDecryptionEvent

| Field               | Type      | Description                                 |
| ------------------- | --------- | ------------------------------------------- |
| `eventName`         | `string`  | `"DelegatedForUserDecryption"`              |
| `delegator`         | `Address` | Account granting access                     |
| `delegate`          | `Address` | Account receiving access                    |
| `contractAddress`   | `Address` | Contract the delegation applies to          |
| `delegationCounter` | `bigint`  | Monotonic delegation counter                |
| `oldExpirationDate` | `bigint`  | Previous expiration (0 if first delegation) |
| `newExpirationDate` | `bigint`  | New expiration timestamp                    |

### RevokedDelegationForUserDecryptionEvent

| Field               | Type      | Description                            |
| ------------------- | --------- | -------------------------------------- |
| `eventName`         | `string`  | `"RevokedDelegationForUserDecryption"` |
| `delegator`         | `Address` | Account that granted access            |
| `delegate`          | `Address` | Account that had access                |
| `contractAddress`   | `Address` | Contract the revocation applies to     |
| `delegationCounter` | `bigint`  | Monotonic delegation counter           |
| `oldExpirationDate` | `bigint`  | Expiration date before revocation      |

### Convenience finders

| Finder                                         | Returns                                                 |
| ---------------------------------------------- | ------------------------------------------------------- |
| `findDelegatedForUserDecryption(logs)`         | First `DelegatedForUserDecryptionEvent` or null         |
| `findRevokedDelegationForUserDecryption(logs)` | First `RevokedDelegationForUserDecryptionEvent` or null |

### Batch decoders

| Decoder                 | Description                                                  |
| ----------------------- | ------------------------------------------------------------ |
| `decodeAclEvent(log)`   | Try both ACL decoders on a single log, return first match    |
| `decodeAclEvents(logs)` | Batch-decode an array of logs, skipping unrecognized entries |

{% hint style="info" %}
ACL delegation events are **not** included in `TOKEN_TOPICS` or `decodeOnChainEvents`. They are emitted by the ACL contract, not by token contracts. Use `ACL_TOPICS` and `decodeAclEvents` separately.
{% endhint %}

## Related

- [Delegated Decryption](/reference/sdk/delegation) — delegation API with on-chain event examples
- [Token](/reference/sdk/Token) — high-level API for token operations
