---
title: Beta
description: Unreleased changes on the prerelease (beta) line — not yet in a stable release.
---

# Beta

{% hint style="warning" %}
**Unreleased.** The changes on this page are on the prerelease (`beta`) line and are **not yet available in a stable release**. They ship with the next stable release, at which point this page is retitled to that version and folded into the version list above. Treat everything here as a preview — details may still change before release.
{% endhint %}

## Stale pending-unshield pointers self-heal

An unshield whose finalize confirmed but whose local pointer was never cleared (a closed tab, a failed storage write) used to leave a permanent "resume unshield" prompt. Every resume attempt then submitted a transaction that reverted.

The SDK now verifies the pointer on-chain. `getPendingUnshield()` clears a pointer whose unwrap request was already finalized and returns `null`. `resumeUnshield()` throws a new `UnshieldAlreadyFinalizedError` (`UNSHIELD_ALREADY_FINALIZED`) instead of broadcasting a reverting transaction, and `useResumeUnshield` refreshes the pending-unshield and balance queries when it sees this error, so the prompt disappears on its own. Treat the error as completion: the funds already arrived. No API change is required to pick this up. See the [error reference](../reference/sdk/errors.md#unshieldalreadyfinalizederror) and [Unshield tokens](../guides/unshield-tokens.md#4-handle-interrupted-unshields).
