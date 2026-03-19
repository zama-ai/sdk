# Improvinho Review - 2026-03-18

## Critical (0)
No findings.

## High (10)
### IMP-0001 - useDelegateDecryption and useRevokeDelegation fire cache invalidation BEFORE user's onSuccess callback — every other hook does the reverse
- Kind: bug
- Confidence: high
- Seen by: refactor-hunter
- Scopes: packages
- Support count: 1
- Files: packages/react-sdk/src/token/use-delegate-decryption.ts, packages/react-sdk/src/token/use-delegate-decryption.ts:32-37, packages/react-sdk/src/token/use-revoke-delegation.ts:32-37
- Evidence: use-delegate-decryption.ts:32-37 and use-revoke-delegation.ts:32-37 both call `context.client.invalidateQueries({ queryKey: zamaQueryKeys.delegationStatus.all })` first, then `options?.onSuccess?.(...)`. All other 9 mutation hooks call `options?.onSuccess?.(...)` first, then invalidate. A user relying on cache state inside their onSuccess callback sees different behavior for delegation hooks vs all others.
- Accept if: The inverted ordering is unintentional and no consumer depends on cache being invalidated before their onSuccess fires
- Dismiss if: Delegation hooks intentionally invalidate first for a documented reason

```diff
Swap the two lines so options?.onSuccess?.() fires before invalidateQueries, matching all other hooks. Better yet, use the factory from finding 1 to enforce consistent ordering.
```

### IMP-0002 - onSuccess callback ordering is inverted in 9 mutation hooks — cache invalidation is skipped if caller's onSuccess throws
- Kind: bug
- Confidence: high
- Seen by: app-logic-architecture
- Scopes: packages
- Support count: 1
- Files: packages/react-sdk/src/token/use-unshield.ts, packages/react-sdk/src/token/use-delegate-decryption.ts:33-36, packages/react-sdk/src/token/use-unshield.ts:41-44, packages/react-sdk/src/token/use-unwrap.ts:41-44
- Evidence: In use-unshield.ts:41-44, use-unwrap.ts:41-44, use-unshield-all.ts:40-43, use-resume-unshield.ts:40-43, use-unwrap-all.ts:36-39, use-finalize-unwrap.ts:40-43, use-approve-underlying.ts:40-43, use-confidential-transfer-from.ts:40-43, use-confidential-approve.ts:38-41, the pattern is: `options?.onSuccess?.(...); invalidateAfterXxx(...)`. If the caller callback throws, invalidation never runs and the cache is left stale. Contrast with use-delegate-decryption.ts:33-36 and use-allow-tokens.ts:29-32 which correctly invalidate FIRST then call the user callback. The ordering is inconsistent across the codebase and wrong in 9 of 11 mutation hooks.
- Accept if: The caller's onSuccess callback could reasonably throw (user code), and stale cache after mutation is undesirable.
- Dismiss if: All callers are guaranteed to never throw in onSuccess, which cannot be enforced by the SDK.

```diff
In all 9 affected hooks, swap the two lines inside onSuccess so invalidation runs before the caller callback:
```
onSuccess: (data, variables, onMutateResult, context) => {
  invalidateAfterXxx(context.client, config.tokenAddress); // always runs
  options?.onSuccess?.(data, variables, onMutateResult, context); // may throw
},
```
Better yet: extract a makeTokenMutation factory (see simplification finding) to fix this in one place.
```

### IMP-0003 - 9 single-action mutation hooks are structurally identical — extract a makeTokenMutation factory to eliminate ~200 lines of boilerplate
- Kind: simplification
- Confidence: high
- Seen by: app-logic-architecture
- Scopes: packages
- Support count: 1
- Files: packages/react-sdk/src/token/use-unshield.ts, packages/react-sdk/src/token/use-approve-underlying.ts:1-46, packages/react-sdk/src/token/use-unshield.ts:1-46, packages/react-sdk/src/token/use-unwrap.ts:1-46
- Evidence: use-unshield.ts, use-unshield-all.ts, use-resume-unshield.ts, use-unwrap.ts, use-unwrap-all.ts, use-finalize-unwrap.ts, use-confidential-transfer-from.ts, use-confidential-approve.ts, use-approve-underlying.ts each contain the same ~40-line scaffold: `const token = useToken(config); return useMutation({ ...xxxMutationOptions(token), ...options, onSuccess: { callerCb(); invalidate(); } })`. The only variation per hook is the mutation options factory, params type, and invalidation function. A `makeTokenMutation(optionsFactory, invalidateFn)` factory would reduce each hook to 1-2 lines and fix the callback ordering bug in one place.
- Accept if: All 9 hooks genuinely share the same structure with no plans for divergent behavior.
- Dismiss if: Individual hooks need bespoke pre/post logic that would make the factory overly complex.

