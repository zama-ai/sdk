---
title: Alpha
description: Unreleased changes on the prerelease (alpha) line — not yet in a stable release. Currently the offline-signing pipeline for institutional custody.
---

# Alpha

{% hint style="warning" %}
**Unreleased.** The changes on this page are on the prerelease (`alpha`) line and are **not yet available in a stable release**. They ship with the next stable release, at which point this page is retitled to that version and folded into the version list above. Treat everything here as a preview — details may still change before release.
{% endhint %}

## Offline signing (institutional custody)

A new `sdk.offline.*` namespace splits a transaction into two separately-invocable phases — `prepare` and `broadcast`, with signing done out-of-process in between — for institutional custody, HSM, and policy-engine workflows where the phases cannot run synchronously in a single `Promise`. Online-signer call sites are unchanged: `Token.confidentialTransfer` and friends keep their atomic path. This is a parallel route where the caller signs the prepared unsigned tx externally instead of going through `writeContract`.

```ts
const prepared = await sdk.offline.prepare({
  kind: "ConfidentialTransfer",
  from: custodyAddress,
  token,
  to: recipient,
  amount: 1_000n,
}); // → RLP-encoded unsigned tx + { from, to, chainId }

// Sign out-of-process (HSM, custody API, policy engine), then broadcast the
// returned signed bytes:
await sdk.offline.broadcast(prepared, signedTx);
```

- **Signer.** `GenericSigner.writeContract` is now optional; `prepare` and `broadcast` work with no configured signer at all, so the initiator process never needs custody of signing material. The prepared unsigned tx is signed out-of-process (HSM, custody API, policy engine) and the signed bytes handed to `broadcast`.
- **Provider.** `GenericProvider` gains `sendRawTransaction(signedTx)` and `prepareTransaction({ from, call })` (builds the RLP-encoded EIP-1559 unsigned tx), wired in the viem, ethers, and wagmi adapters.

{% hint style="info" %}
**Transactions only, for now.** The offline path covers write operations (transfer, set-operator, unwrap, the shield legs, delegation, …). Producing a decryption [permit](../concepts/permit-model.md) through a decompose-and-sign pipeline is not yet available — the permit build-and-sign is still bundled in the backend. For custody decryption today, route the permit envelope through a `BaseSigner` whose async `signTypedData` awaits your custody / policy engine, then call `sdk.permits.grantPermit(contracts)`.
{% endhint %}
