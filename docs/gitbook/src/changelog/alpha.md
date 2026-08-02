---
title: Alpha
description: Unreleased changes on the prerelease (alpha) line — not yet in a stable release. Currently the offline-signing pipeline for institutional custody.
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
- **Signer.** `GenericSigner.writeContract` is now optional; `prepare` works with no configured signer at all, so the initiator process never needs custody of signing material.
- **Provider.** `GenericProvider` gains `prepareTransaction({ from, calldata })`, which resolves chain ID, nonce (`pending` block tag), gas limit, and EIP-1559 fees from chain state and returns the RLP-encoded unsigned tx. Optional `nonce`/`gasLimit`/`maxFeePerGas`/`maxPriorityFeePerGas` overrides let a custodian pin its own nonce and fee values. Wired in the viem, ethers, and wagmi adapters.

{% hint style="info" %}
**Transactions only, for now.** The offline path covers write operations (transfer, set-operator, unwrap, the shield legs, delegation, …). Producing a decryption [permit](../concepts/permit-model.md) through a decompose-and-sign pipeline is not yet available — the permit build-and-sign is still bundled in the backend. For custody decryption today, route the permit envelope through a `BaseSigner` whose async `signTypedData` awaits your custody / policy engine, then call `sdk.permits.grantPermit(contracts)`.
{% endhint %}
