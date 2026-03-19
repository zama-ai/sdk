# Improvinho Review - 2026-03-18

## Critical (0)
No findings.

## High (4)
### IMP-0001 - invalidateAfterShield, invalidateAfterUnshield, and invalidateAfterUnwrap are identical functions
- Kind: simplification
- Confidence: high
- Seen by: app-logic-architecture
- Scopes: packages/sdk
- Support count: 1
- Files: packages/sdk/src/query/invalidation.ts, packages/sdk/src/query/invalidation.ts:27-60
- Evidence: All three functions at invalidation.ts:27-60 perform the exact same four operations: invalidateBalanceQueries, invalidateUnderlyingAllowanceQueries, invalidateWagmiBalanceQueries, and invalidate activityFeed. There is zero behavioral difference between them. Compare:

```ts
// invalidateAfterUnwrap (line 27)
invalidateBalanceQueries(queryClient, tokenAddress);
invalidateUnderlyingAllowanceQueries(queryClient, tokenAddress);
invalidateWagmiBalanceQueries(queryClient);
void queryClient.invalidateQueries({ queryKey: zamaQueryKeys.activityFeed.token(tokenAddress) });

// invalidateAfterShield (line 48) — identical body
// invalidateAfterUnshield (line 55) — identical body
```
- Accept if: Confirm that no consumer overrides or extends any of the three functions differently. A grep for usages should show they are always called the same way.
- Dismiss if: A future roadmap exists to differentiate invalidation behavior per operation (e.g., unwrap will stop invalidating underlying allowance).

```diff
Replace the three identical functions with a single `invalidateAfterBalanceChange(queryClient, tokenAddress)` and export named aliases or just the one function. Consumers that semantically distinguish shield/unshield/unwrap can still call the single function — the invalidation set is identical.
```

### IMP-0002 - invalidateAfterShield, invalidateAfterUnshield, and invalidateAfterUnwrap have identical bodies — should be one function
- Kind: simplification
- Confidence: high
- Seen by: refactor-hunter
- Scopes: packages/sdk
- Support count: 1
- Files: packages/sdk/src/query/invalidation.ts, packages/sdk/src/query/invalidation.ts:27-32, packages/sdk/src/query/invalidation.ts:48-53, packages/sdk/src/query/invalidation.ts:55-60
- Evidence: Lines 48-53 (invalidateAfterShield), 55-60 (invalidateAfterUnshield), and 27-32 (invalidateAfterUnwrap) in invalidation.ts are byte-for-byte identical:
```ts
invalidateBalanceQueries(queryClient, tokenAddress);
invalidateUnderlyingAllowanceQueries(queryClient, tokenAddress);
invalidateWagmiBalanceQueries(queryClient);
void queryClient.invalidateQueries({ queryKey: zamaQueryKeys.activityFeed.token(tokenAddress) });
```
Three exported functions, three identical 4-line bodies. The semantic naming adds no value because the invalidation set is identical.
- Accept if: The three functions remain identical and the semantic distinction adds no real decision-making value at call sites.
- Dismiss if: There's a near-term plan to diverge these (e.g., unshield will invalidate different queries).

```diff
Collapse to one function (e.g., `invalidateAfterBalanceChange`) and export aliases if backward compatibility is needed:
```ts
export function invalidateAfterBalanceChange(queryClient: QueryClientLike, tokenAddress: Address): void {
  invalidateBalanceQueries(queryClient, tokenAddress);
  invalidateUnderlyingAllowanceQueries(queryClient, tokenAddress);
  invalidateWagmiBalanceQueries(queryClient);
  void queryClient.invalidateQueries({ queryKey: zamaQueryKeys.activityFeed.token(tokenAddress) });
}
export const invalidateAfterShield = invalidateAfterBalanceChange;
export const invalidateAfterUnshield = invalidateAfterBalanceChange;
export const invalidateAfterUnwrap = invalidateAfterBalanceChange;
```
```