```diff
```typescript
// utils/make-token-mutation.ts
export function makeTokenMutation<TParams, TResult = TransactionResult>(
  optionsFactory: (token: Token) => UseMutationOptions<TResult, Error, TParams, Address>,
  invalidate: (client: QueryClient, tokenAddress: Address) => void,
) {
  return function useTokenMutation(
    config: UseZamaConfig,
    options?: UseMutationOptions<TResult, Error, TParams, Address>,
  ) {
    const token = useToken(config);
    return useMutation({
      ...optionsFactory(token),
      ...options,
      onSuccess: (data, vars, ctx, context) => {
        invalidate(context.client, config.tokenAddress);
        options?.onSuccess?.(data, vars, ctx, context);
      },
    });
  };
}

// Each hook becomes:
export const useUnshield = makeTokenMutation(unshieldMutationOptions, invalidateAfterUnshield);
```
```

### IMP-0004 - 9 mutation hooks copy-paste identical onSuccess invalidation block — each spreads options then manually calls invalidateAfterXxx with the same 4-line pattern
- Kind: architecture
- Confidence: high
- Seen by: refactor-hunter
- Scopes: packages
- Support count: 1
- Files: packages/react-sdk/src/token/use-unwrap.ts, packages/react-sdk/src/token/use-confidential-approve.ts:38-43, packages/react-sdk/src/token/use-unshield.ts:41-45, packages/react-sdk/src/token/use-unwrap.ts:38-45
- Evidence: use-confidential-approve.ts:38-43, use-unshield.ts:41-45, use-unwrap.ts:38-45, use-unwrap-all.ts:35-40, use-finalize-unwrap.ts:39-44, use-resume-unshield.ts:38-43, use-approve-underlying.ts:40-45, use-unshield-all.ts:39-44, use-confidential-transfer-from.ts:40-44 all contain: `onSuccess: (data, variables, onMutateResult, context) => { options?.onSuccess?.(...); invalidateAfterXxx(context.client, config.tokenAddress); }`. The codebase already has optimisticBalanceCallbacks as a factory pattern for shield hooks — this pattern was never extended to simple mutation hooks.
- Accept if: All 9 hooks use the same structural onSuccess pattern with only the invalidation function varying
- Dismiss if: Some hooks intentionally need different onSuccess ordering or additional side effects beyond invalidation

```diff
Extract a withInvalidateOnSuccess(mutationOptions, invalidateFn, tokenAddress, userOptions) factory that wraps the onSuccess callback. Each hook collapses to: return useMutation(withInvalidateOnSuccess(xxxMutationOptions(token), invalidateAfterXxx, config.tokenAddress, options))
```

### IMP-0005 - useQuery/useSuspenseQuery wrappers erase all type safety with `options: any` and unsafe cast on return
- Kind: architecture
- Confidence: high
- Seen by: type-system-purist
- Scopes: packages
- Support count: 1
- Files: packages/react-sdk/src/utils/query.ts, packages/react-sdk/src/utils/query.ts:25-33, packages/react-sdk/src/utils/query.ts:35-43
- Evidence: packages/react-sdk/src/utils/query.ts:25-33 — `export function useQuery<TData = unknown, TError = DefaultError>(options: any): UseQueryResult<TData, TError> { return tanstack_useQuery({...options, queryKeyHashFn: hashFn}) as UseQueryResult<TData, TError>; }`. Every query hook in the SDK passes through this wrapper, meaning a mismatch between a factory's actual return type and the generic `<TData>` passed to `useQuery` compiles silently. The comment explains TanStack v5 variance issues, but the effect is a complete type-safety hole at the query boundary.
- Accept if: The team agrees that a constrained overload, branded factory return type, or NoInfer utility would recover compile-time checking without the variance issue
- Dismiss if: The TanStack v5 variance constraint is proven unsolvable without `any` and the team has integration tests covering every factory-to-hook type alignment

### IMP-0006 - createEIP712 response reshaping is duplicated identically across RelayerWeb and RelayerNode (~30 lines each)
- Kind: simplification
- Confidence: high
- Seen by: type-system-purist
- Scopes: packages
- Support count: 1
- Files: packages/sdk/src/relayer/relayer-web.ts, packages/sdk/src/relayer/relayer-node.ts:138-173, packages/sdk/src/relayer/relayer-web.ts:234-269
- Evidence: packages/sdk/src/relayer/relayer-web.ts:248-269 and packages/sdk/src/relayer/relayer-node.ts:152-173 contain identical code that manually destructures and re-assigns every field from the worker result: `{ domain: { name: result.domain.name, version: result.domain.version, ... }, types: { ... }, message: { ... } }`. Both also compute `buildEIP712DomainType(domain)`. This manual reshaping distrusts the worker's typed response — if the worker returns `CreateEIP712ResponseData`, a shared helper or spread would suffice.
- Accept if: The worker result type structurally matches EIP712TypedData (minus the EIP712Domain types array)
- Dismiss if: The reshaping intentionally strips unknown extra properties from the worker for security reasons

```diff
Extract a shared `reshapeEIP712Response(result: CreateEIP712ResponseData): EIP712TypedData` into a relayer utility module. Both RelayerWeb and RelayerNode call it with the worker/pool result.
```

