---
title: Alpha
description: Unreleased changes on the prerelease (alpha) line — not yet in a stable release.
---

# Alpha

{% hint style="warning" %}
**Unreleased.** The changes on this page are on the prerelease (`alpha`) line and are **not yet available in a stable release**. They ship with the next stable release, at which point this page is retitled to that version and folded into the version list above. Treat everything here as a preview — details may still change before release.
{% endhint %}

## Reverted the unintended `@fhevm/sdk` upgrade

3.5.1 pins `@fhevm/sdk` back to the stable `0.13.2`, reverting the accidental `0.14.1-0` bump that shipped in 3.5.0. No SDK API changes — upgrade from 3.5.0 to restore the intended dependency.
