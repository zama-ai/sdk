# Migration plan: replace `@zama-fhe/relayer-sdk` with `@fhevm/sdk`

**Strategy: Deep delegation (B).** Treat `@fhevm/sdk` as the FHE-runtime + chain + ethers/viem layer. Delete the redundant mid-layer in zama-sdk; keep only the genuine value-add (`token/`, `namespaces/`, `services/`, `query/`, React hooks) plus a thin bridge.

- **Old:** `@zama-fhe/relayer-sdk@0.4.4` — low-level `FhevmInstance` (`initSDK` + `createInstance` + `.addN().encrypt()` builder).
- **New:** `@fhevm/sdk@1.1.0-alpha.x` — high-level SDK: own chains, ethers/viem client factories, declarative encrypt/decrypt, built-in WASM loading + thread pool, cleartext adapters, verified permits, opaque transport keypair.

> Migrate against the **shipped decorator method names** (`encryptValue(s)`, `decryptValue(s)`/`decryptValuesFromPairs`, `decryptPublicValue(s)`, `signDecryptionPermit`, `generateTransportKeyPair`, `fetchFheEncryptionKeyBytes`), **not** the README prose (`encrypt`/`decrypt`/`publicDecrypt`).

---

## 0. Spike results (validated 2026-06-22 against `@fhevm/sdk@1.1.0-alpha.4`, published on npm under `alpha` tag)

**Published — no source build needed.** `npm view @fhevm/sdk` → `latest: 1.0.0`, `alpha: 1.1.0-alpha.4` (matches `devex/js-sdk`).

**✅ Validated live (Node + Sepolia):**

- `setFhevmRuntimeConfig({})` → `createFhevmClient({ provider, chain })` (sync) → `await client.init()` — **WASM loads fine in Node on ARM** (client-side path safe, per ARM note).
- Client method surface (exact): `encryptValue(s)`, `decryptValue(s)`, `decryptValuesFromPairs`, `decryptPublicValue(s)`, `decryptPublicValuesWithSignatures`, `signDecryptionPermit`, `generateTransportKeyPair`, `serialize/parseTransportKeyPair`, `serialize/parseSignedDecryptionPermit`, `fetchFheEncryptionKeyBytes`, `init`, `extend`, `ready`, `verify`, `trustedClient`.
- `encryptValues` ran end-to-end to the **live relayer** (WASM encrypt + ZK proof + transport). Rejected only because the spike used dummy addresses → coprocessor refused to bind the proof. **Correct behavior**, path proven.
- **§7 opaque keypair + worker-boundary serialization works:** `privateKey` is not accessible on the keypair; `serializeTransportKeyPair({transportKeyPair})` → `{publicKey, privateKey}` hex (1740/3282 chars); `parseTransportKeyPair` round-trips. Crosses a worker boundary fine.
- `signDecryptionPermit` (EIP-712 sign, offline) works; `serializeSignedDecryptionPermit({signedPermit})` → `{ eip712, signature, signerAddress }`.
- **§3 cleartext clients exist:** `@fhevm/sdk/ethers/cleartext` → `createFhevmCleartextClient` etc.

**⚠️ Real param shapes (all methods take a single object — README hides this):**

- `serializeTransportKeyPair({ transportKeyPair })`
- `parseTransportKeyPair(serialized)` → opaque keypair
- `serializeSignedDecryptionPermit({ signedPermit })` → `{ eip712, signature, signerAddress }`
- `parseSignedDecryptionPermit({ serializedPermit, transportKeyPair })`
- `decryptValuesFromPairs({ pairs: [{ encryptedValue, contractAddress }], transportKeyPair, signedPermit, ... })`

**⚠️ Cross-checked discrepancies to handle in migration:**

- **Relayer URL:** new chain config = `https://relayer.testnet.zama.org` (SDK appends `/v2` itself). zama-sdk currently hardcodes `…/v2`. Don't double-suffix.
- **Encrypt types:** Solidity-style `'uint64'`/`'bool'` (not `'euint64'`/`'ebool'`).
- **Serialized permit contains a BigInt** (eip712 domain `chainId`) → zama-sdk storage needs a bigint-aware JSON serializer.
- Sepolia ACL/kms/inputVerifier addresses **match** zama-sdk's `chains/configs.ts` sepolia. ✅