### IMP-0007 - encrypt + emit + error-wrap block is copy-pasted 3 times in Token class — extract #encryptAmount helper
- Kind: simplification
- Confidence: high
- Seen by: app-logic-architecture
- Scopes: packages
- Support count: 1
- Files: packages/sdk/src/token/token.ts, packages/sdk/src/token/token.ts:101-162, packages/sdk/src/token/token.ts:180-249, packages/sdk/src/token/token.ts:426-481
- Evidence: In packages/sdk/src/token/token.ts, the same ~30-line encrypt block appears at lines 101-162 (confidentialTransfer), 180-249 (confidentialTransferFrom), and 426-481 (unwrap). Each emits EncryptStart, calls relayer.encrypt, emits EncryptEnd/EncryptError, checks handles.length === 0, and wraps errors in EncryptionFailedError. The only difference is the error message string. A private `#encryptAmount(value, contractAddress, userAddress)` helper would consolidate all three into one emit+error-wrap boundary.
- Accept if: All three callsites use identical encryption parameters (single euint64 value).
- Dismiss if: Future encrypt calls will need different value types or multiple values per call.

```diff
```typescript
private async #encryptAmount(
  amount: bigint, contractAddress: Address, userAddress: Address,
): Promise<{ handle: Uint8Array; inputProof: Uint8Array }> {
  const t0 = Date.now();
  this.emit({ type: ZamaSDKEvents.EncryptStart });
  try {
    const { handles, inputProof } = await this.relayer.encrypt({
      values: [{ value: amount, type: 'euint64' }],
      contractAddress, userAddress,
    });
    this.emit({ type: ZamaSDKEvents.EncryptEnd, durationMs: Date.now() - t0 });
    if (handles.length === 0) throw new EncryptionFailedError('Encryption returned no handles');
    return { handle: handles[0]!, inputProof };
  } catch (error) {
    this.emit({ type: ZamaSDKEvents.EncryptError, error: toError(error), durationMs: Date.now() - t0 });
    if (error instanceof ZamaError) throw error;
    throw new EncryptionFailedError('Failed to encrypt amount', { cause: error instanceof Error ? error : undefined });
  }
}
```
```

### IMP-0008 - ZamaSDK.revokeSession() and #revokeByTrackedIdentity() bypass CredentialsManager, skipping clearCaches() — stale AES-GCM derived key remains after account switch
- Kind: bug
- Confidence: high
- Seen by: refactor-hunter
- Scopes: packages
- Support count: 1
- Files: packages/sdk/src/token/zama-sdk.ts, packages/sdk/src/token/credential-manager-base.ts:271-278, packages/sdk/src/token/zama-sdk.ts:153-168, packages/sdk/src/token/zama-sdk.ts:256-265
- Evidence: zama-sdk.ts:153-168 and zama-sdk.ts:256-265 both call `this.sessionStorage.delete(storeKey)` directly and emit CredentialsRevoked, but skip `credentials.clearCaches()` which BaseCredentialsManager.revokeSession() calls at credential-manager-base.ts:271-278 to invalidate the CredentialCrypto derived-key cache and #cachedStoreKey. After account switch, the cached derived key from the old account persists in memory.
- Accept if: The sessionStorage.delete() paths are functionally equivalent to the CredentialsManager path except for the missing clearCaches() call
- Dismiss if: The ZamaSDK paths intentionally skip cache clearing for a performance or lifecycle reason

```diff
Both ZamaSDK methods should delegate to this.credentials.revoke() (or this.credentials.revokeSession()) instead of calling sessionStorage.delete() directly. This ensures clearCaches() runs and the derived-key cache is invalidated.
```

### IMP-0009 - Contract address constants are derived from deployments.json independently in 3 packages with inconsistent naming — test-nextjs (CONTRACTS), test-vite (DEFAULTS), and playwright (contracts)
- Kind: architecture
- Confidence: high
- Seen by: refactor-hunter
- Scopes: packages
- Support count: 1
- Files: packages/test-nextjs/src/constants.ts, packages/playwright/fixtures/test.ts:21-29, packages/test-nextjs/src/constants.ts:1-15, packages/test-vite/src/constants.ts:1-20
- Evidence: packages/test-nextjs/src/constants.ts exports CONTRACTS with USDT/cUSDT/USDC/cUSDC. packages/test-vite/src/constants.ts exports DEFAULTS with token/wrapper/confidentialToken. packages/playwright/fixtures/test.ts:21-29 defines contracts with USDT/cUSDT/USDC/cUSDC/acl. All three read from the same hardhat/deployments.json but use different key names and shapes. Adding a new deployed contract requires edits in 3 disconnected files.
- Accept if: All three packages derive the same addresses from the same deployments.json
- Dismiss if: Different packages intentionally need different subsets or shapes of the deployment data

```diff
Add a shared test-constants export to @zama-fhe/test-components (or a new tiny package) that reads deployments.json once and exports CONTRACTS, CONFIDENTIAL_TOKEN_ADDRESSES, and ERC20_TOKENS. All three packages import from it.
```

