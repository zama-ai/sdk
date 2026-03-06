# Implementation Plan: Cleartext Relayer Enhancement

## Context

PR #48 (`feat/relayer-cleartext`) was closed because it rewrote too many internals. We cherry-pick only what's needed:

1. Fix missing ACL checks in the existing `CleartextFhevmInstance`
2. Add `RelayerCleartext` as a thin public-API wrapper (no internal rewrites)
3. Remove e2e fixtures, use `RelayerCleartext` directly in test apps
4. Add proper unit tests inspired by relayer-sdk patterns

## Reference: Correct ACL Behavior (from `relayer-sdk`)

| Operation                | ACL Method                       | Who Is Checked                                                                                  |
| ------------------------ | -------------------------------- | ----------------------------------------------------------------------------------------------- |
| **publicDecrypt**        | `isAllowedForDecryption(handle)` | Handle only (publicly decryptable)                                                              |
| **userDecrypt**          | `persistAllowed(handle, addr)`   | Both **userAddress** AND **contractAddress**; user != contract                                  |
| **delegatedUserDecrypt** | `persistAllowed(handle, addr)`   | Both **delegatorAddress** AND **contractAddress**; delegator != contract. Delegate NOT checked. |

## Current Bugs (verified by reading `cleartext-fhevm-instance.ts`)

1. **`userDecrypt` (line 177-192)**: Only checks `persistAllowed(handle, signerAddress)`. **Missing**: `persistAllowed(handle, contractAddress)` and `signerAddress !== contractAddress` guard.
2. **`delegatedUserDecrypt` (line 272-295)**: Uses `isHandleDelegatedForUserDecryption(delegator, delegate, contract, handle)` which is a single 4-param ACL call. Per relayer-sdk, should instead check `persistAllowed(handle, delegatorAddress)` + `persistAllowed(handle, contractAddress)` + `delegatorAddress !== contractAddress`. The delegate is NOT checked via ACL (authorized by EIP-712 signature).

`publicDecrypt` is **correct** as-is (uses `isAllowedForDecryption`).

---

## Task 1: Fix ACL Checks in `CleartextFhevmInstance`

**File**: `packages/sdk/src/relayer/cleartext/cleartext-fhevm-instance.ts`

### 1a. Fix `userDecrypt` (lines 177-192)

Add contract address ACL check and user != contract guard:

```typescript
async userDecrypt(params: UserDecryptParams): Promise<Readonly<Record<Handle, ClearValueType>>> {
  const normalizedSignerAddress = getAddress(params.signerAddress);
  const normalizedContractAddress = getAddress(params.contractAddress);
  const normalizedHandles = params.handles.map(normalizeHandle);

  // Guard: user address must not equal contract address
  if (normalizedSignerAddress === normalizedContractAddress) {
    throw new DecryptionFailedError(
      `User address ${normalizedSignerAddress} must not equal contract address for user decrypt`,
    );
  }

  // Check both user AND contract have permission for each handle
  const results = await Promise.all(
    normalizedHandles.flatMap((handle) => [
      this.#persistAllowed(handle, normalizedSignerAddress),
      this.#persistAllowed(handle, normalizedContractAddress),
    ]),
  );

  for (let i = 0; i < normalizedHandles.length; i++) {
    const userAllowed = results[i * 2];
    const contractAllowed = results[i * 2 + 1];
    if (!userAllowed) {
      throw new DecryptionFailedError(
        `User ${normalizedSignerAddress} is not authorized for user decrypt of handle ${normalizedHandles[i]!}`,
      );
    }
    if (!contractAllowed) {
      throw new DecryptionFailedError(
        `Contract ${normalizedContractAddress} is not authorized for user decrypt of handle ${normalizedHandles[i]!}`,
      );
    }
  }

  return this.#decryptHandles(normalizedHandles);
}
```

### 1b. Fix `delegatedUserDecrypt` (lines 272-295)

Replace `isHandleDelegatedForUserDecryption` with `persistAllowed` for delegator + contract:

```typescript
async delegatedUserDecrypt(
  params: DelegatedUserDecryptParams,
): Promise<Readonly<Record<Handle, ClearValueType>>> {
  const normalizedHandles = params.handles.map(normalizeHandle);
  const normalizedDelegator = getAddress(params.delegatorAddress);
  const normalizedContract = getAddress(params.contractAddress);

  // Guard: delegator must not equal contract address
  if (normalizedDelegator === normalizedContract) {
    throw new DecryptionFailedError(
      `Delegator address ${normalizedDelegator} must not equal contract address for delegated decrypt`,
    );
  }

  // Check both delegator AND contract have permission (delegate NOT checked - authorized by EIP-712)
  const results = await Promise.all(
    normalizedHandles.flatMap((handle) => [
      this.#persistAllowed(handle, normalizedDelegator),
      this.#persistAllowed(handle, normalizedContract),
    ]),
  );

  for (let i = 0; i < normalizedHandles.length; i++) {
    const delegatorAllowed = results[i * 2];
    const contractAllowed = results[i * 2 + 1];
    if (!delegatorAllowed) {
      throw new DecryptionFailedError(
        `Delegator ${normalizedDelegator} is not authorized for delegated decrypt of handle ${normalizedHandles[i]!}`,
      );
    }
    if (!contractAllowed) {
      throw new DecryptionFailedError(
        `Contract ${normalizedContract} is not authorized for delegated decrypt of handle ${normalizedHandles[i]!}`,
      );
    }
  }

  return this.#decryptHandles(normalizedHandles);
}
```

### 1c. Remove unused `#isHandleDelegatedForUserDecryption` (lines 348-360)

This private method and its ACL ABI entry are no longer needed after the fix.

### 1d. Update unit tests

**File**: `packages/sdk/src/relayer/cleartext/__tests__/cleartext-fhevm-instance.test.ts`

Add/update tests:

- `userDecrypt` with **contract not authorized** → should throw
- `userDecrypt` with **signer === contract** → should throw
- `delegatedUserDecrypt` with **delegator not authorized** → should throw
- `delegatedUserDecrypt` with **contract not authorized** → should throw
- `delegatedUserDecrypt` with **delegator === contract** → should throw
- `delegatedUserDecrypt` with **delegate not authorized** → should still succeed (delegate not checked)

---

## Task 2: Add `RelayerCleartext` Public API Wrapper

### 2a. Add config types

**File**: `packages/sdk/src/relayer/cleartext/types.ts`

