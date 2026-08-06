---
title: Offline signing
description: How to build unsigned transactions that are signed and broadcast out-of-process by a custody platform, HSM, or policy engine.
---

# Offline signing

`sdk.offline.prepare` builds a fully populated unsigned transaction and hands it to you. Signing and broadcasting happen out-of-process: an institutional custody platform, an HSM ceremony, a policy engine with human approval. The preparing process never holds the wallet private key.

{% hint style="info" %}
**Prefer the atomic API when you can.** If your signer can complete a signature inside one `Promise` (even a slow one that polls a custody API), implement a custom [`BaseSigner`](../reference/sdk/GenericSigner.md#implementing-a-custom-signer) and keep the one-call `Token` methods. Reach for `prepare` only when signing genuinely leaves the process.
{% endhint %}

## Steps

### 1. Configure the SDK without a signer

The signer is optional. A provider is all `prepare` needs:

```ts
import { createConfig, MemoryStorage, ZamaSDK } from "@zama-fhe/sdk";
import { sepolia } from "@zama-fhe/sdk/chains";
import { node } from "@zama-fhe/sdk/node";
import { ViemProvider } from "@zama-fhe/sdk/viem";

const sdk = new ZamaSDK(
  createConfig({
    chains: [sepolia],
    relayers: { [sepolia.id]: node() },
    provider: new ViemProvider({ publicClient }), // reads only
    storage: new MemoryStorage(),
  }),
);
```

### 2. Prepare an unsigned transaction

```ts
const prepared = await sdk.offline.prepare({
  kind: "ConfidentialTransfer",
  from: "0xCustodyWallet",
  token: "0xConfidentialToken",
  to: "0xRecipient",
  amount: 1000n,
});
// { kind: "ConfidentialTransfer", from: "0xCustodyWallet", unsignedTx: "0x02..." }
```

For a transfer, the amount is encrypted during `prepare`, including the required relayer interactions, and the calldata is ready to sign. `from` must match the address of the key that eventually signs: encrypted inputs are bound to that sender, so a mismatch reverts on-chain. The result is JSON-safe and crosses a process boundary as-is. `unsignedTx` carries the whole EIP-1559 transaction (chain id, nonce, calldata, gas and fee caps); `from` travels alongside because an unsigned transaction has no sender field and the custodian needs it to pick the signing key.

Nonce, gas, and fees are read from chain state; override them per call when you need control:

```ts
await sdk.offline.prepare(request, {
  nonce: 12,
  gasLimit: 1_000_000n,
  fees: { maxFeePerGas: 60_000_000_000n, maxPriorityFeePerGas: 1_000_000_000n },
});
```

### 3. Sign and broadcast out-of-process

The custody platform signs the prepared transaction after policy approval, preserving its nonce, gas limit, fees, and calldata. Custody platforms typically accept the unsigned payload directly and broadcast in the same call:

```ts
const txHash = await custody.signAndBroadcast(prepared.unsignedTx);
```

Some platforms also support signing without broadcasting. When that API accepts serialized transactions, it returns the serialized signed transaction for you to broadcast:

```ts
const signedTx = await custody.sign(prepared.unsignedTx);
const txHash = await publicClient.sendRawTransaction({ serializedTransaction: signedTx });
```

{% hint style="warning" %}
**Raw-signature APIs need an extra assembly step.** A raw HSM typically signs the EIP-1559 transaction digest and returns signature components, not a serialized transaction. Use your Ethereum library to compute the signing digest and insert the signature into the transaction envelope before broadcasting; do not treat the raw signature as signed transaction bytes.
{% endhint %}

Either way, watch the chain yourself: fetch the receipt for the transaction hash through your own provider, and wait for enough confirmations for your risk policy before acting on it. A receipt returned at first inclusion can still be invalidated by a reorganization, for example after you use it to prepare `FinalizeUnwrap`.

## Request kinds

Each `prepare` call produces one transaction. The `kind` selects what it builds:

| Kind                                                | Transaction               | Notes                                                                |
| --------------------------------------------------- | ------------------------- | -------------------------------------------------------------------- |
| `ConfidentialTransfer` / `ConfidentialTransferFrom` | ERC-7984 transfer         | amount encrypted during `prepare`                                    |
| `SetOperator`                                       | operator approval         | explicit `until` timestamp required                                  |
| `TransferAndCall`                                   | single-transaction shield | ERC-1363 underlyings only                                            |
| `ApproveUnderlying` + `Wrap`                        | two-transaction shield    | see the batch warning below                                          |
| `Unwrap` / `UnwrapAll`                              | unshield phase 1          | `Unwrap` encrypts the amount; `UnwrapAll` reads the on-chain balance |
| `FinalizeUnwrap`                                    | unshield phase 2          | public decryption happens during `prepare`                           |
| `DelegateDecryption` / `RevokeDelegation`           | ACL delegation            | explicit expiry, or omit for permanent                               |

## Multi-transaction flows

`WrappedToken.shield()` and `WrappedToken.unshield()` need a live signer, so offline workflows compose their underlying steps with `prepare`: `TransferAndCall` or `ApproveUnderlying` then `Wrap` for shielding, and `Unwrap` then `FinalizeUnwrap` for unshielding. Offline workflows are one of the few places where composing below the `Token` API is correct.

**Shield** mirrors the [shielding paths](./shield-tokens.md#shielding-paths): one `TransferAndCall` for ERC-1363 underlyings, otherwise `ApproveUnderlying` then `Wrap`. Check which path applies with `await wrappedToken.isPayable()`; this provider-only read does not require a signer.

{% hint style="warning" %}
**Dependent transactions must pin `nonce` and `gasLimit`.** Prepared before the first transaction mines, the second one hits two defaults that break: gas estimation reverts (the allowance does not exist yet) and the nonce read returns the same value twice. Pin both, or confirm each transaction before preparing the next. On the two-transaction path, some underlyings such as USDT require resetting a non-zero allowance first with an `ApproveUnderlying` of `0n` (a third pinned-nonce transaction).
{% endhint %}

```ts
const nonce = await publicClient.getTransactionCount({ address: from, blockTag: "pending" });

const approve = await sdk.offline.prepare(
  { kind: "ApproveUnderlying", from, underlying, spender: wrapper, amount },
  { nonce },
);
const wrap = await sdk.offline.prepare(
  { kind: "Wrap", from, wrapper, to: from, amount },
  { nonce: nonce + 1, gasLimit: 1_000_000n },
);
```

**Unshield** is the request-then-finalize round-trip. The finalize input comes from the phase-1 receipt:

```ts
import { findUnwrapRequested } from "@zama-fhe/sdk";

const unwrap = await sdk.offline.prepare({
  kind: "Unwrap",
  from,
  token: wrapper,
  to: from,
  amount,
});
// sign, broadcast, fetch the receipt, then:
const event = findUnwrapRequested(receipt.logs);
if (!event) throw new Error("No UnwrapRequested event in receipt");
// Persist event.unwrapRequestId now; offline unshield state is not tracked for you.

const finalize = await sdk.offline.prepare({
  kind: "FinalizeUnwrap",
  from,
  wrapper,
  unwrapRequestIdOrAmount: event.unwrapRequestId,
});
```

Neither phase requires a separate wallet signature: both perform the required relayer interactions during `prepare`.

## Approval delays

Policy approval can take hours or days. The cryptographic proofs tolerate that, but the transaction still depends on chain state:

- The input proof (`Unwrap`) and the public decryption proof (`FinalizeUnwrap`) embedded in the calldata have no on-chain expiry. Only rebroadcasting the same signed bytes is safe without further checks. A duplicate `FinalizeUnwrap` reverts instead of paying twice, but re-preparing any other kind (including `Unwrap`) with a fresh nonce creates a new transaction; confirm the original never landed first.
- The nonce can become stale if another transaction from the same wallet is mined first. Reserve or otherwise coordinate nonces across concurrent workflows, and re-prepare if the nonce is consumed.
- Contract state can change while approval is pending, and explicit timestamps such as `SetOperator.until` or a delegation expiry keep advancing. Re-prepare when the transaction's assumptions no longer hold.
- The fee cap can fall below the base fee. Add suitable headroom to `maxFeePerGas`; only the base fee plus priority tip is charged, so unused cap headroom costs nothing. Keep `maxPriorityFeePerGas` at an appropriate tip because raising it can increase the amount paid.

{% hint style="info" %}
**Transactions only, for now.** Producing a decryption [permit](../concepts/permit-model.md) offline is not yet available. In the meantime, route permits through a `BaseSigner` whose `signTypedData` awaits your custody API, then call `sdk.permits.grantPermit(contracts)`.
{% endhint %}

## Next steps

- [Offline reference](../reference/sdk/Offline.md) -- full `prepare` signature, request kinds, and options
- [Shield tokens](./shield-tokens.md) -- the atomic shield flow and routing table
- [Unshield tokens](./unshield-tokens.md) -- the atomic two-phase unshield
- [Node.js backend](./node-js-backend.md) -- server-side setup and custom signers
