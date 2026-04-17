# Code Review: `feat: split signer / provider` (c8323ed5)

**Branch:** `feat/split-signer-provider`
**Author:** enitrat
**Scope:** 73 files, +1352 / −897
**Verdict:** **Request Changes** — 2 confirmed runtime bugs, several architectural regressions, JSDoc drift, one TanStack anti-pattern.

---

## Executive summary

The split itself is directionally right and matches the plan. Three concerns cluster at the top:

1. **`ViemSigner.getChainId()` reads from `publicClient` rather than the wallet** — reintroduces the conflation the split was supposed to remove, and can corrupt credential store keys when provider and signer point at different chains.
2. **`Token.shield()` (and `#ensureAllowance`) read balance/allowance via `sdk.provider` while writing via `sdk.signer`** — cross-chain mismatch is silent: either false-negative "insufficient balance" or false-positive "OK" depending on configuration.
3. **`signerAddressQueryOptions` fires unconditionally when the SDK has no signer** — every read-only mount of `useIsAllowed`, `useConfidentialBalance(s)`, `useUnderlyingAllowance` produces a failed TanStack query that throws `SignerRequiredError` into DevTools.

Everything else is secondary but worth addressing in the same PR.

---

## Blocking — runtime correctness

### B1. `ViemSigner.getChainId` uses `publicClient`, not the wallet

`packages/sdk/src/viem/viem-signer.ts:64-66`

```ts
async getChainId(): Promise<number> {
  return this.#publicClient.getChainId();
}
```

The JSDoc claim ("`WalletClient.getChainId()` may not reflect the most recent chain switch in every viem version") is inverted — `publicClient.getChainId()` returns the client's _statically configured_ chain, while `walletClient.getChainId()` routes to EIP-1193 `eth_chainId`. When provider and signer are intentionally on different chains (the whole reason for the split), `signer.getChainId()` now lies about the wallet's actual chain. `ZamaSDK.#initIdentity` stores the wrong chain ID, `CredentialsManager.computeStoreKey` keys credentials to the wrong chain, and `revokeSession` / `#revokeByTrackedIdentity` operate on the wrong key.

**Fix.** Call `this.#walletClient.getChainId()`. Also drop `publicClient` from `ViemSignerConfig` entirely (B7) — it no longer has any purpose on the signer.

### B2. `Token.shield()` and `#ensureAllowance` cross-chain read/write

`packages/sdk/src/token/token.ts:370-376`, `:402-404`, `:1040-1046`

```ts
const userAddress = await this.sdk.requireSigner("shield").getAddress();
erc20Balance = await this.sdk.provider.readContract(
  balanceOfContract(underlying, userAddress),
);
// …later…
const txHash = await this.sdk.requireSigner("shield").writeContract(...);
const receipt = await this.sdk.provider.waitForTransactionReceipt(txHash);
```

If provider and signer target different chains, the pre-flight balance/allowance check reads chain A while the tx is signed/submitted on chain B. Two failure modes:

- **False "insufficient balance"** — blocks a shield the user could have executed.
- **False "OK"** — the user has 0 on the signer chain but non-zero on the provider chain; viem's own `ChainMismatchError` eventually trips, but the SDK has already polluted cache state and fired events.

`#getUnderlying` (`token.ts:79`) has the same pattern — resolves `underlyingToken()` on the provider chain but the wrapper contract is on the signer chain.

**Fix.** Either (a) enforce chain equality at `ZamaSDK` construction and on `signerChainChange` (warn-then-throw in strict mode), or (b) route pre-flight reads that inform a write through the signer's chain. Option (a) is the minimal fix and aligns with existing "chain assertion is the library's job" stance.

### B3. `signerAddressQueryOptions` fires and throws on read-only SDKs

`packages/sdk/src/query/signer-address.ts:45-51`

```ts
const signer = sdk.signer ?? NO_SIGNER;
return {
  queryKey: zamaQueryKeys.signerAddress.scope(getSignerScope(signer)),
  queryFn: async () => sdk.requireSigner("signerAddress").getAddress(),
  staleTime: 30_000,
  enabled: config?.query?.enabled !== false,
};
```