**❌ Not yet validated (needs team test env):** full decrypt round-trip — requires real on-chain handles ACL-allowed to a funded test user (deployed FHE contract state). Defer to E2E.

---

## 1. Where relayer-sdk is actually used today

Real runtime calls exist in **only two files**; everything else imports **types only**.

| File                                | Uses relayer-sdk for                                                   |
| ----------------------------------- | ---------------------------------------------------------------------- |
| `worker/relayer-sdk.worker.ts`      | `initSDK`, `createInstance` (CDN UMD), `FhevmInstance.*` (browser)     |
| `worker/relayer-sdk.node-worker.ts` | dynamic `import(.../node)`, `createInstance`, `FhevmInstance.*` (Node) |
| 13 other files                      | type-only imports / re-exports                                         |

The 10 ops wrapped: `createEncryptedInput().addN().encrypt()`, `userDecrypt`, `publicDecrypt`, `generateKeypair`, `createEIP712`, `createDelegatedUserDecryptEIP712`, `delegatedUserDecrypt`, `requestZKProofVerification`, `getPublicKey`, `getPublicParams`.

---

## 2. Op-by-op mapping to `@fhevm/sdk`

| zama-sdk `FheOperations`                | relayer-sdk `FhevmInstance` (old)                                      | `@fhevm/sdk` client (new)                                                                                                            |
| --------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `encrypt(params)`                       | `createEncryptedInput().addN().encrypt()`                              | `client.encryptValues({ values:[{type,value}], contractAddress, userAddress })` → `{ encryptedValues, inputProof }`                  |
| `userDecrypt(params)`                   | `instance.userDecrypt(pairs, priv, pub, sig, addrs, signer, ts, days)` | `client.decryptValuesFromPairs({ pairs, transportKeyPair, signedPermit })`                                                           |
| `publicDecrypt(values)`                 | `instance.publicDecrypt(values)`                                       | `client.decryptPublicValues({ encryptedValues })` / `…WithSignatures`                                                                |
| `createEIP712(...)`                     | `instance.createEIP712(...)`                                           | folded into `client.signDecryptionPermit({...})`; raw builder available at `@fhevm/sdk/actions/chain` (`createKmsUserDecryptEip712`) |
| `createDelegatedUserDecryptEIP712(...)` | `instance.createDelegatedUserDecryptEIP712(...)`                       | `signDecryptionPermit({ delegatorAddress, ... })`; raw at `createKmsDelegatedUserDecryptEip712`                                      |
| `delegatedUserDecrypt(params)`          | `instance.delegatedUserDecrypt(...)`                                   | `decryptValuesFromPairs` with a delegated `signedPermit`                                                                             |
| `generateTransportKeyPair()`            | `instance.generateKeypair()` → `{publicKey, privateKey}`               | `client.generateTransportKeyPair()` → **opaque** `TransportKeyPair` (private key hidden)                                             |
| `requestZKProofVerification(zkProof)`   | `instance.requestZKProofVerification(...)`                             | **gone** — ZK proof generation is automatic inside `encryptValues`                                                                   |
| `fetchFheEncryptionKeyBytes()`          | `instance.getPublicKey()`                                              | `client.fetchFheEncryptionKeyBytes()`                                                                                                |
| `getPublicParams(bits)`                 | `instance.getPublicParams(bits)`                                       | **gone** — internal to encrypt                                                                                                       |

**Two ops disappear** (`requestZKProofVerification`, `getPublicParams`) and the EIP-712 builders collapse into `signDecryptionPermit`. That alone removes a chunk of the dispatcher/interface/worker protocol.

---

## 3. DELETE (redundant — `@fhevm/sdk` now owns these)

