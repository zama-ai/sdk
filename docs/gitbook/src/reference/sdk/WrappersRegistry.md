---
title: WrappersRegistry
description: Query the on-chain token wrappers registry — list pairs, look up tokens, and validate confidential tokens.
---

# WrappersRegistry

High-level read interface for the on-chain `ConfidentialTokenWrappersRegistry` contract. Resolves the correct registry address for the current chain automatically.

## Import

```ts
import { WrappersRegistry, DefaultWrappersRegistryAddresses } from "@zama-fhe/sdk";
```

## Usage

### From ZamaSDK

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
  wrappersRegistryAddresses: { [31337]: "0xYourHardhatRegistry" },
});
```

## Constructor

### signer

`GenericSigner`

Wallet signer for read calls. Any signer implementation works (`ViemSigner`, `EthersSigner`, `WagmiSigner`, or custom).

### wrappersRegistryAddresses

`Record<number, Address> | undefined`

Per-chain registry address overrides, merged on top of `DefaultWrappersRegistryAddresses`. Mainnet and Sepolia are configured by default — pass this only for custom or local chains.

## Methods

### getRegistryAddress

`() => Promise<Address>`

Resolves the registry contract address for the current chain. Throws `ConfigurationError` if no address is configured.

```ts
const registryAddr = await registry.getRegistryAddress();
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

## DefaultWrappersRegistryAddresses

`Record<number, Address>`

Exported map of built-in registry addresses extracted from network presets. Includes Mainnet (`1`) and Sepolia (`11155111`).

```ts
import { DefaultWrappersRegistryAddresses } from "@zama-fhe/sdk";

console.log(DefaultWrappersRegistryAddresses[1]); // "0xeb5015fF021DB115aCe010f23F55C2591059bBA0"
```

## Related

- [ZamaSDK](/reference/sdk/ZamaSDK) — `createWrappersRegistry()` factory method
- [Contract Builders](/reference/sdk/contract-builders) — low-level registry builders
- [Network Presets](/reference/sdk/network-presets) — built-in chain configurations