### IMP-0010 - providers.tsx is a line-for-line copy between test-nextjs and test-vite — wagmi config, signer, storage, relayer, and QueryClient setup are 100% identical
- Kind: architecture
- Confidence: high
- Seen by: refactor-hunter
- Scopes: packages
- Support count: 1
- Files: packages/test-nextjs/src/providers.tsx, packages/test-nextjs/src/providers.tsx:1-44, packages/test-vite/src/providers.tsx:1-44
- Evidence: packages/test-nextjs/src/providers.tsx and packages/test-vite/src/providers.tsx are identical except for 'use client' on line 1. Both create the same wagmiConfig, WagmiSigner, MemoryStorage, RelayerCleartext, and QueryClient. If the provider config changes (e.g., new chain, new connector, new relayer config), both files must be updated in sync with no enforcement mechanism.
- Accept if: Both providers.tsx files are functionally identical and share the same dependency versions
- Dismiss if: The two test apps intentionally need different provider configurations

```diff
Export createTestProviders() or TestProviders from @zama-fhe/test-components. The Next.js consumer adds a one-line 'use client' re-export wrapper.
```

## Medium (16)
### IMP-0011 - unwrapOptimisticCallerContext uses unsafe `as` casts and a boolean flag instead of a discriminated union
- Kind: simplification
- Confidence: high
- Seen by: type-system-purist
- Scopes: packages
- Support count: 1
- Files: packages/react-sdk/src/token/optimistic-balance-update.ts, packages/react-sdk/src/token/optimistic-balance-update.ts:14-27
- Evidence: packages/react-sdk/src/token/optimistic-balance-update.ts:14-27 — `const typed = rawContext as OptimisticMutateContext | undefined; const wrappedContext = optimistic ? typed : undefined; const callerContext = (optimistic ? wrappedContext?.callerContext : rawContext) as OptimisticMutateContext | undefined;`. The `rawContext: unknown` parameter is immediately cast, then a boolean `optimistic` flag manually discriminates the shape. A proper discriminated union (`{ kind: 'optimistic', snapshot, callerContext }`) would let TypeScript narrow without any casts.
- Accept if: The onMutate callback return type can be changed to a discriminated union without breaking TanStack's mutation context type
- Dismiss if: TanStack Query's mutation context type is opaque and cannot be narrowed with a discriminant

### IMP-0012 - Duplicated enabled-flag merging expression across 7 query hooks — extract mergeEnabled utility
- Kind: simplification
- Confidence: high
- Seen by: app-logic-architecture
- Scopes: packages
- Support count: 1
- Files: packages/react-sdk/src/token/use-fees.ts, packages/react-sdk/src/token/use-confidential-balance.ts:61-62, packages/react-sdk/src/token/use-fees.ts:60, packages/react-sdk/src/token/use-is-allowed.ts:34
- Evidence: The pattern `(factoryEnabled ?? true) && (userEnabled ?? true)` appears in use-confidential-balance.ts:61-62, use-confidential-balances.ts:82-83, use-confidential-is-approved.ts:73, use-fees.ts:60/90/117/143, use-underlying-allowance.ts:53, use-delegation-status.ts:58, use-is-allowed.ts:34. This non-trivial combination merges the enabled flag from the SDK query factory with the caller's flag. Centralizing ensures uniform behavior.
- Accept if: The enabled-merging semantics should be uniform across all query hooks.
- Dismiss if: Some hooks intentionally need different enabled-merge logic.

```diff
Add to src/utils/query.ts:
```typescript
export function mergeEnabled(
  factoryEnabled: boolean | undefined,
  userEnabled: boolean | undefined,
): boolean {
  return (factoryEnabled ?? true) && (userEnabled ?? true);
}
```
Replace all occurrences with `enabled: mergeEnabled(baseOpts.enabled, options?.enabled)`.
```

### IMP-0013 - Manual 'enabled' composition (baseOpts.enabled ?? true) && (options?.enabled ?? true) is repeated 6+ times across query hooks instead of being handled by a utility or the custom useQuery wrapper
- Kind: simplification
- Confidence: high
- Seen by: refactor-hunter
- Scopes: packages
- Support count: 1
- Files: packages/react-sdk/src/token/use-fees.ts, packages/react-sdk/src/token/use-confidential-balance.ts:61-62, packages/react-sdk/src/token/use-fees.ts:57-62, packages/react-sdk/src/token/use-fees.ts:88-93
- Evidence: use-fees.ts repeats the pattern 4 times at lines 57-62, 88-93, 113-118, 139-144. use-confidential-balance.ts:61-62 and use-confidential-balances.ts:82-83 have the same expression. The codebase already has a custom useQuery wrapper in utils/query.ts that could handle this merging centrally.
- Accept if: All 6+ sites use the exact same (a ?? true) && (b ?? true) expression
- Dismiss if: Some hooks need non-boolean enabled (function form) that can't be merged generically

```diff
Add mergeEnabled(baseEnabled, userEnabled) utility or handle the merge inside the custom useQuery wrapper. Each hook site reduces to: return useQuery({ ...baseOpts, ...options }) with the wrapper handling enabled composition.
```

