---
title: Alpha
description: Unreleased changes on the prerelease (alpha) line — not yet in a stable release.
---

# Alpha

{% hint style="warning" %}
**Unreleased.** The changes on this page are on the prerelease (`alpha`) line and are **not yet available in a stable release**. They ship with the next stable release, at which point this page is retitled to that version and folded into the version list above. Treat everything here as a preview — details may still change before release.
{% endhint %}

## Offline signing (institutional custody)

A new `sdk.offline.prepare` builds an unsigned transaction that the caller signs **and** broadcasts out-of-process — for institutional custody, HSM ceremonies, and policy-engine workflows where signing cannot run synchronously in a single `Promise`. Online-signer call sites are unchanged: `Token.confidentialTransfer` and friends keep their atomic path. This is a parallel route where the SDK hands off an RLP-encoded unsigned tx and steps out; the caller signs it externally instead of going through `writeContract`, and publishes the signed bytes through its own channel.

```ts
const prepared = await sdk.offline.prepare({
  kind: "ConfidentialTransfer",
  from: custodyAddress,
  token,
  to: recipient,
  amount: 1_000n,
}); // → { kind, from, unsignedTx } — a JSON-safe handoff

// Ship `prepared` across the process boundary (it JSON.stringify's as-is),
// then sign and broadcast out-of-process (HSM, custody API, policy engine):
const signedTx = await custody.sign(prepared.unsignedTx);
await custody.broadcast(signedTx);
```

- **Handoff.** `prepare` returns `{ kind, from, unsignedTx }` — the RLP-encoded unsigned tx plus the two fields the bytes don't yield. `chainId`, `nonce`, `to`, `value`, calldata, and the gas/fee bounds are all recoverable by RLP-decoding `unsignedTx`; `from` is carried because an _unsigned_ EIP-1559 tx has no sender field (the on-chain sender is whichever key signs the bytes), and `kind` classifies the resulting receipt's event. All three are JSON-safe, so the whole handoff crosses a process boundary as-is.
- **Signer.** The signer is optional — `prepare` works with no configured signer at all, so the initiator process never needs custody of signing material. (If you _do_ configure a signer it is still a full `GenericSigner`; custody flows simply omit it.)
- **Provider.** `GenericProvider` gains `prepareTransaction({ from, calldata })`, which resolves chain ID, nonce (`pending` block tag), gas limit, and EIP-1559 fees from chain state and returns the RLP-encoded unsigned tx. Optional `nonce`/`gasLimit`/`fees` overrides let a custodian pin its own nonce and fee values; `fees` carries `maxFeePerGas` and `maxPriorityFeePerGas` together in one object so they can only be pinned as a pair. Wired in the viem, ethers, and wagmi adapters.

Each `prepare` call produces one single-tx payload. Multi-step flows — a shield over a non-1363 underlying (`ApproveUnderlying` then `Wrap`), or the request→finalize unshield round-trip — are composed at the call site out of these primitives.

{% hint style="warning" %}
**Dependent txs must pin `nonce` and `gasLimit`.** When you prepare a second tx that depends on the first (the `Wrap` after an `ApproveUnderlying`, say) _before the first is broadcast_, two things break under the defaults: gas estimation for the second reverts because the on-chain state the first tx creates (the allowance) isn't there yet, and the nonce read returns the same value for both (see the nonce note above). Pin an explicit `nonce` (incrementing across the batch) and `gasLimit` on the dependent `prepare` calls, or broadcast and confirm each tx before preparing the next.
{% endhint %}

{% hint style="info" %}
**Transactions only, for now.** The offline path covers write operations (transfer, set-operator, unwrap, the shield legs, delegation, …). Producing a decryption [permit](../concepts/permit-model.md) through a decompose-and-sign pipeline is not yet available — the permit build-and-sign is still bundled in the backend. For custody decryption today, route the permit envelope through a `BaseSigner` whose async `signTypedData` awaits your custody / policy engine, then call `sdk.permits.grantPermit(contracts)`.
{% endhint %}
