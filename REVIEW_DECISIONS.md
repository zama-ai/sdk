# Review decisions — `feat/split-signer-provider` (c8323ed5)

Triaged outcome of the combined review feedback from `CODEX_REVIEW.md` and
`CLAUDE_REVIEW.md`. 20 unique items after dedup.

Each item is one of: **FIX** (land before merge), **SKIPPED** (deliberate
non-action, reason logged), **DEFERRED** (valid but out of scope for this PR).

Conventions used throughout:

- `#n` references the dedup table in the grilling session.
- Callsite references use `path:line` format for traceability.

---

## Posture (applies to every item below)

**No backwards compatibility. Full cutover.** Wherever a decision creates a
breaking change to public API, constructor shape, or config contract, the
expectation is to land the break in one pass rather than layer compat shims
or `@deprecated` aliases.

---

## FIX — land in this PR

### #1 — Examples call removed signer read APIs

**Problem.** Five example apps still call `sdk.signer.readContract`,
`sdk.signer.waitForTransactionReceipt`, and `sdk.signer.getBlockTimestamp`
— methods that no longer exist on `GenericSigner`. Runtime `TypeError` on
mount. Affected: `examples/react-ethers/{app/page.tsx,components/ShieldCard.tsx}`,
`examples/react-viem/{app/page.tsx,components/ShieldCard.tsx,e2e/fixtures.ts}`,
`examples/react-wagmi/components/ShieldCard.tsx`,
`examples/example-hoodi/{app/page.tsx,components/ShieldCard.tsx}`.

**Fix.** Pure find-and-replace:

- `sdk.signer.readContract` → `sdk.provider.readContract`
- `sdk.signer.waitForTransactionReceipt` → `sdk.provider.waitForTransactionReceipt`
- `sdk.signer.getBlockTimestamp` → `sdk.provider.getBlockTimestamp`

Also update the fixture comments in `react-viem/e2e/fixtures.ts` that
reference the old API.

**Verification.** Run the dev servers for at least one example (`react-viem`
and `react-ethers` in particular) and exercise the shield flow end-to-end in
a browser. The shield flow exercises `readContract` (allowance check),
`writeContract` (approve + wrap), and `waitForTransactionReceipt` —
representative coverage.

---

### #2 — `ViemSigner.getChainId` reads from the wrong client

**Problem.** `packages/sdk/src/viem/viem-signer.ts:65` calls
`this.#publicClient.getChainId()`. Per viem source
(`viem/src/actions/public/getChainId.ts:44`), `getChainId` always hits
`eth_chainId` on whatever transport the client owns — it does **not**
short-circuit to the statically configured chain. So `publicClient.getChainId()`
returns the chain of the public transport (possibly a dedicated RPC on
chain A), while `walletClient.getChainId()` returns the chain the wallet is
actually connected to (chain B). When those diverge,
`ZamaSDK.#initIdentity` and `CredentialsManager.computeStoreKey` key
credentials to the wrong chain.

**Fix.** Two changes:

1. `viem-signer.ts:65` → `return this.#walletClient.getChainId();`
2. Remove `publicClient` from `ViemSignerConfig` entirely. The field serves
   no purpose on the signer after the read/write split — reads live on
   `ViemProvider`. Delete the field, its JSDoc, and the constructor
   assignment.

This is a breaking change to `new ViemSigner({...})` but callers are already
editing their adapter construction to add `ViemProvider`, so the migration
cost is zero marginal.

---

### #3 — Chain coherence on write flows

