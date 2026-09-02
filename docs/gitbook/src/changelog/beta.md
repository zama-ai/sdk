---
title: Beta
description: Unreleased changes on the prerelease (beta) line — not yet in a stable release.
---

# Beta

{% hint style="warning" %}
**Unreleased.** The changes on this page are on the prerelease (`beta`) line and are **not yet available in a stable release**. They ship with the next stable release, at which point this page is retitled to that version and folded into the version list above. Treat everything here as a preview — details may still change before release.
{% endhint %}

## Encryption runs in a Web Worker again

`web()` runs encryption in a dedicated Web Worker, as it did before the `@fhevm/sdk` migration, so encrypting a large input no longer blocks the main thread. Nothing changes in your code: `encryptValue()`, `encryptValues()`, and every `Token` method that encrypts keep the same signatures.

Three new `web()` options control it: [`offloadEncrypt`](../reference/sdk/RelayerWeb.md#offloadencrypt) picks where encryption runs (`"auto"` by default, with one `console.warn` per fallback), [`offloadWorker`](../reference/sdk/RelayerWeb.md#offloadworker) supplies your own worker source for bundlers or CSPs the built-in spawn can't reach, and [`offloadTimeouts`](../reference/sdk/RelayerWeb.md#offloadtimeouts) tunes the worker's lifecycle deadlines. Strict `offloadEncrypt: true` rejects with the new [`EncryptOffloadUnavailableError`](../reference/sdk/errors.md#encryptoffloadunavailableerror) (`ENCRYPT_OFFLOAD_UNAVAILABLE`) instead of falling back.

Apps served under a Content Security Policy need `worker-src 'self' blob:`; see the [CSP requirement](../reference/sdk/RelayerWeb.md#csp-requirement).

## Interrupted unshields no longer leave a stuck resume prompt

An unshield whose finalize confirmed but whose persisted record was never cleared (a closed tab, a failed storage write) used to leave a permanent "resume unshield" prompt. Every resume attempt then submitted a transaction that reverted.

The SDK now verifies the record on-chain. `getPendingUnshield()` clears a record whose unwrap request was already finalized and returns `null`. `resumeUnshield()` throws a new `UnshieldAlreadyFinalizedError` (`UNSHIELD_ALREADY_FINALIZED`) instead of broadcasting a reverting transaction, and `useResumeUnshield` refreshes the pending-unshield and balance queries when it sees this error, so the prompt disappears on its own. Treat the error as completion: the funds already arrived. No API change is required to pick this up. See the [error reference](../reference/sdk/errors.md#unshieldalreadyfinalizederror) and [Unshield tokens](../guides/unshield-tokens.md#4-handle-interrupted-unshields).