When `sdk.signer` is `undefined`, `enabled` is still `true`; `queryFn` deterministically throws `SignerRequiredError`. Downstream consumers that don't gate the query themselves:

- `useIsAllowed` (`authorization/use-is-allowed.ts:32`) — unconditional.
- `useConfidentialBalance` (`balance/use-confidential-balance.ts:51`) — unconditional.
- `useConfidentialBalances` (`balance/use-confidential-balances.ts:57`) — unconditional.
- `useUnderlyingAllowance` (`shield/use-underlying-allowance.ts:41`) — unconditional.
- `useConfidentialIsApproved` — correctly gated.

Effect: every mount of the four hooks in a read-only app produces a red error in TanStack DevTools and triggers retries.

**Fix.** Change the factory to `enabled: Boolean(sdk.signer) && (config?.query?.enabled !== false)` and delete `NO_SIGNER` (it exists purely to provide a stable WeakMap key in a state the query should never fire in).

---

## Blocking — test correctness

### B4. Test fixtures alias `signer.readContract === provider.readContract`

`packages/sdk/src/test-fixtures.ts:92-124`

`MockSigner = GenericSigner & Pick<GenericProvider, "readContract" | "waitForTransactionReceipt" | "getBlockTimestamp">` and `createMockProvider(signer)` reuses the same `vi.fn()` instances. Every test that asserts `vi.mocked(signer.readContract).toHaveBeenCalled()` would also pass if production code routed through `sdk.signer.readContract`. The refactor's central invariant ("reads go through the provider") is thus not observable in the test suite.

**Fix.** Either (a) give `createMockProvider` its own `vi.fn()` instances and migrate query/token/wrappers-registry tests to assert `provider.readContract` (structural correctness) or (b) leave the aliasing but add one regression test per adapter that fails if `sdk.signer.readContract` is reintroduced (practical correctness). (a) is cleaner for the long term.

### B5. Query keys missing provider identity — `staleTime: Infinity` entries are permanently cross-contaminated

`packages/sdk/src/query/token-metadata.ts`, `is-confidential.ts`, `total-supply.ts`

`tokenMetadataQueryOptions` routes through `sdk.provider.readContract` and has `staleTime: Infinity`. The key includes only `tokenAddress`. Two `ZamaProvider` instances in the same tree pointed at different chains share the cache entry. Once populated, the value never refreshes. `isConfidentialQueryOptions` is similar.

**Fix.** Scope these keys by provider chain ID (reuse the signer-scope WeakMap pattern on `sdk.provider`) or the provider instance directly. `wrappersRegistry` queries already include `registryAddress`, which partially mitigates this — apply the same pattern consistently.

---

## Blocking — JSDoc drift

### J1. `@throws SignerRequiredError` missing everywhere it now fires

Every method that calls `requireSigner` now throws `SignerRequiredError`, and none document it:

- `Token.confidentialTransfer` (`token.ts:121`)
- `Token.confidentialTransferFrom` (`token.ts:208`)
- `Token.approve` (`token.ts:295`)
- `Token.shield` (`token.ts:367`)
- `Token.unwrap` (`token.ts:438`)
- `Token.unwrapAll` (`token.ts:508`)
- `Token.delegateDecryption` (`token.ts:748`)
- `Token.revokeDelegation`
- `ReadonlyToken.balanceOf` / `confidentialBalanceOf` / `allowance` / `isApproved` when no explicit owner
- `ZamaSDK.userDecrypt` (`zama-sdk.ts:~390`)
- `ZamaSDK.revokeSession` (`zama-sdk.ts:~546`)

**Fix.** Add `@throws {@link SignerRequiredError}` with a short "if no signer is configured" tail on each method.

### J2. Stale examples in `ZamaProvider` / `ZamaSDK`

