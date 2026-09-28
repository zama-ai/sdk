---
title: VaultRouter
description: The contract that turns one submission into a join on each of several vault batchers.
---

# VaultRouter

`VaultRouter` wraps the on-chain router that fans one submission out across several batchers. It submits the legs it is given and decides nothing about them; [`VaultGroup`](VaultGroup.md) is the surface that builds the legs, and most apps should use that instead.

## Import

```ts
import { createVaultRouter, VaultRouter } from "@zama-fhe/sdk/vaults";
```

## Construction

```ts
const router = createVaultRouter(sdk, "0xRouter");
```

`createVaultRouter` is a thin factory over `new VaultRouter(sdk, address)`; both take the same arguments.

## Properties

### sdk

`ZamaSDK`

The SDK instance this router reads and writes through.

### address

`Address`

Checksummed address of the router contract.

## Reads

### tokenWrapperRegistry

`() => Promise<Address>`

The registry the router checks a token against before accepting a pushed transfer. Immutable on chain, so it is resolved once and cached.

### isTokenListed

`(token: Address) => Promise<boolean>`

Whether the router's registry lists `token`. Governance can revoke a listing, so this is read per call rather than cached.

### requireTokenListed

`(token: Address) => Promise<void>`

Throws [`UnlistedConfidentialTokenError`](errors.md#unlistedconfidentialtokenerror) if the registry does not list `token`. `VaultGroup.deposit` calls this before pushing the asset to the router, so the caller does not pay for a reverted transaction.

## Writes

### encryptAllocation

`(legs: readonly AllocationLeg[]) => Promise<EncryptedAllocation>`

Encrypts a leg set as one FHE input bound to the router — the contract that verifies the proof — and returns the legs with their handles plus the single `inputProof`. `encodeAllocationData(allocation)` turns the result into the `data` payload of a `confidentialTransferAndCall` to the router, which is how a deposit funds every leg with one transfer.

An `AllocationLeg` is `{ batcher, token, amount }` with a plaintext `amount`.

### join

`(legs: readonly AllocationLeg[], options?: VaultRouterJoinOptions) => Promise<TransactionResult>`

Pulls every leg's token from the caller and joins each leg's batcher, in one transaction. Grants the router an ERC-7984 operator approval on each distinct token first, unless one is already active. This is the path a group redemption takes, since each leg spends a different share token.

Options (`VaultRouterJoinOptions`):

| Option          | Type     | Default      | Description                                                                                                                                  |
| --------------- | -------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `operatorUntil` | `number` | now + 1 hour | Unix timestamp (seconds) until which the router's operator grant on each leg's token is valid. Only used where a grant isn't already active. |

**Throws:**

- [`ConfigurationError`](errors.md#configurationerror) — an empty leg set, or more than `MAX_GROUP_VAULTS` legs. Thrown before any grant.
- [`SignerNotConfiguredError`](errors.md#signernotconfigurederror) — no signer on the SDK.
- [`EncryptionFailedError`](errors.md#encryptionfailederror) — encryption returned fewer handles than legs.

FHE compute grows with the leg count, and a transaction has a ceiling on it; `MAX_GROUP_VAULTS` (10) is the [documented limit](https://docs.zama.org/protocol/confidential-vault/concepts/multi-vault-router#leg-limits) for a pull.

## Related

- [VaultGroup](VaultGroup.md) — builds the legs and picks the path
- [Vault groups](../../guides/vault-groups.md)
