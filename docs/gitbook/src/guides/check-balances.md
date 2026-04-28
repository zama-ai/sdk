---
title: Check balances
description: Decrypt and read confidential token balances using the SDK and React hooks.
---

# Check balances

Confidential balances are stored on-chain as encrypted handles. To display a human-readable number, the SDK decrypts them using FHE credentials tied to the user's wallet. This guide walks through reading balances, understanding the caching layer, and working with multiple tokens.

## Steps

### 1. Read your own balance

Call `balanceOf()` on a `Token` or `ReadonlyToken` instance. The SDK fetches the encrypted handle from the chain, decrypts it, and returns a `bigint`.

{% tabs %}
{% tab title="SDK" %}

```ts
import { createConfig } from "@zama-fhe/sdk/viem";
import { ZamaSDK, web } from "@zama-fhe/sdk";
import { sepolia } from "@zama-fhe/sdk/chains";

const config = createConfig({
  chains: [sepolia],
  publicClient,
  walletClient,
  storage,
  relayers: { [sepolia.id]: web() },
});
const sdk = new ZamaSDK(config);
const token = sdk.createToken("0xEncryptedERC20");

const balance = await token.balanceOf();
console.log(`Confidential balance: ${balance}`);
```

{% endtab %}
{% endtabs %}

### 2. Understand the first-time wallet signature

The first `balanceOf()` call for a token prompts the user's wallet for an EIP-712 signature. This creates FHE decrypt credentials that are cached in your storage backend. Subsequent reads are silent -- no wallet popup.

{% hint style="info" %}
**In React apps, don't trigger this signature on render.** Gate `useConfidentialBalance` behind `useIsAllowed` and let the user click an explicit "Decrypt" button. See [Avoid blind-sign wallet popups](encrypt-decrypt.md#gating-useconfidentialbalance) for the full pattern.
{% endhint %}

If the user rejects the signature, the SDK throws a `SigningRejectedError`. See [Handle Errors](handle-errors.md) for recovery patterns.

You can pre-authorize multiple tokens with a single signature using `ReadonlyToken.allow()`:

{% tabs %}
{% tab title="SDK" %}

```ts
import { ReadonlyToken } from "@zama-fhe/sdk";

const tokenA = sdk.createReadonlyToken("0xTokenA");
const tokenB = sdk.createReadonlyToken("0xTokenB");

await ReadonlyToken.allow(tokenA, tokenB);
// All subsequent balanceOf() calls are silent
```

{% endtab %}
{% endtabs %}

### 3. Balance caching

Decrypted balances are automatically cached in your storage backend (IndexedDB, async local storage, etc.). This means:

- **No spinner on page reload** -- if a balance was previously decrypted, it is returned instantly from cache instead of re-running the 2-5 second FHE decryption.
- **Automatic invalidation** -- the cache key includes the on-chain encrypted handle, so when a transfer, shield, or unshield changes the balance, the old cache entry is naturally bypassed.
- **Best-effort** -- cache reads and writes never throw. If storage is unavailable, the SDK falls back to a fresh decryption silently.

The cache is keyed by `token address + owner address + encrypted handle`.

### 4. Work with raw encrypted handles

Sometimes you need the encrypted handle itself, for example to check whether a balance exists before attempting decryption.

{% tabs %}
{% tab title="SDK" %}

```ts
import { isZeroHandle } from "@zama-fhe/sdk";

const handle = await token.confidentialBalanceOf(userAddress);

// Check if the handle is zero (account has never shielded)
if (isZeroHandle(handle)) {
  console.log("No confidential balance yet");
}

// Decrypt a handle you already have
const result = await sdk.userDecrypt([{ handle, contractAddress: token.address }]);
const value = result[handle] as bigint;

// Decrypt multiple handles at once (must include the contract address per handle)
const decrypted = await sdk.userDecrypt(
  [handle1, handle2, handle3].map((h) => ({ handle: h, contractAddress: token.address })),
);
```

{% endtab %}
{% endtabs %}

### 5. Distinguish "no balance" from "zero balance"

These are different situations that your UI should handle separately:

- **`NoCiphertextError`** -- the account has never shielded tokens. There is no encrypted balance to decrypt. Show something like "No confidential balance" in your UI.
- **Balance of `0n`** -- the account has shielded before but currently holds zero. Show "Balance: 0".

{% tabs %}
{% tab title="SDK" %}

```ts
import { NoCiphertextError } from "@zama-fhe/sdk";

try {
  const balance = await token.balanceOf();
  showBalance(balance); // could be 0n
} catch (error) {
  if (error instanceof NoCiphertextError) {
    showEmptyState("Shield tokens to get started");
  }
}
```

{% endtab %}
{% endtabs %}

### 6. Batch decrypt across multiple tokens

When your app manages a portfolio of confidential tokens, use batch operations to minimize wallet prompts and parallelize decryption.

{% tabs %}
{% tab title="SDK" %}

```ts
import { ReadonlyToken } from "@zama-fhe/sdk";

const tokens = addresses.map((a) => sdk.createReadonlyToken(a));

// One wallet signature covers all tokens
await ReadonlyToken.allow(...tokens);

// Decrypt all balances in parallel
const { results, errors } = await ReadonlyToken.batchBalancesOf(tokens, userAddress);

// `results` is Map<Address, bigint> for tokens that decrypted successfully,
// `errors` is Map<Address, ZamaError> for tokens that failed — partial failure
// never rejects the whole batch.
for (const [address, balance] of results) {
  console.log(address, balance);
}
```

{% endtab %}
{% endtabs %}

### 7. Read token metadata

Before displaying balances, you typically want the token's name, symbol, and decimals. Use the `useMetadata` hook:

```tsx
import { useMetadata } from "@zama-fhe/react-sdk";

const { data: meta } = useMetadata("0xToken");

// meta.name, meta.symbol, meta.decimals
```

See [useMetadata reference](/reference/react/useMetadata) for full options.

### 8. Use the balance hooks in React

The React SDK provides hooks that handle polling, caching, and React Query integration out of the box.

{% tabs %}
{% tab title="Single token" %}

```tsx
import { useConfidentialBalance } from "@zama-fhe/react-sdk";

const {
  data: balance,
  isLoading,
  error,
} = useConfidentialBalance(
  {
    tokenAddress: "0xToken",
  },
  { refetchInterval: 5_000 },
);
```

{% endtab %}
{% tab title="Multiple tokens" %}

```tsx
import { useConfidentialBalances } from "@zama-fhe/react-sdk";

const { data } = useConfidentialBalances({
  tokenAddresses: ["0xTokenA", "0xTokenB", "0xTokenC"],
});

const tokenABalance = data?.results.get("0xTokenA");
```

{% endtab %}
{% endtabs %}

`useConfidentialBalance` calls `token.balanceOf(owner)` which reads the on-chain handle and decrypts via the SDK. Previously decrypted values are served from cache instantly — the relayer is only hit when the handle changes. Pass `refetchInterval` to poll for updates. Decrypted values are persisted in storage, so page reloads show the balance instantly.

### 9. Force a manual refresh

Mutations automatically invalidate balance caches, but if you need manual control (for example, after an external contract interaction), use `zamaQueryKeys`:

{% tabs %}
{% tab title="React" %}

```tsx
import { useQueryClient } from "@tanstack/react-query";
import { zamaQueryKeys } from "@zama-fhe/sdk/query";

const queryClient = useQueryClient();

// Invalidate all balance queries
queryClient.invalidateQueries({
  queryKey: zamaQueryKeys.confidentialBalance.all,
});

// Invalidate one token
queryClient.invalidateQueries({
  queryKey: zamaQueryKeys.confidentialBalance.token("0xToken"),
});
```

{% endtab %}
{% endtabs %}

## Next steps

- See [Avoid blind-sign wallet popups](encrypt-decrypt.md#gating-useconfidentialbalance) to gate balance queries behind explicit user action.
- See [Token Operations](/reference/sdk/Token) for the full `Token.balanceOf` and `ReadonlyToken` API.
- See [Hooks](/reference/react/query-keys) for `useConfidentialBalance`, `useConfidentialBalances`, and query key details.
- To handle `NoCiphertextError` and other failures, see [Handle Errors](handle-errors.md).
