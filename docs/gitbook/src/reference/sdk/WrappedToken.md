---
title: WrappedToken
description: ERC-7984 ERC-20 wrapper interface — shield, unshield, allowance.
---

# WrappedToken

`WrappedToken` is the high-level interface for an ERC-7984 ERC-20 wrapper. It extends [`Token`](Token.md), so it supports the base confidential-token operations (`balanceOf`, `confidentialTransfer`, `setOperator`, etc.) and adds wrapper-specific methods for converting between the public ERC-20 and its confidential form.

The wrapper **is** the confidential token. Pass the wrapper contract address directly; there is no separate token / wrapper pair in the SDK object.

## Import

```ts
import { WrappedToken } from "@zama-fhe/sdk";
```

## Construction

Use [`sdk.createWrappedToken()`](ZamaSDK.md):

```ts
const wrappedToken = sdk.createWrappedToken("0xWrapper");

await wrappedToken.shield(1000n);
await wrappedToken.confidentialTransfer("0xRecipient", 500n);
await wrappedToken.unshield(250n);
```

## Inherited Token API

`WrappedToken` extends [`Token`](Token.md). Use the inherited methods for ERC-7984 confidential-token reads and writes:

- `balanceOf(owner)`
- `confidentialBalanceOf(owner)`
- `decryptBalanceAs(params)`
- `confidentialTransfer(to, amount, options?)`
- `confidentialTransferFrom(from, to, amount, callbacks?)`
- `setOperator(operator, until?)`
- `isOperator(holder, spender)`
- `name()`, `symbol()`, `decimals()`
- `isConfidential()`, `isWrapper()`

## Wrapper Reads

### underlying

`() => Promise<Address>`

Reads the underlying public ERC-20 token address from the wrapper contract. The result is cached per `WrappedToken` instance.

```ts
const underlying = await wrappedToken.underlying();
```

### allowance

`(owner: Address) => Promise<bigint>`

Reads the ERC-20 allowance that `owner` granted to this wrapper contract.

```ts
const allowance = await wrappedToken.allowance(owner);
```

### isPayable

`() => Promise<boolean>`

Checks whether the underlying ERC-20 supports ERC-1363. `shield()` uses this internally to route between `transferAndCall` and `approve` + `wrap`. The result is cached per `WrappedToken` instance.

```ts
const singleTxShield = await wrappedToken.isPayable();
```

## Shield

### shield

`(amount: bigint, options?: ShieldOptions) => Promise<TransactionResult>`

Shields public ERC-20 tokens into confidential tokens. The SDK validates the public ERC-20 balance before submitting.

The execution path is selected automatically:

| Path               | Used when                                       | Wallet prompts |
| ------------------ | ----------------------------------------------- | -------------- |
| `transferAndCall`  | The underlying ERC-20 supports ERC-1363         | 1              |
| `approve` + `wrap` | The underlying ERC-20 does not support ERC-1363 | 2              |

```ts
const { txHash, receipt } = await wrappedToken.shield(1000n);
```

Options:

| Option                | Type                         | Default   | Description                                      |
| --------------------- | ---------------------------- | --------- | ------------------------------------------------ |
| `approvalStrategy`    | `"exact" \| "max" \| "skip"` | `"exact"` | Controls approval on the `approve` + `wrap` path |
| `to`                  | `Address`                    | signer    | Recipient of the confidential balance            |
| `onApprovalSubmitted` | `(txHash: Hex) => void`      | —         | Called after the approval tx is submitted        |
| `onShieldSubmitted`   | `(txHash: Hex) => void`      | —         | Called after the shield tx is submitted          |

`approvalStrategy` is ignored on the ERC-1363 `transferAndCall` path because there is no allowance step.

### approveUnderlying

`(amount?: bigint) => Promise<TransactionResult>`

Approves this wrapper contract to spend the underlying ERC-20. Defaults to `uint256.max`. If an existing non-zero allowance is present, the SDK resets it to zero first for compatibility with tokens such as USDT.

Most apps should use `shield()` directly and let it manage approvals.

```ts
await wrappedToken.approveUnderlying();
await wrappedToken.approveUnderlying(1000n);
```

### wrap

`(amount: bigint, options?: WrapOptions) => Promise<TransactionResult>`

Wraps already-approved underlying ERC-20 into confidential tokens — the second half of the manual `approve` + `wrap` flow. Validates the ERC-20 balance and the wrapper's allowance before submitting: throws `InsufficientERC20BalanceError` if the balance is too low, and `InsufficientAllowanceError` if the allowance is below `amount` (call `approveUnderlying()` first).

