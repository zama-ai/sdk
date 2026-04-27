---
title: ReadonlyToken
description: Read-only interface for confidential token queries and batch operations.
---

# ReadonlyToken

Read-only interface for confidential token queries and batch operations — balance decryption, metadata reads, and multi-token workflows without transaction capabilities.

## Import

```ts
import { ReadonlyToken } from "@zama-fhe/sdk";
```

Instance creation via [`ZamaSDK.createReadonlyToken()`](/reference/sdk/ZamaSDK#createreadonlytoken).

## Usage

{% tabs %}
{% tab title="app.ts" %}

```ts
import { ReadonlyToken, ZamaSDK } from "@zama-fhe/sdk";

const sdk = new ZamaSDK({ relayer, provider, signer, storage });
const tokens = addresses.map((a) => sdk.createReadonlyToken(a));

// One wallet signature covers all tokens
await ReadonlyToken.allow(...tokens);

// Decrypt all balances in parallel
const { results, errors } = await ReadonlyToken.batchBalancesOf(tokens, owner);
```

{% endtab %}
{% tab title="config.ts" %}

```ts
import { createConfig } from "@zama-fhe/sdk/viem";
import { web } from "@zama-fhe/sdk";
import { sepolia, mainnet, type FheChain } from "@zama-fhe/sdk/chains";

const mySepolia = {
  ...sepolia,
  relayerUrl: "https://your-app.com/api/relayer/11155111",
} as const satisfies FheChain;

const myMainnet = {
  ...mainnet,
  relayerUrl: "https://your-app.com/api/relayer/1",
} as const satisfies FheChain;

const config = createConfig({
  chains: [mySepolia, myMainnet],
  publicClient,
  walletClient,
  relayers: {
    [mySepolia.id]: web(),
    [myMainnet.id]: web(),
  },
});
```

{% endtab %}
{% endtabs %}

## Static methods

### ReadonlyToken.allow

`(...tokens: ReadonlyToken[]) => Promise<void>`

Prompts the wallet for a single signature that covers all provided tokens. Call early to avoid popups during batch decrypts.

```ts
const tokens = addresses.map((a) => sdk.createReadonlyToken(a));
await ReadonlyToken.allow(...tokens);
```

### ReadonlyToken.batchBalancesOf

`(tokens: ReadonlyToken[], owner?: Address) => Promise<{ results: Map<Address, bigint>; errors: Map<Address, ZamaError> }>`

Decrypts balances for multiple tokens in parallel. Pre-authorizes the full token set in one wallet signature, then dispatches per-token decryption with bounded concurrency. Returns successful balances and per-token failures separately so a single bad token does not reject the whole batch.

```ts
const { results, errors } = await ReadonlyToken.batchBalancesOf(tokens, owner);

for (const [address, balance] of results) {
  console.log(address, balance);
}
for (const [address, error] of errors) {
  console.warn(`Failed to decrypt ${address}:`, error);
}
```

## Methods

### balanceOf

`(owner?: Address) => Promise<bigint>`

Returns the decrypted confidential balance. First call prompts a wallet signature; subsequent calls use cached credentials.

```ts
const balance = await readonlyToken.balanceOf();

// Another address
const otherBalance = await readonlyToken.balanceOf("0xOwnerAddress");
```

### confidentialBalanceOf

`(owner?: Address) => Promise<Hex>`

Returns the raw encrypted handle without decrypting.

```ts
const handle = await readonlyToken.confidentialBalanceOf();
```

### name

`() => Promise<string>`

Token name from the contract.

```ts
const name = await readonlyToken.name();
```

### symbol

`() => Promise<string>`

Token symbol from the contract.

```ts
const symbol = await readonlyToken.symbol();
```

### decimals

`() => Promise<number>`

Token decimals from the contract.

```ts
const decimals = await readonlyToken.decimals();
```

### isConfidential

`() => Promise<boolean>`

Checks whether the token supports confidential operations (ERC-7984).

```ts
const isConfidential = await readonlyToken.isConfidential();
```

### isWrapper

`() => Promise<boolean>`

Checks whether the contract is a wrapper around a public ERC-20.

```ts
const isWrapper = await readonlyToken.isWrapper();
```

### underlyingToken

`() => Promise<Address>`

Returns the underlying public ERC-20 address from a wrapper contract.

```ts
const underlying = await readonlyToken.underlyingToken();
```

### allowance

`(wrapper: Address, owner?: Address) => Promise<bigint>`

Reads the ERC-20 allowance of the underlying token for the given wrapper contract. Optionally specify an `owner` address (defaults to the connected wallet).

```ts
const allowance = await readonlyToken.allowance("0xWrapperAddress");

// With explicit owner
const ownerAllowance = await readonlyToken.allowance("0xWrapperAddress", "0xOwnerAddress");
```

### allow

`() => Promise<void>`

Prompts the wallet to sign and caches session credentials for this token.

```ts
await readonlyToken.allow();
```

### revoke

`() => Promise<void>`

Clears session credentials for this token.

```ts
await readonlyToken.revoke();
```

### isAllowed

`() => Promise<boolean>`

Returns whether the session has active credentials for this token.

```ts
const allowed = await readonlyToken.isAllowed();
```

### isZeroHandle

`(handle: Hex) => boolean`

Returns `true` if the handle represents a zero balance.

```ts
if (readonlyToken.isZeroHandle(handle)) {
  console.log("No confidential balance yet");
}
```

## Related

- [ZamaSDK](/reference/sdk/ZamaSDK) — creates `ReadonlyToken` via `createReadonlyToken()`
- [Token](/reference/sdk/Token) — read/write variant with shielding and transfers
- [Check Balances guide](/guides/check-balances) — step-by-step balance decryption walkthrough
