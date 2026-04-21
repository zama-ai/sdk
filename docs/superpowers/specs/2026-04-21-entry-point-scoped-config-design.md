# Entry-Point-Scoped `createZamaConfig`

**Date:** 2026-04-21
**Status:** Approved
**Scope:** `@zama-fhe/sdk` config system, `@zama-fhe/react-sdk` wagmi config

## Problem

`createZamaConfig` currently lives in the main `@zama-fhe/sdk` entry and accepts a union of three adapter paths (`ZamaConfigViem | ZamaConfigEthers | ZamaConfigCustomSigner`). A separate copy exists in `@zama-fhe/react-sdk` for wagmi. This has issues:

1. **Unnecessary union at the call site.** Users always know which adapter they're using — the union only adds noise and `never` discriminant fields.
2. **Duplicated resolution logic.** The wagmi `createZamaConfig` re-implements storage, chain-transport, and relayer resolution.
3. **Dead adapter code in bundles.** Importing `createZamaConfig` from the main entry pulls `resolveSigner`, which references both `ViemSigner` and `EthersSigner`.

## Design

### Entry point structure

Each sub-entry exports its own `createZamaConfig` that only accepts the adapter type it's responsible for:

| Entry point                 | Config type        | Signer built   |
| --------------------------- | ------------------ | -------------- |
| `@zama-fhe/sdk/viem`        | `ZamaConfigViem`   | `ViemSigner`   |
| `@zama-fhe/sdk/ethers`      | `ZamaConfigEthers` | `EthersSigner` |
| `@zama-fhe/react-sdk/wagmi` | `ZamaConfigWagmi`  | `WagmiSigner`  |

The main `@zama-fhe/sdk` entry **stops exporting `createZamaConfig`**. It continues to export `ZamaConfig`, `ZamaConfigBase`, transport factories, `ZamaSDK`, and everything else.

### Flattened config types

The nested `viem: {}` / `ethers: {}` wrappers and `never` discriminant fields are removed. Each config type is flat:

```ts
// src/viem/types.ts
export interface ZamaConfigViem extends ZamaConfigBase {
  publicClient: PublicClient;
  walletClient?: WalletClient;
  ethereum?: EIP1193Provider;
}

// src/ethers/types.ts
export type ZamaConfigEthers = ZamaConfigBase &
  ({ ethereum: EIP1193Provider } | { signer: Signer } | { provider: Provider });

// react-sdk: src/wagmi/config.ts
export interface ZamaConfigWagmi<T = Config> extends ZamaConfigBase {
  wagmiConfig: T;
}
```

For `ZamaConfigEthers`: `ethereum`, `signer`, and `provider` are mutually exclusive — matches the existing `EthersSignerConfig` shape. `EthersSigner` constructor is unchanged.

### Shared internal builder

All three `createZamaConfig` functions delegate to a shared internal builder:

```ts
// config/build.ts (@internal — exported from main SDK entry for react-sdk, not public API)
export function buildZamaConfig(
  signer: GenericSigner,
  params: ZamaConfigBase,
  resolveChainId?: () => Promise<number>,
): ZamaConfig {
  const { storage, sessionStorage } = resolveStorage(params.storage, params.sessionStorage);
  const chainTransports = resolveChainTransports(
    params.chains,
    params.transports,
    params.chains.map((c) => c.id),
  );
  const relayer = buildRelayer(chainTransports, resolveChainId ?? (() => signer.getChainId()));

  return {
    chains: params.chains,
    relayer,
    signer,
    storage,
    sessionStorage,
    keypairTTL: params.keypairTTL,
    sessionTTL: params.sessionTTL,
    registryTTL: params.registryTTL,
    onEvent: params.onEvent,
  } as unknown as ZamaConfig;
}
```

The `resolveChainId` override exists because wagmi derives chain ID from `getChainId(wagmiConfig)` rather than `signer.getChainId()`.

### Thin entry-point wrappers

