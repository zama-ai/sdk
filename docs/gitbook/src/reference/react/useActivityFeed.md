---
title: useActivityFeed
description: Parse event logs into a classified, optionally decrypted activity feed.
---

# useActivityFeed

Parse event logs into a classified, optionally decrypted activity feed. Each item includes the event type, direction relative to the user, and amount.

## Import

```ts
import { useActivityFeed } from "@zama-fhe/react-sdk";
```

## Usage

{% tabs %}
{% tab title="ActivityList.tsx" %}

```tsx
import { useActivityFeed } from "@zama-fhe/react-sdk";
import { usePublicClient } from "wagmi";
import { parseAbiItem } from "viem";
import { useEffect, useState } from "react";

function ActivityList({
  tokenAddress,
  userAddress,
}: {
  tokenAddress: Address;
  userAddress: Address;
}) {
  const [logs, setLogs] = useState([]);
  const publicClient = usePublicClient();

  useEffect(() => {
    publicClient
      .getLogs({
        address: tokenAddress,
        fromBlock: "earliest",
      })
      .then(setLogs);
  }, [tokenAddress]);

  const { data: feed, isLoading } = useActivityFeed({
    tokenAddress,
    logs,
    userAddress,
    decrypt: true,
  });

  if (isLoading) return <p>Loading activity...</p>;

  return (
    <ul>
      {feed?.map((item, i) => (
        <li key={i}>
          {item.type} -- {item.direction} -- {item.amount?.toString()}
        </li>
      ))}
    </ul>
  );
}
```

{% endtab %}
{% endtabs %}

## Parameters

### tokenAddress

`Address`

Address of the confidential token contract.

```ts
useActivityFeed({
  tokenAddress: "0xToken",
  logs,
  userAddress: "0xUser",
});
```

### logs

`Log[]`

Raw event logs to parse. Fetch these from your provider (viem `getLogs`, ethers `queryFilter`, etc.) before passing them in.

```ts
const logs = await publicClient.getLogs({
  address: tokenAddress,
  fromBlock: "earliest",
});

useActivityFeed({ tokenAddress, logs, userAddress: "0xUser" });
```

### userAddress

`Address`

Address of the current user. Used to determine the `direction` of each activity item (incoming vs. outgoing).

```ts
useActivityFeed({
  tokenAddress: "0xToken",
  logs,
  userAddress: "0xUser",
});
```

---

### decrypt

`boolean`

When `true`, decrypt encrypted amounts in the feed items. Defaults to `false`.

```ts
useActivityFeed({
  tokenAddress: "0xToken",
  logs,
  userAddress: "0xUser",
  decrypt: true,
});
```

## Return Type

The `data` field resolves to an array of activity items:

```ts
Array<{
  type: "ConfidentialTransfer" | "Wrapped" | "UnwrapRequested" | string;
  direction: "incoming" | "outgoing" | "self";
  amount: bigint | undefined;
}>;
```

| Field       | Description                                                  |
| ----------- | ------------------------------------------------------------ |
| `type`      | Event classification                                         |
| `direction` | Whether the user sent, received, or self-transferred         |
| `amount`    | Decrypted amount when `decrypt: true`, otherwise `undefined` |

{% include ".gitbook/includes/query-result.md" %}

## Related

- [useConfidentialBalance](/reference/react/useConfidentialBalance) -- read the decrypted balance
- [useMetadata](/reference/react/useMetadata) -- token name, symbol, decimals
- [Query keys](/reference/react/query-keys) -- `zamaQueryKeys.activityFeed` for cache control
- [Hooks overview](/reference/react/query-keys) -- all available hooks
