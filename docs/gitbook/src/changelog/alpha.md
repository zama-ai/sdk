---
title: Alpha
description: Unreleased changes on the prerelease (alpha) line — not yet in a stable release.
---

# Alpha

{% hint style="warning" %}
**Unreleased.** The changes on this page are on the prerelease (`alpha`) line and are **not yet available in a stable release**. They ship with the next stable release, at which point this page is retitled to that version and folded into the version list above. Treat everything here as a preview — details may still change before release.
{% endhint %}

## Offline signing

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

### Decryption permits

The same offline model now covers decryption permits: `sdk.offline.preparePermit` builds the unsigned EIP-712 typed data for a permit — no signer required — and `sdk.permits.registerPermit` verifies and persists the signature a custody partner returns for it.

```ts
const prepared = await sdk.offline.preparePermit({ signer: custodyAddress, contracts: [cUSDT] });
// hand prepared.eip712 to your custody platform for eth_signTypedData_v4

await sdk.permits.registerPermit(prepared, signature);
```

One permit per call — unlike `grantPermit`, `preparePermit` never widens an existing permit or chunks over 10 contracts. See [Offline signing](../guides/offline.md#offline-permits) for the full workflow and [Offline reference](../reference/sdk/Offline.md#preparepermit) for the method signatures and typed errors.

## Transport key pair encrypted at rest

A new `transportKeyPairDerivationSecret` option on the `ZamaSDK` constructor encrypts the transport private key before it is written to storage. (This is key encryption, unrelated to token wrapping via `shield`/`unshield`.) It is for headless environments with no secure storage to delegate to: CLI tools, agents, bare-metal boxes. Omit it and nothing changes: storage stays plaintext, as before.

```ts
const sdk = new ZamaSDK(config, {
  transportKeyPairDerivationSecret: derivationSecret, // 32+ random bytes
});
```

Failures surface as a new `KeyWrappingError` (`KEY_WRAPPING_FAILED`); `hasPermit` and `hasDelegationPermit` return `false` instead of throwing it. See [Configuration](../guides/configuration.md#10-optional-wrap-the-transport-key-pair-at-rest-headless-environments) for which environments should use this and the setup, and [Security Model](../concepts/security-model.md#wrapped-at-rest-transportkeypairderivationsecret) for the mechanism, entropy requirement, and rotation.

## Automatic recovery from KMS context rotation

When a permit's KMS context is revoked on-chain, the SDK now re-grants the permit (one wallet prompt) and retries the decrypt instead of failing. No API change; existing decrypt and balance calls pick this up automatically. A new `RevokedKmsContextError` (`REVOKED_KMS_CONTEXT`) surfaces when the retry also fails, or when the re-grant itself fails (a signing failure attached as `cause`); on a failed re-grant the other permits of the scope are kept. See the [error reference](../reference/sdk/errors.md#revokedkmscontexterror) for the recovery mechanics.