- `ZamaProvider` JSDoc (`packages/react-sdk/src/provider.tsx:76`) omits `provider` — will not compile.
- `ZamaSDK[Symbol.dispose]` example (`zama-sdk.ts:~584`) omits `provider` — will not compile.
- `useZamaSDK` doc (`provider.tsx:155`) still says "throws… when no signer is provided" — no longer accurate.

### J3. Re-exports missing from `@zama-fhe/react-sdk`

`packages/react-sdk/src/index.ts` re-exports the core SDK types but is missing `GenericProvider` and `SignerRequiredError`. Consumers who only install `@zama-fhe/react-sdk` cannot `instanceof SignerRequiredError` or type-reference `GenericProvider` without reaching into the core package.

### J4. Class-level `@param` tags on `EthersSigner` / `ViemSigner` / `WagmiSigner`

TSDoc ignores `@param` at class scope. Move those tags onto the constructor signatures.

### J5. `WagmiSignerConfig.config` undocumented

`wagmi-signer.ts:22-24` has no field-level JSDoc; `WagmiProviderConfig` does. The pairing (same `Config` instance for both) is load-bearing — document it explicitly.

---

## Architectural concerns (request changes)

### A1. `Token` should hold a non-nullable `signer`, removing all in-method `requireSigner` calls

`sdk.createToken(address)` already funnels construction. Having `createToken` call `sdk.requireSigner("createToken")` once and pass the result to a `Token` field typed `readonly signer: GenericSigner` removes:

- Three `requireSigner("shield")` calls inside `shield()` and more in `#ensureAllowance`.
- Two `requireSigner("unwrap")` / `requireSigner("unwrapAll")` / etc. patterns.
- The `requireSigner` / `sdk.signer` duality problem entirely for write operations.

`ReadonlyToken` stays signer-free; `Token` guarantees it at the type level. This is actually _closer_ to the plan's originally-proposed `new Token(address, provider, signer, relayer)` shape than DECISIONS.md D2 admits — and it's not a public API break because `Token` is always constructed via `sdk.createToken`.

### A2. `createThrowingSigner` is a type-laundering workaround

`zama-sdk.ts:34-41` exists only so `CredentialsManager`'s `signer: GenericSigner` field can be non-optional. But `requireSigner` already owns the "throw typed error on wallet-bound operation" contract. Giving `CredentialsManager` `signer: GenericSigner | undefined` and guarding at the (few) real call sites is cleaner and surfaces better stack traces (operation name known at the `ZamaSDK` boundary rather than "getAddress"/"getChainId" deep inside credential plumbing). Deleting `createThrowingSigner` also deletes one of the two "no signer" failure paths.

### A3. `NO_SIGNER` module-level sentinel is the wrong primitive

`query/signer-address.ts:12-17`. See B3 — `enabled: Boolean(sdk.signer)` eliminates the need for the sentinel entirely.

### A4. Dual `getChainId` without any mismatch detection

Both `GenericSigner` and `GenericProvider` expose `getChainId()`. `WrappersRegistry.getRegistryAddress()` uses `provider.getChainId()`; credentials use `signer.getChainId()`. Mismatch is silent. DECISIONS.md acknowledges this as a feature but adds no guardrail.

**Recommendation.** Either (a) add a one-time construction-time check in `ZamaSDK` that warns when `await signer.getChainId() !== await provider.getChainId()` (cheap, catches common misconfigurations), or (b) remove `getChainId()` from `GenericSigner` and drive all chain-ID-sensitive operations through the provider, which admittedly changes the semantics the plan specifies. (a) is the pragmatic fix.

### A5. Ethers double-`BrowserProvider` is a documentation gap, not just an allocation cost

`{ ethereum }` on both adapters wraps the same EIP-1193 source twice. Per-instance `getChainId()` timing, caches, and error surfaces diverge. DECISIONS.md dismisses this but the DX recommendation — pass a shared `ethers.Provider` explicitly via `{ provider }` — should be documented in `EthersProvider`'s JSDoc as the _preferred_ production path. Optionally ship a `createEthersAdapter(ethereum)` helper that returns `{ signer, provider }` backed by one `BrowserProvider`.