### IMP-0003 - Repeated `cause: error instanceof Error ? error : undefined` narrows away non-Error context when ErrorOptions.cause accepts unknown
- Kind: simplification
- Confidence: high
- Seen by: type-system-purist
- Scopes: packages/sdk
- Support count: 1
- Files: packages/sdk/src/token/token.ts, packages/sdk/src/token/token.ts:133, packages/sdk/src/token/token.ts:159, packages/sdk/src/token/token.ts:214, packages/sdk/src/token/token.ts:246, packages/sdk/src/token/token.ts:284, packages/sdk/src/token/token.ts:370, packages/sdk/src/token/token.ts:407, packages/sdk/src/token/token.ts:453, packages/sdk/src/token/token.ts:478, packages/sdk/src/token/token.ts:522, packages/sdk/src/token/token.ts:637, packages/sdk/src/token/token.ts:658, packages/sdk/src/token/token.ts:711, packages/sdk/src/token/token.ts:761, packages/sdk/src/token/token.ts:798, packages/sdk/src/token/token.ts:951
- Evidence: TypeScript's ErrorOptions.cause is typed as `unknown` (verified in lib.es2022.error.d.ts). The pattern `cause: error instanceof Error ? error : undefined` appears 16 times in token.ts (lines 133, 159, 214, 246, 284, 370, 407, 453, 478, 522, 637, 658, 711, 761, 798, 951) and 2 times in relayer files. This guard (1) distrusts the type system — cause already accepts unknown, (2) silently discards non-Error causes (e.g. string rejections from wallets, or objects with statusCode), losing debugging context. Simply passing `{ cause: error }` is both type-correct and preserves all error context.
- Accept if: No downstream code depends on cause being Error | undefined rather than unknown

```diff
--- a/packages/sdk/src/token/token.ts
+++ b/packages/sdk/src/token/token.ts
@@ -130,7 +130,7 @@
       if (error instanceof ZamaError) {
         throw error;
       }
-      throw new EncryptionFailedError("Failed to encrypt transfer amount", {
-        cause: error instanceof Error ? error : undefined,
+      throw new EncryptionFailedError("Failed to encrypt transfer amount", {
+        cause: error,
       });

(apply same change to all 16 occurrences)
```

### IMP-0004 - 17 identical error-wrapping catch blocks in token.ts should be a single helper method
- Kind: simplification
- Confidence: high
- Seen by: refactor-hunter
- Scopes: packages/sdk
- Support count: 1
- Files: packages/sdk/src/token/token.ts, packages/sdk/src/token/token.ts:129, packages/sdk/src/token/token.ts:280, packages/sdk/src/token/token.ts:366, packages/sdk/src/token/token.ts:474, packages/sdk/src/token/token.ts:707, packages/sdk/src/token/token.ts:794
- Evidence: Every write method in Token repeats this exact pattern:
```ts
catch (error) {
  this.emit({ type: ZamaSDKEvents.TransactionError, operation: "xxx", error: toError(error) });
  if (error instanceof ZamaError) { throw error; }
  throw new SomeError("message", { cause: error instanceof Error ? error : undefined });
}
```
Grep finds `if (error instanceof ZamaError)` at 17 distinct lines: 129, 155, 210, 242, 280, 366, 403, 449, 474, 518, 633, 654, 707, 757, 794, 892, 947. Each block is 5-7 lines of identical structure differing only in operation name, error class, and message string.
- Accept if: All 17 catch blocks follow the same emit-then-rethrow-or-wrap pattern with no meaningful variation beyond parameters.

```diff
Extract a private helper:
```ts
private wrapAndThrow(
  error: unknown,
  operation: string,
  ErrorClass: new (msg: string, opts?: ErrorOptions) => ZamaError,
  message: string,
): never {
  this.emit({ type: ZamaSDKEvents.TransactionError, operation, error: toError(error) });
  if (error instanceof ZamaError) throw error;
  throw new ErrorClass(message, { cause: error instanceof Error ? error : undefined });
}
```
Then each catch becomes: `catch (error) { this.wrapAndThrow(error, "shield", TransactionRevertedError, "Shield transaction failed"); }`
```

## Medium (7)
### IMP-0005 - shieldFeeQueryOptions and unshieldFeeQueryOptions are near-identical with duplicated config types
- Kind: simplification
- Confidence: high
- Seen by: refactor-hunter
- Scopes: packages/sdk
- Support count: 1
- Files: packages/sdk/src/query/fees.ts, packages/sdk/src/query/fees.ts:17-29, packages/sdk/src/query/fees.ts:35-72, packages/sdk/src/query/fees.ts:74-111
- Evidence: In fees.ts, `ShieldFeeQueryConfig` (lines 17-22) and `UnshieldFeeQueryConfig` (lines 24-29) are structurally identical interfaces — both have `feeManagerAddress`, `amount`, `from`, `to`. The functions `shieldFeeQueryOptions` (lines 35-72) and `unshieldFeeQueryOptions` (lines 74-111) differ only in: (1) the query key factory (`zamaQueryKeys.fees.shieldFee` vs `.unshieldFee`), and (2) the contract factory (`getWrapFeeContract` vs `getUnwrapFeeContract`). Every other line is identical — same enabled logic, same amount parsing, same validation guards, same staleTime.
- Accept if: The two functions remain structurally identical with only the query key and contract call differing.

