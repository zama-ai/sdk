---
title: Beta
description: Unreleased changes on the prerelease (beta) line — not yet in a stable release.
---

# Beta

{% hint style="warning" %}
**Unreleased.** The changes on this page are on the prerelease (`beta`) line and are **not yet available in a stable release**. They ship with the next stable release, at which point this page is retitled to that version and folded into the version list above. Treat everything here as a preview — details may still change before release.
{% endhint %}

## Permit signatures with a 0/1 recovery byte

`parseSignedDecryptionPermit` (and `sdk.permits.registerPermit`, which uses it) now accepts 65-byte permit signatures whose recovery byte is `0`/`1` as well as `27`/`28`. The SDK normalizes the byte before the permit is verified; signatures already in `27`/`28` form and longer ERC-1271 signatures are unchanged.