| Path                                                              | Replaced by                                     | Notes                             |
| ----------------------------------------------------------------- | ----------------------------------------------- | --------------------------------- |
| `relayer/cleartext/relayer-cleartext.ts`                          | `@fhevm/sdk/{ethers,viem}/cleartext`            | whole cleartext relayer           |
| `relayer/cleartext/eip712.ts`                                     | new SDK's EIP-712 + `verifyKms*Eip712`          | drop build-time type-sync asserts |
| `relayer/cleartext/fhe-type.ts`                                   | new SDK type system (`'bool'`,`'uint8'`…)       | copied util, no longer needed     |
| `relayer/cleartext/handle.ts`                                     | new SDK cleartext handle gen                    | mock handle util                  |
| `relayer/cleartext/constants.ts`, `index.ts`, `__tests__/`        | —                                               | folder removed                    |
| `relayer/fhe-artifact-cache.ts`                                   | `fetchFheEncryptionKeyBytes` + internal caching | ~625 LOC; see §6 caveat           |
| `worker/relayer-sdk.worker.ts` (CDN UMD load)                     | new SDK WASM loader                             | rewrite/remove — see §5           |
| `worker/relayer-sdk.node-worker.ts`                               | new SDK runs in Node directly                   | rewrite/remove — see §5           |
| `relayer/relayer-web.ts` (CDN versioning, integrity, CSRF wiring) | new SDK runtime config                          | logic folds into the new backend  |
| `relayer/relayer-node.ts`                                         | new SDK runtime config                          | folds into new backend            |
| `RELAYER_SDK_VERSION` / `CDN_URL` constants                       | new SDK bundles WASM                            | no more CDN pinning               |

Estimated deletion: **most of `relayer/` + `worker/` (~4,850 LOC at risk)**, of which cleartext + artifact-cache (~1,300 LOC) is pure deletion.

---

## 4. REWRITE (rewire onto the new SDK)

| Path                                                                                               | Change                                                                                                                                                                                                                                                                                                                                                             |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `package.json`                                                                                     | drop `@zama-fhe/relayer-sdk`; add `@fhevm/sdk` (peer/optional `ethers`,`viem`). Update `rolldown.config.ts` `external` regex `^@zama-fhe\/relayer-sdk` → `^@fhevm\/sdk`.                                                                                                                                                                                           |
| `relayer/relayer-sdk.ts` (`FheOperations`/`RelayerSDK` ifaces)                                     | drop `requestZKProofVerification` + `getPublicParams`; collapse `createEIP712`/`createDelegated…` into permit signing. Re-type against new SDK or local types.                                                                                                                                                                                                     |
| `relayer/relayer-sdk.types.ts`                                                                     | replace all `@zama-fhe/relayer-sdk` type aliases: `Bytes32Hex`→ new `EncryptedValue` (branded), `ClearValueType`→ new `TypedValue`, `PublicDecryptResults`, `KmsUserDecryptEIP712Type`, `SDK.FheTypeName`, `SDK.PublicParams`. Re-source from `@fhevm/sdk/types`.                                                                                                  |
| `relayer/relayer-dispatcher.ts`                                                                    | keep multi-chain routing; drop the 2 removed ops; `#active` becomes a `@fhevm/sdk` client (or a thin backend wrapping one).                                                                                                                                                                                                                                        |
| **new** `relayer/fhevm-backend.{web,node}.ts`                                                      | thin `RelayerSDK` impl that constructs `createFhevmClient({ provider, chain })` and maps the ops in §2. Runs inside the worker shell if §5 keeps it.                                                                                                                                                                                                               |
| `worker/worker.types.ts`                                                                           | protocol: drop `GET_PUBLIC_PARAMS`, `REQUEST_ZK_PROOF_VERIFICATION`, `GET_PUBLIC_KEY` (or repoint), `CREATE_EIP712`/`CREATE_DELEGATED_EIP712` (folded into permit). Reshape `USER_DECRYPT`/`DELEGATED_USER_DECRYPT` to carry a **serialized** `TransportKeyPair` + `signedPermit` instead of raw `privateKey`/`publicKey`/`signature`/timestamps (see §7).         |
| `worker/worker.client.ts`, `worker.node-client.ts`, `worker.node-pool.ts`, `worker.base-client.ts` | match the new protocol; instantiate `@fhevm/sdk` inside the worker.                                                                                                                                                                                                                                                                                                |
| `chains/configs.ts` + `chains/types.ts`                                                            | **derive** a `FhevmChain` (id + `fhevm.{contracts:{acl,inputVerifier,kmsVerifier}, relayerUrl, gateway}`) from each `FheChain`; **keep** zama-only fields (`network` RPC, `registryAddress`, `executorAddress`, `gatewayChainId`) the token layer uses. Drop `Auth` import (re-source from new SDK runtime `auth` option). Add a `toFhevmChain(fheChain)` adapter. |
| `config/types.ts`, `config/resolve.ts`, `config/schema.ts`                                         | `RelayerSDK`/`RelayerWebConfig` types track the rewritten backend; `createWorker`/`createRelayer` factory shape adjusted.                                                                                                                                                                                                                                          |
| `credentials/types.ts` + `credentials/`                                                            | `TransportKeyPair` becomes opaque; use `serialize/parseTransportKeyPair` for worker boundary + persistence.                                                                                                                                                                                                                                                        |
| `namespaces/decryption.ts`, `token/*.ts`                                                           | follow renamed ops + opaque keypair + permit object instead of raw EIP-712 fields.                                                                                                                                                                                                                                                                                 |
| `index.ts` + `web/index.ts` + `node/index.ts` + `ethers/index.ts`                                  | fix public type re-exports (see §8).                                                                                                                                                                                                                                                                                                                               |
| `query/user-decrypt.ts`                                                                            | `UserDecryptResults` → new SDK decrypt return type.                                                                                                                                                                                                                                                                                                                |
| `docs/llm/corpus-manifest.json`, `docs/gitbook/**`, `claude-setup/`                                | regenerate after API stabilizes (`pnpm llm:build`, `pnpm api-report*`).                                                                                                                                                                                                                                                                                            |