```diff
Unify the config type and extract a parameterized factory:
```ts
export interface FeeAmountQueryConfig extends FeeQueryConfig {
  feeManagerAddress?: Address;
  amount?: bigint;
  from?: Address;
  to?: Address;
}

function feeQueryOptionsFactory(
  signer: GenericSigner,
  config: FeeAmountQueryConfig,
  queryKeyFn: typeof zamaQueryKeys.fees.shieldFee,
  contractFn: typeof getWrapFeeContract,
) { /* shared logic */ }

export const shieldFeeQueryOptions = (s, c) => feeQueryOptionsFactory(s, c, zamaQueryKeys.fees.shieldFee, getWrapFeeContract);
export const unshieldFeeQueryOptions = (s, c) => feeQueryOptionsFactory(s, c, zamaQueryKeys.fees.unshieldFee, getUnwrapFeeContract);
```
```

### IMP-0006 - shieldFeeQueryOptions and unshieldFeeQueryOptions are near-identical 40-line functions with identical config types
- Kind: simplification
- Confidence: high
- Seen by: app-logic-architecture
- Scopes: packages/sdk
- Support count: 1
- Files: packages/sdk/src/query/fees.ts, packages/sdk/src/query/fees.ts:17-29, packages/sdk/src/query/fees.ts:35-111
- Evidence: `ShieldFeeQueryConfig` (line 17) and `UnshieldFeeQueryConfig` (line 24) in fees.ts are structurally identical interfaces: both have `{ feeManagerAddress?, amount?, from?, to?, query? }`. The two factory functions (lines 35-71 and 74-111) differ only in: (a) the query key segment (`shieldFee` vs `unshieldFee`), and (b) the contract call (`getWrapFeeContract` vs `getUnwrapFeeContract`). All validation logic, enabled logic, staleTime, and structure is duplicated line-for-line.

```ts
// shieldFeeQueryOptions, line 64
return signer.readContract(getWrapFeeContract(params.feeManagerAddress, amount, params.from, params.to));

// unshieldFeeQueryOptions, line 103
return signer.readContract(getUnwrapFeeContract(params.feeManagerAddress, amount, params.from, params.to));
```
- Accept if: Both functions are confirmed to share identical validation, enabled logic, and staleTime.
- Dismiss if: The shield and unshield fee contracts are expected to diverge in parameter shape soon.

```diff
Unify `ShieldFeeQueryConfig` and `UnshieldFeeQueryConfig` into a single `DirectionalFeeQueryConfig` type (they are identical). Extract a private `feeQueryOptionsFactory(signer, type, contractFn, config)` helper parameterized on the fee direction, then have `shieldFeeQueryOptions` and `unshieldFeeQueryOptions` be thin one-line wrappers that pass `getWrapFeeContract` or `getUnwrapFeeContract`.
```

### IMP-0007 - query/index.ts re-exports 70+ types from sibling modules (token, relayer, events, activity), blurring the query module's ownership boundary
- Kind: architecture
- Confidence: high
- Seen by: app-logic-architecture
- Scopes: packages/sdk
- Support count: 1
- Files: packages/sdk/src/query/index.ts, packages/sdk/src/query/index.ts:132-205
- Evidence: Lines 132-205 of `query/index.ts` re-export types from `../activity`, `../events/onchain-events`, `../events/sdk-events`, `../relayer/relayer-sdk.types`, `../relayer/relayer-sdk`, `../token/readonly-token`, `../token/token`, `../token/zama-sdk`, `../token/credentials-manager`, and `../token/token.types`. These are not query-related types — they are domain types (Token, ZamaSDK, RelayerSDK, event types, etc.). The main SDK `src/index.ts` already exports all of these. This makes the query barrel a second canonical source for the entire SDK's type surface, increasing coupling and making it unclear whether consumers should import from `@zama-fhe/sdk` or `@zama-fhe/sdk/query`.
- Accept if: The main SDK entry and query entry are consumed by different packages, and consumers can import from both without friction.
- Dismiss if: The query sub-entry is the sole entry point for a framework integration package that cannot depend on the main SDK entry.

