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

::: code-group

```ts [app.ts]
import { ReadonlyToken } from "@zama-fhe/sdk";

const sdk = new ZamaSDK({ relayer, signer, storage });
const tokens = addresses.map((a) => sdk.createReadonlyToken(a));

// One wallet signature covers all tokens
await ReadonlyToken.allow(...tokens);

// Decrypt all balances in parallel
const balances = await ReadonlyToken.batchDecryptBalances(tokens, { owner });
```

```ts [config.ts]
import { ZamaSDK, indexedDBStorage, RelayerWeb, SepoliaConfig } from "@zama-fhe/sdk";
import { ViemSigner } from "@zama-fhe/sdk/viem";

const signer = new ViemSigner({ walletClient, publicClient });
const relayer = new RelayerWeb({
  getChainId: () => signer.getChainId(),
  transports: {
    [SepoliaConfig.chainId]: {
      ...SepoliaConfig,
      relayerUrl: "https://your-app.com/api/relayer/1",
      network: "https://sepolia.infura.io/v3/YOUR_KEY",
    },
  },
});
```

:::

## Static Methods

### ReadonlyToken.allow

`(...tokens: ReadonlyToken[]) => Promise<void>`

Prompts the wallet for a single signature that covers all provided tokens. Call early to avoid popups during batch decrypts.

```ts
const tokens = addresses.map((a) => sdk.createReadonlyToken(a));
await ReadonlyToken.allow(...tokens); // [!code focus]
```

### ReadonlyToken.batchDecryptBalances

`(tokens: ReadonlyToken[], opts: { owner?: Address; handles?: Hex[] }) => Promise<Map<Address, bigint>>`

Decrypts balances for multiple tokens in parallel. Returns a `Map` keyed by token address. Pass `handles` to skip the on-chain RPC reads if you already have them.

```ts
const balances = await ReadonlyToken.batchDecryptBalances(tokens, { owner }); // [!code focus]
// Returns Map<Address, bigint>

// With pre-fetched handles
const balances = await ReadonlyToken.batchDecryptBalances(tokens, { handles, owner }); // [!code focus]
```

## Methods

### balanceOf

`(owner?: Address) => Promise<bigint>`

Returns the decrypted confidential balance. First call prompts a wallet signature; subsequent calls use cached credentials.

```ts
const balance = await readonlyToken.balanceOf(); // [!code focus]

// Another address
const balance = await readonlyToken.balanceOf("0xOwnerAddress"); // [!code focus]
```

### confidentialBalanceOf

`(owner?: Address) => Promise<Hex>`

Returns the raw encrypted handle without decrypting.

```ts
const handle = await readonlyToken.confidentialBalanceOf(); // [!code focus]
```

### name

`() => Promise<string>`

Token name from the contract.

```ts
const name = await readonlyToken.name(); // [!code focus]
```

### symbol

`() => Promise<string>`

Token symbol from the contract.

```ts
const symbol = await readonlyToken.symbol(); // [!code focus]
```

### decimals

`() => Promise<number>`

Token decimals from the contract.

```ts
const decimals = await readonlyToken.decimals(); // [!code focus]
```

### isConfidential

`() => Promise<boolean>`

Checks whether the token supports confidential operations (ERC-7984).

```ts
const isConfidential = await readonlyToken.isConfidential(); // [!code focus]
```

### isWrapper

`() => Promise<boolean>`

Checks whether the contract is a wrapper around a public ERC-20.

```ts
const isWrapper = await readonlyToken.isWrapper(); // [!code focus]
```

### discoverWrapper

`(coordinatorAddress: Address) => Promise<Address>`

Finds the wrapper contract for a public token via the deployment coordinator.

```ts
const wrapper = await readonlyToken.discoverWrapper("0xCoordinatorAddress"); // [!code focus]
```

### underlyingToken

`() => Promise<Address>`

Returns the underlying public ERC-20 address from a wrapper contract.

```ts
const underlying = await readonlyToken.underlyingToken(); // [!code focus]
```

### allowance

`(spenderAddress: Address) => Promise<bigint>`

Reads the ERC-20 allowance of the underlying token for a given spender.

```ts
const allowance = await readonlyToken.allowance("0xWrapperAddress"); // [!code focus]
```

### allow

`() => Promise<void>`

Prompts the wallet to sign and caches session credentials for this token.

```ts
await readonlyToken.allow(); // [!code focus]
```

### revoke

`() => Promise<void>`

Clears session credentials for this token.

```ts
await readonlyToken.revoke(); // [!code focus]
```

### isAllowed

`() => Promise<boolean>`

Returns whether the session has active credentials for this token.

```ts
const allowed = await readonlyToken.isAllowed(); // [!code focus]
```

### decryptBalance

`(handle: Hex) => Promise<bigint>`

Decrypts a raw encrypted handle into a plaintext balance value. Results are cached.

```ts
const handle = await readonlyToken.confidentialBalanceOf();
const value = await readonlyToken.decryptBalance(handle); // [!code focus]
```

### decryptHandles

`(handles: Hex[]) => Promise<Map<Hex, bigint>>`

Decrypts multiple encrypted handles in a single call.

```ts
const values = await readonlyToken.decryptHandles([handle1, handle2]); // [!code focus]
```

### isZeroHandle

`(handle: Hex) => boolean`

Returns `true` if the handle represents a zero balance.

```ts
if (readonlyToken.isZeroHandle(handle)) {
  // [!code focus]
  console.log("No confidential balance yet");
}
```

## Related

- [ZamaSDK](/reference/sdk/ZamaSDK) — creates `ReadonlyToken` via `createReadonlyToken()`
- [Token](/reference/sdk/Token) — read/write variant with shielding and transfers
- [Token operations guide](/reference/sdk/Token)