```ts
// sdk/src/viem/index.ts
import { buildZamaConfig } from "../config/build";
import { ViemSigner } from "./viem-signer";
import type { ZamaConfigViem } from "./types";

export function createZamaConfig(params: ZamaConfigViem): ZamaConfig {
  const signer = new ViemSigner({
    publicClient: params.publicClient,
    walletClient: params.walletClient,
    ethereum: params.ethereum,
  });
  return buildZamaConfig(signer, params);
}

// sdk/src/ethers/index.ts
import { buildZamaConfig } from "../config/build";
import { EthersSigner } from "./ethers-signer";
import type { ZamaConfigEthers } from "./types";

export function createZamaConfig(params: ZamaConfigEthers): ZamaConfig {
  const signer = new EthersSigner(params);
  return buildZamaConfig(signer, params);
}

// react-sdk/src/wagmi/config.ts
import { buildZamaConfig } from "@zama-fhe/sdk"; // @internal export
import { WagmiSigner } from "./wagmi-signer";

export function createZamaConfig(params: ZamaConfigWagmi): ZamaConfig {
  const signer = new WagmiSigner({ config: params.wagmiConfig });
  const getChainIdFn = () => Promise.resolve(getChainId(params.wagmiConfig));
  return buildZamaConfig(signer, params, getChainIdFn);
}
```

## Removals

| Item                         | Action                                             |
| ---------------------------- | -------------------------------------------------- |
| `ZamaConfigCustomSigner`     | Deleted                                            |
| `CreateZamaConfigBaseParams` | Deleted                                            |
| `resolveSigner()`            | Deleted from `resolve.ts`                          |
| `createZamaConfig`           | Removed from `config/index.ts` and main SDK export |
| `never` discriminant fields  | Removed from all config interfaces                 |

## Relocations

| Item                    | From              | To                |
| ----------------------- | ----------------- | ----------------- |
| `ZamaConfigViem` type   | `config/types.ts` | `viem/types.ts`   |
| `ZamaConfigEthers` type | `config/types.ts` | `ethers/types.ts` |

The main `@zama-fhe/sdk` entry re-exports these types from their new locations for consumers who need them.

## What stays unchanged

- `ZamaConfig` (branded opaque output type)
- `ZamaConfigBase` (shared shape)
- Transport factories (`web()`, `node()`, `cleartext()`)
- `resolveChainTransports`, `buildRelayer`, `resolveStorage` internals
- `CompositeRelayer`
- `@zama-fhe/sdk/node` entry point
- All non-config SDK exports

## Breaking changes

- `createZamaConfig` removed from `@zama-fhe/sdk` main entry. Users must import from `/viem` or `/ethers`.
- `ZamaConfigCustomSigner` removed. Users with custom signers must wrap them in viem or ethers adapters.
- Config fields are flattened: `viem: { publicClient }` becomes `publicClient` directly on params.

## Migration

**Before:**

```ts
import { createZamaConfig, web } from "@zama-fhe/sdk";

const config = createZamaConfig({
  chains: [sepolia],
  transports: { [sepolia.id]: web() },
  viem: { publicClient, walletClient },
});
```

**After:**

```ts
import { createZamaConfig } from "@zama-fhe/sdk/viem";
import { web } from "@zama-fhe/sdk";

const config = createZamaConfig({
  chains: [sepolia],
  transports: { [sepolia.id]: web() },
  publicClient,
  walletClient,
});
```

Same for ethers (import from `@zama-fhe/sdk/ethers`). Wagmi path unchanged.

## Files changed

| File                            | Change                                                                                                                        |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `sdk/src/config/types.ts`       | Remove `ZamaConfigViem`, `ZamaConfigEthers`, `ZamaConfigCustomSigner`, `CreateZamaConfigBaseParams`                           |
| `sdk/src/config/build.ts`       | New file: `buildZamaConfig` internal builder                                                                                  |
| `sdk/src/config/index.ts`       | Remove `createZamaConfig`, add `buildZamaConfig` `@internal` re-export                                                        |
| `sdk/src/config/resolve.ts`     | Remove `resolveSigner`, `ConfigWithTransports`                                                                                |
| `sdk/src/viem/types.ts`         | New file: `ZamaConfigViem` (flattened)                                                                                        |
| `sdk/src/viem/index.ts`         | Add `createZamaConfig`                                                                                                        |
| `sdk/src/ethers/types.ts`       | New file: `ZamaConfigEthers` (flattened)                                                                                      |
| `sdk/src/ethers/index.ts`       | Add `createZamaConfig`                                                                                                        |
| `sdk/src/index.ts`              | Remove `createZamaConfig`, `CreateZamaConfigBaseParams`, `ZamaConfigCustomSigner` exports; re-export types from new locations |
| `react-sdk/src/wagmi/config.ts` | Use `buildZamaConfig` instead of duplicating resolution logic                                                                 |

## Testing

- Existing config resolution tests stay (they test `resolveChainTransports`, `buildRelayer` directly).
- Add type-level tests verifying each entry point rejects wrong adapter fields.
- Update integration tests to import `createZamaConfig` from the correct entry point.
