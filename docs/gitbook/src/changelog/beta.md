---
title: Beta
description: Unreleased changes on the prerelease (beta) line — not yet in a stable release.
---

# Beta

{% hint style="warning" %}
**Unreleased.** The changes on this page are on the prerelease (`beta`) line and are **not yet available in a stable release**. They ship with the next stable release, at which point this page is retitled to that version and folded into the version list above. Treat everything here as a preview — details may still change before release.
{% endhint %}

### Unshield

**Interrupted unshields stay recoverable.** The SDK now saves the unwrap transaction hash as soon as the wallet returns it, instead of after the receipt, and keeps one entry per unshield, so a second unshield on the same token no longer overwrites the first. `getPendingUnshield()` / `usePendingUnshield` return the oldest pending one; after resuming it, the next one is returned. An entry whose unwrap reverted is cleared instead of being reported. See [Unshield tokens](../guides/unshield-tokens.md#4-handle-interrupted-unshields).

### Daemon

**Daemon traffic is identifiable in telemetry.** Relayer requests made by the SDK daemon now report `runtime=daemon` instead of `node`, plus a `client` field (`go`, `rust`, or `unknown`) with the client language. Nothing else changes: no new identifiers are sent, and `ZAMA_SDK_TELEMETRY=off` on the daemon process still disables telemetry. See [SDK usage telemetry](../guides/telemetry.md) and [Deploy in production](../native/operations/run-in-production.md#telemetry).
