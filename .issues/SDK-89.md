# SDK-89: [EPIC] Credentials system re-implementation

| Field         | Value                                                                           |
| ------------- | ------------------------------------------------------------------------------- |
| **URL**       | https://linear.app/zama/issue/SDK-89/epic-credentials-system-re-implementation  |
| **Status**    | Backlog                                                                         |
| **Priority**  | Medium                                                                          |
| **Labels**    | epic                                                                            |
| **Assignee**  | mathieu.saugier@zama.ai                                                         |
| **Project**   | Zama SDK General Availability (GA)                                              |
| **Milestone** | Zama SDK Public Beta                                                            |
| **Created**   | 2026-04-15                                                                      |
| **Relations** | Related to [SDK-60](SDK-60): `isAllowed()` returns true when keypair is expired |

## Sub-issues

| ID                    | Title                                                                                    | Status                | Labels        | Blocked by                         |
| --------------------- | ---------------------------------------------------------------------------------------- | --------------------- | ------------- | ---------------------------------- |
| [SDK-134](SDK-134.md) | refactor(credentials): replace credentials model with keypair vault + permission store   | Backlog               | Feature       | —                                  |
| [SDK-135](SDK-135.md) | feat(credentials): optional derivationSecret wrapping for at-rest private key protection | Backlog               | Feature       | —                                  |
| [SDK-136](SDK-136.md) | feat(credentials): widen permits on overlap                                              | Backlog               | Improvement   | SDK-134                            |
| [SDK-137](SDK-137.md) | feat(credentials): recover from KMS context rotation on userDecrypt                      | Backlog               | Improvement   | SDK-134                            |
| [SDK-138](SDK-138.md) | feat(credentials): persist keypair and permissions across reloads                        | Duplicate (Cancelled) | Feature       | —                                  |
| [SDK-139](SDK-139.md) | docs(credentials): update credentials API documentation and examples                     | Backlog               | Documentation | SDK-134, SDK-135, SDK-136, SDK-137 |

---

## Background — Credentials in the Zama Protocol

To decrypt a confidential value on an FHE-enabled EVM chain, a wallet must present **credentials** to the KMS (a threshold MPC cluster). Two pieces of material are involved:

**An ML-KEM ephemeral keypair.** The SDK generates a post-quantum keypair whose public key is used to return the re-encrypted shares. The KMS encrypts each share under this public key; only the holder of the private key can combine and decrypt them locally. A keypair is **per wallet identity** — it has no inherent tie to any chain or contract.

**Permits.** A permit is an EIP-712 message signed by the user's wallet. It binds:

- the keypair's public key,
- a set of contract addresses (max 10 per the protocol),
- a validity window (`startTimestamp` + `durationDays`, max 365 days),
- a chain ID (via the EIP-712 domain),
- `extraData` carrying the current KMS context (`contextId` + `epochId`).

When the SDK asks the relayer to decrypt a handle, it sends the permit alongside the request. The KMS verifies the permit signature, checks the on-chain ACL, and — if everything passes — returns re-encrypted shares. The private key never leaves the client.

**Delegation.** A delegated decryption works identically, except the signer (delegate) is not the handle owner. The owner must have registered the delegation on-chain via the ACL. The KMS verifies this entry before releasing shares. From the credential system's perspective, delegation adds one axis — a `delegatorAddress` — but the keypair and permit mechanics are unchanged.

**What this means for the SDK.** The credential layer must manage two things with different lifetimes and scopes: a long-lived keypair (identity-scoped, chain-independent) and short-lived permits (chain-scoped, contract-scoped, bound to a keypair). Getting this separation right is the entire point of this epic.

---

## What's Wrong Today

The current implementation fuses the keypair, a single permit, and the session signature into one `(signer, chainId)` blob. Three structural consequences follow:

**1-to-1 keypair <-> permit coupling.** The model supports exactly one set of signed contracts per `(signer, chainId)`. When an app needs more than 10 contracts (the protocol cap), or two disjoint contract sets must be authorized independently, the system cannot represent it. It silently forces a re-sign of the merged union or narrows the set, breaking the other consumer.

**The permit doubles as the encryption key for the private key at rest.** The EIP-712 signature is fed into PBKDF2 to derive an AES key that encrypts the ML-KEM private key in storage. This means revoking consent (deleting the permit) orphans the persisted keypair — it can no longer be decrypted. Re-issuing consent forces a wallet prompt whose sole purpose is to re-derive the AES key. The state machine must then handle "ciphertext exists but no signature to decrypt it" — a state that shouldn't exist. Worse, the PBKDF2 input (the session signature) is stored right alongside the encrypted data — lock and key in the same drawer, providing no real security.

**Identity scoping is wrong.** The keypair is stored per `(signer, chainId)`, but the protocol treats it as per-signer only. Switching chains generates a new keypair when the old one should have been preserved. Meanwhile, the delegated flow lives in a parallel class (`DelegatedCredentialsManager`) with its own storage keys and its own state machine, kept in sync manually.

These aren't independent bugs — they're consequences of a single model mismatch. The protocol treats keypairs and permits as orthogonal concerns; the SDK merges them. No incremental patch fixes this without first restoring the separation.

---

## Acceptance Criteria

When this epic is complete, the following must all be true:

- [ ] **Keypairs are identity-scoped, not chain-scoped.** A signer's keypair survives chain switches. Switching from chain A to chain B and back does not generate a new keypair or trigger a wallet prompt.
- [ ] **Multiple permits per (signer, chain).** An app that needs more than 10 authorized contracts can hold multiple permits, each covering a disjoint subset. The 10-contract protocol cap is per-permit, not per-session.
- [ ] **Revoking a permit never orphans the keypair.** The keypair and permits have independent lifecycles. Revoking all permits for a contract (or all contracts) leaves the keypair intact; the next `allow()` re-prompts for permits only.
- [ ] **Delegated and direct decryption share one code path.** No parallel manager class, no separate storage keys, no manual sync. Delegation is expressed as a field on the permission scope, not a fork in the architecture.
- [ ] **Credentials persist across page reloads.** A user who has already approved permits is not re-prompted after a page refresh or app restart.
- [ ] **Partial `allow()` success is preserved.** If the user approves 2 of 3 needed permits and rejects the third, the first two remain in the store. The next call only re-prompts for uncovered contracts.
- [ ] **No fake at-rest encryption.** The private key is never "encrypted" with key material stored alongside it. At-rest protection is either genuinely delegated to the storage backend, or provided via an explicit consumer-supplied secret.
- [ ] **KMS context rotation is recoverable.** When a permit is rejected because the KMS context has rotated, the SDK invalidates the stale permit, re-prompts once, and retries — rather than surfacing an opaque error.
- [ ] **Permit widening minimizes wallet prompts.** When a new contract can be added to an existing permit without exceeding the 10-contract cap, the SDK widens the existing permit rather than creating a new one.
- [ ] **Public API and documentation are coherent.** The docs site, READMEs, and example apps reflect the shipped behavior. No references to removed types or old config keys survive.

---

## Success Metrics

| Metric                                                                                                                                                      | Target                                        |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Wallet re-prompts on page reload                                                                                                                            | Zero (credentials restored from storage)      |
| Max contracts authorizable per (signer, chain)                                                                                                              | Unlimited (chunked into permits of ≤10)       |
| Code paths for delegated vs. direct decryption                                                                                                              | One (unified)                                 |
| Old credential types fully removed (`CredentialsManager`, `DelegatedCredentialsManager`, `StoredCredentials`, `keypairTTL`, `sessionTTL`, `sessionStorage`) | All deleted                                   |
| KMS context rotation: user-visible behavior                                                                                                                 | At most one extra wallet prompt, then success |

---

## Non-Goals

These are explicitly out of scope for this epic:

- **Storage-free / seeded keypair mode.** Deriving the keypair deterministically from a seed (eliminating the need for persistent storage) requires the relayer WASM to expose `ml_kem_pke_keygen_from_seed()`. Tracked separately if/when the relayer ships it.
- **Permission wrapping / encryption.** Permits contain only EIP-712 signatures (public data) and contract addresses. Encrypting them adds complexity without security benefit.
- **React hook API changes.** The hooks already call through the SDK's public surface. This epic changes the internals; the hook layer adapts transparently.
- **Better-than-plaintext SDK-layer encryption by default.** The SDK delegates at-rest security to the storage backend. The optional `derivationSecret` (SDK-135) covers headless contexts; beyond that, the consumer is responsible for choosing a secure storage implementation.

---

## Assumptions & Dependencies

| Assumption                                                   | Impact if wrong                                                         |
| ------------------------------------------------------------ | ----------------------------------------------------------------------- |
| `GenericStorage` interface is stable and sufficient          | Would need storage interface changes before starting                    |
| Relayer WASM provides keypair generation (`generateKeypair`) | Cannot generate ML-KEM keypairs without it                              |
| Relayer provides EIP-712 typed data creation for permits     | Cannot construct permits without it                                     |
| Protocol's 10-contract-per-permit cap is fixed               | Permit chunking logic would need revision                               |
| Protocol's 365-day max validity window is fixed              | Duration validation would need revision                                 |
| KMS context rotation produces a distinguishable error type   | SDK-137 recovery depends on detecting stale-context errors specifically |
| EIP-712 domain includes `chainId`                            | Permits are inherently chain-scoped; this is a protocol invariant       |

---

## Decomposition

The sub-issues are ordered by dependency, not by priority:

1. **[SDK-134](SDK-134.md) — Foundation.** Replace the credentials model with the correct shape: identity-scoped keypair vault, chain-scoped 1-to-many permission store, unified delegation. Persistent from day one. This is the only sub-issue that touches every layer; all others are additive.

2. **[SDK-135](SDK-135.md) — derivationSecret wrapping.** Optional at-rest protection for headless contexts. Additive to the vault; no interface changes.

3. **[SDK-136](SDK-136.md) — Permit widening.** Optimization to minimize wallet prompts by widening existing permits instead of creating new ones. Additive to the `allow()` planning step. Blocked by SDK-134.

4. **[SDK-137](SDK-137.md) — KMS context recovery.** Automatic retry when a permit is rejected due to stale KMS context. Additive to the `userDecrypt` orchestration. Blocked by SDK-134.

5. **[SDK-139](SDK-139.md) — Documentation.** Single coherent pass over all consumer-facing docs. Blocked by all implementation sub-issues.

[SDK-138](SDK-138.md) (persistence) was absorbed into SDK-134 — persistence ships with the foundation rather than as a separate step.
