# Low-level SDK migration & decrypt terminology

**Status:** Updated 2026-06-04. Two separate tracks, two separate decisions:

1. **Swapping the low-level dependency** (`@zama-fhe/relayer-sdk` → `@fhevm/sdk@1.x`) — **parked.**
   It is a re-architecture, not a bump. Revisit at a future network upgrade. (Finding 1 below.)
2. **Aligning our public decrypt wording** to the Zama glossary — **done** on branch
   `align/decrypt-glossary` as a plain **rename, no back-compat aliases**. Covers: glossary names
   (no `userDecrypt`/`publicDecrypt`), the **single-entrypoint** decision (`decryptValues`, dropping the
   `FromPairs` suffix), and **handle → encryptedValue** terminology. **Not flagged as a breaking
   change**: we're still in the `3.x` prerelease/alpha line, so it's absorbed there without a major bump
   (no `!`/`BREAKING CHANGE:`). (Finding 2 below.)

Internal feedback that set this split: _"going from relayer-sdk to fhevm/sdk is not in scope for now
until future network upgrades. However, aligning on a single public glossary is something we can do
already to be consistent across all products — just updating our public APIs."_

## Finding 1 — the dependency swap is a rewrite, not a bump (PARKED)

- We consume `@zama-fhe/relayer-sdk@~0.4.3` (the legacy low-level SDK).
- `@fhevm/sdk` is the **rebrand** of that SDK. `1.1.0-alpha.2` exists (line already at `1.1.0-alpha.4`;
  there is **no stable `1.x`** — dist-tag `latest` is the placeholder `0.0.1`, `alpha` is the live line).
- The Slack changelog ("breaking renames", `moduleVersions`, `extraData` fix) only describes the
  **`1.1.0-alpha.1 → alpha.2` delta** — hence the "it's just renaming" impression. That is true only
  _between those two alphas_, not relative to our `0.4.3` baseline.
- Between `0.4.3` and `1.x` the architecture was **entirely refactored**:

  |          | We consume (`relayer-sdk@0.4.3`)                      | `@fhevm/sdk@1.1.0-alpha.4`                                                      |
  | -------- | ----------------------------------------------------- | ------------------------------------------------------------------------------- |
  | Model    | `createInstance()` → global `FhevmInstance`           | viem/ethers client + decorators/actions (`createFhevmClient`, `decryptActions`) |
  | Decrypt  | `instance.userDecrypt()` / `instance.publicDecrypt()` | `decryptValue` / `decryptValues` / `decryptValuesFromPairs`                     |
  | Subpaths | `/bundle`, `/node`, `/web`                            | `./viem`, `./ethers`, `./actions/*`, `./base`, `./chains`, `./types`            |
  | Init     | `initSDK()`                                           | `initFhevmRuntime()` + `runtimeConfig` (`moduleVersions` lives here)            |

- Blast radius if we ever migrate: **~15 source files** import the low-level SDK; **~4,850 LOC**
  across `packages/sdk/src/relayer/` (~2,664) + `packages/sdk/src/worker/` (~2,190) are built on the
  old `createInstance`/`FhevmInstance` model. Plus `@fhevm/mock-utils@0.4.2` (test infra) is tied to
  the old line and would need a 1.x-compatible equivalent.
- **Verdict:** multi-week re-architecture against a moving alpha target. Do not attempt as a "bump".
  Re-evaluation trigger: a network upgrade that requires `@fhevm/sdk@1.x`, ideally once it is stable.

## Finding 2 — decrypt wording alignment (DONE, plain rename in prerelease)

Reference sources (reconciled 2026-06-04):