Most apps should use `shield()`, which routes ERC-1363 tokens through `transferAndCall` and manages approval automatically. Reach for `wrap()` only when you need the `approve` and `wrap` signatures as separate, independently-triggered steps — see [Shield tokens → Manual approve + wrap](../../guides/shield-tokens.md#manual-approve-wrap-escape-hatch).

```ts
await wrappedToken.approveUnderlying(1000n);
const { txHash, receipt } = await wrappedToken.wrap(1000n);
```

Options:

| Option            | Type                    | Default | Description                           |
| ----------------- | ----------------------- | ------- | ------------------------------------- |
| `to`              | `Address`               | signer  | Recipient of the confidential balance |
| `onWrapSubmitted` | `(txHash: Hex) => void` | —       | Called after the wrap tx is submitted |

## Unshield

### unshield

`(amount: bigint, options?: UnshieldOptions) => Promise<TransactionResult>`

Unshields a specific confidential amount back to public ERC-20. This orchestrates the two-step protocol:

1. Submit `unwrap`.
2. Wait for the unwrap receipt and public decryption proof.
3. Submit `finalizeUnwrap`.

The returned `txHash` and `receipt` are for the finalization transaction.

```ts
const { txHash, receipt } = await wrappedToken.unshield(500n);
```

Options:

| Option                | Type                    | Default | Description                                    |
| --------------------- | ----------------------- | ------- | ---------------------------------------------- |
| `skipBalanceCheck`    | `boolean`               | `false` | Skip the confidential-balance pre-flight check |
| `onUnwrapSubmitted`   | `(txHash: Hex) => void` | —       | Called after the unwrap tx is submitted        |
| `onFinalizing`        | `() => void`            | —       | Called before waiting for the finalize proof   |
| `onFinalizeSubmitted` | `(txHash: Hex) => void` | —       | Called after the finalize tx is submitted      |

### unshieldAll

`(callbacks?: UnshieldCallbacks) => Promise<TransactionResult>`

Unshields the entire confidential balance by using the on-chain encrypted balance handle directly.

```ts
await wrappedToken.unshieldAll({
  onUnwrapSubmitted: (txHash) => console.log("unwrap:", txHash),
  onFinalizeSubmitted: (txHash) => console.log("finalize:", txHash),
});
```

### resumeUnshield

`(unwrapTxHash: Hex, callbacks?: UnshieldCallbacks) => Promise<TransactionResult>`

Resumes an interrupted unshield after the unwrap transaction has already been submitted. The SDK reads the unwrap receipt, extracts the unwrap request id, waits for the proof, and submits `finalizeUnwrap`. On success it clears the persisted pending state.

If the unwrap request was already finalized on-chain, it clears the persisted pending state and throws [`UnshieldAlreadyFinalizedError`](errors.md#unshieldalreadyfinalizederror) instead of submitting a transaction that would revert. The funds already arrived; treat the error as completion.

```ts
const pending = await wrappedToken.getPendingUnshield();
if (pending) {
  await wrappedToken.resumeUnshield(pending);
}
```

### getPendingUnshield

`() => Promise<Hex | null>`

Returns the unwrap transaction hash of an unshield that was interrupted between its two phases, or `null` if none is pending for this wrapper. The SDK persists this automatically when `unshield()` / `unshieldAll()` submit phase 1, and clears it once phase 2 finalizes.

The SDK verifies the persisted hash on-chain before reporting it: if the unwrap request was already finalized, it clears the record and returns `null`. If the verification read fails, the hash is returned unverified; a network error never deletes recovery state.

Resuming stays caller-driven — surface a "resume" prompt and call `resumeUnshield()`, rather than finalizing on load and triggering a wallet transaction the user did not initiate.

```ts
const pending = await wrappedToken.getPendingUnshield();
if (pending) {
  await wrappedToken.resumeUnshield(pending);
}
```

## Low-Level Unwrap Primitives

Most apps should use `unshield()` or `unshieldAll()`. The low-level methods are escape hatches for custom two-phase flows.

### unwrap

`(amount: bigint) => Promise<UnwrapResult>`

Encrypts `amount` and submits the unwrap request. Finalization is not automatic. The returned `UnwrapResult` extends `TransactionResult` with the `unwrapRequestId` decoded from the `UnwrapRequested` event, so you can finalize without parsing the receipt yourself.

```ts
const { txHash, unwrapRequestId } = await wrappedToken.unwrap(500n);
```

### unwrapAll

`() => Promise<UnwrapResult>`

Submits an unwrap request for the full confidential balance using the current encrypted balance handle. Like `unwrap`, it returns the decoded `unwrapRequestId` on the result.

```ts
const { unwrapRequestId } = await wrappedToken.unwrapAll();
```

### finalizeUnwrap

`(unwrapRequestId: EncryptedValue) => Promise<TransactionResult>`

Completes an unwrap after the gateway has publicly decrypted the unwrap request. Pass the `unwrapRequestId` from the `UnwrapResult` that `unwrap` / `unwrapAll` returned.

```ts
const { unwrapRequestId } = await wrappedToken.unwrap(500n);

await wrappedToken.finalizeUnwrap(unwrapRequestId);
```

## Related

- [Token](Token.md) — base ERC-7984 confidential-token API
- [ZamaSDK](ZamaSDK.md) — creates `WrappedToken` via `createWrappedToken()`
- [Shield tokens](../../guides/shield-tokens.md) — full shield flow
- [Unshield tokens](../../guides/unshield-tokens.md) — full unshield flow
- [useWrappedToken](../react/useWrappedToken.md) — React hook returning a `WrappedToken`
