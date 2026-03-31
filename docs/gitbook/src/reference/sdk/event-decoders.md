---
title: Event Decoders
description: Decode on-chain logs into typed event objects and build activity feeds.
---

# Event Decoders

Utilities for decoding raw `eth_getLogs` entries into typed event objects and assembling user-facing activity feeds.

## Import

```ts
import {
  decodeOnChainEvents,
  TOKEN_TOPICS,
  decodeConfidentialTransfer,
  decodeWrapped,
  decodeUnwrapRequested,
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
  // Activity feed
  parseActivityFeed,
  extractEncryptedHandles,
  applyDecryptedValues,
  sortByBlockNumber,
} from "@zama-fhe/sdk";
```

## decodeOnChainEvents

`(logs: Log[]) => DecodedEvent[]`

Decodes an array of raw log entries into typed event objects. Each returned event has a `.type` discriminator.

```ts
const logs = await publicClient.getLogs({
  address: tokenAddress,
  topics: [TOKEN_TOPICS],
});

const events = decodeOnChainEvents(logs);

for (const event of events) {
  switch (event.type) {
    case "ConfidentialTransfer":
      console.log(event.from, event.to, event.encryptedAmount);
      break;
    case "Wrapped":
      console.log(event.account, event.amount);
      break;
    case "UnwrapRequested":
      console.log(event.account, event.amount);
      break;
  }
}
```

| Parameter | Type    | Description                                                 |
| --------- | ------- | ----------------------------------------------------------- |
| `logs`    | `Log[]` | Raw log entries from `eth_getLogs` or a transaction receipt |

**Returns:** `DecodedEvent[]` — each event has a `.type` of `"ConfidentialTransfer"`, `"Wrapped"`, `"UnwrapRequested"`, `"UnwrappedFinalized"`, or `"UnwrappedStarted"`.

## TOKEN_TOPICS

`Hex[]`

Array of topic hashes for all supported token events. Pass this to `eth_getLogs` to fetch relevant logs in a single RPC call.

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

| Decoder                           | Event type             | Description                         |
| --------------------------------- | ---------------------- | ----------------------------------- |
| `decodeConfidentialTransfer(log)` | `ConfidentialTransfer` | Encrypted transfer between accounts |
| `decodeWrapped(log)`              | `Wrapped`              | Tokens wrapped (shielded)           |
| `decodeUnwrapRequested(log)`      | `UnwrapRequested`      | Unwrap initiated                    |
| `decodeUnwrappedFinalized(log)`   | `UnwrappedFinalized`   | Unwrap completed (finalized)        |
| `decodeUnwrappedStarted(log)`     | `UnwrappedStarted`     | Unwrap decryption started           |

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
  console.log(`Unwrap requested for ${unwrapEvent.amount}`);
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

## Activity feed utilities

Build a complete activity feed from raw logs with encrypted amount decryption.

### parseActivityFeed

`(logs: Log[], userAddress: Address) => ActivityItem[]`

Parses raw logs into classified activity items (transfers, shields, unshields) relative to the given user address. Items include direction ("sent", "received", "shielded", "unshielded") and raw encrypted handles.

```ts
const items = parseActivityFeed(logs, userAddress);
// [{ type: "transfer", direction: "sent", handle: "0x...", ... }, ...]
```

| Parameter     | Type      | Description                         |
| ------------- | --------- | ----------------------------------- |
| `logs`        | `Log[]`   | Raw log entries                     |
| `userAddress` | `Address` | User address to determine direction |

### extractEncryptedHandles

`(items: ActivityItem[]) => bigint[]`

Extracts all unique encrypted handles from activity items for batch decryption.

```ts
const handles = extractEncryptedHandles(items);
```

### applyDecryptedValues

`(items: ActivityItem[], decryptedMap: Map<bigint, bigint>) => EnrichedActivityItem[]`

Attaches decrypted amounts to activity items.

```ts
const enrichedItems = applyDecryptedValues(items, decryptedMap);
// Each item now has .amount: bigint
```

| Parameter      | Type                  | Description                                       |
| -------------- | --------------------- | ------------------------------------------------- |
| `items`        | `ActivityItem[]`      | Items from `parseActivityFeed`                    |
| `decryptedMap` | `Map<bigint, bigint>` | Handle-to-value map from `token.decryptHandles()` |

### sortByBlockNumber

`(items: ActivityItem[]) => ActivityItem[]`

Returns a new array sorted by block number, newest first.

```ts
const sorted = sortByBlockNumber(enrichedItems);
```

## Full pipeline example

```ts
import {
  parseActivityFeed,
  extractEncryptedHandles,
  applyDecryptedValues,
  sortByBlockNumber,
  TOKEN_TOPICS,
} from "@zama-fhe/sdk";

// 1. Fetch logs
const logs = await publicClient.getLogs({
  address: tokenAddress,
  topics: [TOKEN_TOPICS],
  fromBlock: startBlock,
  toBlock: "latest",
});

// 2. Parse into classified activity items
const items = parseActivityFeed(logs, userAddress);

// 3. Extract handles for decryption
const handles = extractEncryptedHandles(items);

// 4. Decrypt all handles in one batch
const decryptedMap = await token.decryptHandles(handles);

// 5. Attach decrypted amounts
const enrichedItems = applyDecryptedValues(items, decryptedMap);

// 6. Sort newest first
const feed = sortByBlockNumber(enrichedItems);
```

## Related

- [Activity Feeds guide](/guides/activity-feeds) — activity feed usage in context
- [Delegated Decryption](/reference/sdk/delegation) — delegation API with on-chain event examples
- [Token](/reference/sdk/Token) — high-level API for token operations