- **fhevm `GLOSSARY.md`** (PRs [zama-ai/fhevm#2478](https://github.com/zama-ai/fhevm/pull/2478) +
  [#2729](https://github.com/zama-ai/fhevm/pull/2729), treated as the up-to-date source even pre-merge)
  — public-decrypt is `decryptPublicValue` / `decryptPublicValues` / `decryptPublicValuesWithSignatures`
  (the Notion export's `readPublicValue` proposal is **superseded** — do not use it). `EncryptedValue`
  is canonical; **"handle" is deprecated** (kept only as a secondary `FHE.sol` alias).
- **`@fhevm/sdk@1.1.0-alpha.4`** user-decrypt family: `decryptValue` / `decryptValues` /
  `decryptValuesFromPairs`.
- **Internal decision (Slack):** the zama-sdk exposes a **single** user-decrypt entrypoint, so the
  `fromPairs` suffix is "not relevant nor wanted" — name it just **`decryptValues`** (takes one or more
  pairs). We intentionally diverge from fhevm's three-way split.
- **handle → encryptedValue** (zama-sdk [PR #394](https://github.com/zama-ai/sdk/pull/394), commit
  `d22637f`): `EncryptedValue` / "encrypted value" is the canonical external term across the SDK.

Strategy: the new name is the **only** export — old names are **removed** with no back-compat alias.
Our own callers + tests + docs are migrated; `examples/` use the high-level `Token` API and are
unaffected. **Not flagged as a breaking change** — we're in the `3.x` prerelease/alpha line, so the
commit stays `refactor(sdk):` (no `!`, no `BREAKING CHANGE:` footer) and semantic-release keeps it on
the alpha channel without a major bump.

### Applied mapping (old name **removed**, migrate to new)

| Old (removed)                             | New canonical name                              | Surface               |
| ----------------------------------------- | ----------------------------------------------- | --------------------- |
| `Decryption.userDecrypt()`                | `Decryption.decryptValues()`                    | `@zama-fhe/sdk`       |
| `Decryption.publicDecrypt()`              | `Decryption.decryptPublicValues()`              | `@zama-fhe/sdk`       |
| `Decryption.delegatedDecrypt()`           | `Decryption.delegatedDecryptValues()`           | `@zama-fhe/sdk`       |
| `Decryption.delegatedBatchDecrypt()`      | `Decryption.delegatedBatchDecryptValues()`      | `@zama-fhe/sdk`       |
| `UserDecryptParams`                       | `DecryptValuesParams`                           | type                  |
| `PublicDecryptResult`                     | `DecryptPublicValuesResult`                     | type                  |
| `DelegatedUserDecryptParams`              | `DelegatedDecryptValuesParams`                  | type                  |
| `KmsDelegatedUserDecryptEIP712Type`       | `KmsDelegatedDecryptEIP712Type`                 | type                  |
| `DecryptHandle`                           | `DecryptInput`                                  | type                  |
| `BatchDecryptHandleItem`                  | `BatchDecryptItem`                              | type                  |
| `BatchDecryptHandlesResult`               | `BatchDecryptResult`                            | type                  |
| `ZERO_HANDLE` / `isZeroHandle`            | `ZERO_ENCRYPTED_VALUE` / `isZeroEncryptedValue` | value/fn              |
| `useUserDecrypt` / `UseUserDecryptResult` | `useDecryptValues` / `UseDecryptValuesResult`   | `@zama-fhe/react-sdk` |
| `usePublicDecrypt`                        | `useDecryptPublicValues`                        | `@zama-fhe/react-sdk` |
| `useDelegatedDecrypt`                     | `useDelegatedDecryptValues`                     | `@zama-fhe/react-sdk` |

> Note: an earlier iteration of this PR shipped the user-decrypt method as `decryptValuesFromPairs`
> (and `delegated*ValuesFromPairs`); the single-entrypoint decision then dropped the `FromPairs` suffix.

### Deliberately NOT renamed

- **`handle` where it is the on-chain / Solidity term** — kept (the glossary confirms "handle" is the
  `FHE.sol`/whitepaper term): `isHandleDelegatedContract` (mirrors Solidity
  `isHandleDelegatedForUserDecryption`), the KMS EIP-712 field `ctHandles`
  (`CiphertextVerification(bytes32[] ctHandles,…)`).
- **Delegation-for-user-decryption family** (`DelegatedForUserDecryptionEvent`,
  `decodeDelegatedForUserDecryption`, `delegateForUserDecryptionContract`, …) — mirror on-chain ACL
  Solidity event names (`Solidity-mirror` convention).
- **`encrypt`-side `handle` terms** (`EncryptResult.handles`, etc.) — owned by PR #394, out of scope here.
- **Token-flavoured / delegation hooks** (`useDecryptBalanceAs`, `useBatchDecryptBalancesAs`,
  `useDelegateDecryption`) — domain hooks, already well-named.
- **Internal layers** (`packages/sdk/src/query/`, `services/decryption-service.ts` incl. its internal
  `delegatedBatchDecryptHandlesAs` method, the relayer dispatcher/node/web/cleartext
  `userDecrypt`/`publicDecrypt` methods and the underlying `relayer-sdk` types
  `UserDecryptParams`/`PublicDecryptResult`/…) — not public API; left as-is (public-API-only scope).
  Every **published barrel** (`index.ts` and the `./query` + `./node` subpaths) re-exports those
  underlying decrypt param/result types under the glossary names (`DecryptValuesParams`,
  `DecryptPublicValuesResult`, `DelegatedDecryptValuesParams`), so the same type carries the same name
  on every public door. Internal callers use the new public method names.

### Why a plain rename, not a breaking change

We are at `@zama-fhe/sdk@3.1.0-alpha.1` (prerelease/alpha line). The reviewer asked to drop the
`@deprecated` aliases, so the old names are removed outright — **but not to mark it as a breaking
change**, since we're still in prerelease where this kind of rename is expected. Concretely the commit
stays `refactor(sdk):` with **no `!` and no `BREAKING CHANGE:` footer**, so semantic-release keeps it
on the alpha channel without a major bump. (Note: `.releaserc.cjs` disables `BREAKING CHANGE:` notes
via a `noteKeywords` sentinel, but a header `!` would still escalate to major — hence no `!`.)
Consumers on the old names rename at upgrade (our own `examples/` use the high-level `Token` API and
are unaffected).