Add `CleartextInstanceConfig` interface (flat config matching PR 48's shape) alongside existing types. This is the user-facing config for `RelayerCleartext`:

```typescript
export interface CleartextInstanceConfig {
  network: EIP1193Provider | string;
  chainId: number;
  gatewayChainId: number;
  aclContractAddress: string;
  kmsContractAddress?: string;
  inputVerifierContractAddress?: string;
  verifyingContractAddressDecryption: string;
  verifyingContractAddressInputVerification: string;
  cleartextExecutorAddress: string;
  coprocessorSignerPrivateKey: string;
  kmsSignerPrivateKey: string;
}
```

Add an internal adapter function that maps `CleartextInstanceConfig` → `CleartextChainConfig` (the existing internal config shape).

### 2b. Add `RelayerCleartext` class

**File**: `packages/sdk/src/relayer/cleartext/relayer-cleartext.ts` (new)

Thin wrapper implementing `RelayerSDK` that:

- Accepts single-transport (`CleartextInstanceConfig`) or multi-transport config
- Internally calls `createCleartextRelayer()` (existing factory) after adapting the config
- Lazy init + per-chain caching
- `terminate()` nullifies instance (auto-restarts on next op, supports React StrictMode)
- All methods delegate to the underlying `CleartextFhevmInstance`

This is a **pass-through wrapper** — no logic duplication. The class from PR 48 is the template, but adapted to delegate to our existing factory/instance rather than a rewritten `createCleartextInstance`.

### 2c. Add preset configs

**File**: `packages/sdk/src/relayer/relayer-utils.ts` (or new `relayer-configs.ts`)

Add `HardhatConfig` (with cleartext-specific fields: `cleartextExecutorAddress`, `coprocessorSignerPrivateKey`, `kmsSignerPrivateKey`) and `HoodiConfig` preset, satisfying `CleartextInstanceConfig`.

Update existing `HardhatConfig` to include the cleartext-specific fields (backward compatible — the extra fields are ignored by non-cleartext consumers).

### 2d. Update exports

**File**: `packages/sdk/src/relayer/cleartext/index.ts`

```typescript
export { createCleartextRelayer } from "./factory";
export { RelayerCleartext } from "./relayer-cleartext";
export { hoodi } from "./presets";
export { GATEWAY_CHAIN_ID, VERIFYING_CONTRACTS } from "./constants";
export type { CleartextChainConfig, CleartextContracts, CleartextInstanceConfig } from "./types";
```

### 2e. Add `RelayerCleartext` unit tests

**File**: `packages/sdk/src/relayer/cleartext/__tests__/relayer-cleartext.test.ts` (new)

Test:

- Single-transport construction and delegation
- Multi-transport construction with chain switching
- `terminate()` + auto-restart
- Chain ID rejection (mainnet/sepolia)
- Missing config error

---

## Task 3: Remove E2E Fixtures, Use `RelayerCleartext` in Test Apps

### 3a. Update test app providers

**Files**:

- `packages/test-vite/src/providers.tsx`
- `packages/test-nextjs/src/providers.tsx`

Replace `RelayerWeb` with `RelayerCleartext`:

```typescript
import { RelayerCleartext } from "@zama-fhe/sdk/cleartext";
import { HardhatConfig } from "@zama-fhe/react-sdk"; // or from sdk
import deployments from "../../../hardhat/deployments.json" with { type: "json" };

const relayer = new RelayerCleartext({
  ...HardhatConfig,
  aclContractAddress: deployments.fhevm.acl,
  inputVerifierContractAddress: deployments.fhevm.inputVerifier,
  kmsContractAddress: deployments.fhevm.kmsVerifier,
  cleartextExecutorAddress: deployments.fhevm.executor,
});
```

Remove `useMemo` wrapper, remove `security: { integrityCheck }`, remove `threads` config.

### 3b. Delete Playwright fixtures

- **Delete** `packages/playwright/fixtures/fhevm.ts`
- **Delete** `packages/playwright/fixtures/relayer-sdk.js`
- **Update** `packages/playwright/fixtures/index.ts` — remove `mockRelayerSdk` export
- **Update** `packages/playwright/fixtures/test.ts`:
  - Remove `await mockRelayerSdk(page, baseURL)` call
  - Remove post-revert `viemClient.mine({ blocks: 100 })` hack
  - Navigate to `/wallet` instead of `/` (avoids Next.js 307 redirect)
  - Simplify teardown comments

### 3c. Re-export `HardhatConfig` from react-sdk

Ensure `HardhatConfig` (with cleartext fields) is accessible from `@zama-fhe/react-sdk` so test apps can spread it into `RelayerCleartext` config.

---

## Task 4: Verify E2E Tests Pass

After all changes:

1. Run `pnpm test` in `packages/sdk` to verify unit tests
2. Run Playwright e2e suite against both Vite and Next.js test apps
3. Verify no regressions in existing 15 spec files

---

## Execution Order

```
Task 1 (ACL fixes)          → independent, do first
Task 2 (RelayerCleartext)   → depends on Task 1 types being stable
Task 3 (E2E fixture removal)→ depends on Task 2 (needs RelayerCleartext)
Task 4 (Verify)             → final validation
```

## Files Modified (Summary)

| File                                                                            | Action                                       |
| ------------------------------------------------------------------------------- | -------------------------------------------- |
| `packages/sdk/src/relayer/cleartext/cleartext-fhevm-instance.ts`                | Fix ACL checks                               |
| `packages/sdk/src/relayer/cleartext/types.ts`                                   | Add `CleartextInstanceConfig`                |
| `packages/sdk/src/relayer/cleartext/relayer-cleartext.ts`                       | **New** - wrapper class                      |
| `packages/sdk/src/relayer/cleartext/index.ts`                                   | Add exports                                  |
| `packages/sdk/src/relayer/relayer-utils.ts`                                     | Extend `HardhatConfig` with cleartext fields |
| `packages/sdk/src/relayer/cleartext/__tests__/cleartext-fhevm-instance.test.ts` | Add ACL tests                                |
| `packages/sdk/src/relayer/cleartext/__tests__/relayer-cleartext.test.ts`        | **New** - wrapper tests                      |
| `packages/test-vite/src/providers.tsx`                                          | Use `RelayerCleartext`                       |
| `packages/test-nextjs/src/providers.tsx`                                        | Use `RelayerCleartext`                       |
| `packages/playwright/fixtures/fhevm.ts`                                         | **Delete**                                   |
| `packages/playwright/fixtures/relayer-sdk.js`                                   | **Delete**                                   |
| `packages/playwright/fixtures/index.ts`                                         | Remove mock export                           |
| `packages/playwright/fixtures/test.ts`                                          | Remove mock setup, simplify                  |

## What We Do NOT Change (from PR 48)

- No rewrite of `CleartextFhevmInstance` internals (keep handle computation, encrypted input, EIP-712 as-is)
- No ethers→viem migration
- No `CredentialsManager` session TTL changes
- No credential→keypair rename
- No `ConfigurationError`/`NotSupportedError` new error classes (use existing error types)
- No bundle size optimizations
- No new examples
