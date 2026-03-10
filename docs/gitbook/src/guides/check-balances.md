---
title: Check Balances
description: Decrypt and read confidential token balances using the SDK and React hooks.
---

# Check Balances

Confidential balances are stored on-chain as encrypted handles. To display a human-readable number, the SDK decrypts them using FHE credentials tied to the user's wallet. This guide walks through reading balances, understanding the caching layer, and working with multiple tokens.

## Steps

### 1. Read your own balance

Call `balanceOf()` on a `Token` or `ReadonlyToken` instance. The SDK fetches the encrypted handle from the chain, decrypts it, and returns a `bigint`.

{% tabs %}
{% tab title="SDK" %}

```ts
import { ZamaSDK } from "@zama-fhe/sdk";

const sdk = new ZamaSDK({ relayer, signer, storage });
const token = sdk.createToken("0xEncryptedERC20");

const balance = await token.balanceOf();
console.log(`Confidential balance: ${balance}`);
```

{% endtab %}
{% endtabs %}

### 2. Understand the first-time wallet signature

The first `balanceOf()` call for a token prompts the user's wallet for an EIP-712 signature. This creates FHE decrypt credentials that are cached in your storage backend. Subsequent reads are silent -- no wallet popup.

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
const handle = await token.confidentialBalanceOf();

// Check if the handle is zero (account has never shielded)
if (token.isZeroHandle(handle)) {
  console.log("No confidential balance yet");
}

// Decrypt a handle you already have
const value = await token.decryptBalance(handle);

// Decrypt multiple handles at once
const values = await token.decryptHandles([handle1, handle2, handle3]);
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
const balances = await ReadonlyToken.batchDecryptBalances(tokens, {
  owner: userAddress,
});
// Returns Map<Address, bigint>

// If you already have the handles, pass them to skip the RPC reads
const balances = await ReadonlyToken.batchDecryptBalances(tokens, {
  handles,
  owner: userAddress,
});
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
} = useConfidentialBalance({
  tokenAddress: "0xToken",
  handleRefetchInterval: 5_000, // optional (default: 10s)
});
```

{% endtab %}
{% tab title="Multiple tokens" %}

```tsx
import { useConfidentialBalances } from "@zama-fhe/react-sdk";

const { data: balances } = useConfidentialBalances({
  tokenAddresses: ["0xTokenA", "0xTokenB", "0xTokenC"],
});

const tokenABalance = balances?.get("0xTokenA");
```

{% endtab %}
{% endtabs %}

`useConfidentialBalance` uses two-phase polling: it cheaply checks the encrypted handle every 10 seconds and only decrypts when the handle changes. Decrypted values are persisted in storage, so page reloads show the balance instantly.

### 9. Force a manual refresh

Mutations automatically invalidate balance caches, but if you need manual control (for example, after an external contract interaction), use `zamaQueryKeys`:

{% tabs %}
{% tab title="React" %}

```tsx
import { useQueryClient } from "@tanstack/react-query";
import { zamaQueryKeys } from "@zama-fhe/react-sdk";

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

- See [Token Operations](/reference/sdk/Token.md) for the full `Token.balanceOf` and `ReadonlyToken` API.
- See [Hooks](/reference/react/query-keys.md) for `useConfidentialBalance`, `useConfidentialBalances`, and query key details.
- To handle `NoCiphertextError` and other failures, see [Handle Errors](handle-errors.md).
