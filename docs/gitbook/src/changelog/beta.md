---
title: Beta
description: Unreleased changes on the prerelease (beta) line — not yet in a stable release.
---

# Beta

{% hint style="warning" %}
**Unreleased.** The changes on this page are on the prerelease (`beta`) line and are **not yet available in a stable release**. They ship with the next stable release, at which point this page is retitled to that version and folded into the version list above. Treat everything here as a preview — details may still change before release.
{% endhint %}

## `bscTestnet` targets the real protocol

The `bscTestnet` preset (chain ID `97`) now targets the Zama protocol on BNB Smart Chain testnet through the hosted testnet relayer, like `sepolia`. Use it with `web()` or `node()` instead of `cleartext()`. The preset includes the wrappers registry address, so token discovery needs no extra configuration.

**Breaking change for the BSC cleartext deployment:** the preset no longer carries that deployment's contract addresses or `executorAddress`. To keep using it, define a custom `FheChain` with its addresses and use `cleartext()`. See [What each chain includes](../reference/sdk/network-presets.md#what-each-chain-includes).
