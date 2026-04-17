# Review: `c8323ed552d3311ffbd426dbea1cf45b3869d623`

## Findings

### 1. Examples still call removed signer read APIs and now crash at runtime

Severity: High

The split removed `readContract`, `waitForTransactionReceipt`, and `getBlockTimestamp` from `GenericSigner`, but several shipped examples still call those methods on `sdk.signer`.

Representative call sites:

- [examples/react-ethers/src/components/ShieldCard.tsx](/Users/msaug/zama/zama-sdk-2/examples/react-ethers/src/components/ShieldCard.tsx:68)
- [examples/react-ethers/src/app/page.tsx](/Users/msaug/zama/zama-sdk-2/examples/react-ethers/src/app/page.tsx:278)
- [examples/react-viem/src/components/ShieldCard.tsx](/Users/msaug/zama/zama-sdk-2/examples/react-viem/src/components/ShieldCard.tsx:68)
- [examples/react-wagmi/src/components/ShieldCard.tsx](/Users/msaug/zama/zama-sdk-2/examples/react-wagmi/src/components/ShieldCard.tsx:68)
- [examples/example-hoodi/src/components/ShieldCard.tsx](/Users/msaug/zama/zama-sdk-2/examples/example-hoodi/src/components/ShieldCard.tsx:68)

Example:

```ts
const currentAllowance = await sdk.signer.readContract(...)
await sdk.signer.waitForTransactionReceipt(txHash)
```

After this commit, those methods no longer exist on `sdk.signer`, so these flows fail with raw `TypeError`s before they ever exercise the new provider abstraction.

Why this matters:

- The PR claims the examples were part of the migration scope.
- These examples are part of the public adoption path for the new API.
- The breakage is immediate and user-visible.

Recommended fix:

- Replace all public reads and receipt polling in examples with `sdk.provider.*`.
- Keep `sdk.signer.*` for wallet authority only.

### 2. The React surface is still not safe for provider-only mode

Severity: High

One of the core goals of the refactor was letting apps render useful on-chain state before wallet connection. The core SDK now supports that, but several React hooks still eagerly require a signer.

Concrete cases:

- [packages/react-sdk/src/authorization/use-is-allowed.ts](/Users/msaug/zama/zama-sdk-2/packages/react-sdk/src/authorization/use-is-allowed.ts:31)
- [packages/react-sdk/src/balance/use-confidential-balance.ts](/Users/msaug/zama/zama-sdk-2/packages/react-sdk/src/balance/use-confidential-balance.ts:51)
- [packages/react-sdk/src/balance/use-confidential-balances.ts](/Users/msaug/zama/zama-sdk-2/packages/react-sdk/src/balance/use-confidential-balances.ts:57)
- [packages/react-sdk/src/shield/use-underlying-allowance.ts](/Users/msaug/zama/zama-sdk-2/packages/react-sdk/src/shield/use-underlying-allowance.ts:41)
- [packages/react-sdk/src/transfer/use-confidential-is-approved.ts](/Users/msaug/zama/zama-sdk-2/packages/react-sdk/src/transfer/use-confidential-is-approved.ts:89)
- [packages/sdk/src/query/signer-address.ts](/Users/msaug/zama/zama-sdk-2/packages/sdk/src/query/signer-address.ts:45)

Root cause:

- `signerAddressQueryOptions()` is enabled by default even when `sdk.signer` is absent.
- Its `queryFn` calls `sdk.requireSigner("signerAddress")`.
- Hooks layer on top of it unconditionally, so a read-only `<ZamaProvider provider=... signer={undefined}>` throws `SignerRequiredError` instead of staying idle.

The most obvious regression is the suspense approval hook:

- [packages/react-sdk/src/transfer/use-confidential-is-approved.ts](/Users/msaug/zama/zama-sdk-2/packages/react-sdk/src/transfer/use-confidential-is-approved.ts:85)

The non-suspense version correctly skips signer lookup when `holder` is explicitly provided. The suspense version always resolves signer address first, so a public read that should work with an explicit holder is still wallet-gated.

Why this matters:

- This is directly contrary to the stated product goal of pre-connect reads.
- It leaves the core SDK and the React SDK with different behavior contracts.
- It also contradicts the local decision record in [DECISIONS.md](/Users/msaug/zama/zama-sdk-2/DECISIONS.md:67) and [DECISIONS.md](/Users/msaug/zama/zama-sdk-2/DECISIONS.md:82).

Recommended fix:

- Make `signerAddressQueryOptions()` disable itself when `sdk.signer` is absent.
- In higher-level hooks, only resolve signer address when the caller omitted the owner/holder.
- Add read-only hook tests for both regular and suspense variants.

### 3. The split introduced a provider/signer chain-coherence bug on write flows

Severity: High

The new architecture explicitly allows independent provider and signer instances, but write flows now submit through the signer and then poll receipts through the provider with no guard that both are on the same chain.

Representative sites:

- [packages/sdk/src/token/token.ts](/Users/msaug/zama/zama-sdk-2/packages/sdk/src/token/token.ts:167)
- [packages/sdk/src/token/token.ts](/Users/msaug/zama/zama-sdk-2/packages/sdk/src/token/token.ts:175)
- [packages/sdk/src/token/token.ts](/Users/msaug/zama/zama-sdk-2/packages/sdk/src/token/token.ts:264)
- [packages/sdk/src/token/token.ts](/Users/msaug/zama/zama-sdk-2/packages/sdk/src/token/token.ts:407)
- [packages/sdk/src/zama-sdk.ts](/Users/msaug/zama/zama-sdk-2/packages/sdk/src/zama-sdk.ts:133)

Pattern:

```ts
const txHash = await this.sdk.requireSigner(...).writeContract(...)
const receipt = await this.sdk.provider.waitForTransactionReceipt(txHash)
```

Before the split, the same abstraction both submitted and polled the transaction. After the split, a valid supported configuration can:

1. send the transaction through the signer on chain A
2. poll for the receipt through the provider on chain B
3. fail with "receipt not found" or a wrapped revert/timeout even though the transaction succeeded on chain A

This is not just a theoretical purity concern:

- the PR explicitly allows mixed configurations
- the PR explicitly declines to add a chain-alignment assertion
- credential/session identity still tracks the signer chain, while registry resolution tracks the provider chain

That means the refactor removed a safety invariant without replacing it with either enforcement or a coherent fallback.

Recommended fix:

- Either re-couple receipt polling to the signer transport for writes, or
- enforce `await signer.getChainId() === await provider.getChainId()` before every wallet-bound flow and throw a clear configuration error.

### 4. Read query caches are still keyed only by token params, not provider identity

Severity: Medium

The refactor moved reads from the signer to the provider, but the React Query keys still ignore provider identity and chain.

Evidence:

- [packages/sdk/src/query/token-metadata.ts](/Users/msaug/zama/zama-sdk-2/packages/sdk/src/query/token-metadata.ts:30)
- [packages/sdk/src/query/is-confidential.ts](/Users/msaug/zama/zama-sdk-2/packages/sdk/src/query/is-confidential.ts:23)
- [packages/sdk/src/query/query-keys.ts](/Users/msaug/zama/zama-sdk-2/packages/sdk/src/query/query-keys.ts:53)
- [packages/react-sdk/src/provider.tsx](/Users/msaug/zama/zama-sdk-2/packages/react-sdk/src/provider.tsx:116)

`ZamaProvider` recreates the SDK when `provider` changes, but none of the read-query keys or invalidation paths reflect that. For queries with `staleTime: Infinity`, such as token metadata and ERC-165 checks, a provider swap can leave permanently stale data in cache under the same key.

Why this matters:

- The split’s main value proposition is independent read infrastructure.
- Without provider-aware query keys or invalidation, the React layer still behaves as if reads were tied to a single long-lived transport.

Recommended fix:

- Scope read query keys by provider identity or resolved chain ID, or
- invalidate all Zama read queries when the `provider` prop changes.

### 5. Coverage does not actually prove the refactor’s main acceptance criteria

Severity: Medium

The migrated tests still share the provider and signer mocks, so they do not prove that reads truly moved off the signer path.

Evidence:

- [packages/sdk/src/test-fixtures.ts](/Users/msaug/zama/zama-sdk-2/packages/sdk/src/test-fixtures.ts:117)
- [packages/sdk/src/**tests**/wrappers-registry.test.ts](/Users/msaug/zama/zama-sdk-2/packages/sdk/src/__tests__/wrappers-registry.test.ts:35)
- [packages/sdk/src/query/**tests**/signer-address.test.ts](/Users/msaug/zama/zama-sdk-2/packages/sdk/src/query/__tests__/signer-address.test.ts:5)

`createMockProvider()` reuses the signer's `vi.fn()` implementations:

```ts
return {
  getChainId: signer.getChainId,
  readContract: signer.readContract,
  waitForTransactionReceipt: signer.waitForTransactionReceipt,
  getBlockTimestamp: signer.getBlockTimestamp,
};
```

As a result:

- tests asserting on `signer.readContract` still pass even if production code secretly regresses to signer-based reads
- the suite does not prove the "no public chain read in the SDK routes through the signer" acceptance criterion
- the new `sdk.signer === undefined` behavior is barely exercised

Recommended fix:

- Use distinct provider and signer mocks in integration-style tests.
- Add explicit provider-only tests for public reads.
- Add read-only hook tests and mixed provider/signer integration tests.

## Architectural Assessment

The high-level direction is correct. Splitting provider and signer matches viem/ethers/wagmi and removes the worst part of the old API shape.

The problem is that the implementation stopped at the type split. Several behaviors that used to be safe because everything rode the same transport are now split across two independently configured objects:

- writes happen on signer, receipts on provider
- credential identity tracks signer chain
- registry resolution tracks provider chain
- query caches still assume read transport identity is irrelevant
- the React hook layer still assumes a signer is always present

So the code now has a better type model, but not yet a fully coherent runtime model.

The deepest architectural issue is not that provider and signer are separate. It is that the codebase still has several implicit assumptions that they are effectively the same connection, even though the public API now says they are not.

## Non-blocking Concerns

### Wrapper discovery still carries a stale signer-era API shape

- [packages/sdk/src/query/wrapper-discovery.ts](/Users/msaug/zama/zama-sdk-2/packages/sdk/src/query/wrapper-discovery.ts:7)
- [packages/react-sdk/src/token/use-wrapper-discovery.ts](/Users/msaug/zama/zama-sdk-2/packages/react-sdk/src/token/use-wrapper-discovery.ts:12)

The hook still requires an unrelated `tokenAddress` purely to scope/enable the query, even though the lookup itself is now provider-driven via `sdk.registry`. That makes the query API inconsistent with the new design.

### Optional-signer fallback currently surfaces low-level operation names

- [packages/sdk/src/zama-sdk.ts](/Users/msaug/zama/zama-sdk-2/packages/sdk/src/zama-sdk.ts:149)
- [packages/sdk/src/credentials/credentials-manager.ts](/Users/msaug/zama/zama-sdk-2/packages/sdk/src/credentials/credentials-manager.ts:200)

Injecting `createThrowingSigner()` into the credential managers means signer-less flows can fail as `SignerRequiredError("getAddress")` / `"getChainId"` instead of `"allow"` or `"revokeSession"`. That is not a correctness bug, but it is a user-facing diagnostics regression.

### Upgrade documentation is still uneven

- [packages/react-sdk/src/provider.tsx](/Users/msaug/zama/zama-sdk-2/packages/react-sdk/src/provider.tsx:72)
- [packages/react-sdk/src/provider.tsx](/Users/msaug/zama/zama-sdk-2/packages/react-sdk/src/provider.tsx:153)
- [packages/sdk/src/zama-sdk.ts](/Users/msaug/zama/zama-sdk-2/packages/sdk/src/zama-sdk.ts:582)

There are still examples and messages showing the old provider-less constructor/React provider shape.

## Verdict

The refactor direction is good, but this commit is not review-clean.

The main blockers are:

1. broken example apps
2. provider-only mode still broken in the React layer
3. no runtime protection against provider/signer chain divergence on writes

I would not sign off on this as a complete implementation of the split until those are addressed and the acceptance tests are tightened accordingly.
