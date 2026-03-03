# Plan: CleartextMockFhevm TypeScript Module

## Overview

Create a new `packages/playwright/fixtures/cleartext-mock/` directory containing 7 TypeScript
modules that implement `CleartextMockFhevm` — a drop-in replacement for `MockFhevmInstance` from
`@fhevm/mock-utils`. The new implementation reads cleartext values directly from the on-chain
`CleartextFHEVMExecutor` contract via `eth_call`, eliminating the dependency on native addons
(`node-tfhe`, `node-tkms`) and the Hardhat coprocessor polling loop.

## TDD Applies — Justification

This is **entirely new feature code** with a public API surface (classes, functions, types) that
must conform to precise byte layouts, EIP-712 structures, and handle metadata encoding. TDD is
the right approach because:

1. The handle metadata bit layout is error-prone — tests catch shift/mask bugs before they surface
   in E2E tests
2. EIP-712 type hashes must match on-chain contract expectations exactly
3. The encrypted input proof wire format has specific byte offsets
4. Permission checks (ACL) must reject unauthorized operations

Tests will be written **before** each module's implementation.

---

## File Structure

```
packages/playwright/fixtures/cleartext-mock/
├── __tests__/
│   ├── handle.test.ts              # computeInputHandle, computeMockCiphertext
│   ├── eip712.test.ts              # EIP-712 domain/type structure
│   ├── encrypted-input.test.ts     # CleartextEncryptedInput.encrypt() proof layout
│   └── index.test.ts               # CleartextMockFhevm (mocked provider)
├── bytecode.ts                     # CLEARTEXT_EXECUTOR_BYTECODE
├── constants.ts                    # Addresses, keys, FheType, bit widths, HANDLE_VERSION
├── types.ts                        # CleartextMockConfig, shared types
├── handle.ts                       # computeInputHandle, computeMockCiphertext
├── eip712.ts                       # 3 EIP-712 schema definitions
├── encrypted-input.ts              # CleartextEncryptedInput builder
└── index.ts                        # CleartextMockFhevm class
```

---

## Step-by-Step Implementation (TDD order)

### Phase 1: Foundation (no tests needed — pure data)

#### Step 1: `constants.ts`

Create constants file with all verified addresses and enums.

```typescript
// Exports:
export const FHEVM_ADDRESSES: {
  acl: string; executor: string; inputVerifier: string; kmsVerifier: string;
}
export const VERIFYING_CONTRACTS: {
  inputVerification: string; decryption: string;
}
export const GATEWAY_CHAIN_ID: number;                     // 10901
export const MOCK_INPUT_SIGNER_PK: string;                 // 0x7ec8ada6...
export const MOCK_KMS_SIGNER_PK: string;                   // 0x388b7680...
export enum FheType { Bool=0, Uint4=1, ..., Uint256=8 }
export const FHE_BIT_WIDTHS: Record<FheType, number>;
export const HANDLE_VERSION: number;                        // 0
export const PREHANDLE_MASK: bigint;                        // 21 bytes FF, 11 bytes 00
```

**Source of truth:** FHEVMHostAddresses.sol, fhevm.ts, FhevmTest.sol, FheTypeBitWidth.sol

#### Step 2: `types.ts`

```typescript
export interface CleartextMockConfig {
  chainId: bigint;                              // dapp chain (hardhat: 31337n)
  gatewayChainId: number;                       // 10901
  aclAddress: string;
  executorProxyAddress: string;
  inputVerifierContractAddress: string;
  kmsContractAddress: string;
  verifyingContractAddressInputVerification: string;
  verifyingContractAddressDecryption: string;
}
```

#### Step 3: `bytecode.ts`

```typescript
import artifact from "../../contracts/out/CleartextFHEVMExecutor.sol/CleartextFHEVMExecutor.json";
export const CLEARTEXT_EXECUTOR_BYTECODE: string = artifact.deployedBytecode.object;
```

**Note:** The forge artifact at `packages/playwright/contracts/out/CleartextFHEVMExecutor.sol/CleartextFHEVMExecutor.json` has `deployedBytecode.object` as a hex string (71,266 chars including `0x` prefix). The tsconfig uses `"resolveJsonModule": true`.