```diff
Remove the non-query type re-exports from `query/index.ts`. Consumers of the query sub-entry should import domain types from the main SDK entry point (`@zama-fhe/sdk`). The query entry should only export query option factories, mutation option factories, query keys, invalidation helpers, and the utility types they define.
```

### IMP-0008 - ZERO_HANDLE is defined identically in two modules
- Kind: simplification
- Confidence: high
- Seen by: app-logic-architecture
- Scopes: packages/sdk
- Support count: 1
- Files: packages/sdk/src/query/utils.ts, packages/sdk/src/query/utils.ts:63-64, packages/sdk/src/token/readonly-token.ts:38-39
- Evidence: The constant `ZERO_HANDLE = "0x0000...0000"` is defined in both `token/readonly-token.ts:38` and `query/utils.ts:63`. The main SDK barrel (`src/index.ts:54`) re-exports from `token/readonly-token`, while the query barrel (`query/index.ts:1`) re-exports from `query/utils`. Both are the same 66-char hex string. The `activity.ts` module imports from `token/readonly-token`. This creates two canonical sources for the same value.
- Accept if: The query sub-package does not need to be independently publishable without the token module.
- Dismiss if: The query module is intended to be a standalone package with zero imports from token internals (in which case the duplication is deliberate decoupling).

```diff
Delete the `ZERO_HANDLE` definition from `query/utils.ts` and import it from `../token/readonly-token` instead. The query module already imports `ReadonlyToken` in several files, so this introduces no new cross-module dependency.
```

### IMP-0009 - encryptCredentials, decryptCredentials, and storeKey caching are duplicated across CredentialsManager and DelegatedCredentialsManager
- Kind: simplification
- Confidence: high
- Seen by: refactor-hunter
- Scopes: packages/sdk
- Support count: 1
- Files: packages/sdk/src/token/credentials-manager.ts, packages/sdk/src/token/credentials-manager.ts:165-184, packages/sdk/src/token/credentials-manager.ts:194-205, packages/sdk/src/token/delegated-credentials-manager.ts:155-176, packages/sdk/src/token/delegated-credentials-manager.ts:186-201
- Evidence: CredentialsManager.encryptCredentials (lines 165-173) and DelegatedCredentialsManager.encryptCredentials (lines 155-165) have identical logic: `crypto.encrypt(creds.privateKey, creds.signature, address)`, then destructure out privateKey/signature and spread rest with encryptedPrivateKey. Same for decryptCredentials. The #storeKey caching pattern (identity string → cache check → compute) is also duplicated: CredentialsManager lines 194-205 vs DelegatedCredentialsManager lines 186-201, differing only in identity string composition and static compute method.
- Accept if: The encrypt/decrypt logic is truly identical and the only difference is the TypeScript generic parameter.
- Dismiss if: The delegated variant needs to encrypt additional fields beyond privateKey/signature in the near future.

```diff
Move encryptCredentials and decryptCredentials to BaseCredentialsManager with generic type parameters. For storeKey, extract a `cachedStoreKey(identitySegments: string[], computeFn: (...args) => Promise<string>)` utility in the base class.
```

### IMP-0010 - confidentialTransfer and confidentialTransferFrom share ~80% identical encrypt-then-submit flow
- Kind: simplification
- Confidence: high
- Seen by: refactor-hunter
- Scopes: packages/sdk
- Support count: 1
- Files: packages/sdk/src/token/token.ts, packages/sdk/src/token/token.ts:101-162, packages/sdk/src/token/token.ts:180-249
- Evidence: In token.ts, `confidentialTransfer` (lines 101-162) and `confidentialTransferFrom` (lines 180-249) share the same structure: (1) encrypt amount via relayer, (2) emit EncryptStart/End/Error events with timing, (3) check handles.length, (4) submit contract call, (5) emit submitted event + callback, (6) wait for receipt. The differences are: `userAddress` source (signer vs `from` param), contract function (`confidentialTransferContract` vs `confidentialTransferFromContract`), and event type (TransferSubmitted vs TransferFromSubmitted). The encrypt block (lines 110-139 vs 189-220) is nearly character-for-character identical.
- Accept if: The encrypt-then-submit pattern is identical and no divergence is planned.
- Dismiss if: The two methods are expected to diverge significantly (e.g., different encryption strategies).