### IMP-0014 - useShield and useShieldETH are structural clones — differ only in the mutation options function and param type, should be a factory
- Kind: simplification
- Confidence: high
- Seen by: refactor-hunter
- Scopes: packages
- Support count: 1
- Files: packages/react-sdk/src/token/use-shield.ts, packages/react-sdk/src/token/use-shield-eth.ts:1-59, packages/react-sdk/src/token/use-shield.ts:1-60
- Evidence: use-shield.ts (60 lines) and use-shield-eth.ts (59 lines) both: define an identical UseShield*Config with optimistic?: boolean, call useToken(config) and useQueryClient(), spread *MutationOptions(token) then options then optimisticBalanceCallbacks({...}), and cast the return. The UseShieldConfig and UseShieldETHConfig types are identical structs.
- Accept if: Both hooks are structurally identical except for the mutation options factory and param type
- Dismiss if: The hooks will diverge in behavior in a planned future change

```diff
Create makeShieldHook<TParams>(mutationOptionsFn) factory. Export useShield = makeShieldHook(shieldMutationOptions) and useShieldETH = makeShieldHook(shieldETHMutationOptions). Eliminates ~55 lines.
```

### IMP-0015 - 5 hooks independently resolve signer address via useQuery(signerAddressQueryOptions(signer)) — should be a shared useSignerAddress hook
- Kind: simplification
- Confidence: high
- Seen by: refactor-hunter
- Scopes: packages
- Support count: 1
- Files: packages/react-sdk/src/token/use-underlying-allowance.ts, packages/react-sdk/src/token/use-confidential-balance.ts:48-52, packages/react-sdk/src/token/use-confidential-balances.ts:64-68, packages/react-sdk/src/token/use-underlying-allowance.ts:40-55
- Evidence: use-underlying-allowance.ts:40-55 (both normal and suspense variants), use-confidential-balance.ts:48-52, use-confidential-balances.ts:64-68, and use-confidential-is-approved.ts:54-58 all perform: `const addressQuery = useQuery({ ...signerAddressQueryOptions(token.signer) }); const owner = addressQuery.data;` — identical 3-line blocks.
- Accept if: All 5 sites use identical query options with no custom overrides
- Dismiss if: Some sites need suspense variant or custom enabled logic for the address query

```diff
Extract useSignerAddress(signer: GenericSigner): Address | undefined as a 5-line hook wrapping the query. Replace all 5 sites with: const owner = useSignerAddress(token.signer);
```

### IMP-0016 - ethers/contracts.ts is a redundant bypass layer — 130 lines of per-contract wrappers that circumvent the GenericSigner abstraction
- Kind: architecture
- Confidence: high
- Seen by: app-logic-architecture
- Scopes: packages
- Support count: 1
- Files: packages/sdk/src/ethers/contracts.ts, packages/sdk/src/ethers/contracts.ts:96-227, packages/sdk/src/ethers/ethers-signer.ts:22
- Evidence: packages/sdk/src/ethers/contracts.ts exports ~10 readXxx/writeXxx helpers (e.g., writeConfidentialTransferContract at line 136-144) that wrap the generic contract builders from src/contracts/ by calling ethersRead/ethersWrite with a raw EthersTransactionSigner. The EthersSigner class already implements readContract/writeContract accepting the same generic configs, so any caller with an EthersSigner can call `signer.writeContract(confidentialTransferContract(...))` directly. This file creates a second incompatible call path that operates below the GenericSigner interface the SDK is built on.
- Accept if: No external consumers depend on these per-contract ethers helpers (check npm package exports and CHANGELOG).
- Dismiss if: External integrators actively use these helpers as a documented API.

```diff
Delete ethers/contracts.ts and its re-exports in ethers/index.ts. Consumers holding a raw ethers.Signer should construct an EthersSigner and use the Token/ReadonlyToken API. If low-level ethers access is needed for scripting, collapse into a single `encodeContractCall(config)` utility.
```

### IMP-0017 - isTransientError uses stringly-typed message substring matching instead of the SDK's typed error hierarchy
- Kind: simplification
- Confidence: high
- Seen by: type-system-purist
- Scopes: packages
- Support count: 1
- Files: packages/sdk/src/relayer/relayer-utils.ts, packages/sdk/src/relayer/relayer-utils.ts:28-45
- Evidence: packages/sdk/src/relayer/relayer-utils.ts:28-45 — `function isTransientError(error: unknown): boolean { const msg = error.message.toLowerCase(); return msg.includes('timed out') || msg.includes('502') || msg.includes('503') || msg.includes('504') || ... }`. The SDK defines `RelayerRequestFailedError` with a typed `statusCode` property, but this function ignores it and greps messages for '502'/'503'/'504' as substrings. A message containing '5040 items' would false-positive. Status code detection should use `error instanceof RelayerRequestFailedError && [502,503,504].includes(error.statusCode)`.
- Accept if: RelayerRequestFailedError.statusCode is populated for HTTP failures and the worker propagates it
- Dismiss if: The function intentionally handles errors from layers below the SDK (raw fetch/network) where typed errors are not yet constructed

