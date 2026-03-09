---
title: Activity Feeds
description: Parse on-chain events into a user-friendly activity feed with decrypted amounts.
---

# Activity Feeds

Confidential tokens emit standard events (transfers, wraps, unwraps) but the amounts are encrypted handles. The SDK provides utilities to fetch these logs, classify them by type and direction, decrypt the amounts, and produce a feed ready for your UI.

## Steps

### 1. Fetch logs from the chain

Start by querying event logs from the token contract. The SDK exports `TOKEN_TOPICS` -- an array of topic hashes covering all relevant events (confidential transfers, wraps, and unwraps).

::: code-group

```ts [viem]
import { TOKEN_TOPICS } from "@zama-fhe/sdk";

const logs = await publicClient.getLogs({
  address: tokenAddress, // [!code focus]
  topics: [TOKEN_TOPICS], // [!code focus]
  fromBlock: deployBlock,
  toBlock: "latest",
});
```

:::

You can narrow the block range to limit the number of logs returned. For a production app, you would typically paginate or use an indexer.

### 2. Parse raw logs with parseActivityFeed

Pass the raw logs and the user's address to `parseActivityFeed`. It classifies each event by type (`ConfidentialTransfer`, `Wrapped`, `UnwrapRequested`, etc.) and direction (`incoming`, `outgoing`, or `self`).

::: code-group

```ts [SDK]
import { parseActivityFeed } from "@zama-fhe/sdk";

const items = parseActivityFeed(logs, userAddress); // [!code focus]
// Each item has: .type, .direction, .from, .to, .encryptedHandle, .blockNumber
```

:::

### 3. Extract encrypted handles

The parsed items contain encrypted handles that need decrypting before you can show amounts. Use `extractEncryptedHandles` to collect them into a flat array.

::: code-group

```ts [SDK]
import { extractEncryptedHandles } from "@zama-fhe/sdk";

const handles = extractEncryptedHandles(items); // [!code focus]
```

:::

### 4. Decrypt the handles

Use the token instance to decrypt all handles in one batch call. This returns a `Map` from handle to decrypted `bigint`.

::: code-group

```ts [SDK]
const decryptedMap = await token.decryptHandles(handles); // [!code focus]
```

:::

This call requires FHE credentials. If the user has not signed yet, the SDK prompts for a wallet signature. See [Check Balances](check-balances.md) for details on the signature flow.

### 5. Attach decrypted values with applyDecryptedValues

Merge the decrypted amounts back into the activity items. Each item gains an `.amount` field with the human-readable value.

::: code-group

```ts [SDK]
import { applyDecryptedValues } from "@zama-fhe/sdk";

const enrichedItems = applyDecryptedValues(items, decryptedMap); // [!code focus]
// Each item now has .amount (bigint) alongside .encryptedHandle
```

:::

### 6. Sort and display

Use `sortByBlockNumber` to order the feed newest-first, then render it in your UI.

::: code-group

```ts [SDK]
import { sortByBlockNumber } from "@zama-fhe/sdk";

const feed = sortByBlockNumber(enrichedItems); // [!code focus]

feed.forEach((item) => {
  console.log(`${item.type} | ${item.direction} | ${item.amount}`);
});
```

:::

Here is the full pipeline in one block for reference:

::: code-group

```ts [Full example]
import {
  parseActivityFeed,
  extractEncryptedHandles,
  applyDecryptedValues,
  sortByBlockNumber,
} from "@zama-fhe/sdk";

// 1. Parse raw logs into classified items
const items = parseActivityFeed(logs, userAddress);

// 2. Pull out handles that need decrypting
const handles = extractEncryptedHandles(items);

// 3. Decrypt them
const decryptedMap = await token.decryptHandles(handles);

// 4. Attach the decrypted amounts
const enrichedItems = applyDecryptedValues(items, decryptedMap);

// 5. Sort newest first
const feed = sortByBlockNumber(enrichedItems);
```

:::

### 7. Use the useActivityFeed hook in React

The React SDK wraps the entire pipeline into a single hook. Pass it your logs and it handles parsing, decryption, and sorting automatically.

::: code-group

```tsx [React]
import { useActivityFeed } from "@zama-fhe/react-sdk";

const { data: feed, isLoading } = useActivityFeed({
  tokenAddress: "0xToken", // [!code focus]
  logs, // [!code focus]
  userAddress, // [!code focus]
  decrypt: true, // [!code focus]
});

feed?.forEach((item) => {
  console.log(item.type, item.direction, item.amount);
});
```

:::

When `decrypt` is `true`, the hook decrypts all handles and attaches amounts. Set it to `false` if you only need the classified event metadata without decrypted values.

You can control cache invalidation with `zamaQueryKeys.activityFeed`:

```tsx
import { zamaQueryKeys } from "@zama-fhe/react-sdk";

queryClient.invalidateQueries({
  queryKey: zamaQueryKeys.activityFeed.token("0xToken"),
});
```

## Next steps

- See [Token Operations](/reference/sdk/Token.md) for the event decoder API (`decodeOnChainEvents`, `TOKEN_TOPICS`, individual decoders).
- See [Hooks](/reference/react/query-keys.md) for `useActivityFeed` details and query key reference.
- To handle decryption errors during feed building, see [Handle Errors](handle-errors.md).
