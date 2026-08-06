---
title: Alpha
description: Unreleased changes on the prerelease (alpha) line — not yet in a stable release.
---

# Alpha

{% hint style="warning" %}
**Unreleased.** The changes on this page are on the prerelease (`alpha`) line and are **not yet available in a stable release**. They ship with the next stable release, at which point this page is retitled to that version and folded into the version list above. Treat everything here as a preview — details may still change before release.
{% endhint %}

## Offline signing (institutional custody)

A new `sdk.offline.prepare` builds an unsigned transaction that the caller signs and broadcasts out-of-process: institutional custody, HSM ceremonies, policy engines with human approval. The signer is now optional in the SDK config, so the preparing process never holds the wallet private key. Atomic call sites are unchanged; `Token.confidentialTransfer` and friends keep their online path.

```ts
const prepared = await sdk.offline.prepare({
  kind: "ConfidentialTransfer",
  from: custodyAddress,
  token,
  to: recipient,
  amount: 1_000n,
});
// { kind, from, unsignedTx } - a JSON-safe handoff to your custody platform
```

All eleven write operations are covered, including the shield legs and the two-phase unshield. See [Offline signing](../guides/offline.md) for the full guide: the handoff contract, request kinds, multi-transaction batches, and approval-delay behavior.
