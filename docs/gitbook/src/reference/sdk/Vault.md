---
title: Vault
description: Confidential ERC-4626 vault interface — deposit and redeem through a pair of batchers.
---

# Vault

`Vault` is the high-level interface for a confidential ERC-4626 vault. It pairs the vault's two on-chain batcher contracts — one for deposits, one for redemptions — behind ERC-4626-style `deposit` and `redeem` methods, the way [`WrappedToken`](WrappedToken.md) builds on [`Token`](Token.md).

Both methods grant the batcher an ERC-7984 operator approval if one isn't already active, check the caller's confidential balance, encrypt the amount, and join the currently open batch. Everything after the join — tracking the batch, dispatching it, claiming, quitting — lives on the two [`VaultBatcher`](VaultBatcher.md) instances the vault exposes as `depositBatcher` and `redeemBatcher`.

## Import

```ts
import { createVault, Vault } from "@zama-fhe/sdk/vaults";
```

The `vaults` subpath is separate from the root entry, so apps that don't use vaults don't bundle it.

## Construction

Use `createVault(sdk, addresses)`:

```ts
import { createVault } from "@zama-fhe/sdk/vaults";

const vault = createVault(sdk, {
  depositBatcher: "0xDepositBatcher",
  redeemBatcher: "0xRedeemBatcher",
});

const { batchId } = await vault.deposit(1_000_000n);
// …once the batch is dispatched and reaches BatchState.Finalized:
await vault.depositBatcher.claim(batchId);
```

`createVault` is a thin factory over `new Vault(sdk, addresses)`; both take the same arguments.

### VaultAddresses

```ts
import { type VaultAddresses } from "@zama-fhe/sdk/vaults";
```

| Field            | Type      | Required | Description                                                                                                                                                              |
| ---------------- | --------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `depositBatcher` | `Address` | yes      | The batcher users join to deposit the confidential underlying asset.                                                                                                     |
| `redeemBatcher`  | `Address` | yes      | The batcher users join to redeem confidential shares.                                                                                                                    |
| `vault`          | `Address` | no       | The ERC-4626 vault contract. Both batchers report it on-chain, so it is optional. Passing it does not skip that read: `vaultAddress()` verifies it against the batchers. |

## Properties

### sdk

`ZamaSDK`

The SDK instance this vault reads and writes through.

### depositBatcher

`VaultBatcher`

The batcher joined by deposits of the underlying asset. Use it for `batchState`, `claim`, `quit`, `dispatchBatch` and the other per-batch operations on the deposit side — see [`VaultBatcher`](VaultBatcher.md).

### redeemBatcher

`VaultBatcher`

The batcher joined by share redemptions. Same API as `depositBatcher`, for the redeem side.

```ts
const state = await vault.depositBatcher.batchState(batchId);
await vault.redeemBatcher.claim(batchId);
```

## Reads

Each read resolves once per `Vault` instance and is cached, including the in-flight promise, so concurrent callers share a single lookup.

### vaultAddress

`() => Promise<Address>`

The underlying ERC-4626 vault contract, read from both batchers rather than trusted from configuration.