Wait — the playwright tsconfig does NOT have `resolveJsonModule`. We need to add it, OR use `fs.readFileSync` + JSON.parse at runtime, OR add a minimal declaration.

**Decision:** Add `"resolveJsonModule": true` to `packages/playwright/tsconfig.json` since the root tsconfig already has it. Alternatively, extract the bytecode at build time. Since this is a test-only package, adding `resolveJsonModule` is simplest.

#### Step 4: `eip712.ts`

```typescript
// Exports:
export const INPUT_VERIFICATION_EIP712: {
  domain: (chainId: number, verifyingContract: string) => EIP712Domain;
  types: { CiphertextVerification: EIP712TypeField[] };
}
export const KMS_DECRYPTION_EIP712: {
  domain: (chainId: number, verifyingContract: string) => EIP712Domain;
  types: { PublicDecryptVerification: EIP712TypeField[] };
}
export const USER_DECRYPT_EIP712: {
  domain: (chainId: number, verifyingContract: string) => EIP712Domain;
  types: { UserDecryptRequestVerification: EIP712TypeField[] };
}
```

**⚠️ CRITICAL:** Use contract-verified fields, NOT RFC fields:
- `CiphertextVerification`: `{ctHandles, userAddress, contractAddress, contractChainId, extraData}`
- `PublicDecryptVerification`: `{ctHandles, decryptedResult, extraData}`
- `UserDecryptRequestVerification`: `{publicKey, contractAddresses, startTimestamp, durationDays, extraData}`

---

### Phase 2: Handle computation (TDD)

#### Step 5: Write `__tests__/handle.test.ts`

Tests:
1. **`computeInputHandle` metadata bits** — create a mock ciphertext, compute handle for
   index=0, chainId=31337n, fheType=Uint8, then assert:
   - `handle & 0xFFn` === `HANDLE_VERSION` (0)
   - `(handle >> 8n) & 0xFFn` === `FheType.Uint8` (2)
   - `(handle >> 16n) & 0xFFFFFFFFFFFFFFFFn` === `31337n`
   - `(handle >> 80n) & 0xFFn` === `0n` (index)
   - Top 21 bytes preserved from hash

2. **`computeInputHandle` with index=5** — same as above but byte 21 = 5

3. **`computeMockCiphertext` returns deterministic hash** — given same inputs, returns same output;
   uses "ZK-w_rct" prefix

4. **`computeMockCiphertext` byte length** — Bool uses 1 byte, Uint256 uses 32 bytes for cleartext

#### Step 6: Implement `handle.ts`

```typescript
export function computeMockCiphertext(
  fheType: FheType, cleartext: bigint, random32: Uint8Array
): string;

export function computeInputHandle(
  mockCiphertext: string,  // bytes32 hash from computeMockCiphertext
  index: number,
  fheType: FheType,
  aclAddress: string,
  chainId: bigint,
): string;  // bytes32 handle
```

**Implementation notes:**
- `computeMockCiphertext`: `keccak256(concat(["ZK-w_rct", keccak256(concat([fheType_byte, clearBytes, random32]))]))`
  Wait — re-reading the research: the Solidity does `blobHash = keccak256(abi.encodePacked("ZK-w_rct", mockCiphertext))` where `mockCiphertext` is the raw bytes. Then in TypeScript, we pass the hash result of `keccak256(concat([fheType_byte, clearBytes, random32]))` as the `mockCiphertext` to `computeInputHandle`.

  Actually, looking more carefully at the research doc: `computeMockCiphertext` returns `keccak256(concat([fheType_byte, clearBytes, random32]))` — this is the per-value ciphertext. Then the `ciphertextBlob` (passed to `computeInputHandle`) is `keccak256(concat(allPerValueCiphertexts))`.

  The handle's `blobHash` is computed as `keccak256(abi.encodePacked("ZK-w_rct", ciphertextBlob))` inside `computeInputHandle`.

