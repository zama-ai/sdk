---
title: useConfidentialBalances
description: Decrypt and poll multiple tokens' confidential balances in a single query.
---

# useConfidentialBalances

Decrypt and poll multiple tokens' confidential balances in a single query. Returns a `Map` keyed by token address. Each token uses the same two-phase polling strategy as [`useConfidentialBalance`](/reference/react/useConfidentialBalance).

## Import

```ts
import { useConfidentialBalances } from "@zama-fhe/react-sdk";
```

## Usage

{% tabs %}
{% tab title="component.tsx" %}

```tsx
import {
  useAllow,
  useConfidentialBalances,
  useIsAllowed,
} from "@zama-fhe/react-sdk";

function Portfolio({ tokens }: { tokens: `0x${string}`[] }) {
  const { mutate: allow, isPending: isAllowing } = useAllow();
  const { data: allowed } = useIsAllowed({ contractAddresses: tokens });
  const { data: balances, isLoading } = useConfidentialBalances(
    { tokenAddresses: tokens },
    { enabled: !!allowed }, // gate: only decrypt once authorized
  );

  if (!allowed) {
    return (
      <button onClick={() => allow(tokens)} disabled={isAllowing}>
        {isAllowing ? "Signing..." : "Authorize tokens"}
      </button>
    );
  }

  if (isLoading) return <span>Decrypting...</span>;

  return (
    <ul>
      {tokens.map((addr) => (
        <li key={addr}>
          {addr}: {balances?.get(addr)?.toString() ?? "—"}
        </li>
      ))}
    </ul>
  );
}
```

{% endtab %}
{% tab title="config.ts" %}

```ts
import { ZamaSDK, RelayerWeb, indexedDBStorage } from "@zama-fhe/sdk";
import { ViemSigner } from "@zama-fhe/sdk/viem";

const signer = new ViemSigner({ walletClient, publicClient });

const sdk = new ZamaSDK({
  relayer: new RelayerWeb({
    getChainId: () => signer.getChainId(),
    transports: {
      [1]: {
        relayerUrl: "https://your-app.com/api/relayer/1",
        network: "https://mainnet.infura.io/v3/YOUR_KEY",
      },
      [11155111]: {
        relayerUrl: "https://your-app.com/api/relayer/11155111",
        network: "https://sepolia.infura.io/v3/YOUR_KEY",
      },
    },
  }),
  signer,
  storage: indexedDBStorage,
});
```

{% endtab %}
{% endtabs %}

## Parameters

```ts
import { type UseConfidentialBalancesParameters } from "@zama-fhe/react-sdk";
```

### tokenAddresses

`Address[]`

Array of confidential ERC-20 token contract addresses to query.

{% tabs %}
{% tab title="component.tsx" %}

```tsx
const { data } = useConfidentialBalances({
  tokenAddresses: ["0xTokenA", "0xTokenB", "0xTokenC"],
});
```

{% endtab %}
{% endtabs %}

---

### owner

`Address | undefined`

Address whose balances to read. Defaults to the connected wallet address from the signer.

{% tabs %}
{% tab title="component.tsx" %}

```tsx
const { data } = useConfidentialBalances({
  tokenAddresses: ["0xTokenA", "0xTokenB"],
  owner: "0xOwner",
});
```

{% endtab %}
{% endtabs %}

{% include ".gitbook/includes/query-options.md" %}

## Return Type

```ts
import { type UseConfidentialBalancesReturnType } from "@zama-fhe/react-sdk";
```

The `data` property is `Map<Address, bigint> | undefined` -- a map from token address to decrypted balance.

{% include ".gitbook/includes/query-result.md" %}

## How It Works

Internally, `useConfidentialBalances` uses **two-phase polling**:

1. **Handles phase** — cheap RPC reads poll each token's encrypted balance handle on the configured `handleRefetchInterval` (default: 10 s). No wallet interaction.
2. **Decrypt phase** — only runs when at least one handle changes. Calls `ReadonlyToken.batchDecryptBalances(tokens)` which checks the SDK's persistent plaintext cache first, then hits the relayer for any uncached handles. The credential request covers **all** queried token addresses in a single `credentials.allow(...)` call.

Because the decrypt phase uses the full token set, a parallel call to `ReadonlyToken.allow(...tokens)` (e.g. from a manual "Authorize" button or a `useAllow` mutation) deduplicates against the hook's internal credential request — only one wallet signature is ever requested.

## Credential Caching

`useConfidentialBalances` relies on the same credential cache as [`useUserDecrypt`](/reference/react/useUserDecrypt):

- **First `allow()` call** — generates a new FHE keypair, creates EIP-712 typed data, and requests a wallet signature. Credentials are cached in persistent storage and keyed by the sorted set of contract addresses.
- **Subsequent queries** — reuse the cached credentials if they are still valid (not expired) and cover every token address in the query.
- **Expiry** — credentials expire after `keypairTTL` seconds (default: 2592000 = 30 days, configurable via SDK config). Once expired, call `allow()` again to generate fresh credentials.

{% hint style="warning" %}
**`useConfidentialBalances` does not automatically gate on credentials.** If credentials are not cached when the decrypt phase fires, the SDK will prompt the user's wallet for a signature. To avoid unexpected popups, gate the query using [`useIsAllowed`](/reference/react/useIsAllowed) as shown in the [Usage](#usage) example.
{% endhint %}

## Related

- [useConfidentialBalance](/reference/react/useConfidentialBalance) -- single-token variant
- [Two-Phase Polling](/concepts/two-phase-polling)
- [Check Balances guide](/guides/check-balances)
- [Query Keys](/reference/react/query-keys) -- `zamaQueryKeys.confidentialBalances`