```diff
Extract a private `#encryptAndSubmit` helper that handles the encrypt → validate → submit → wait flow, parameterized by the user address, contract call builder, event type, and error message. Each public method becomes a thin wrapper that calls the shared helper.
```

### IMP-0011 - unprefixHex asserts 0x-prefix on viem Hex type that already guarantees it
- Kind: simplification
- Confidence: high
- Seen by: type-system-purist
- Scopes: packages/sdk
- Support count: 1
- Files: packages/sdk/src/utils.ts, packages/sdk/src/utils.ts:14-16
- Evidence: viem's `Hex` type is `\`0x${string}\``. The parameter `value: Hex` at line 14 of utils.ts already guarantees the string starts with `0x`. The `assertCondition(value.startsWith("0x"), ...)` at line 15 is a runtime check for a property the type system has already enforced. This assertion can never fail for correctly-typed callers. All 12 call sites in the codebase pass `Hex`-typed values (verified via grep in worker files).
- Accept if: All callers are typed and no untyped JS consumers exist in the public API surface
- Dismiss if: The SDK is consumed as a JS bundle without type enforcement, making this a genuine trust boundary

```diff
--- a/packages/sdk/src/utils.ts
+++ b/packages/sdk/src/utils.ts
@@ -13,7 +13,6 @@
 /** Convert a public `Hex` value back an unprefixed format. */
 export function unprefixHex(value: Hex): string {
-  assertCondition(value.startsWith("0x"), `Expected 0x-prefixed hex, got: ${value}`);
   return value.slice(2);
 }
```

## Low (2)
### IMP-0012 - MutationFactoryOptions.onSuccess with TOnMutateResult generic is unused speculative generality
- Kind: simplification
- Confidence: high
- Seen by: refactor-hunter
- Scopes: packages/sdk
- Support count: 1
- Files: packages/sdk/src/query/factory-types.ts, packages/sdk/src/query/factory-types.ts:32, packages/sdk/src/query/factory-types.ts:36-41
- Evidence: In factory-types.ts (lines 28-42), MutationFactoryOptions declares a `TOnMutateResult` generic (defaults to `unknown`) and a 4-argument `onSuccess` callback using `MutationFunctionContext`. Grep for `TOnMutateResult` across packages/sdk/src/query/ shows it appears only in the type definition itself — no mutation file specializes it. Similarly, no mutation file provides an `onSuccess` callback. The `MutationFunctionContext` import exists solely for this unused signature.
- Accept if: No consumer currently uses onSuccess or specializes TOnMutateResult.
- Dismiss if: Consumer packages (e.g., React hooks) provide onSuccess through this type but weren't in scope of this review.

```diff
Remove TOnMutateResult and onSuccess from MutationFactoryOptions:
```ts
export interface MutationFactoryOptions<
  TMutationKey extends readonly unknown[],
  TVariables,
  TData,
> {
  mutationKey: TMutationKey;
  mutationFn: (variables: TVariables) => Promise<TData>;
}
```
Re-add onSuccess when a concrete use case arrives.
```

### IMP-0013 - ZERO_HANDLE constant duplicated in readonly-token.ts and query/utils.ts
- Kind: simplification
- Confidence: high
- Seen by: type-system-purist
- Scopes: packages/sdk
- Support count: 1
- Files: packages/sdk/src/query/utils.ts, packages/sdk/src/query/utils.ts:63-64, packages/sdk/src/token/readonly-token.ts:38-39
- Evidence: The exact same constant `0x` + 64 zeros is defined at `packages/sdk/src/token/readonly-token.ts:38` and `packages/sdk/src/query/utils.ts:63`. Both are exported independently. The query barrel (`query/index.ts:1`) re-exports from utils.ts, while the main barrel (`index.ts:54`) re-exports from readonly-token.ts. The `activity.ts` module imports from readonly-token. This duplication means two sources of truth for the same semantic value.
- Accept if: The query package is not intended to be publishable independently from the token package
- Dismiss if: The query and token packages are meant to be independently consumable, requiring separate definitions

```diff
--- a/packages/sdk/src/query/utils.ts
+++ b/packages/sdk/src/query/utils.ts
@@ -60,9 +60,7 @@
   | "query"
   | "pollingInterval";
 
-export const ZERO_HANDLE =
-  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;
+export { ZERO_HANDLE } from "../token/readonly-token";
```