- `computeInputHandle`:
  1. `blobHash = solidityPackedKeccak256(["bytes", "bytes32"], [toUtf8Bytes("ZK-w_rct"), mockCiphertext])`
  2. `handleHash = solidityPackedKeccak256(["bytes", "bytes32", "uint8", "address", "uint256"], [toUtf8Bytes("ZK-w_hdl"), blobHash, index, aclAddress, chainId])`
  3. Apply PREHANDLE_MASK and OR in metadata bits

---

### Phase 3: EIP-712 verification (TDD)

#### Step 7: Write `__tests__/eip712.test.ts`

Tests:
1. **INPUT_VERIFICATION_EIP712 typehash matches contract** — compute
   `keccak256("CiphertextVerification(bytes32[] ctHandles,address userAddress,address contractAddress,uint256 contractChainId,bytes extraData)")`
   and verify it matches the EIP-712 type encoding from `ethers.TypedDataEncoder`

2. **KMS_DECRYPTION_EIP712 typehash matches contract** — compute
   `keccak256("PublicDecryptVerification(bytes32[] ctHandles,bytes decryptedResult,bytes extraData)")`

3. **Domain names are correct** — InputVerification domain name = "InputVerification",
   KMS/User domain name = "Decryption"

4. **CiphertextVerification has 5 fields** (not 4 as RFC incorrectly stated)

---

### Phase 4: Encrypted input (TDD)

#### Step 8: Write `__tests__/encrypted-input.test.ts`

Tests:
1. **Proof byte layout** — create input with 2 values via `add8(42n)` and `add8(99n)`,
   call `encrypt()`, assert:
   - `proof[0]` === 2 (numHandles)
   - `proof[1]` === 1 (numSigners)
   - Total length = `2 + 2*32 + 1*65 + 2*32 = 195 bytes`
   - Handles at bytes 2..65 (2 × 32 bytes)
   - Signature at bytes 66..130 (65 bytes)
   - Cleartexts at bytes 131..194 (2 × 32 bytes, left-padded)

2. **Cleartext values encoded correctly** — the cleartext section at offset 131 contains
   `42` as a 32-byte big-endian value, and offset 163 contains `99`

3. **addBool, add4..add256, addAddress all work** — each sets the correct FheType

4. **Handles returned match embedded handles** — the `handles` array from encrypt() matches
   the handles embedded in the proof

#### Step 9: Implement `encrypted-input.ts`

```typescript
export class CleartextEncryptedInput {
  constructor(
    contractAddress: string,
    userAddress: string,
    config: CleartextMockConfig,
  );

  addBool(value: boolean | bigint): this;
  add4(value: bigint): this;
  add8(value: bigint): this;
  add16(value: bigint): this;
  add32(value: bigint): this;
  add64(value: bigint): this;
  add128(value: bigint): this;
  addAddress(value: string): this;
  add256(value: bigint): this;

  async encrypt(): Promise<{
    handles: Uint8Array[];
    inputProof: Uint8Array;
  }>;
}
```

**Implementation notes for `encrypt()`:**
1. For each added value, compute `mockCiphertext = computeMockCiphertext(fheType, value, random32)`
2. Compute `ciphertextBlob = keccak256(concat(allMockCiphertexts))`
3. For each value, compute `handle = computeInputHandle(ciphertextBlob, index, fheType, aclAddress, chainId)`
4. Build cleartext bytes: each value as 32-byte big-endian
5. Sign EIP-712 `CiphertextVerification` with input signer wallet:
   - domain: `INPUT_VERIFICATION_EIP712.domain(GATEWAY_CHAIN_ID, verifyingContractAddressInputVerification)`
   - struct: `{ ctHandles: handles, userAddress, contractAddress, contractChainId: config.chainId, extraData: cleartextBytes }`
6. Assemble proof: `[numHandles(1)][numSigners=1(1)][handles(N*32)][signature(65)][cleartexts(N*32)]`

---

### Phase 5: Main class (TDD)

#### Step 10: Write `__tests__/index.test.ts`

Tests:
1. **userDecrypt rejects when ACL returns false** — mock provider where
   `persistAllowed(handle, user)` returns false, assert `userDecrypt` throws

