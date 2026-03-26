---
title: WrappersRegistry
description: Query the on-chain token wrappers registry — list pairs, look up tokens, and validate confidential tokens.
---

# WrappersRegistry

High-level read interface for the on-chain `ConfidentialTokenWrappersRegistry` contract. Resolves the correct registry address for the current chain automatically.

## Import

```ts
import { WrappersRegistry, DefaultRegistryAddresses } from "@zama-fhe/sdk";
```

## Usage

### From ZamaSDK

The SDK exposes a shared registry instance via `sdk.registry`. This is the recommended way to access the registry — it shares the SDK's signer, `registryAddresses`, and `registryTTL`, and maintains a single in-memory cache.

```ts
const pairs = await sdk.registry.listPairs({ page: 1 });
const result = await sdk.registry.getConfidentialToken(erc20Address);
```

You can also create a separate instance via `sdk.createWrappersRegistry()` (inherits `registryTTL` from the SDK):

```ts
const registry = sdk.createWrappersRegistry();
const pairs = await registry.getTokenPairs();
```

### Standalone

```ts
import { WrappersRegistry } from "@zama-fhe/sdk";

const registry = new WrappersRegistry({ signer });
const [found, cToken] = await registry.getConfidentialTokenAddress(tokenAddress);
```

### Custom chains

Override registry addresses for Hardhat or custom deployments:

```ts
// Via ZamaSDK
const registry = sdk.createWrappersRegistry({ [31337]: "0xYourHardhatRegistry" });

// Via constructor
const registry = new WrappersRegistry({
  signer,
  registryAddresses: { [31337]: "0xYourHardhatRegistry" },
});
```

## Constructor

### signer

`GenericSigner`

Wallet signer for read calls. Any signer implementation works (`ViemSigner`, `EthersSigner`, `WagmiSigner`, or custom).

### registryAddresses

`Record<number, Address> | undefined`

Per-chain registry address overrides, merged on top of `DefaultRegistryAddresses`. Mainnet and Sepolia are configured by default — pass this only for custom or local chains.

### registryTTL

`number | undefined`

How long cached registry results remain valid, in seconds. Default: `86400` (24 hours).

```ts
const registry = new WrappersRegistry({
  signer,
  registryTTL: 3600, // 1 hour
});
```

## Methods

### getRegistryAddress

`() => Promise<Address>`

Resolves the registry contract address for the current chain. Throws `ConfigurationError` if no address is configured.

```ts
const registryAddr = await registry.getRegistryAddress();
```

### listPairs

`(options?: ListPairsOptions) => Promise<PaginatedResult<TokenWrapperPair | EnrichedTokenWrapperPair>>`

List token wrapper pairs with page-based pagination. Pass `metadata: true` to enrich each pair with on-chain name, symbol, decimals, and totalSupply.

```ts
// Basic pagination
const page1 = await registry.listPairs({ page: 1, pageSize: 20 });
console.log(`${page1.total} pairs, showing page ${page1.page}`);

// With on-chain metadata
const enriched = await registry.listPairs({ metadata: true, pageSize: 10 });
for (const pair of enriched.items) {
  console.log(pair.underlying.symbol, "→", pair.confidential.symbol);
}
```

#### ListPairsOptions

| Option     | Type      | Default | Description                                          |
| ---------- | --------- | ------- | ---------------------------------------------------- |
| `page`     | `number`  | `1`     | Page number (1-indexed)                              |
| `pageSize` | `number`  | `100`   | Items per page                                       |
| `metadata` | `boolean` | `false` | Fetch on-chain metadata for both tokens in each pair |

### getConfidentialToken

`(tokenAddress: Address) => Promise<{ confidentialTokenAddress: Address; isValid: boolean } | null>`

Look up the confidential token for a given plain ERC-20. Returns `null` if no pair is registered. Negative lookups are cached for 5 minutes.

```ts
const result = await registry.getConfidentialToken(usdcAddress);
if (result) {
  console.log(result.confidentialTokenAddress, result.isValid);
}
```

### getUnderlyingToken

`(confidentialTokenAddress: Address) => Promise<{ tokenAddress: Address; isValid: boolean } | null>`

Reverse lookup — find the plain ERC-20 for a confidential token. Returns `null` if no pair is registered.

```ts
const result = await registry.getUnderlyingToken(cUsdcAddress);
if (result) {
  console.log(result.tokenAddress, result.isValid);
}
```

### refresh

`() => void`

Force-invalidate the in-memory cache. The next call to any read method will fetch fresh data from the chain.

```ts
registry.refresh();
```

### getTokenPairs

`() => Promise<readonly TokenWrapperPair[]>`

Fetch all token wrapper pairs from the registry.

```ts
const pairs = await registry.getTokenPairs();
for (const pair of pairs) {
  console.log(pair.tokenAddress, "→", pair.confidentialTokenAddress, pair.isValid);
}
```

### getTokenPairsLength

`() => Promise<bigint>`

Get the total number of registered token wrapper pairs.

```ts
const count = await registry.getTokenPairsLength();
```

### getTokenPairsSlice

`(fromIndex: bigint, toIndex: bigint) => Promise<readonly TokenWrapperPair[]>`

Fetch a range of pairs for pagination.

```ts
const page = await registry.getTokenPairsSlice(0n, 10n);
```

### getTokenPair

`(index: bigint) => Promise<TokenWrapperPair>`

Fetch a single pair by index.

```ts
const pair = await registry.getTokenPair(0n);
```

### getConfidentialTokenAddress

`(tokenAddress: Address) => Promise<readonly [boolean, Address]>`

Look up the confidential token for a given plain ERC-20. Returns `[found, confidentialTokenAddress]`.

```ts
const [found, cToken] = await registry.getConfidentialTokenAddress("0xUSDC");
if (found) {
  const token = sdk.createToken(cToken);
}
```

### getTokenAddress

`(confidentialTokenAddress: Address) => Promise<readonly [boolean, Address]>`

Reverse lookup — find the plain ERC-20 for a confidential token. Returns `[found, tokenAddress]`.

```ts
const [found, plainToken] = await registry.getTokenAddress("0xcUSDC");
```

### isConfidentialTokenValid

`(confidentialTokenAddress: Address) => Promise<boolean>`

Check whether a confidential token is registered and valid.

```ts
if (await registry.isConfidentialTokenValid("0xcUSDC")) {
  // Token is a known valid wrapper
}
```

## DefaultRegistryAddresses

`Record<number, Address>`

Exported map of built-in registry addresses derived from `DefaultConfigs`. Includes Mainnet (`1`) and Sepolia (`11155111`). Addresses are EIP-55 checksummed.

```ts
import { DefaultRegistryAddresses } from "@zama-fhe/sdk";

console.log(DefaultRegistryAddresses[1]); // "0xeb5015fF021DB115aCe010f23F55C2591059bBA0"
```

## Related

- [ZamaSDK](/reference/sdk/ZamaSDK) — `sdk.registry` shared instance and `createWrappersRegistry()` factory
- [useListPairs](/reference/react/useListPairs) — React hook for paginated pair listing
- [useConfidentialTokenAddress](/reference/react/useConfidentialTokenAddress) — React hook for forward lookup
- [useTokenAddress](/reference/react/useTokenAddress) — React hook for reverse lookup
- [useIsConfidentialTokenValid](/reference/react/useIsConfidentialTokenValid) — React hook for validity check
- [Contract Builders](/reference/sdk/contract-builders) — low-level registry builders
- [Network Presets](/reference/sdk/network-presets) — built-in chain configurations
