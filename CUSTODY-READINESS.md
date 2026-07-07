# Zama SDK — Custody / Institutional Readiness Requirements

## Purpose

This document lists the SDK capabilities we require before we consider `@zama-fhe/sdk`
ready for an institutional / custody integration. The common thread is a
**two-signing-session, server-side custody model**: the signer lives in a hardened
vault (HSM / MPC), signing happens out-of-band (not in a browser, often not even in
the same process), transactions are published through our own infrastructure, and any
operation that today assumes a single interactive wallet session must be splittable
into discrete, independently-signable steps.

Each requirement below has a rationale, concrete **acceptance criteria** (the
definition of done we hold the SDK to), and the **current status**.

> **Baseline assessed:** the currently checked-out branch
> **`feature/sdk-replace-relayer-with-fhevm-sdk`** (the in-flight @fhevm/sdk migration,
> PR #458) — **not** `prerelease`. That branch differs substantially from `prerelease`
> (~161 files; the relayer→@fhevm/sdk migration). Re-verify against the release line you
> actually intend to ship on.

## Summary

| #   | Capability                                     | Status (vs `feature/sdk-replace-relayer-with-fhevm-sdk`)                                 |
| --- | ---------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 1   | Offline signing flow                           | 🟡 Partial — signer abstraction exists; full detached flow in progress                   |
| 2   | View-key storage in our own (encrypted) vault  | 🟢 Ready — pluggable storage                                                             |
| 3   | Publishing transactions via our own RPC        | 🟢 Ready — configurable transport/provider                                               |
| 4   | Explicit view-key activation API               | 🟢 Ready — `permits.grantPermit()` (idempotent); reads still auto-grant, no strict guard |
| 5   | Unbundle shield (separate approve + wrap)      | 🟡 Partial — approval separable; standalone `wrap()` in flight                           |
| 6   | Unbundle unshield (separate unwrap + finalize) | 🔴 Missing — needs SDK split and/or protocol support                                     |

Legend: 🟢 Ready · 🟡 Partial · 🔴 Missing.

---

## 1. Offline signing flow

**Requirement.** The SDK must let us produce the exact payload that needs signing
(EIP-712 typed data for view-key permits, and raw transactions for on-chain actions),
hand it to an external signer (vault/HSM/MPC), and feed the resulting signature back —
without the SDK ever holding a private key or assuming an interactive `window`-based
wallet.

**Rationale.** In custody, keys never leave the vault and signing is asynchronous.
The SDK cannot be the thing that "pops a wallet"; it must be a payload producer and a
signature consumer.

**Acceptance criteria.**

- A signer can be implemented against a stable public interface without a browser
  wallet (e.g. custom class extending `BaseSigner` / implementing `GenericSigner`).
- For view-key permits: the SDK can emit the EIP-712 typed-data payload for external
  signing and accept the returned signature to reconstruct the permit — i.e. the
  permit grant is separable from signature production.
- For transactions: the SDK can build the unsigned transaction request so we sign and
  broadcast it ourselves (see #3), rather than requiring `signer.sendTransaction`.
- No code path requires an interactive prompt or in-process key material.

**Current status — 🟡 Partial.** The signer adapter layer exists
(`BaseSigner`, `GenericSigner`, with `EthersSigner` / `ViemSigner` reference
implementations), so a vault-backed signer is implementable today. A fully detached
offline flow — extract signable payload → sign elsewhere → return signature, for both
permits and transactions — is not yet a first-class, documented API. This is the main
gap in this item and is tracked internally as the offline-signing workstream.

---

## 2. Storing & retrieving view keys from our own (encrypted) vault

**Requirement.** The generated view keypair and signed permits must be persistable to
storage we control, so we can hold them encrypted at rest in our vault and rehydrate
them on demand — rather than the SDK deciding they live in browser IndexedDB.

**Rationale.** View keys are sensitive material. We must own their encryption,
lifecycle, and location for compliance.

**Acceptance criteria.**

- A storage backend is injectable via configuration (a `GenericStorage`-shaped
  `get`/`set`/`remove` interface) and is used for both the keypair and the permits.
- Permit storage is addressable independently of general storage, so we can route it
  to a dedicated encrypted store.
- The SDK never silently falls back to a persistent browser store when we've supplied
  our own backend.
- Round-trip works: persist from one process/session, rehydrate in another, and
  decrypt/use without regeneration.

**Current status — 🟢 Ready.** `createConfig` accepts `storage` and a separate
`permitStorage` (both `GenericStorage`); built-ins are `memoryStorage` and
`IndexedDBStorage`, but any custom backend (our encrypted vault adapter) can be
supplied. This satisfies the requirement; we implement the `GenericStorage` adapter
over our vault.

---

## 3. Publishing transactions using our own RPC

**Requirement.** All on-chain reads and transaction broadcasts must go through an RPC
endpoint we configure, not a wallet-provided or SDK-default endpoint.

**Rationale.** We run our own nodes / RPC providers for reliability, rate limits, and
compliance. Broadcasting is our infrastructure's job.

**Acceptance criteria.**

- The RPC/transport (for reads and the relayer) is configurable per chain at
  construction time.
- We can obtain the built (unsigned) transaction and broadcast it via our own client,
  or point the SDK's transport at our RPC — our choice, no hard-coded endpoints.
- Chain reads (balances, receipts, ACL) honor the same configured RPC.

**Current status — 🟢 Ready.** `createConfig` takes explicit transports/providers
(web and node entry points; ethers `createConfig` requires a provider-backed signer),
with per-chain relayer resolution. Own-RPC is a supported, first-class configuration.
Pairs with #1 (build-and-broadcast-yourself) for full custody control.

---

## 4. Explicit view-key activation API

**Requirement.** A dedicated, callable API to activate (generate keypair + grant the
permit) on demand — decoupled from any read operation — so activation happens when we
choose, not as a side effect of the first `balanceOf` / decrypt.

**Rationale.** Activation triggers a signing session (permit grant). In custody that
session is scheduled and audited; it must never be triggered implicitly by a read. We
want to run it once, explicitly, and then perform many reads without further prompts.

**Acceptance criteria.**

- A public method exists whose sole job is to establish the view-key credential
  (transport key pair + signed EIP-712 permit) and persist it (see #2). ✅
- After explicit activation, subsequent reads use the stored credential with no
  additional signing. ✅ (permit grant is idempotent)
- _(Stretch)_ A strict mode where a balance/decrypt against an unactivated account
  fails fast rather than implicitly triggering a signature.

**Current status — 🟢 Ready (with one nuance).** The explicit API is
`sdk.permits.grantPermit(contracts)` (and `grantDelegationPermit(delegator, contracts)`):
it signs and stores the EIP-712 decryption permit on demand, generating the transport
key pair as needed, and is **idempotent** — calling it when a covering permit already
exists is a no-op with no signature prompt. We call it once, explicitly, whenever we
schedule the signing session; afterwards reads are signature-free.

Note the distinction: `sdk.permits.warmTransportKeyPair()` is **not** activation — it is
a best-effort prefetch of the ML-KEM _transport_ key pair (a latency optimization;
"invisible plumbing" per the SDK, no signature). The signing/authorization is
`grantPermit`.

The one nuance vs. a literal "not on first `balanceOf`" reading: the decrypt path
(and `Token.balanceOf`) also calls `grantPermit` **implicitly** when no permit is
present, so a read against an unactivated account _would_ trigger the signature rather
than error. Because the grant is idempotent, pre-activating with `grantPermit` fully
avoids this — reads never re-sign. If we require reads to hard-fail instead of
auto-activating (a strict "no implicit signing" guard), that is a small SDK
enhancement, not a missing capability.

---

## 5. Unbundle shield — separate token approval and wrap (two signatures)

**Requirement.** The public ERC-20 → confidential shield flow must be splittable into
its two on-chain steps — (a) approve the wrapper to spend the underlying, and
(b) wrap — so each can be signed in a separate signing session.

**Rationale.** `shield()` today may perform approve + wrap as one orchestrated call
assuming a single session. Custody needs each transaction signed and broadcast
independently.

**Acceptance criteria.**

- A standalone approval call exists (`approveUnderlying`) that produces just the
  approval transaction.
- A standalone `wrap()` call exists that produces just the wrap transaction, assuming
  allowance is already in place, and fails fast with a clear error if it is not.
- Neither step assumes the other happened in the same session; both are usable purely
  as transaction producers (see #1/#3).
- The bundled `shield()` remains available for interactive callers, unchanged.

**Current status — 🟡 Partial.** `WrappedToken.approveUnderlying()` already exposes the
approval step standalone. A public standalone `WrappedToken.wrap()` (plus a `useWrap`
hook) is implemented on the in-flight unbundle branch (PR #521) but is **not yet merged
to `prerelease`**. Once that lands, this item is satisfied for the two-signature model.

---

## 6. Unbundle unshield — separate unwrap and finalize (two sessions)

**Requirement.** The confidential → public ERC-20 unshield flow must be splittable into
its two phases — (a) request the unwrap, and (b) finalize the unwrap — so each is
signed in a separate session. Because finalize needs the request's `requestId`, we must
be able to obtain that id **between** sessions.

**Rationale.** Unshield is inherently two-phase (request, then finalize after the
protocol processes it). The bundled `unshield()` assumes one continuous session that
holds the `requestId` in memory. In custody, the two phases can be hours apart and run
in different processes, so the `requestId` must be recoverable from durable state or
the chain — it cannot live only in a JS variable.

**Acceptance criteria (minimum).**

- A standalone request-unwrap call that produces just the request transaction.
- A standalone finalize call that accepts a `requestId` we supply.
- A supported way to obtain the `requestId` for a pending unwrap **from the chain**
  (e.g. read it from the request transaction's receipt / emitted event), so a second,
  independent session can finalize without in-memory state from the first.

**Acceptance criteria (preferred — needs protocol support).**

- Either the protocol exposes a **deterministic `requestId` computable up front** (from
  known inputs, before the request is mined), so both transactions can be prepared and
  signed together in a single session; **or**
- the protocol merges request + finalize into a **single transaction**, eliminating the
  two-phase split entirely.

**Current status — 🔴 Missing.** `WrappedToken.unwrap()` exists but the two-phase split
with an SDK-supported, chain-read `requestId` is not exposed on `prerelease`; the
non-deterministic `requestId` is the blocker for signing both phases together. A
read-helper design (obtain the pending unwrap's `requestId` from chain for a second
session) has been scoped. The preferred single-session / single-tx outcome depends on a
**protocol-level change** (deterministic `requestId` or merged transaction) and is an
open dependency on the fhEVM protocol team, not solvable in the SDK alone.

---

## Cross-cutting note: the two-signing-session model

Requirements 1, 3, 5, and 6 are facets of one need: **every signable action must be
expressible as "build payload → sign externally → broadcast externally," and any
multi-transaction flow must be splittable into independently-signable steps.** Items 2
and 4 make the _view-key_ lifecycle fit the same model — owned storage and explicit,
scheduled activation. Item 6's "preferred" path is the only one that reaches outside
the SDK into the protocol; everything else is achievable at the SDK layer.