2. **publicDecrypt rejects when ACL returns false** — mock provider where
   `isAllowedForDecryption(handle)` returns false, assert `publicDecrypt` throws

3. **publicDecrypt proof layout** — verify `decryptionProof` is
   `[numSigners=1(1 byte)][KMS signature(65 bytes)]`

4. **generateKeypair returns distinct 32-byte hex strings** — call twice, verify format
   and uniqueness

#### Step 11: Implement `index.ts`

```typescript
export class CleartextMockFhevm {
  static async create(
    provider: ethers.JsonRpcProvider,
    config: CleartextMockConfig,
  ): Promise<CleartextMockFhevm>;

  generateKeypair(): { publicKey: string; privateKey: string };

  createEIP712(
    publicKey: string,
    contractAddresses: string[],
    startTimestamp: number,
    durationDays: number,
  ): object;  // USER_DECRYPT_EIP712 typed data

  createEncryptedInput(
    contractAddress: string,
    userAddress: string,
  ): CleartextEncryptedInput;

  async userDecrypt(
    handleContractPairs: Array<{ handle: string; contractAddress: string }>,
    privateKey: string,
    publicKey: string,
    signature: string,
    signedContractAddresses: string[],
    signerAddress: string,
    startTimestamp: number,
    durationDays: number,
  ): Promise<Record<string, bigint>>;

  async publicDecrypt(
    handles: string[],
  ): Promise<{
    clearValues: Record<string, bigint>;
    abiEncodedClearValues: string;
    decryptionProof: string;
  }>;
}
```

**`create()` implementation:**
1. Read EIP-1967 implementation slot `0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc` from `executorProxyAddress`
2. Extract address: `getAddress("0x" + slotValue.slice(26))`
3. Call `hardhat_setCode` on that implementation address with `CLEARTEXT_EXECUTOR_BYTECODE`

**`userDecrypt()` implementation:**
1. For each handle, call `acl.persistAllowed(handle, signerAddress)` — throw if false
2. For each handle, call `executor.plaintexts(handle)` — read cleartext value
3. Return `{ [handle]: clearValue }`

**`publicDecrypt()` implementation:**
1. For each handle, call `acl.isAllowedForDecryption(handle)` — throw if false
2. For each handle, call `executor.plaintexts(handle)` — read cleartext value
3. ABI-encode clear values: `abiCoder.encode(["uint256[]"], [values])`
4. Sign KMS EIP-712: `kmsSignerWallet.signTypedData(domain, types, { ctHandles, decryptedResult, extraData: "0x" })`
5. Build proof: `concat([Uint8Array([1]), getBytes(signature)])`
6. Return `{ clearValues, abiEncodedClearValues, decryptionProof }`

---

### Phase 6: Configuration updates

#### Step 12: Update `packages/playwright/tsconfig.json`

Add `"resolveJsonModule": true` to `compilerOptions` so `bytecode.ts` can import the forge artifact JSON.

---

## Files to Create

| File | Purpose |
|------|---------|
| `packages/playwright/fixtures/cleartext-mock/constants.ts` | Addresses, keys, FheType, bit widths |
| `packages/playwright/fixtures/cleartext-mock/types.ts` | CleartextMockConfig interface |
| `packages/playwright/fixtures/cleartext-mock/bytecode.ts` | CLEARTEXT_EXECUTOR_BYTECODE from artifact |
| `packages/playwright/fixtures/cleartext-mock/eip712.ts` | 3 EIP-712 schema definitions |
| `packages/playwright/fixtures/cleartext-mock/handle.ts` | computeInputHandle, computeMockCiphertext |
| `packages/playwright/fixtures/cleartext-mock/encrypted-input.ts` | CleartextEncryptedInput builder |
| `packages/playwright/fixtures/cleartext-mock/index.ts` | CleartextMockFhevm class |
| `packages/playwright/fixtures/cleartext-mock/__tests__/handle.test.ts` | Handle computation tests |
| `packages/playwright/fixtures/cleartext-mock/__tests__/eip712.test.ts` | EIP-712 structure tests |
| `packages/playwright/fixtures/cleartext-mock/__tests__/encrypted-input.test.ts` | Proof layout tests |
| `packages/playwright/fixtures/cleartext-mock/__tests__/index.test.ts` | CleartextMockFhevm tests |