---

## 5. ⚠️ The load-bearing decision: off-main-thread

zama-sdk's web worker exists to keep the **browser main thread responsive** during encryption. `@fhevm/sdk`'s own thread pool parallelizes the _TFHE WASM crypto_ but its client factories run in the **calling context**. If we delete the worker entirely, encryption may block the main thread.

**Recommendation:** **keep the worker shell**, run `@fhevm/sdk` _inside_ it. Delete the CDN-UMD-loading guts, the artifact cache, and the EIP-712/ZK plumbing — but preserve `RelayerWorkerClient` ↔ worker message transport and the multi-chain dispatcher. This is still "deep delegation": the new SDK owns all FHE/chain/WASM; we keep only a transport shell. (Open question for the team: does `@fhevm/sdk`'s threaded mode already free the main thread enough to drop the worker? If yes, even more deletes.)

---

## 6. ⚠️ Artifact cache caveat

`fhe-artifact-cache.ts` does TTL + ETag/Last-Modified revalidation + IndexedDB persistence of the public key/params across **sessions**. The new SDK caches in-process via `fetchFheEncryptionKeyBytes`, but confirm it persists across reloads. If not, retain a slimmed cache around `fetchFheEncryptionKeyBytes` rather than deleting outright. The `RelayerWebConfig.fheArtifactStorage`/`fheArtifactCacheTTL` options are public — removing them is a breaking config change.

---

## 7. ⚠️ Opaque `TransportKeyPair`

Today the worker passes raw `privateKey`/`publicKey` across the boundary (`worker.types.ts` `UserDecryptRequest`). The new keypair hides the private key in a closure. Cross the worker boundary and persist via `serializeTransportKeyPair` → `{ publicKey, privateKey }` (hex) and `parseTransportKeyPair`. Affects `credentials/`, the worker protocol, and any persisted-credential storage format (**potential stored-data migration**).

---

## 8. ⚠️ Public API breaking changes (type re-exports)

These are exported to consumers and have no clean 1:1:

- `ZKProofLike`, explicit `InputProofBytesType` — **gone** (ZK is internal).
- `FheTypeName` (`'ebool'|'euint8'…`) → new SDK uses Solidity-style `'bool'|'uint8'…`. **Encrypt input shape changes** (`type: 'ebool'` → `'bool'`).
- `EncryptedValue` (was `Bytes32Hex`) → now a **branded** type.
- `FhevmInstanceConfig`, `KmsDelegatedUserDecryptEIP712Type`, `Auth`, `ClearValueType`, `PublicDecryptResults` → re-source from `@fhevm/sdk/types` or drop.

➡️ This is a **major** version bump for `@zama-fhe/sdk`. Plan a deprecation/back-compat alias layer per the repo's "EncryptedValue canonical, keep alias" convention where feasible.

---

## 9. KEEP (untouched value-add)

`token/`, `namespaces/`, `services/`, `query/` (signatures only), `events/`, `signer/`, `storage/`, `errors/`, `schemas/`, `abi/`, `contracts/`, React hooks. These sit above the FHE runtime and only need op-rename + keypair/permit-shape follow-through.

---

## 10. Sequenced execution

1. **Spike** (throwaway): build `@fhevm/sdk` from the branch, pack a tarball, get one `encryptValues` + `decryptValuesFromPairs` + `signDecryptionPermit` round-trip working on Sepolia in a scratch script. Confirm real method names & threading behavior.
2. **Types & chains:** rewrite `relayer-sdk.types.ts`, add `toFhevmChain`, fix `chains/`.
3. **Backend:** add `fhevm-backend.{web,node}.ts`; rewrite dispatcher to the reduced op set.
4. **Worker:** reshape protocol (§4), run new SDK inside the shell (§5), opaque-keypair serialization (§7).
5. **Delete:** cleartext/, artifact-cache (or slim, §6), old worker guts, relayer-web/node guts.
6. **Public surface:** fix re-exports (§8), back-compat aliases, bump major.
7. **Tests:** rewrite `relayer/__tests__`, `cleartext/__tests__`, `worker/__tests__`, `ethers/__tests__`, config tests; update examples' lockfiles (`@zama-fhe/relayer-sdk` → `@fhevm/sdk`).
8. **Docs/LLM:** `pnpm api-report`, `pnpm llm:build`, gitbook update, corpus-manifest regen.
9. **Verify:** `pnpm typecheck && pnpm lint && pnpm test`, E2E/playwright, examples.

## 10b. Worker-rewrite constraints discovered during implementation

The worker is the load-bearing core. Concrete findings from reading `relayer-sdk.worker.ts` + the new SDK:

- **Provider inside the worker.** Old `createInstance(chainConfig)` built its own provider from `chain.network` internally. New `createFhevmClient({ provider, chain })` _requires_ a provider. The worker has no wallet, but has the RPC URL (`chain.network`) → build a read-only `ethers.JsonRpcProvider(chain.network)` inside the worker. Spike confirmed a read-only provider suffices for encrypt + the relayer path.
- **EIP-712 signing moves to the main thread.** A live signer can't cross the worker boundary. New plan: main thread builds typed data (`createKmsUserDecryptEip712`) + signs with the user wallet + assembles the serialized permit `{eip712, signature, signerAddress}`; worker calls `parseSignedDecryptionPermit({serializedPermit, transportKeyPair})` then `decryptValuesFromPairs` (signer-free — confirmed). So worker protocol drops `CREATE_EIP712`/`CREATE_DELEGATED_EIP712`; `USER_DECRYPT` carries serialized permit + serialized transportKeyPair instead of raw priv/pub/sig/timestamps.
- **Worker standardizes on `@fhevm/sdk/ethers` internally** (read-only JsonRpcProvider), regardless of whether the _user_ uses ethers or viem — the worker only reads RPC + calls the relayer.
- **WASM load mode:** use `wasmAssetLoadMode: 'embedded-base64'` so the IIFE-bundled worker needs no CDN fetch. Replaces the entire CDN-UMD + integrity + `validateCdnUrl` + `loadSdkScript` machinery and `RELAYER_SDK_VERSION`/`CDN_URL`/`CDN_INTEGRITY`.
- **`RelayerSDKGlobal`** (CDN `window.relayerSDK` shape) is only referenced by the web worker — delete with the rewrite.
- **✅ Build-time unknown RESOLVED (worker-bundle spike):** `@fhevm/sdk/ethers` **does** bundle into the IIFE worker via the existing rolldown/`iife-plugin` (71ms build). BUT the default embeds WASM as base64 → **6.75 MB** IIFE (8 blobs), inlined as a string into the SDK bundle. Also surfaced `import.meta`→`{}` and `node:url/buffer/fs` warnings (the SDK's CJS/ESM branches): the default `wasmBaseUrl` (uses `import.meta.url`) **breaks under IIFE**, so the default WASM-URL resolution won't work in the worker — an explicit `locateFile` is required for any non-embedded mode.
  - **Decision (interim):** ship **embedded-base64** WASM in the worker (functional, no infra dependency). Add `transform.define: { 'import.meta': {} }` to the iife build to silence/neutralize the warning.
  - **Follow-up (size):** flip to hosted WASM (`wasmAssetLoadMode: 'precheck-direct-url'` + `locateFile → cdn.zama.org/...`) once Zama hosts the `@fhevm/sdk` WASM assets — mirrors today's `cdn.zama.org/relayer-sdk-js/<ver>/` model and restores a small bundle. **Infra/deployment decision for the team.**
- **Containment strategy (adopted):** keep zama domain types stable; translate `TypedValue[]↔Record<handle,ClearValue>`, `bool/uint64↔euint64`, branded handles, permit/keypair (de)serialization all **inside the worker + backend**. Keeps dispatcher / token / namespaces / credentials nearly untouched.

## 10c. Implementation progress (branch `feature/sdk-replace-relayer-with-fhevm-sdk`)

- ✅ `@fhevm/sdk@1.1.0-alpha.4` added to `packages/sdk` deps (alongside old dep during transition).
- ✅ `chains/to-fhevm-chain.ts` — `toFhevmChain(FheChain) → FhevmChain` adapter (compiles).
- ✅ `/v2` removed from `mainnet`/`sepolia` presets in `chains/configs.ts` (new SDK appends `v2/...` itself).
- ✅ Worker-bundle spike: `@fhevm/sdk/ethers` bundles into the IIFE worker (resolved the last unknown; see §10b).
- ✅ `worker/fhevm-client.ts` — the **worker-side translation engine**: wraps `createFhevmClient` (read-only `JsonRpcProvider` from `chain.network`) and maps every op to zama shapes — `encrypt` (`euint64`→`uint64`, handles→hex), `userDecrypt` (parses serialized keypair + serialized permit, zips `TypedValue[]`→`Record<handle,ClearValue>`), `publicDecrypt` (`…WithSignatures`→`{clearValues, abiEncodedClearValues, decryptionProof}`), `generateTransportKeyPair` (serialized), `fetchFheEncryptionKeyBytes` (mapped to `{publicKeyId, publicKey}`). Compiles green against the real published SDK.
- ✅ Tree is typecheck-green + lint+ast-grep-clean at this checkpoint.
- ✅ `worker/fhevm-client.ts` extended with `createEIP712` + `createDelegatedUserDecryptEIP712` (via `@fhevm/sdk/actions/chain`).
- ✅ `relayer/fhevm-relayer.ts` — **`FhevmRelayer`**: implements the full `RelayerSDK` interface on the main thread by reusing the engine. Reconstructs the new SDK's signed permit from the interface's params (`createEIP712(...)` typed data + the returned signature + signerAddress) + serialized keypair. `requestZKProofVerification` rejects (internal now), `getPublicParams` returns null (internal now), `getAclAddress` from chain. Branded-type mismatches (`Hex`→`BytesHex`, `Address`→`ChecksummedAddress`) cast at this adapter boundary. **Compiles + lints green vs the real published SDK.**
- ✅ The complete new FHE backend (chains adapter → engine → FhevmRelayer) is landed, additive, and green. Old path fully intact (nothing wired/deleted yet).
- ⏭️ Next phase (coupled cleanup): wire `config/web.ts` + `node/config.ts` → `FhevmRelayer`; delete old path (RelayerWeb/Node/Cleartext, workers, worker clients, `cleartext/`, `fhe-artifact-cache`); prune interface (`requestZKProofVerification`/`getPublicParams`); modernize `EIP712TypedData` + signer adapters + `index.ts` re-exports; remove `@zama-fhe/relayer-sdk` dep; update tests + api-reports + llm corpus. Decision still open: which decrypt values shape / how much of `credentials` `Permission` schema changes (the serialized keypair already matches; the permit shape differs).
- ✅ **Wired live:** `config/web.ts` + `node/config.ts` now construct `FhevmRelayer` (worker factories dropped; `WebRelayerConfig`/`NodeRelayerConfig` simplified). `web()`/`node()` run on `@fhevm/sdk`. Tree typecheck-green + lint-clean. Old RelayerWeb/Node/workers are now dead code (present, compiling, pending deletion).
- ✅ **All three configs migrated:** `web()`, `node()`, AND `cleartext()` now construct `FhevmRelayer`. Cleartext mode uses `@fhevm/sdk`'s `createFhevmCleartextClient` (executor address discovered on-chain — no `executorAddress` plumbing). `RelayerDirect`→`FhevmRelayer` rename done. Old `RelayerWeb`/`RelayerNode`/`RelayerCleartext`/workers are now fully unused by the runtime. Tree green.
- ⏭️ **Public-API decision before deletion** (deliberate major-bump surface reduction): `@zama-fhe/sdk/web` exports `RelayerWeb`/`RelayerWebConfig`/`RelayerWebSecurityConfig`; `@zama-fhe/sdk/node` exports `RelayerNodeConfig`, `NodeWorkerClientConfig`, `NodeWorkerPoolConfig`, `BaseWorkerClient`, the entire worker-protocol type set, `GenericLogger`; `@zama-fhe/sdk/cleartext` exports `RelayerCleartext`. Deleting the old files removes all of these published exports. Needs sign-off on what (if anything) stays.
- ⏭️ Deletion cascade (next pass, entangled — do carefully):
  - Extract `GenericLogger` to its own module (widely imported) before deleting `worker.types.ts`.
  - **Cleartext backend:** `config/cleartext.ts` still uses old `RelayerCleartext`; needs a direct backend on `@fhevm/sdk`'s `createFhevmCleartextClient` before `relayer/cleartext/` can be deleted.
  - Extract `GenericLogger` out of `worker.types.ts` (widely imported) before deleting the worker protocol.
  - Delete `relayer-web.ts`, `relayer-node.ts`, `fhe-artifact-cache.ts`, `cleartext/`, both worker scripts, `worker.client.ts`/`base-client`/`node-client`/`node-pool`.
  - Fix `web/index.ts` + `node/index.ts` exports + `rolldown.config.ts` entries (drops `node/relayer-sdk.node-worker`, `cleartext/index`).
  - Prune `requestZKProofVerification`/`getPublicParams` from `FheOperations`/dispatcher + test fixtures.
  - Modernize `EIP712TypedData` (new shape) + 4 signer files + `index.ts` re-exports; remove `@zama-fhe/relayer-sdk` dep + `rolldown` external.
  - Update tests (config tests expecting `createWorker`, worker/relayer tests) + regenerate api-reports + llm corpus.
- 🔭 Deferred (tracked, not blockers): off-main-thread worker for web (FhevmRelayer runs on main thread); embedded-WASM 6.75 MB → hosted WASM.

## 10d. Main-thread (signing) half — design confirmed, and why the rest is one coupled change

- **Reuse zama's signer abstraction.** `GenericSigner.signTypedData(typedData) → Hex` already exists. Flow: main thread builds typed data → `signer.signTypedData(...)` → assemble `{eip712, signature, signerAddress}` → hand serialized permit to the worker engine. No native-signer plumbing into `@fhevm/sdk` needed.
- **But the builder isn't pure.** `createKmsUserDecryptEip712(fhevm, params)` needs a (read-only) `@fhevm/sdk` client on the main thread, and returns `KmsUserDecryptEip712` — which must **become** zama's `EIP712TypedData` (today aliased from relayer-sdk and consumed by the ethers/viem signer adapters). So updating it ripples into `signer/` + `namespaces/decryption`.
- **Serialized keypair fits the existing store:** `{publicKey, privateKey}` hex == zama's `TransportKeyPair`/`StoredTransportKeyPair` shape. ✅ The serialized **permit** (`{eip712, signature, signerAddress}`) does NOT match the current `Permission` zod schema → schema + `namespaces/decryption` + `token` decrypt paths change.
- **Conclusion:** beyond the additive engine, the remainder is ONE coupled change — `RelayerSDK`/`FheOperations` interface (permit-based, reduced ops) → `relayer-sdk.types.ts` → worker protocol + scripts → worker clients → dispatcher + relayers → `credentials` + `schemas` + `namespaces/decryption` + `token` → `config/web.ts`/`node/config.ts` → delete old path → public `index.ts` exports → tests. No green checkpoint until it substantially lands. Best done as a dedicated focused effort following §10's sequence.

## 10e. ✅ Core migration COMPLETE (build-green, dep removed)

- **All source migrated** off `@zama-fhe/relayer-sdk` onto `@fhevm/sdk`. No `relayer-sdk` imports remain in `src/` (one doc comment aside).
- **Deleted:** `relayer-web.ts`, `relayer-node.ts`, `fhe-artifact-cache.ts`, `relayer-utils.ts`, `relayer/cleartext/`, both worker scripts, `worker.client/base-client/node-client/node-pool`, `worker.types.ts`, `browser-extension.ts`, `iife.d.ts`. `GenericLogger` extracted to `types/logger.ts`.
- **Interface pruned:** `requestZKProofVerification` + `getPublicParams` removed from `FheOperations`/dispatcher; `EIP712TypedData` is now a local structural type; `FheTypeName` defined locally.
- **Types modernized:** `relayer-sdk.types.ts` fully local (`EncryptedValue=Hex`, `ClearValue=bigint|boolean|string`, …). `index.ts`/`web/index.ts`/`node/index.ts` re-exports trimmed (dropped `ZKProofLike`, `InputProofBytesType`, `FhevmInstanceConfig`, `RelayerWeb`, `BaseWorkerClient`, worker-protocol types, etc.).
- **Public surface reduced** (major bump): removed the `./cleartext` entry; trimmed `web`/`node` exports.
- **Dependency removed:** `@zama-fhe/relayer-sdk` gone from `packages/sdk/package.json` + root devDeps + lockfile; `rolldown` external swapped to `@fhevm/sdk`.
- **Verified:** `pnpm typecheck` = 0 errors, `pnpm lint` clean, **`pnpm build` succeeds** (emits `fhevm-relayer.cjs`, `@fhevm/sdk` external).

### ✅ Verification (all green)

- `pnpm typecheck` → 0 errors
- `pnpm lint` → clean
- `pnpm build` → succeeds (`fhevm-relayer.cjs`, `@fhevm/sdk` external)
- `pnpm test:run` → **1459 passed / 0 failed** (fixed dispatcher pruned-op test, `web()` option tests in sdk + react-sdk)
- `pnpm api-report` → regenerated (`etc/*.api.md` reflect the new surface)
- `pnpm llm:build` → regenerated (corpus has **0** relayer-sdk references)

### Remaining (separate / optional — core SDK migration is done)

- **Commit** the regenerated `etc/*.api.md` + `docs/llm/*` artifacts (`llm:check` `verify-clean` just flags they're uncommitted).
- **examples/** apps: lockfiles still list `@zama-fhe/relayer-sdk` (was a transitive dep) — refresh on reinstall.
- **E2E/playwright** mock relayer (`fixtures/relayer-sdk-server.mjs`) — update for the new `/v2` relayer protocol.
- **gitbook** prose updates.
- **Deferred optimizations:** off-main-thread worker for web; embedded-WASM 6.75 MB → hosted WASM (`locateFile`); delete now-unused `iife-plugin.ts`.

## 11. Open questions for the team

- Is `@fhevm/sdk` published yet, or do we vendor a tarball from `devex/js-sdk`? (CI/release impact.)
- Does the new threaded WASM mode free the main thread enough to drop our worker entirely (§5)?
- Does `fetchFheEncryptionKeyBytes` persist across reloads, or do we keep a slim cache (§6)?
- Back-compat window: hard major bump vs alias shim for removed types (§8)?