### A6. `DECISIONS.md` at the repo root

The file references internal tooling ("PostToolUse `pnpm typecheck` hook") and user directives. It is not an ADR (no context/alternatives/consequences structure). It will ship with `npm publish` unless explicitly excluded. Either convert to `docs/adr/0001-provider-signer-split.md` with proper ADR structure, or delete. Scrub internal references either way.

### A7. `WagmiProvider` name collision with wagmi's own component

`@zama-fhe/react-sdk/wagmi` now exports `WagmiProvider` — identical name to the most common wagmi symbol in any downstream app. The example in `examples/react-wagmi/src/providers.tsx` already has to alias: `WagmiProvider as ZamaWagmiProvider`. DECISIONS.md D6 justifies this as "symmetry" with `ViemProvider` / `EthersProvider`, but those names don't collide because viem/ethers don't export same-named components. Symmetry of export names is a weak reason to require every downstream user to alias. Consider `WagmiReadAdapter` / `WagmiChainProvider` / `ZamaWagmiProvider` before the public release.

### A8. Scope creep

The commit bundles the split with orthogonal behavioral changes:

- `onAccountChange` / `onChainChange` idempotence guards (`zama-sdk.ts:198-200, 213-215`) — new logic.
- `revokeSession` serial → `Promise.all` (`zama-sdk.ts:~549`) — correctness tweak.
- `SignerRequiredError` addition (required by the split, but the "operation name as string argument" API is worth its own review).

None are wrong; splitting them into follow-up commits would make bisect cleaner.

---

## Suggestions / nits

- **S1.** `useConfidentialBalances` uses `(baseOptions.enabled ?? true) && enabled` — inconsistent with `useConfidentialBalance` one file over. Use `Boolean(baseOptions.enabled) && enabled`.
- **S2.** `listPairsQueryOptions` closes over `registry` outside the key context — intentional and documented, but should add a one-liner asserting callers pass `sdk.registry`.
- **S3.** `ViemSignerConfig.publicClient` doc string references "every viem version" — add the specific version range or remove the phrase.
- **S4.** `WagmiProvider.waitForTransactionReceipt` throws `TransactionRevertedError` (unique among `GenericProvider` implementations) with no `@throws` annotation.
- **S5.** `createThrowingSigner` should be `@internal`-tagged for consistency with `emitEvent`.
- **S6.** `confidentialBalanceQueryOptions` does not gate on `owner` being defined — sibling factories do. Minor hazard, worth checking.

---

## Positive observations

- The interface split itself is clean — `GenericProvider` has a focused surface, `GenericSigner` is a genuine wallet-authority type.
- `SignerRequiredError` carries the operation name and extends `ZamaError`; the JSDoc `@example` on it is textbook.
- The 10 query factories migrate consistently and correctly route through `sdk.provider.readContract` (verified).
- `ZamaProvider` `useMemo` deps are correctly extended with `provider`.
- `onAccountChange` / `onChainChange` idempotence guards are a real UX improvement even if out of scope.
- DECISIONS.md D1 (no compat layer) is the right call; the narrow public migration (adapter imports only) is manageable.

---

## Recommended order of fixes

1. **B1** (ViemSigner.getChainId) — one-line fix, prevents silent chain-ID corruption.
2. **B2** (shield cross-chain) — add chain-consistency guard in `ZamaSDK` ctor (addresses A4 too).
3. **B3** (signerAddressQueryOptions `enabled`) — one-line fix, removes NO_SIGNER (A3).
4. **B4 + B5** (test invariant + query-key scoping) — structural test changes.
5. **A1** (Token-owns-signer) — refactor that eliminates a whole class of JSDoc (J1) gaps and dedup.
6. **J1–J5** (JSDoc sweep) — pass once the APIs above settle.
7. **A6** (`DECISIONS.md`) — either move to `docs/adr/` or delete before merge.
8. **A7** (WagmiProvider rename) — only before any public release where aliasing becomes a compat burden.