Throws [`ConfigurationError`](errors.md#configurationerror) if the two batchers report different vaults, or if either disagrees with an `addresses.vault` passed at construction. A mismatched pair would settle deposits and redemptions against different vaults, so the SDK refuses instead of silently continuing. `deposit()` and `redeem()` call this before granting any approval.

```ts
const vaultAddress = await vault.vaultAddress();
```

### cAsset

`() => Promise<WrappedToken>`

The confidential wrapper of the vault's underlying asset — the token deposits are paid in. Read from the deposit batcher's `fromToken()`.

```ts
const cAsset = await vault.cAsset();
const balance = await cAsset.balanceOf(address);
```

### cShare

`() => Promise<WrappedToken>`

The confidential share token this vault issues. Read from the redeem batcher's `fromToken()`, since that is the contract that pulls shares on a redemption.

```ts
const cShare = await vault.cShare();
const shares = await cShare.balanceOf(address);
```

## Writes

### deposit

`(amount: bigint, options?: VaultJoinOptions) => Promise<JoinResult>`

Deposits a plaintext amount of the underlying confidential asset by joining the current deposit batch. `amount` is denominated in the asset token's base units — `cAsset().decimals()`.

In order, the call:

1. Resolves `vaultAddress()` and `cAsset()`, throwing `ConfigurationError` if the batchers disagree.
2. Grants the deposit batcher an operator approval on `cAsset` via `Token.setOperator`, unless `isOperator` already reports one.
3. Checks the caller's confidential balance (skippable with `skipBalanceCheck`).
4. Encrypts `amount` and submits `join` on the deposit batcher.
5. Reads the `Joined` event from the receipt and returns the `batchId`.

```ts
const { txHash, batchId, confidentialJoinedAmount } = await vault.deposit(1_000_000n);
```

Options (`VaultJoinOptions`):

| Option             | Type      | Default          | Description                                                                                                                                                                                                  |
| ------------------ | --------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `beneficiary`      | `Address` | connected wallet | Account credited in the batch. The beneficiary owns the position: only they can `quit` it, and `claim` always pays out to them.                                                                              |
| `operatorUntil`    | `number`  | now + 1 hour     | Unix timestamp (seconds) until which the batcher's operator grant is valid. Only used when a grant isn't already active. Same default as `Token.setOperator`.                                                |
| `skipBalanceCheck` | `boolean` | `false`          | Skip the confidential-balance pre-flight. For accounts whose balance the connected signer can't decrypt, such as smart wallets. The on-chain transfer then moves zero, not reverts, if the balance is short. |

**Throws:**

- [`ConfigurationError`](errors.md#configurationerror) — the batchers point at different vaults, or disagree with the configured `vault` address. Thrown before any approval is granted.
- [`SignerNotConfiguredError`](errors.md#signernotconfigurederror) — no signer on the SDK.
- [`InsufficientConfidentialBalanceError`](errors.md#insufficientconfidentialbalanceerror) — the confidential balance is less than `amount`.
- [`BalanceCheckUnavailableError`](errors.md#balancecheckunavailableerror) — the balance check needs a decryption the signer can't perform; pass `skipBalanceCheck: true`.

### redeem

`(amount: bigint, options?: VaultJoinOptions) => Promise<JoinResult>`

Redeems shares by joining the current redeem batch, which the vault later settles into the underlying asset at the batch's exchange rate. Same flow and options as `deposit`, against `cShare` and the redeem batcher.

`amount` is denominated in **shares**, never in assets — this is ERC-4626 `redeem`, not `withdraw`.

```ts
const { batchId } = await vault.redeem(500n);
```

Throws the same errors as `deposit`.

## JoinResult

```ts
import { type JoinResult } from "@zama-fhe/sdk/vaults";
```

Both writes resolve to a `JoinResult`, which extends `TransactionResult`:

| Field                      | Type                 | Description                                                                                                                                                                  |
| -------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `txHash`                   | `Hex`                | The join transaction hash.                                                                                                                                                   |
| `receipt`                  | `TransactionReceipt` | The confirmed receipt.                                                                                                                                                       |
| `batchId`                  | `bigint`             | The batch the join landed in, read from the batcher's `Joined` event. Every later call (`batchState`, `claim`, `quit`) needs it.                                             |
| `beneficiary`              | `Address`            | The account credited — the beneficiary, which may not be the caller.                                                                                                         |
| `confidentialJoinedAmount` | `EncryptedValue`     | The encrypted amount actually credited. An ERC-7984 transfer moves zero rather than reverting when the balance is short, so decrypt this to confirm the join landed in full. |

## Related

- [VaultBatcher](VaultBatcher.md) — the per-direction batcher API: batch state, dispatch, claim, quit, recover
- [Vault deposits and redemptions](../../guides/vault-deposits.md) — the full deposit → dispatch → claim flow
- [Operator approvals](../../guides/operator-approvals.md) — the approval `deposit()` / `redeem()` grant automatically
- [useVault](../react/useVault.md) — React hook returning a `Vault`
- [useDeposit](../react/useDeposit.md) / [useRedeem](../react/useRedeem.md) — mutation hooks over `deposit()` / `redeem()`
