# Low-level SDK migration & decrypt terminology

**Status:** Updated 2026-07-27. Both tracks are now **done** and shipped on the `3.x` line:

1. **Swapping the low-level dependency** (`@zama-fhe/relayer-sdk` → `@fhevm/sdk@1.x`) — **shipped**
   ([PR #458](https://github.com/zama-ai/sdk/pull/458)). The internal FHE backend is now `@fhevm/sdk`;
   `packages/sdk/package.json` depends on `@fhevm/sdk@1.1.0-alpha.9` and `@zama-fhe/relayer-sdk` is no
   longer a runtime dependency. (Finding 1 below.)
2. **Aligning our public decrypt wording** to the Zama glossary — **done** on branch
   `align/decrypt-glossary` as a plain **rename, no back-compat aliases**. Covers: glossary names
   (no `userDecrypt`/`publicDecrypt`), the **single-entrypoint** decision (`decryptValues`, dropping the
   `FromPairs` suffix), and **handle → encryptedValue** terminology. **Not flagged as a breaking
   change**: we were still in the `3.x` prerelease/alpha line, so it was absorbed there without a major
   bump (no `!`/`BREAKING CHANGE:`). (Finding 2 below.)

> **This doc is now a historical record** of two migrations that have both landed. Keep it for the
> rationale and the rename mapping (still an accurate reference for the current API); it no longer
> describes pending work. For the user-facing description of the current backend, see
> [`changelog/alpha.md`](../gitbook/src/changelog/alpha.md) and
> [`concepts/architecture.md`](../gitbook/src/concepts/architecture.md).

Internal feedback that originally set this split (track 1 was deferred first, then completed):
_"going from relayer-sdk to fhevm/sdk is not in scope for now until future network upgrades. However,
aligning on a single public glossary is something we can do already to be consistent across all
products — just updating our public APIs."_ The dependency swap was subsequently prioritised and
landed in #458.

## Finding 1 — the dependency swap (SHIPPED in #458)

The swap **has been completed**. It was the full re-architecture this section originally warned it
would be — not a version bump — and it landed in [PR #458](https://github.com/zama-ai/sdk/pull/458).

Current state on this branch:

- The internal FHE backend is **`@fhevm/sdk@1.1.0-alpha.9`** (`packages/sdk/package.json`).
  `@zama-fhe/relayer-sdk` is **no longer a runtime dependency** — only `utils/fhe-type.ts` still
  references its types.
- `packages/sdk/src/worker/` — the ~2,190 LOC worker pool built on the old
  `createInstance`/`FhevmInstance` model — **has been removed**. `@fhevm/sdk` now owns its worker pool
  internally.
- `packages/sdk/src/relayer/` is now a thin adapter (`fhevm-relayer.ts`, `types.ts`) over `@fhevm/sdk`,
  with `web()` / `node()` / `cleartext()` transport factories routed per chain by `ChainRouter`
  (`packages/sdk/src/chains/router.ts`).

What the migration replaced (kept for reference — the `@fhevm/sdk` column is the current model):

  |          | Old (`relayer-sdk@0.4.3`)                            | `@fhevm/sdk@1.x` (current)                                                       |
  | -------- | ----------------------------------------------------- | ------------------------------------------------------------------------------- |
  | Model    | `createInstance()` → global `FhevmInstance`           | viem/ethers client + decorators/actions (`createFhevmClient`, `decryptActions`) |
  | Decrypt  | `instance.userDecrypt()` / `instance.publicDecrypt()` | `decryptValue` / `decryptValues` / `decryptValuesFromPairs`                     |
  | Subpaths | `/bundle`, `/node`, `/web`                            | `./viem`, `./ethers`, `./actions/*`, `./base`, `./chains`, `./types`            |
  | Init     | `initSDK()`                                           | `initFhevmRuntime()` + `runtimeConfig` (`moduleVersions` lives here)            |

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
| `ZERO_HANDLE` / `isZeroHandle`            | `ZERO_ENCRYPTED_VALUE` / `isEncryptedValueZero` | value/fn              |
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
- **Genuinely internal modules** — left as-is (public-API-only scope): `services/decryption-service.ts`
  incl. its internal `delegatedBatchDecryptHandlesAs` method, the relayer node/web/cleartext
  `userDecrypt`/`publicDecrypt` methods, and the underlying `relayer-sdk` types
  (`UserDecryptParams`/`PublicDecryptResult`/…). Internal callers use the new public method names.
- **`RelayerSDK` / `RelayerDispatcher`** — `@public` in the api-report but **kept on the legacy verbs**
  (`userDecrypt`/`publicDecrypt`/`delegatedUserDecrypt`): this is the adapter that _mirrors_ the
  third-party `@zama-fhe/relayer-sdk` interface, so renaming would make it diverge from what it adapts.
  Deliberate upstream-mirror (could be marked `@internal` later if we want the report literally free of
  the old verbs; not done here).

### Published subpaths are public too (`./query`, `./node`)

`./query` and `./node` are real published entry points (`package.json#exports`, each with its own
golden `etc/sdk-*.api.md`), so their decrypt-wording exports fall under the rule:

- **Decrypt param/result types** re-exported under the glossary names on every published barrel
  (`index.ts` + `./query` + `./node`): `DecryptValuesParams`, `DecryptPublicValuesResult`,
  `DelegatedDecryptValuesParams` — same type, same name on every public door.
- **`./query` query-option factories** renamed to match the public method names:
  `userDecryptQueryOptions` → `decryptValuesQueryOptions`,
  `publicDecryptMutationOptions` → `decryptPublicValuesMutationOptions`,
  `delegatedDecryptMutationOptions` → `delegatedDecryptValuesMutationOptions`
  (+ param type `DelegatedDecryptMutationParams` → `DelegatedDecryptValuesMutationParams`, and mutation
  keys `"zama.publicDecrypt"`/`"zama.delegatedDecrypt"` → `"zama.decryptPublicValues"`/
  `"zama.delegatedDecryptValues"`). The three `react-sdk` decrypt hooks import the new factory names.

### Why a plain rename, not a breaking change

We are at `@zama-fhe/sdk@3.1.0-alpha.1` (prerelease/alpha line). The reviewer asked to drop the
`@deprecated` aliases, so the old names are removed outright — **but not to mark it as a breaking
change**, since we're still in prerelease where this kind of rename is expected. Concretely the commit
stays `refactor(sdk):` with **no `!` and no `BREAKING CHANGE:` footer**, so semantic-release keeps it
on the alpha channel without a major bump. (Note: `.releaserc.cjs` disables `BREAKING CHANGE:` notes
via a `noteKeywords` sentinel, but a header `!` would still escalate to major — hence no `!`.)
Consumers on the old names rename at upgrade (our own `examples/` use the high-level `Token` API and
are unaffected).