## Files to Modify

| File | Change |
|------|--------|
| `packages/playwright/tsconfig.json` | Add `"resolveJsonModule": true` |

---

## Risks and Mitigations

### 1. EIP-712 field mismatch with on-chain contracts
**Risk:** RFC fields are known to be wrong. Using incorrect struct fields will cause signature verification to fail.
**Mitigation:** Research doc has verified correct fields from InputVerifier.sol and KMSVerifier.sol. Tests verify typehashes match contract-computed values.

### 2. Handle metadata bit encoding
**Risk:** Off-by-one in shift amounts or mask application produces handles that don't match what InputVerifier expects.
**Mitigation:** TDD with explicit bit extraction tests. The PREHANDLE_MASK and shift values are verified against InputProofHelper.sol.

### 3. Index encoding as uint8 vs uint256
**Risk:** RFC says uint256 but Solidity uses uint8. Wrong encoding changes the keccak256 hash.
**Mitigation:** Research explicitly verified this. Test with known vectors.

### 4. contractChainId vs GATEWAY_CHAIN_ID confusion
**Risk:** Using gateway chain ID (10901) in the struct field instead of dapp chain ID (31337).
**Mitigation:** Research doc clarifies: `contractChainId = block.chainid` (dapp), gateway only in EIP-712 domain.

### 5. Forge artifact JSON import
**Risk:** The playwright tsconfig doesn't have `resolveJsonModule`. The JSON file is 346KB which could cause bundling issues.
**Mitigation:** Add `resolveJsonModule: true` to tsconfig. Vitest handles JSON imports natively. If the JSON import causes issues at runtime, fall back to `fs.readFileSync + JSON.parse`.

### 6. Vitest setup file compatibility
**Risk:** Root `vitest.setup.ts` imports `@testing-library/jest-dom/vitest` and `fake-indexeddb/auto`, which may not be needed or could conflict.
**Mitigation:** These setup files only add matchers and polyfills — they won't interfere with pure ethers-based tests. Tests use standard `describe/it/expect` from vitest.

### 7. KMS verifier address discrepancy
**Risk:** `fhevm.ts` uses `0xbE0E3839...` as `kmsContractAddress` but `FHEVMHostAddresses.sol` has `0x901F8942...`. May need runtime verification.
**Mitigation:** Use the `FHEVMHostAddresses.sol` address (`0x901F8942...`) as the source of truth for the KMS verifier. The mock signs with the correct private key regardless.

---

## Acceptance Criteria Verification

| # | Criterion | How Verified |
|---|-----------|-------------|
| 1 | All 7 files exist | File creation in steps 1-11 |
| 2 | CLEARTEXT_EXECUTOR_BYTECODE matches artifact | `bytecode.ts` imports `artifact.deployedBytecode.object` directly |
| 3 | Handle metadata bits correct | `handle.test.ts` — bit extraction assertions |
| 4 | computeMockCiphertext uses ZK-w_rct prefix | `handle.test.ts` — verified in implementation |
| 5 | encrypt() proof layout correct | `encrypted-input.test.ts` — byte offset assertions |
| 6 | INPUT_VERIFICATION_EIP712 correct fields | `eip712.test.ts` — typehash comparison |
| 7 | KMS/User EIP-712 use "Decryption" domain | `eip712.test.ts` — domain name check |
| 8 | create() uses EIP-1967 slot | `index.ts` implementation, `index.test.ts` mock |
| 9 | userDecrypt throws on ACL false | `index.test.ts` — mocked ACL test |
| 10 | publicDecrypt throws on ACL false | `index.test.ts` — mocked ACL test |
| 11 | publicDecrypt proof = [1 byte][65 bytes] | `index.test.ts` — proof length assertion |
| 12 | generateKeypair returns distinct 32-byte hex | `index.test.ts` — format and uniqueness check |
| 13 | Tests pass via `pnpm run test` | Root vitest picks up `packages/**/*.test.ts` |