### IMP-0018 - RelayerWeb and RelayerNode share ~90% of initialization/teardown/reshaping code with no shared base class
- Kind: simplification
- Confidence: high
- Seen by: app-logic-architecture
- Scopes: packages
- Support count: 1
- Files: packages/sdk/src/relayer/relayer-web.ts, packages/sdk/src/relayer/relayer-node.ts:138-173, packages/sdk/src/relayer/relayer-node.ts:43-128, packages/sdk/src/relayer/relayer-web.ts:241-268, packages/sdk/src/relayer/relayer-web.ts:60-204
- Evidence: packages/sdk/src/relayer/relayer-web.ts (392 lines) and relayer-node.ts (261 lines) both implement identical promise-lock lifecycle (#initPromise, #ensureLock, #terminated, #resolvedChainId), identical terminate() that nulls fields, identical getAclAddress() with Object.assign from DefaultConfigs, and identical createEIP712 result reshaping (whitelist-field extraction of domain/types/message). The createEIP712 reshaping alone is ~25 lines duplicated verbatim. A BaseRelayer<TBackend> abstract class would shrink both files by ~80 lines each.
- Accept if: The promise-lock and reshaping logic is genuinely identical between both implementations.
- Dismiss if: Web and Node relayers are expected to diverge significantly in lifecycle management.

```diff
Extract a BaseRelayer<TBackend> abstract class with the shared lifecycle (promise-lock init, terminate, getAclAddress) and a normalizeEIP712Result() utility in relayer-utils.ts for the reshaping logic. Subclasses provide only #initBackend() and backend-specific method implementations.
```

### IMP-0019 - encryptCredentials and decryptCredentials are line-for-line identical between CredentialsManager and DelegatedCredentialsManager — should be in the base class
- Kind: simplification
- Confidence: high
- Seen by: refactor-hunter
- Scopes: packages
- Support count: 1
- Files: packages/sdk/src/token/credentials-manager.ts, packages/sdk/src/token/credentials-manager.ts:165-184, packages/sdk/src/token/delegated-credentials-manager.ts:155-176
- Evidence: credentials-manager.ts:165-184 and delegated-credentials-manager.ts:155-176 both implement: `const address = await this.signer.getAddress(); const encryptedPrivateKey = await this.crypto.encrypt(creds.privateKey, creds.signature, address); const { privateKey: _, signature: _sig, ...rest } = creds; return { ...rest, encryptedPrivateKey };`. The decryptCredentials methods are similarly identical. The only difference is the generic type parameter, which TypeScript generics already handle.
- Accept if: The method bodies are structurally identical and the generic type parameter is the only variation
- Dismiss if: A future subclass will need a genuinely different encrypt/decrypt implementation

```diff
Move encryptCredentials and decryptCredentials as concrete methods into BaseCredentialsManager. Remove the abstract declarations and the two duplicate implementations.
```

### IMP-0020 - CredentialsManager and DelegatedCredentialsManager duplicate encryptCredentials/decryptCredentials and #storeKey caching — move to BaseCredentialsManager
- Kind: simplification
- Confidence: high
- Seen by: app-logic-architecture
- Scopes: packages
- Support count: 1
- Files: packages/sdk/src/token/credentials-manager.ts, packages/sdk/src/token/credential-manager-base.ts:1, packages/sdk/src/token/credentials-manager.ts:165-184, packages/sdk/src/token/delegated-credentials-manager.ts:155-176
- Evidence: packages/sdk/src/token/credentials-manager.ts:165-184 and delegated-credentials-manager.ts:155-176 contain character-for-character identical implementations of encryptCredentials and decryptCredentials. Both also independently maintain a #cachedStoreKey/#cachedStoreKeyIdentity pair with the same cache-check-then-compute pattern in #storeKey(). The base class (credential-manager-base.ts) already has this.signer and this.crypto but does not provide default implementations. Moving these ~60 lines into the base class eliminates the duplication.
- Accept if: Both subclass implementations are genuinely identical and the base class has the required dependencies (signer, crypto).
- Dismiss if: The delegated manager's encryption is expected to diverge (e.g., different key derivation for delegated keys).

### IMP-0021 - decryptBalance and decryptBalanceAs in readonly-token.ts duplicate ~30 lines of cache-check → emit-start → call-relayer → emit-end → cache-save → error-wrap logic
- Kind: simplification
- Confidence: high
- Seen by: refactor-hunter
- Scopes: packages
- Support count: 1
- Files: packages/sdk/src/token/readonly-token.ts, packages/sdk/src/token/readonly-token.ts:762-846, packages/sdk/src/token/readonly-token.ts:863-926
- Evidence: readonly-token.ts decryptBalance (lines 863-926) and decryptBalanceAs (lines 762-846) both: check loadCachedBalance, obtain credentials, record t0=Date.now(), emit DecryptStart, call relayer, emit DecryptEnd with durationMs, check result[handle] throwing DecryptionFailedError, saveCachedBalance in try/catch, and catch with emit DecryptError + wrapDecryptError. The only variation is which credential method (allow vs delegatedCredentials.allow) and which relayer call (userDecrypt vs delegatedUserDecrypt).
- Accept if: Both methods follow the same structural pipeline with only the credential and relayer call varying
- Dismiss if: The two methods will diverge with different caching or event semantics

```diff
Extract a private #decryptWithRelayer(relayerFn, handle, owner) method that owns the timing, event emission, cache load/save, result extraction, and error wrapping. Both public methods reduce to: get credentials, call #decryptWithRelayer.
```

### IMP-0022 - Identical catch-block pattern (instanceof ZamaError → re-throw, else wrap) duplicated 10+ times in Token
- Kind: simplification
- Confidence: high
- Seen by: type-system-purist
- Scopes: packages
- Support count: 1
- Files: packages/sdk/src/token/token.ts, packages/sdk/src/token/token.ts:129-134, packages/sdk/src/token/token.ts:155-160
- Evidence: packages/sdk/src/token/token.ts has 10+ catch blocks following this exact pattern: `if (error instanceof ZamaError) { throw error; } throw new SpecificError('message', { cause: error instanceof Error ? error : undefined });`. Examples at lines 129-134, 155-160, 209-214, 240-247, 274-284, 365-371, 399-405, 449-453, 475-479, 519-523. The `cause` ternary also ignores the existing `toError()` utility. A single `wrapOperationError(error, ErrorClass, message)` helper would eliminate all copies.
- Accept if: All catch blocks follow the same instanceof-check-then-wrap pattern with no variation in the intermediate logic

```diff
Create `function wrapOperationError(error: unknown, Ctor: new (msg: string, opts?: { cause?: Error }) => ZamaError, message: string): never { if (error instanceof ZamaError) throw error; throw new Ctor(message, { cause: toError(error) }); }` and call it from each catch block.
```

### IMP-0023 - approveUnderlying and #ensureAllowance duplicate the reset-to-zero approve logic with subtly divergent guards
- Kind: bug
- Confidence: high
- Seen by: app-logic-architecture
- Scopes: packages
- Support count: 1
- Files: packages/sdk/src/token/token.ts, packages/sdk/src/token/token.ts:678-714, packages/sdk/src/token/token.ts:915-954
- Evidence: In packages/sdk/src/token/token.ts, `approveUnderlying` (lines 678-714) and `#ensureAllowance` (lines 915-954) both implement the USDT-compatible zero-reset-then-approve pattern. `approveUnderlying` guards with `if (approvalAmount > 0n)` before reading current allowance; `#ensureAllowance` reads allowance first and enters only when `allowance < amount`. The reset-to-zero + approve logic is duplicated but with different preconditions, creating a maintenance hazard where a bug fix in one copy doesn't apply to the other.
- Accept if: Both methods genuinely need the same reset-to-zero behavior for USDT-style tokens.
- Dismiss if: The two methods intentionally handle different approval semantics that should not be unified.

```diff
Extract a private `#resetAndApprove(underlying: Address, approvalAmount: bigint)` method that owns the read-current-allowance → reset-to-zero → approve-new-amount sequence. Call it from both `approveUnderlying` and `#ensureAllowance`.
```

### IMP-0024 - useUserDecryptedValues bypasses the shared queryKeyHashFn wrapper — will silently diverge if hash function changes
- Kind: bug
- Confidence: medium
- Seen by: app-logic-architecture
- Scopes: packages
- Support count: 1
- Files: packages/react-sdk/src/relayer/use-user-decrypted-values.ts, packages/react-sdk/src/relayer/use-user-decrypted-value.ts:13, packages/react-sdk/src/relayer/use-user-decrypted-values.ts:12-19, packages/react-sdk/src/utils/query.ts:1-44
- Evidence: packages/react-sdk/src/relayer/use-user-decrypted-values.ts:12-19 imports useQueries directly from @tanstack/react-query and manually injects `queryKeyHashFn: hashFn` into each query object. The project's shared wrapper in src/utils/query.ts exists precisely to centralize this injection. Its companion hook use-user-decrypted-value.ts:13 correctly uses the wrapped useQuery. There is no useQueries equivalent in utils/query.ts — this is the gap.
- Accept if: The custom hashFn is a project-wide invariant that all query hooks must use.
- Dismiss if: The hashFn is being deprecated or useQueries intentionally needs different hashing.

```diff
Add a useQueries wrapper to src/utils/query.ts that injects queryKeyHashFn into every query in the array, then use it in use-user-decrypted-values.ts.
```

### IMP-0025 - Three inconsistent patterns for merging factory `enabled` flag in react-sdk query hooks
- Kind: architecture
- Confidence: medium
- Seen by: type-system-purist
- Scopes: packages
- Support count: 1
- Files: packages/react-sdk/src/token/use-fees.ts, packages/react-sdk/src/token/use-confidential-is-approved.ts:73, packages/react-sdk/src/token/use-fees.ts:60, packages/react-sdk/src/token/use-is-allowed.ts:34
- Evidence: Pattern A (use-fees.ts:60, use-underlying-allowance.ts:54): `enabled: (baseOpts.enabled ?? true) && (options?.enabled ?? true)`. Pattern B (use-is-allowed.ts:34): `const factoryEnabled = 'enabled' in baseOpts ? (baseOpts.enabled ?? true) : true`. Pattern C (use-confidential-is-approved.ts:73): `enabled: ('enabled' in baseOpts ? (baseOpts.enabled ?? true) : true) && (userEnabled ?? true)`. The `'enabled' in baseOpts` check in B/C guards against `skipToken` factories, but Pattern A doesn't. This inconsistency suggests the factory return type isn't narrow enough to distinguish skipToken from real options, forcing ad-hoc runtime narrowing.
- Accept if: The factory can return skipToken and the enabled merging is genuinely needed in all hooks
- Dismiss if: Factories never return skipToken and the `in` checks are vestigial

```diff
Create a shared `mergeEnabled(baseOpts: QueryOptions | typeof skipToken, userEnabled?: boolean): boolean` utility that handles both skipToken and real options uniformly.
```

### IMP-0026 - ActivityFeedPanel performs raw RPC log fetching — business logic leaked into a test UI component
- Kind: architecture
- Confidence: medium
- Seen by: app-logic-architecture
- Scopes: packages
- Support count: 1
- Files: packages/test-components/src/activity-feed-panel.tsx, packages/test-components/src/activity-feed-panel.tsx:39-66
- Evidence: packages/test-components/src/activity-feed-panel.tsx:39-66 directly calls `publicClient.request({ method: 'eth_getLogs', params: [...] })` and manually maps raw RPC log objects to typed structures before passing them to useActivityFeed. This log-fetching and normalization logic is a data-fetching concern that belongs in the react-sdk's useActivityFeed hook (e.g., as a fromBlock option). Any real consumer of useActivityFeed must replicate this exact fetch-and-normalize pattern, revealing a design gap in the hook's API.
- Accept if: useActivityFeed is intended to be used by external consumers who shouldn't need to write raw eth_getLogs calls.
- Dismiss if: useActivityFeed intentionally accepts pre-fetched logs as a power-user API and the test component is the only consumer.

```diff
Extend useActivityFeed to accept a fromBlock option and handle the RPC call internally. Or export a useLogs({ tokenAddress, fromBlock }) hook from react-sdk. The component should consume logs via a hook, not construct RPC calls.
```

## Low (3)
### IMP-0027 - checkExpired returns false when no credentials exist — 'not expired' and 'never created' are conflated
- Kind: architecture
- Confidence: high
- Seen by: app-logic-architecture
- Scopes: packages
- Support count: 1
- Files: packages/sdk/src/token/credential-manager-base.ts, packages/sdk/src/token/credential-manager-base.ts:255-268
- Evidence: In packages/sdk/src/token/credential-manager-base.ts:255-268, `checkExpired` returns `false` when `stored` is null (line 259). This means `isExpired()` returns `false` both when credentials exist and are valid AND when credentials have never been created. A caller using `if (await token.isExpired())` to decide whether to regenerate would conclude 'not expired' and skip generation even when the user has never authenticated.
- Accept if: Callers distinguish 'never created' from 'expired' through a separate hasCredentials() check that doesn't exist yet.
- Dismiss if: The absent case is intentionally treated as 'not expired' because creation is always handled through a separate flow that doesn't check isExpired.

### IMP-0028 - Dead `=== undefined` branches on fields typed as `T | null` (never undefined)
- Kind: simplification
- Confidence: high
- Seen by: type-system-purist
- Scopes: packages
- Support count: 1
- Files: packages/sdk/src/token/zama-sdk.ts, packages/sdk/src/token/zama-sdk.ts:155-162, packages/sdk/src/token/zama-sdk.ts:63-64
- Evidence: packages/sdk/src/token/zama-sdk.ts:155-162 — `if (this.#lastAddress === null || this.#lastAddress === undefined || this.#lastChainId === null || this.#lastChainId === undefined)`. Field declarations at lines 63-64: `#lastAddress: Address | null = null; #lastChainId: number | null = null;`. Neither field can be `undefined` — they are initialized to `null` and only assigned `Address`/`number` values. The `=== undefined` checks are dead code.

```diff
Replace with `if (this.#lastAddress === null || this.#lastChainId === null) { return; }`
```

### IMP-0029 - unprefixHex asserts 0x prefix on viem's Hex type which is already `0x${string}` at the type level
- Kind: simplification
- Confidence: high
- Seen by: type-system-purist
- Scopes: packages
- Support count: 1
- Files: packages/sdk/src/utils.ts, packages/sdk/src/utils.ts:14-16
- Evidence: packages/sdk/src/utils.ts:14-16 — `export function unprefixHex(value: Hex): string { assertCondition(value.startsWith('0x'), `Expected 0x-prefixed hex, got: ${value}`); return value.slice(2); }`. viem's `Hex` is defined as `` `0x${string}` ``, a template literal type guaranteeing the prefix. The assertCondition can never fail for well-typed callers.
- Accept if: All callers pass typed Hex values (no `as Hex` casts on unvalidated strings upstream)
- Dismiss if: The function is part of a public API where JavaScript callers bypass TypeScript

```diff
Remove the assertCondition and simplify to `return value.slice(2);`
```

