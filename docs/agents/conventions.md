# Conventions

## Naming

The SDK is for all Zama Protocol use cases, not just tokens. The code is in transition toward that, so naming discipline matters.

- **SDK-level operations use "contracts":** `contractAddress`, `contractAddresses`, generic ops like allow/revoke/session management, package descriptions, README language. These work with any confidential contract type.
- **Token-specific operations use "tokens":** `Token`/`WrappedToken` classes, `shield`, `unshield`, `transfer`, `balanceOf`, ERC-7984/ERC-20 interfaces. These are explicitly about confidential tokens.
- **"Encrypted value", not "handle", on public surfaces.** Public APIs and docs use `encryptedValue(s)` / `EncryptedValue` and the glossary verb names — `decryptValues` / `decryptPublicValues` / `delegatedDecryptValues`, never `userDecrypt` / `publicDecrypt`. Keep `handle` only where it mirrors an on-chain term (contract ABI fragments, `isHandleDelegatedForUserDecryption`, KMS `ctHandles`). Internal code (services and the `@fhevm/sdk` boundary) may keep `handle` / `userDecrypt` — the rule is the public surface, not internal code; public barrels re-export the internal types under the glossary names.
- **Key/keypair terms mirror the glossary too** (`TransportKeyPair` / `generateTransportKeyPair()`, "FHE encryption key" / `fetchFheEncryptionKeyBytes()` — not `keypair` / `getPublicKey`), and renames are a **clean break with no back-compat aliases**.
- **User-facing docs:** no Slack links or internal tool references. Linear ticket refs (SDK-42) in code comments and PR titles are fine.
- **Docs use stage-gate language, not calendar dates.** Write "once deployed to testnet" / "after mainnet launch", not "in Q2 2026" or "by March 31" — calendar dates rot, stage gates don't.

> React-sdk has its own naming rules for hooks — see [`packages/react-sdk/AGENTS.md`](../../packages/react-sdk/AGENTS.md).

## Design decisions

- **Contract call builders are pure.** Functions in `packages/sdk/src/contracts/` return `{ address, abi, functionName, args }` config objects. They never execute transactions. Library-specific sub-paths (`/viem`, `/ethers`) compose these.
- **Generic interfaces over framework primitives.** Stateful framework dependencies — wallet, RPC, storage — are typed as `Generic*` interfaces in the core (e.g. `GenericSigner`, `GenericProvider`, `GenericStorage`). New framework-touching code reuses or defines a `Generic*`; framework-specific code lives in adapter sub-paths, not the core.
- **Every contract abstraction has a `create*` factory, and the factory is the documented idiom.** `sdk.createToken` / `sdk.createWrappedToken` for tokens; `createVault` / `createVaultBatcher` (standalone, because the `/vaults` subpath must not be pulled into the root entry) for vaults. React object hooks (`useToken`, `useVault`, `useVaultBatcher`) call the factory, never `new`. Classes stay exported for types and `instanceof`, mirroring `Token` and `WrappedToken`.
- **Token method params mirror Solidity, per-method.** `Token`/`WrappedToken` method signatures (arg order and names) track the underlying contract ABI per-method, with SDK-internal exceptions accepted where the SDK method does something semantically different. Do not "normalize" inconsistencies across methods — callers cross-reference the Solidity source.
- **Don't recompose flows the SDK already orchestrates.** Token-side operations (`shield`, `unshield`, `confidentialTransfer`, `balanceOf`, …) wrap the underlying contract calls with validation, encryption, decryption, approval handling, and — for `shield` — ERC-1363 vs `approve` + `wrap` routing. Reach for the `Token` / `WrappedToken` method (or matching React hook) instead of chaining the raw calls, even for "just one transaction" flows. Snippets that pair `erc20.approve` with `wrapper.wrap` (or hand-roll `erc20.transferAndCall`) are below the recommended API surface — replace them with `WrappedToken.shield(amount)`.

## Keeping docs consistent

A single behavior is often described in more than one place — a method's reference page, a narrative guide, a sibling reference page for a related hook, the changelog. When a PR changes documented behavior (not just adds a brand-new one), grep the docs tree for other prose describing the same fact before considering the docs update done. Updating only the page "closest" to the code change leaves the others stale, and `pnpm docs:check-links` won't catch it — it only verifies that links and anchors resolve, not that content is still true. (Example: v3.4.0's automatic decrypt-batch chunking updated the changelog, but `reference/sdk/ZamaSDK.md` and `reference/react/useDecryptValues.md` both kept asserting the old "one relayer call per contract" behavior for two releases before anyone caught it.)
