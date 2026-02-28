# Protocol Apps Feedback — Design

**Date**: 2026-02-28
**Source**: [Notion feedback page](https://www.notion.so/zamaai/Zama-SDK-alpha-release-feedback-3145a7358d5e803c8378cc0daa5ab9a2)

10 feedback items from Protocol Apps alpha testing. Items 11 (ActivityFeed) and 12 (3-layer architecture) are deferred.

---

## 1. useUserDecrypt: Full Orchestration Hook

**Problem**: `useUserDecrypt` requires callers to manually provide keypair, EIP712 signature, and all credential params. The docs reference `useUserDecryptFlow` which doesn't exist.

**Design**: Replace the current `useUserDecrypt` with an orchestrated version. Simplified API:

```typescript
const { mutate } = useUserDecrypt();
mutate({
  handles: [{ handle: "0xHandle", contractAddress: "0xContract" }],
  durationDays: 7,
});
```

**Strategy**: Try cached credentials first, prompt for new ones only if missing/expired.

**Internal flow**:
1. Check `CredentialsManager` for cached credentials matching the contract addresses
2. If valid credentials exist → skip to step 5
3. If missing/expired → generate keypair via `sdk.relayer.generateKeypair()`
4. Create EIP712 typed data → prompt wallet signature → store credentials
5. Call `sdk.userDecrypt()` with credentials
6. Cache decrypted values in TanStack Query cache

**Breaking change**: Rename current low-level hook to `useUserDecryptRaw` for advanced users who need manual credential control.

**Files**:
- `packages/react-sdk/src/relayer/use-user-decrypt.ts` — rewrite with orchestration
- `packages/react-sdk/src/relayer/use-user-decrypt-raw.ts` — move current implementation here
- `packages/sdk/src/token/credentials-manager.ts` — ensure `getCredentials()` / `hasValidCredentials()` are exposed

---

## 2. Expose RelayerSDKStatus via useFHEvmStatus Hook

**Problem**: `RelayerSDKStatus` type exists but isn't accessible. WASM loading issues are hard to debug.

**Design**: Add a `useFHEvmStatus()` hook that returns the current relayer lifecycle state.

```typescript
const status = useFHEvmStatus(); // "idle" | "initializing" | "ready" | "error"
```

**Implementation**:
- Add `getStatus(): RelayerSDKStatus` method to `RelayerWeb`
- Add `onStatusChange(listener): () => void` subscription to `RelayerWeb` for reactive updates
- Hook uses `useSyncExternalStore(subscribe, getSnapshot)` for tear-safe rendering

**Files**:
- `packages/sdk/src/relayer/relayer-web.ts` — add status getter + subscription
- `packages/react-sdk/src/relayer/use-fhevm-status.ts` — new hook
- `packages/react-sdk/src/index.ts` — export the hook

---

## 3. Make Signer Optional in ZamaProvider

**Problem**: `signer` is required in `ZamaProvider`, blocking read-only app states before wallet connection.

**Design**: Make `signer` optional. Read-only hooks work without signer. Mutation hooks throw `SignerRequiredError` if called without one.

**Changes**:
- `ZamaProviderProps.signer` becomes `signer?: GenericSigner`
- `ZamaSDKConfig.signer` becomes optional
- Add `ZamaSDK.setSigner(signer: GenericSigner)` for late binding when wallet connects
- `ZamaProvider` calls `sdk.setSigner(signer)` when prop transitions from undefined → defined
- Add `SignerRequiredError` extending `ZamaError` with code `SIGNER_REQUIRED`
- Internal `#requireSigner(): GenericSigner` guard on all write paths
- `Token` constructor accepts optional signer; `ReadonlyToken` paths work without it

**Files**:
- `packages/sdk/src/token/zama-sdk.ts` — optional signer, `setSigner()` method
- `packages/sdk/src/token/token.ts` — `#requireSigner()` guard on mutations
- `packages/sdk/src/token/token.types.ts` — update `ZamaSDKConfig`
- `packages/sdk/src/token/errors.ts` — add `SignerRequiredError`
- `packages/react-sdk/src/provider.tsx` — optional signer prop, `setSigner` effect

---

## 4. Detailed Callbacks in Multi-Step Hooks

**Problem**: Only `useUnshield` has step-by-step callbacks (`UnshieldCallbacks`). `useShield` and other multi-step hooks lack them.

**Design**: Add `ShieldCallbacks` following the same `safeCallback()` pattern:

```typescript
interface ShieldCallbacks {
  onApprovalSubmitted?: (txHash: Hex) => void;
  onShieldSubmitted?: (txHash: Hex) => void;
}
```

Add `callbacks?: ShieldCallbacks` to `ShieldParams`. The `Token.shield()` method invokes them at each step.

**Files**:
- `packages/sdk/src/token/token.types.ts` — define `ShieldCallbacks`
- `packages/sdk/src/token/token.ts` — invoke callbacks in `shield()` and `#ensureAllowance()`
- `packages/react-sdk/src/token/use-shield.ts` — pass through callbacks

---

## 5. useEncrypt: Support All FHE Types

**Problem**: `useEncrypt` accepts `values: bigint[]` and the worker hardcodes `input.add64()`. Non-uint64 types cannot be encrypted.

**Design**: Replace `bigint[]` with typed value entries:

```typescript
type FheType = "bool" | "uint4" | "uint8" | "uint16" | "uint32" | "uint64"
             | "uint128" | "uint256" | "address" | "bytes64" | "bytes128" | "bytes256";

type EncryptableValue =
  | { type: "bool"; value: boolean }
  | { type: "address"; value: Address }
  | { type: "uint4" | "uint8" | "uint16" | "uint32" | "uint64" | "uint128" | "uint256"; value: bigint }
  | { type: "bytes64" | "bytes128" | "bytes256"; value: Uint8Array };
```

`EncryptParams.values` changes from `bigint[]` to `EncryptableValue[]`.

**Worker change**: Replace the `add64` loop with a type dispatcher that calls the appropriate `input.addX()` method per entry.

**Files**:
- `packages/sdk/src/relayer/relayer-sdk.types.ts` — define `FheType`, `EncryptableValue`, update `EncryptParams`
- `packages/sdk/src/worker/relayer-sdk.worker.ts` — type dispatcher replacing `add64` loop
- `packages/react-sdk/src/relayer/use-encrypt.ts` — updated types flow through

---

## 6. Decrypt: Return Proper Types for ebool and eaddress

**Problem**: `useUserDecrypt` and `useUserDecryptedValue` return `bigint` only. `ebool` should return `boolean`, `eaddress` should return an address string.

**Design**: The relayer returns raw bigints for all types (the protocol doesn't distinguish at the handle level). Add a utility function for consumers to decode:

```typescript
function decodeDecryptedValue(value: bigint, type: "bool"): boolean;
function decodeDecryptedValue(value: bigint, type: "address"): Address;
function decodeDecryptedValue(value: bigint, type: FheType): bigint | boolean | Address;
```

- `"bool"` → `value !== 0n`
- `"address"` → `"0x" + value.toString(16).padStart(40, "0")` (pad to 20 bytes)
- All uint types → return as-is (`bigint`)

Export from `@zama-fhe/sdk` and re-export from `@zama-fhe/react-sdk`.

**Files**:
- `packages/sdk/src/relayer/decode-decrypted-value.ts` — new utility
- `packages/sdk/src/index.ts` — export it
- `packages/react-sdk/src/index.ts` — re-export it

---

## 7. useShield: Add `to` (Recipient) Parameter

**Problem**: Shielding doesn't support specifying a recipient. The underlying Solidity function accepts a `to` parameter.

**Design**: Add `to?: Address` to `ShieldParams`. Defaults to caller's own address (current behavior).

Pass through to `Token.shield()` → `wrapContract()` call.

**Files**:
- `packages/sdk/src/token/token.types.ts` — add `to?: Address` to `ShieldParams`
- `packages/sdk/src/token/token.ts` — pass `to` to wrap contract call
- `packages/sdk/src/contracts/wrapper.ts` — update `wrapContract()` to accept `to`

---

## 8. Approval Strategy in useShield (Verification)

**Problem**: Concern about USDT compatibility where allowance must be reset to 0 before increasing.

**Status**: Already handled. `Token.#ensureAllowance()` checks for non-zero existing allowance and resets to zero first. The `approvalStrategy: "max" | "exact" | "skip"` already exists.

**Action**: Verify the reset-to-zero logic in tests. No code changes needed beyond item #4 (adding callbacks to make the approval step visible to consumers).

---

## 9. useConfidentialBalances: Return Partial Results

**Problem**: If one token in the list fails decryption, the entire hook fails.

**Design**: Change the return type to include per-token error information:

```typescript
// New result type
type BalanceResult = { status: "success"; value: bigint } | { status: "error"; error: Error };

// Return type changes from Map<Address, bigint> to Map<Address, BalanceResult>
```

In `ReadonlyToken.batchDecryptBalances()`: always use an internal `onError` handler that captures the error. Return results for all tokens — successes and failures.

The hook-level `data` becomes `Map<Address, BalanceResult>`. Consumers check `result.status` per token.

**Files**:
- `packages/sdk/src/token/readonly-token.ts` — update `batchDecryptBalances` return type
- `packages/sdk/src/token/token.types.ts` — define `BalanceResult`
- `packages/react-sdk/src/token/use-confidential-balances.ts` — update types

---

## 10. useConfidentialIsApproved: Add Holder Parameter

**Problem**: The hook always checks approval for the connected wallet. The underlying Solidity function accepts an arbitrary holder.

**Design**: Add `holder?: Address` to `UseConfidentialIsApprovedConfig`. When omitted, defaults to connected wallet (current behavior).

```typescript
interface UseConfidentialIsApprovedConfig extends UseZamaConfig {
  spender: Address | undefined;
  holder?: Address; // defaults to connected wallet
}
```

**Files**:
- `packages/react-sdk/src/token/use-confidential-is-approved.ts` — add holder param, pass to `token.isApproved()`
- `packages/sdk/src/token/token.ts` — ensure `isApproved()` accepts a holder override
