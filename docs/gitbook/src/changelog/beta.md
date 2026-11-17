---
title: Beta
description: Unreleased changes on the prerelease (beta) line — not yet in a stable release.
---

# Beta

{% hint style="warning" %}
**Unreleased.** The changes on this page are on the prerelease (`beta`) line and are **not yet available in a stable release**. They ship with the next stable release, at which point this page is retitled to that version and folded into the version list above. Treat everything here as a preview — details may still change before release.
{% endhint %}

### Daemon

**Daemon traffic is identifiable in telemetry.** Relayer requests made by the SDK daemon now report `runtime=daemon` instead of `node`, plus a `client` field (`go`, `rust`, or `unknown`) with the client language. Nothing else changes: no new identifiers are sent, and `ZAMA_SDK_TELEMETRY=off` on the daemon process still disables telemetry. See [SDK usage telemetry](../guides/telemetry.md) and [Deploy in production](../native/operations/run-in-production.md#telemetry).

### Vaults

**Several batchers per vault direction.** A vault's `batchers.deposit` and `batchers.redeem` take an address, a `BatcherEntry` (`{ address, lastBatchId? }`), or a list of them. A join goes to the open batch that is dispatched next among the batchers that are not paused or closed, and `readOpenBatches` returns that batch. `VaultBatcherPausedError` is now thrown only when no batcher of a vault is open. `readBatch` no longer lists `dispatch` while the previous batch is still dispatched. `BatcherHistory` and `RetiredBatcher` are deprecated: a history still works, read as the list `[...retired, latest]`. See [Several batchers](../guides/vaults/advanced.md#several-batchers).