**Problem.** The split intentionally allows `provider` and `signer` to be
independently configured (the main motivation: dedicated read RPC
independent of wallet). Today, every write method routes the transaction
through `signer.writeContract()` and then polls the receipt via
`provider.waitForTransactionReceipt()`. Pre-flight reads (e.g.
`shield`'s ERC-20 balance check, `#getUnderlying`, `#ensureAllowance`)
also go through `provider`. Three concrete breakages when chains diverge:

1. `Token#getUnderlying` reads `underlyingToken()` from the wrapper via
   `provider` (chain A), but the wrapper is on the signer's chain (B).
   Returned underlying address is nonsense on B.
2. `Token.shield` checks ERC-20 balance on chain A, submits wrap on chain B.
3. Every `writeContract` → `waitForTransactionReceipt` pair can "succeed"
   on chain B but the receipt is never found on chain A.

The original plan delegated chain enforcement to the underlying library.
Per viem source (`sendTransaction.ts:219-228`), viem only asserts chain
alignment between the wallet transport and the statically configured
`chain` field — it cannot see the Zama SDK's pre-flight reads through
`provider`, nor the receipt polling after the tx is submitted.

**Fix.** Add an SDK-level pre-flight check:

```ts
// ZamaSDK
async requireChainAlignment(operation: string): Promise<number> {
  if (!this.signer) return this.provider.getChainId();
  const [signerChainId, providerChainId] = await Promise.all([
    this.signer.getChainId(),
    this.provider.getChainId(),
  ]);
  if (signerChainId !== providerChainId) {
    throw new ChainMismatchError({ operation, signerChainId, providerChainId });
  }
  return signerChainId;
}
```

Introduce `ChainMismatchError extends ZamaError` carrying
`{ operation, signerChainId, providerChainId }`. Do **not** reuse viem's
`ChainMismatchError` — it requires a full `Chain` object (message includes
`chain.name`), which we don't have at the adapter boundary. Our error
class is the portable shape across viem / ethers / wagmi.

Call `requireChainAlignment(operation)` at the top of every write method on
`Token` (after the `Token.signer` refactor in #8 lands, the helper is
reached via `this.sdk.requireChainAlignment`): `confidentialTransfer`,
`confidentialTransferFrom`, `approve`, `shield`, `unwrap`, `unwrapAll`,
`finalizeUnwrap`, `delegateDecryption`, `revokeDelegation`. Also call it on
`ZamaSDK.userDecrypt` and `ZamaSDK.revokeSession`.

**Runtime cost.** Two concurrent `eth_chainId` RPC hops per write
(~1–10 ms wall-clock on browser wallets; both are independent round-trips
through the EIP-1193 transport — viem does in-flight dedup only, no
persistent cache). Acceptable for human-scale operations.

---

### #4 — Signer-address resolution moved out of the query factory

**Problem.** `signerAddressQueryOptions` was doing too much: a bootstrap
query to resolve the signer's address, used by 5 hooks. It fired even when
`sdk.signer` was undefined (because `enabled: config?.query?.enabled !== false`
defaulted to true), throwing `SignerRequiredError` into TanStack devtools
for every read-only mount. A `NO_SIGNER` sentinel + WeakMap scope pattern
existed purely to give the dead query a stable cache key.

Also: TanStack v5's `useSuspenseQuery` does not accept `enabled: false`
— the `Omit<..., "enabled">` on the type prevents gating suspense queries
via enable. So any fix that keeps the factory fundamentally cannot handle
the suspense case cleanly.

**Fix (structural).** Delete the query factory entirely. Lift signer-address
resolution to React state in `ZamaProvider`:

```tsx
// packages/react-sdk/src/provider.tsx — inside ZamaProvider
const [signerAddress, setSignerAddress] = useState<Address | undefined>();
useEffect(() => {
  if (!sdk.signer) {
    setSignerAddress(undefined);
    return;
  }
  let cancelled = false;
  sdk.signer.getAddress().then((addr) => {
    if (!cancelled) setSignerAddress(addr);
  });
  const unsub = sdk.signer.subscribe?.({
    onAccountChange: (addr) => setSignerAddress(addr),
    onDisconnect: () => setSignerAddress(undefined),
  });
  return () => {
    cancelled = true;
    unsub?.();
  };
}, [sdk.signer]);
```

Expose two public hooks:

- `useSignerAddress(): Address | undefined` — reads provider state, sync.
- `useSignerAddressSuspense(): Address` — inline `useSuspenseQuery`,
  throws `SignerRequiredError` from `queryFn` when no signer; propagates
  to the nearest error boundary via suspense's error channel.

Migrate the 5 consumer hooks:

- `useIsAllowed`, `useConfidentialBalance`, `useConfidentialBalances`,
  `useUnderlyingAllowance`, `useConfidentialIsApproved` (non-suspense
  variant only) → replace `useQuery(signerAddressQueryOptions(sdk))` with
  `useSignerAddress()`. Each hook adds `enabled: ... && resolvedHolder !== undefined`
  where appropriate.
- `useUnderlyingAllowanceSuspense` → use `useSignerAddressSuspense()`
  internally. Consumers who call it without a signer get an error boundary
  hit — documented.

Delete `packages/sdk/src/query/signer-address.ts` and its test. Remove
exports from `packages/sdk/src/query/index.ts` and
`packages/react-sdk/src/index.ts`. Delete the `WeakMap` + `NO_SIGNER`
sentinel; delete `signerScopes`, `getSignerScope` helpers.

**Why this is better than gating `enabled` at the factory.** The factory
approach cannot handle suspense (v5 type constraint). The React-state
approach (a) handles both suspense and non-suspense cleanly, (b) gives
account-change reactivity for free via `subscribe()`, (c) eliminates ~60
lines of bootstrap infrastructure.

---

### #5 — `useConfidentialIsApprovedSuspense` ignores explicit `holder`

**Problem.** `packages/react-sdk/src/transfer/use-confidential-is-approved.ts:89`
calls `useSuspenseQuery(signerAddressQueryOptions(sdk))` unconditionally,
even when the caller provided an explicit `holder`. The non-suspense
variant correctly gates on `holder === undefined`. This is the bug
Codex §2 flagged; the Claude review mistakenly looked only at the
non-suspense variant and called the factory "correctly gated."

**Fix.** Make `holder: Address` **required** in
`UseConfidentialIsApprovedSuspenseConfig` (drop the `?`). The suspense
hook then never needs `signerAddressQueryOptions` at all — callers who
want "connected wallet + suspense" compose:

```tsx
const { data: myAddress } = useSignerAddressSuspense();
const { data: isApproved } = useConfidentialIsApprovedSuspense({
  tokenAddress,
  spender,
  holder: myAddress,
});
```

This is breaking (suspense config previously allowed omitting `holder`).
Acceptable per full-cutover stance.

---

### #7 — Test fixtures alias signer and provider reads

**Problem.** `packages/sdk/src/test-fixtures.ts:92-124` defines
`MockSigner = GenericSigner & Pick<GenericProvider, "readContract" | ...>`
and `createMockProvider(signer)` reuses the signer's `vi.fn()` instances:

```ts
return {
  getChainId: signer.getChainId,
  readContract: signer.readContract,
  waitForTransactionReceipt: signer.waitForTransactionReceipt,
  getBlockTimestamp: signer.getBlockTimestamp,
};
```

Every test that asserts `vi.mocked(signer.readContract).toHaveBeenCalled()`
would also pass if production code regressed to routing reads through
`sdk.signer.readContract`. The refactor's central invariant ("reads go
through the provider") is thus not observable in the test suite.

**Fix.** Full split — no alias:

```ts
export type MockSigner = GenericSigner; // production shape

export function createMockSigner(
  address: Address = USER,
  overrides?: Partial<GenericSigner>,
): GenericSigner {
  return {
    getChainId: vi.fn().mockResolvedValue(31337),
    getAddress: vi.fn().mockResolvedValue(address),
    signTypedData: vi.fn().mockResolvedValue("0xsig"),
    writeContract: vi.fn().mockResolvedValue("0xtxhash"),
    subscribe: vi.fn().mockReturnValue(() => {}),
    ...overrides,
  };
}

export function createMockProvider(overrides?: Partial<GenericProvider>): GenericProvider {
  return {
    getChainId: vi.fn().mockResolvedValue(31337),
    readContract: vi.fn(),
    waitForTransactionReceipt: vi.fn().mockResolvedValue({ logs: [] }),
    getBlockTimestamp: vi.fn().mockResolvedValue(BigInt(Math.floor(Date.now() / 1000))),
    ...overrides,
  };
}
```

Migrate ~58 assertion sites across ~34 test files (grep:
`signer.readContract`, `signer.waitForTransactionReceipt`,
`signer.getBlockTimestamp` + assertion patterns). The TypeScript compiler
will guide: once `MockSigner` no longer has `readContract`, every stale
assertion errors until migrated.

**Invariant enforced.** After the migration, `sdk.signer.readContract`
does not compile — accidental regressions in production are caught at
build time, directly satisfying the original plan's acceptance criterion
"no public chain read in the SDK routes through the signer."

---

### #8 — `Token` owns a non-nullable `signer`

**Problem.** Today every write method on `Token` calls
`this.sdk.requireSigner("<op>")` — 17+ call sites. Duplication, JSDoc
`@throws SignerRequiredError` on every method, no type-level guarantee
that `Token` has a signer.

**Fix.**

Core SDK:

```ts
// ZamaSDK.createToken
createToken(address: Address, wrapper?: Address): Token {
  const signer = this.requireSigner("createToken");
  return new Token(this, signer, address, wrapper);
}

// Token
export class Token extends ReadonlyToken {
  readonly signer: GenericSigner;
  constructor(sdk: ZamaSDK, signer: GenericSigner, address: Address, wrapper?: Address) {
    super(sdk, address);
    this.signer = signer;
    this.wrapper = wrapper ? getAddress(wrapper) : this.address;
  }
  // Every write method uses this.signer.* directly.
}
```

React SDK:

```ts
export function useToken(config: UseZamaConfig): Token | undefined {
  const sdk = useZamaSDK();
  return useMemo(
    () => (sdk.signer ? sdk.createToken(config.tokenAddress, config.wrapperAddress) : undefined),
    [sdk, sdk.signer, config.tokenAddress, config.wrapperAddress],
  );
}
```

The 9 mutation hooks that consume `useToken()` add a single-line guard in
their `mutationFn`:

```ts
mutationFn: async (args) => {
  if (!token) throw new SignerRequiredError("<op>");
  return token.<op>(args);
}
```

This pattern mirrors wagmi's `useWriteContract` — always-mountable, fails
on trigger not on render. Pre-connect UIs continue to work.

**Wins.** ~17 `requireSigner("op")` calls inside `Token` collapse to
`this.signer.x()`. `@throws SignerRequiredError` JSDoc on Token write
methods collapses to a single annotation on `sdk.createToken`. Type-level
proof that any `Token` instance was built with a signer.

---

### #9 — Credentials managers are optional when no signer

**Problem.** `createThrowingSigner` is a stub whose sole purpose is to
make `CredentialsManager.signer: GenericSigner` non-optional. Every method
on `CredentialsManager` eventually calls `#storeKey()` → `signer.getAddress()`

- `signer.getChainId()` to identify whose credentials to manage. Without
  a signer, there is no "whose" — the entire manager is semantically empty.

Today, signer-less SDKs see `sdk.credentials` populated with a throwing
stub. Calling `sdk.credentials.allow(...)` surfaces
`SignerRequiredError("getAddress")` or `SignerRequiredError("getChainId")`
— the operation name is the low-level signer method, not the
caller-meaningful op.

**Fix.**

```ts
class ZamaSDK {
  readonly signer: GenericSigner | undefined;
  readonly credentials: CredentialsManager | undefined;
  readonly delegatedCredentials: DelegatedCredentialsManager | undefined;

  constructor(config: ZamaSDKConfig) {
    // ...
    if (config.signer) {
      const credentialsConfig = { signer: config.signer /* ... */ };
      this.credentials = new CredentialsManager(credentialsConfig);
      this.delegatedCredentials = new DelegatedCredentialsManager(credentialsConfig);
    }
    // else: both remain undefined
  }

  requireCredentials(operation: string): CredentialsManager {
    if (!this.credentials) throw new SignerRequiredError(operation);
    return this.credentials;
  }

  requireDelegatedCredentials(operation: string): DelegatedCredentialsManager {
    if (!this.delegatedCredentials) throw new SignerRequiredError(operation);
    return this.delegatedCredentials;
  }
}
```

- `CredentialsManagerConfig.signer` stays **required** — the config type is
  honest.
- Delete `createThrowingSigner` entirely.
- All callers switch from `sdk.credentials.<op>(...)` to
  `sdk.requireCredentials("op").<op>(...)` (or the delegated equivalent).
  Known callers: `ReadonlyToken.isAllowed` (`readonly-token.ts:468`),
  `ReadonlyToken.revoke` (`readonly-token.ts:480`),
  `ReadonlyToken.delegateForUserDecryption` callers at lines 312 and 637,
  `ZamaSDK.userDecrypt`, `ZamaSDK.revokeSession`, `query/revoke.ts`.
- No silent `return false` / no-op fallbacks. The honest answer to "am I
  allowed?" when no signer is present is a thrown error, not a lie.

**Error type.** Reuse `SignerRequiredError` — the root cause is still
"no signer was configured." No new `CredentialsRequiredError` needed.

---

### #10 — Wagmi adapter name collision

**Problem.** `WagmiProvider` (our adapter class) collides with wagmi's
own `WagmiProvider` component. Every downstream wagmi user must alias on
import. The example in this repo already does:

```tsx
import { WagmiProvider as ZamaWagmiProvider } from "@zama-fhe/react-sdk/wagmi";
```

`ViemProvider` / `EthersProvider` don't collide because viem and ethers
don't export same-named components.

**Fix.** Rename the wagmi pair:

- `WagmiProvider` → `ZamaWagmiProvider`
- `WagmiSigner` → `ZamaWagmiSigner`
- Rename `WagmiProviderConfig` → `ZamaWagmiProviderConfig`, same for signer.

Leave viem and ethers pairs alone — the asymmetry is principled (fixes a
real collision; unnecessary elsewhere).

Update `packages/react-sdk/src/wagmi/index.ts` exports, the two class
files, and the example apps. Update re-exports in root `index.ts`.

---

### JSDoc sweep (do last)

After #3, #8, #9, #10 settle, run one editorial pass covering #15–#19 +
S1/S2/S4/S6. **Sweep scope and guidance:**

1. **`@throws` annotations** — after #8 lands, `@throws SignerRequiredError`
   is only needed on:
   - `ZamaSDK.createToken` (one-liner: factory throws when no signer).
   - `ZamaSDK.userDecrypt`, `ZamaSDK.revokeSession` (call `requireSigner`
     directly).
   - `ReadonlyToken.balanceOf` / `confidentialBalanceOf` / `allowance` /
     `isApproved` — only when `owner` is omitted.
   - `ReadonlyToken.isAllowed`, `ReadonlyToken.revoke`,
     `ReadonlyToken.delegateForUserDecryption` — always require credentials
     via `requireCredentials`.
     Add `@throws ChainMismatchError` to every write method on `Token` and to
     `ZamaSDK.userDecrypt` / `ZamaSDK.revokeSession` (any method calling
     `requireChainAlignment`).

2. **Stale examples** (#16) — audit every fenced code block in the
   following files for "old shape" (signer-only, no `provider` prop):
   - `packages/react-sdk/src/provider.tsx` (ZamaProvider and `useZamaSDK`
     doc).
   - `packages/sdk/src/zama-sdk.ts` (`Symbol.dispose` example and any
     ctor examples).

3. **Missing re-exports** (#17) — add to
   `packages/react-sdk/src/index.ts`:
   - `type GenericProvider`
   - `SignerRequiredError`
   - `ChainMismatchError` (new in #3)
   - `useSignerAddress`, `useSignerAddressSuspense` (new in #4)
   - `ZamaWagmiProvider` / `ZamaWagmiSigner` — **keep off the root** index;
     they live on the `@zama-fhe/react-sdk/wagmi` subpath to avoid forcing
     wagmi into the root bundle.

4. **Class-level `@param` migration** (#18) — in `EthersSigner`,
   `ViemSigner`, `ZamaWagmiSigner` (and the new `EthersProvider` /
   `ViemProvider` / `ZamaWagmiProvider`): TSDoc ignores `@param` at class
   scope. Move every `@param` tag onto the constructor signature.

5. **`ZamaWagmiSignerConfig.config` doc** (#19) — document the `config`
   field, and explicitly state the pairing contract: "Pass the same wagmi
   `Config` instance to `ZamaWagmiSignerConfig.config` and
   `ZamaWagmiProviderConfig.config` so reads and writes share the same
   transport and chain state." Mirror the note on both sides.

6. **Nits** — resolve in the sweep:
   - **S1** — align `useConfidentialBalances` enabled computation with
     `useConfidentialBalance` (same pattern, same file). Use
     `Boolean(baseOptions.enabled) && enabled`.
   - **S2** — one-line note on `listPairsQueryOptions` asserting callers
     pass `sdk.registry`.
   - **S4** — `ZamaWagmiProvider.waitForTransactionReceipt` throws
     `TransactionRevertedError` (unique among `GenericProvider`
     implementations). Add `@throws {@link TransactionRevertedError}`.
   - **S6** — verify `confidentialBalanceQueryOptions` owner-gate
     behavior. Sibling factories gate on `owner !== undefined`; confirm
     whether the missing gate is intentional and document or fix
     accordingly.

7. **Obsolete by other decisions** (cross-reference, no separate action):
   - **S3** — `ViemSignerConfig.publicClient` JSDoc: moot, field deleted
     in #2.
   - **S5** — `createThrowingSigner` `@internal` tag: moot, function
     deleted in #9.

---

## SKIPPED

Deliberate non-actions. Reasons logged so future reviews can see the
rationale instead of re-raising.

### #6 — Scope read query keys by provider identity

**Raised by.** Codex §4, Claude B5.

**Decision.** SKIPPED for this PR. Revisit later.

**Why now-skipped.** The fix as proposed requires adding `chainId: number`
as a parameter to ~15 query factories + threading a
`useProviderChainId()` hook through every React consumer + resolving
provider chain asynchronously at SDK construction. The failure modes
(multi-provider trees with shared `QueryClient`, `staleTime: Infinity`
entries surviving provider swaps) are real but narrow in practice. Cost
of the fix > value for this PR.

### #11 — Ethers double-`BrowserProvider`

**Raised by.** Claude A5.

**Decision.** SKIPPED. Accept the minor allocation.

**Why.** Two `BrowserProvider` instances wrapping the same
`window.ethereum` costs ~1–2 duplicate `eth_chainId` calls at init + one
extra JS object. Ethers v6 `BrowserProvider` does no default polling, so
there is no ongoing cost. A fix would require either (a) documenting a
"preferred production path" that users can ignore or (b) introducing a
new `{ browserProvider, ethereum }` config variant and a
`createEthersAdapter` helper — neither is justified by the actual cost.

---

## DEFERRED

Valid items to revisit in their own PRs after this one lands.

### #6 — Provider-scoped query keys _(revisit)_

See SKIPPED rationale above. Worth doing eventually — the
multi-chain / provider-swap failure modes are real — but scoped as its own
change: ~15 factory signatures, query-keys.ts schema overhaul, React
`useProviderChainId()` plumbing, a round of hook migration. Worth a
focused PR with its own acceptance tests.

### #12 — `DECISIONS.md` at repo root

**Raised by.** Claude A6.

**Status.** Keep for now. **Delete before the branch merges to `main`.**

The file is useful as a working record during implementation but
references internal tooling ("PostToolUse `pnpm typecheck` hook") and
user directives. It would ship with `npm publish` unless filtered. Either
scrub + move to `docs/adr/0001-provider-signer-split.md` with proper
context/decision/alternatives/consequences structure, or delete. Decision
on which path to take is deferred to the merge-prep step.

### #13 — Scope creep in c8323ed5

**Raised by.** Claude A8.

**Decision.** Acknowledged, no action for this PR.

The split commit bundled three orthogonal changes:

1. `onAccountChange` / `onChainChange` idempotence guards
   (`zama-sdk.ts:198-200, 213-215`).
2. `revokeSession` serial → `Promise.all` (`zama-sdk.ts:~549`).
3. `SignerRequiredError` API shape ("operation name as string argument").

All three are either necessary or net-positive. Splitting history now
adds noise; the fixes from this review will land on the same branch and
merge together anyway. **Lesson for future PRs:** keep behavioral tweaks
separate from type refactors for bisect cleanliness.

### #14 — `wrapper-discovery` factory carries stale signer-era shape

**Raised by.** Codex NB.

**Decision.** Orthogonal pre-existing debt, defer to a dedicated cleanup
PR.

The `tokenAddress` field in `WrapperDiscoveryQueryConfig` +
`UseWrapperDiscoveryConfig` is used purely for cache namespacing and
enablement gating — the registry lookup itself uses `erc20Address` +
`registryAddress`. The JSDoc even says "Used only to derive the signer
context" (stale terminology — no signer is involved). Cleanup scope:
drop `tokenAddress` from both configs, rename
`zamaQueryKeys.wrapperDiscovery.token` → `.lookup`, update the React
hooks.

This predates the split. Including it would bundle unrelated cleanup into
the split PR, which is exactly the bisect-hostile pattern flagged in #13.

### FU1 — Require explicit `owner`/`holder` on read hooks (wagmi-shape)

**Raised by.** Post-review discussion on the design of #4 after examining
`/Users/msaug/zama/wagmi` and `/Users/msaug/zama/viem` for precedent.

**Decision.** DEFERRED to a follow-up PR. Out of scope here.

**Context.** Wagmi's read hooks (`useBalance`, `useReadContract`,
`useSignMessage`) never internally read `useAccount().address` — the
connected-wallet address is always passed explicitly by the caller. Viem
follows the same rule at a lower layer: every wallet action resolves
`account` from an explicit param with the client default as fallback
(`viem/src/actions/wallet/sendTransaction.ts:167`). The sync connection
primitive (`useAccount` / `useConnection`) exists specifically so callers
can thread the address through; no hook does the fallback itself.

The Zama equivalent would be: make `owner` / `holder` a required field
on every read-hook config, delete the implicit `useSignerAddress()`
reach-in from each hook, and let query keys embed `owner` as a plain
field (matching wagmi's `['balance', { address, chainId, ... }]` shape
at `packages/core/src/query/getBalance.ts:51-57`).

**Why deferred.** #4 as written keeps the implicit fallback and only
swaps the bootstrap query for the sync `useSignerAddress()` hook — that
is the local fix for the spurious read-only-mount errors caused by the
split. Making `owner`/`holder` required is a distinct design change with
its own thesis ("stop doing implicit connected-wallet fallback, align
with wagmi/viem's explicit-params pattern") and its own breaking-change
surface (all 5 read hooks + their suspense variants + every consumer
callsite). Rolling it into this PR would bundle two unrelated breaks
behind one "full cutover" justification — exactly the bisect-hostile
pattern #13 flagged.

**Scope of the follow-up.** One coherent PR covering:

- Make `owner`/`holder` required on `useIsAllowed`,
  `useConfidentialBalance`, `useConfidentialBalances`,
  `useUnderlyingAllowance`, `useConfidentialIsApproved` — suspense and
  non-suspense variants, config-level (not a runtime check).
- Remove the internal `useSignerAddress()` call from each. Cache keys
  embed `owner` as a plain field via `filterQueryOptions`; drop any
  remaining per-signer scoping.
- Add optional `readonly address?: Address` to `GenericSigner`.
  `ViemSigner` populates it synchronously from
  `walletClient.account.address` (already available at
  `packages/sdk/src/viem/viem-signer.ts:69`). `ZamaProvider` seeds its
  state with `sdk.signer?.address` to skip the first-render `undefined`
  window for viem users; ethers users unchanged.
- Add `useSignerStatus(): 'disconnected' | 'connecting' | 'connected'`
  for consumer UI gating — the sync indicator that makes the "writes
  throw at mutate time" pattern from #8 actually usable at the render
  layer. Mirrors `useAccount().status` from wagmi.
- Document the call-site pattern in the migration guide:
  ```tsx
  const owner = useSignerAddress();
  const { data: balance } = useConfidentialBalance({ tokenAddress, owner });
  ```
  Plus an optional thin `useMy*` wrapper layer if the call-site
  ergonomics prove friction-heavy in practice — ship only on demand, not
  preemptively.

**Wins.** Cache keys become honest (explicit `owner` replaces implicit
signer-identity scope); read hooks become reusable for non-connected
addresses (admin dashboards, "look at another user's balance"); suspense
variants stop silently fetching the connected wallet; the implicit
coupling between "read hook" and "current signer" disappears everywhere.

**Cost.** Every consumer callsite for the 5 hooks gets one extra line
(`const owner = useSignerAddress()`). Single breaking change, one-pass
migration. Documented precedent in both wagmi and viem.

---

## Resolved conflicts / corrections

Noting where the two reviews disagreed or where external-source research
contradicted the reviews.

### `useConfidentialIsApprovedSuspense` — gating behavior

Codex §2 claimed the suspense variant was broken (resolves signer
address even when `holder` is explicit). Claude B3 claimed
`useConfidentialIsApproved` was "correctly gated." Reading
`packages/react-sdk/src/transfer/use-confidential-is-approved.ts:89`
confirms Codex is correct: the suspense variant calls
`useSuspenseQuery(signerAddressQueryOptions(sdk))` unconditionally.
Claude's assertion applied only to the non-suspense variant. Fix tracked
as #5.

### `walletClient.getChainId()` cost

Earlier framing in the Q2 discussion claimed `walletClient.getChainId()`
was "essentially free" on browser wallets. Viem source review disagreed:
`src/actions/public/getChainId.ts:44` always hits `eth_chainId` on the
transport — no static short-circuit, no persistent cache. The only
caching is in-flight dedup via `withDedupe`
(`src/utils/promise/withDedupe.ts:17`). For MetaMask `custom` transport,
this is a real postMessage round-trip (~1–5 ms). The chain-alignment check
in #3 therefore costs ~2–10 ms per write, not zero. Still acceptable, but
the framing matters for future decisions about adding similar checks.

---

## Suggested implementation order

1. **#2 `ViemSigner.getChainId`** — one-line correctness fix, zero
   dependencies.
2. **#1 Examples** — unblocks local verification of the rest.
3. **#7 Test fixtures** — land before the refactors so new tests assert
   against correct structure. Also surfaces any production regressions.
4. **#9 Credentials managers optional** — enables deleting
   `createThrowingSigner`, cleans up a key invariant.
5. **#8 `Token` owns signer** — refactor pass; collapses 17
   `requireSigner` calls and half the JSDoc.
6. **#3 Chain alignment** — add `ChainMismatchError` and
   `requireChainAlignment` once `Token.signer` exists (cleaner to wire
   through the class-held signer).
7. **#4 / #5 Signer-address plumbing** — ZamaProvider state,
   `useSignerAddress{,Suspense}`, migrate 5 hooks, make suspense `holder`
   required.
8. **#10 Wagmi rename** — mechanical, after the dust settles.
9. **JSDoc sweep** — last, one editorial pass per the guidance above.

Verification at each step: `pnpm typecheck`, relevant test suite. After
step 2, run at least one example dev server to cover the shield flow
end-to-end.
