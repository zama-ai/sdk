# Research: CleartextMockFhevm TypeScript Module

## Unit ID
`cleartext-mock-ts-module`

## Summary
Create all TypeScript files under `packages/playwright/fixtures/cleartext-mock/` that implement
`CleartextMockFhevm` — a drop-in replacement for `MockFhevmInstance` that reads on-chain
cleartext values from the `CleartextFHEVMExecutor` contract instead of using native addons.

---

## RFC Reference
- **File**: `/Users/msaug/zama/token-sdk/CLEARTEXT_MOCK_PLAN.md`
- **Sections**: §2, §2.1, §2.2, §2.3, §2.4, §2.5

---

## Key Reference Paths

### Existing Codebase
- `/Users/msaug/zama/token-sdk/CLEARTEXT_MOCK_PLAN.md` — full RFC specification
- `/Users/msaug/zama/token-sdk/packages/playwright/fixtures/fhevm.ts` — **CURRENT implementation to replace**
- `/Users/msaug/zama/token-sdk/packages/playwright/fixtures/test.ts` — test fixture that invokes `mockRelayerSdk`
- `/Users/msaug/zama/token-sdk/packages/playwright/fixtures/index.ts` — re-exports
- `/Users/msaug/zama/token-sdk/packages/playwright/package.json` — dependencies: ethers ^6.16.0, @fhevm/mock-utils 0.4.2

### Solidity Sources (reference contracts)
- `/Users/msaug/zama/token-sdk/contracts/InputProofHelper.sol` — **PRIMARY: `computeInputHandle` algorithm**
- `/Users/msaug/zama/token-sdk/packages/playwright/contracts/src/CleartextFHEVMExecutor.sol` — **the executor with `plaintexts` mapping**
- `/Users/msaug/zama/token-sdk/packages/playwright/contracts/src/fhevm-host/contracts/InputVerifier.sol` — **AUTHORITATIVE EIP-712 struct defs**
- `/Users/msaug/zama/token-sdk/packages/playwright/contracts/src/fhevm-host/contracts/KMSVerifier.sol` — **AUTHORITATIVE KMS EIP-712 struct defs**
- `/Users/msaug/zama/token-sdk/packages/playwright/contracts/src/fhevm-host/contracts/ACL.sol` — `persistAllowed` and `isAllowedForDecryption` ABIs
- `/Users/msaug/zama/token-sdk/packages/playwright/contracts/src/fhevm-host/contracts/shared/FheType.sol` — full FheType enum (88 types)
- `/Users/msaug/zama/token-sdk/packages/playwright/contracts/src/fhevm-host/contracts/shared/Constants.sol` — `HANDLE_VERSION = 0`
- `/Users/msaug/zama/token-sdk/packages/playwright/contracts/src/fhevm-host/addresses/FHEVMHostAddresses.sol` — confirmed on-chain addresses
- `/Users/msaug/zama/token-sdk/contracts/FheTypeBitWidth.sol` — bit widths for all FheTypes
- `/Users/msaug/zama/token-sdk/contracts/PlaintextDBMixin.sol` — reference cleartext computation patterns

### Forge Artifact (bytecode source)
- `/Users/msaug/zama/token-sdk/packages/playwright/contracts/out/CleartextFHEVMExecutor.sol/CleartextFHEVMExecutor.json` — **compiled artifact (35,633 bytes deployedBytecode)**

---

## File Structure to Create

```
packages/playwright/fixtures/cleartext-mock/
├── index.ts              # CleartextMockFhevm class (static create, all methods)
├── encrypted-input.ts    # CleartextEncryptedInput builder
├── eip712.ts             # EIP-712 type definitions (3 schemas)
├── handle.ts             # computeInputHandle, computeMockCiphertext
├── constants.ts          # addresses, keys, FheType enum, bit widths, HANDLE_VERSION
├── bytecode.ts           # CLEARTEXT_EXECUTOR_BYTECODE hex constant
└── types.ts              # CleartextMockConfig and shared types
```

---

## §2.1 — constants.ts

### FHEVM_ADDRESSES (✓ VERIFIED from FHEVMHostAddresses.sol)
```typescript
export const FHEVM_ADDRESSES = {
    acl: "0x50157CFfD6bBFA2DECe204a89ec419c23ef5755D",
    executor: "0xe3a9105a3a932253A70F126eb1E3b589C643dD24",
    inputVerifier: "0x36772142b74871f255CbD7A3e89B401d3e45825f",
    kmsVerifier: "0x901F8942346f7AB3a01F6D7613119Bca447Bb030",
};
```

### VERIFYING_CONTRACTS (✓ VERIFIED from fhevm.ts)
```typescript
export const VERIFYING_CONTRACTS = {
    inputVerification: "0x812b06e1CDCE800494b79fFE4f925A504a9A9810",
    decryption: "0x5ffdaAB0373E62E2ea2944776209aEf29E631A64",
};
```

### GATEWAY_CHAIN_ID (✓ VERIFIED from fhevm.ts)
```typescript
export const GATEWAY_CHAIN_ID = 10901;
```

### Mock Signer Private Keys (✓ VERIFIED from previous research on forge-fhevm FhevmTest.sol)
```typescript
export const MOCK_INPUT_SIGNER_PK = "0x7ec8ada6642fc4ccfb7729bc29c17cf8d21b61abd5642d1db992c0b8672ab901";
export const MOCK_KMS_SIGNER_PK   = "0x388b7680e4e1afa06efbfd45cdd1fe39f3c6af381df6555a19661f283b97de91";
```

### FheType Enum (✓ VERIFIED — only the 9 user-encryptable types needed)
```typescript
// FheType.sol has 88 types but user-facing API only exposes these:
export enum FheType {
    Bool   = 0,
    Uint4  = 1,
    Uint8  = 2,
    Uint16 = 3,
    Uint32 = 4,
    Uint64 = 5,
    Uint128 = 6,
    Uint160 = 7,
    Uint256 = 8,
}
```

### FHE_BIT_WIDTHS (✓ VERIFIED from FheTypeBitWidth.sol)
```typescript
export const FHE_BIT_WIDTHS: Record<FheType, number> = {
    [FheType.Bool]: 1,
    [FheType.Uint4]: 4,
    [FheType.Uint8]: 8,
    [FheType.Uint16]: 16,
    [FheType.Uint32]: 32,
    [FheType.Uint64]: 64,
    [FheType.Uint128]: 128,
    [FheType.Uint160]: 160,
    [FheType.Uint256]: 256,
};
```

### HANDLE_VERSION (✓ VERIFIED from Constants.sol)
```typescript
export const HANDLE_VERSION = 0;
```

---

## §2.2 — handle.ts

### PREHANDLE_MASK (✓ VERIFIED from InputProofHelper.sol)
From Solidity: `handleHash & 0xffffffffffffffffffffffffffffffffffffffffff0000000000000000000000`
- 21 bytes of `0xff` followed by 11 bytes of `0x00`
- In BigInt: `0xffffffffffffffffffffffffffffffffffffffffff0000000000000000000000n`
- This zeros bits 0–87 (bytes 21–31 from MSB), preserving only the top 21 bytes of the hash

### computeInputHandle (✓ VERIFIED against InputProofHelper.sol)

```solidity
// Solidity reference (InputProofHelper.sol):
bytes32 blobHash = keccak256(abi.encodePacked("ZK-w_rct", mockCiphertext));
bytes32 handleHash = keccak256(abi.encodePacked("ZK-w_hdl", blobHash, index, aclAddress, uint256(chainId)));
handle = handleHash & 0xffffffffffffffffffffffffffffffffffffffffff0000000000000000000000;
handle |= bytes32(uint256(index) << 80);
handle |= bytes32(uint256(chainId) << 16);
handle |= bytes32(uint256(uint8(fheType)) << 8);
handle |= bytes32(uint256(HANDLE_VERSION));
```

**Critical Notes**:
- `index` in Solidity is `uint8` — in `abi.encodePacked` this serializes as 1 byte
- In the TypeScript port, `solidityPackedKeccak256` with `["uint8"]` for index
- The `mockCiphertext` parameter to the Solidity version is `bytes memory` (raw ciphertext bytes)
- In the TypeScript implementation, `ciphertextBlob` (a keccak256 hash) is passed as the 32-byte `mockCiphertext`

⚠️ **Byte encoding of index**: RFC uses `["bytes", "bytes32", "uint256", "address", "uint256"]` but Solidity uses `uint8` for index. The TypeScript port must use `uint8` to match:
```typescript
// Correct:
const handleHash = ethers.solidityPackedKeccak256(
    ["bytes", "bytes32", "uint8", "address", "uint256"],
    [ethers.toUtf8Bytes("ZK-w_hdl"), blobHash, index, aclAddress, chainId]
);
```

### Metadata Bit Layout (✓ VERIFIED)
- **byte 21 (from MSB)** = index → shift left 80 bits
- **bytes 22–29 (from MSB)** = chainId (uint64) → shift left 16 bits
- **byte 30 (from MSB)** = fheType → shift left 8 bits
- **byte 31 (from MSB)** = version → shift left 0 bits

### computeMockCiphertext
```typescript
// fheByteLenMap: ceil(bitWidth / 8)
// Bool=1, Uint4=1, Uint8=1, Uint16=2, Uint32=4, Uint64=8, Uint128=16, Uint160=20, Uint256=32
export function computeMockCiphertext(fheType: FheType, cleartext: bigint, random32: Uint8Array): string {
    const byteLen = Math.ceil(FHE_BIT_WIDTHS[fheType] / 8);
    const clearBytes = zeroPadLeft(cleartext, byteLen);
    return ethers.keccak256(ethers.concat([new Uint8Array([fheType]), clearBytes, random32]));
}
```

---

## §2.3 — eip712.ts

### ⚠️ CRITICAL DISCREPANCY: RFC vs Contract

The RFC's `eip712.ts` section is INCORRECT for `CiphertextVerification`. Do NOT use the RFC fields directly.

**RFC says** (WRONG):
```typescript
CiphertextVerification: [
    { name: "blobHash", type: "bytes32" },
    { name: "handlesList", type: "bytes32[]" },
    { name: "userAddress", type: "address" },
    { name: "contractAddress", type: "address" },
],
```

**InputVerifier.sol says** (CORRECT — use this):
```
EIP712_INPUT_VERIFICATION_TYPE =
    "CiphertextVerification(bytes32[] ctHandles,address userAddress,address contractAddress,uint256 contractChainId,bytes extraData)"
```

### Correct INPUT_VERIFICATION_EIP712
```typescript
export const INPUT_VERIFICATION_EIP712 = {
    domain: (chainIdSource: number, verifyingContract: string) => ({
        name: "InputVerification",
        version: "1",
        chainId: chainIdSource,
        verifyingContract,
    }),
    types: {
        CiphertextVerification: [
            { name: "ctHandles",       type: "bytes32[]" },
            { name: "userAddress",     type: "address"   },
            { name: "contractAddress", type: "address"   },
            { name: "contractChainId", type: "uint256"   },
            { name: "extraData",       type: "bytes"     },
        ],
    },
};
```

### ⚠️ CRITICAL DISCREPANCY: KMS EIP-712

**RFC says** (WRONG — missing `extraData`):
```typescript
PublicDecryptVerification: [
    { name: "ctHandles",       type: "bytes32[]" },
    { name: "decryptedResult", type: "bytes"     },
],
```

**KMSVerifier.sol says** (CORRECT — use this):
```
EIP712_PUBLIC_DECRYPT_TYPE =
    "PublicDecryptVerification(bytes32[] ctHandles,bytes decryptedResult,bytes extraData)"
```

### Correct KMS_DECRYPTION_EIP712
```typescript
export const KMS_DECRYPTION_EIP712 = {
    domain: (chainIdSource: number, verifyingContract: string) => ({
        name: "Decryption",
        version: "1",
        chainId: chainIdSource,
        verifyingContract,
    }),
    types: {
        PublicDecryptVerification: [
            { name: "ctHandles",       type: "bytes32[]" },
            { name: "decryptedResult", type: "bytes"     },
            { name: "extraData",       type: "bytes"     },
        ],
    },
};
```

### USER_DECRYPT_EIP712 (✓ matches RFC — no contract discrepancy)
```typescript
export const USER_DECRYPT_EIP712 = {
    domain: (chainIdSource: number, verifyingContract: string) => ({
        name: "Decryption",
        version: "1",
        chainId: chainIdSource,
        verifyingContract,
    }),
    types: {
        UserDecryptRequestVerification: [
            { name: "publicKey",         type: "bytes"     },
            { name: "contractAddresses", type: "address[]" },
            { name: "startTimestamp",    type: "uint256"   },
            { name: "durationDays",      type: "uint256"   },
            { name: "extraData",         type: "bytes"     },
        ],
    },
};
```

---

## §2.4 — encrypted-input.ts

### Proof Format (✓ VERIFIED from CleartextFHEVMExecutor.sol and RFC)
```
Standard: [numHandles(1)] [numSigners(1)] [handles(N*32)] [signatures(M*65)]
Extended: [numHandles(1)] [numSigners(1)] [handles(N*32)] [signatures(M*65)] [cleartexts(N*32)]
                                                                                ^^^^^^^^^^^^^^^^
                                                                                read by verifyInput override
```

### Signing in encrypt()

The EIP-712 signature must use the **correct** struct (not the RFC's incorrect one):
```typescript
const signature = await inputSignerWallet.signTypedData(
    INPUT_VERIFICATION_EIP712.domain(GATEWAY_CHAIN_ID, VERIFYING_CONTRACTS.inputVerification),
    INPUT_VERIFICATION_EIP712.types,
    {
        ctHandles: handles,                   // array of bytes32
        userAddress: this.#userAddress,
        contractAddress: this.#contractAddress,
        contractChainId: this.#config.chainId,  // dapp's chain (hardhat = 31337), NOT gateway
        extraData: cleartextBytes,              // the appended cleartext section (N*32 bytes)
    }
);
```

**Key insight**: `contractChainId` is `block.chainid` (the hardhat chain, e.g. 31337), NOT the gateway chain ID (10901). The `GATEWAY_CHAIN_ID` is only used in the EIP-712 **domain**, not the struct.

**Key insight**: `extraData` in the struct = the cleartext bytes section (the N*32 bytes appended after signatures). This must be included when signing so the InputVerifier can verify it.

---

## §2.5 — index.ts (CleartextMockFhevm)

### EIP-1967 Slot (✓ VERIFIED from RFC)
```typescript
const IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
```

### ACL Contract ABI (needed for permission checks)
```typescript
// Minimal ABI for ACL calls
const ACL_ABI = [
    "function persistAllowed(bytes32 handle, address account) view returns (bool)",
    "function isAllowedForDecryption(bytes32 handle) view returns (bool)",
];
```

### Executor Contract ABI
```typescript
const EXECUTOR_ABI = [
    "function plaintexts(bytes32 handle) view returns (uint256)",
];
```

### KMS Signing in publicDecrypt()

Must include `extraData` field (empty bytes for mock):
```typescript
const signature = await kmsSignerWallet.signTypedData(
    KMS_DECRYPTION_EIP712.domain(GATEWAY_CHAIN_ID, VERIFYING_CONTRACTS.decryption),
    KMS_DECRYPTION_EIP712.types,
    {
        ctHandles: handleBytes32List,
        decryptedResult: abiEncodedClearValues,
        extraData: "0x",   // empty extraData for mock
    }
);
```

### publicDecrypt Proof Format (✓ VERIFIED from KMSVerifier.sol)
```
[numSigners(1)] [signature(65)] [extraData(0+)]
```
KMSVerifier parses: `uint256 numSigners = uint256(uint8(decryptionProof[0]));`
Then `65 * numSigners` bytes of signatures, then optional extraData.
```typescript
const decryptionProof = ethers.concat([
    new Uint8Array([1]),           // numSigners = 1
    ethers.getBytes(signature),    // 65 bytes
    // no extraData needed
]);
```

---

## bytecode.ts

### Forge Artifact (✓ VERIFIED — file exists)
```
/packages/playwright/contracts/out/CleartextFHEVMExecutor.sol/CleartextFHEVMExecutor.json
```
- `deployedBytecode.object` field contains the hex bytecode
- Artifact is ~35,633 bytes of deployed bytecode
- Extract: `artifact.deployedBytecode.object` (includes `0x` prefix)

```typescript
import artifact from "../../contracts/out/CleartextFHEVMExecutor.sol/CleartextFHEVMExecutor.json";

export const CLEARTEXT_EXECUTOR_BYTECODE: string = artifact.deployedBytecode.object;
```

---

## types.ts

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

---

## Existing fhevm.ts Integration

### What currently exists (to be replaced)
The current `fhevm.ts` imports from `@fhevm/mock-utils`:
```typescript
import { MockFhevmInstance } from "@fhevm/mock-utils";
const fhevm = await MockFhevmInstance.create(provider, provider, config, properties);
```

### What changes after this unit
```typescript
import { CleartextMockFhevm } from "./cleartext-mock";
const fhevm = await CleartextMockFhevm.create(provider, config);
```

### The 5 Existing Route Handlers (to preserve)
1. `GET /generateKeypair` → `fhevm.generateKeypair()`
2. `POST /createEIP712` → `fhevm.createEIP712(...)`
3. `POST /encrypt` → `fhevm.createEncryptedInput(...).encrypt()`
4. `POST /userDecrypt` → `fhevm.userDecrypt(...)` — **remove retry loops**
5. `POST /publicDecrypt` → `fhevm.publicDecrypt(...)` — **remove retry loops**

### What Gets Removed from test.ts
Line 132: `await viemClient.mine({ blocks: 100 });` — post-revert block mining no longer needed

---

## Unit Tests Required

### Test 1: computeInputHandle with known vectors
- Create a mockCiphertext, index=0, chainId=31337n, fheType=Uint8
- Assert handle metadata bits are correctly set:
  - `handle & 0xFF` === HANDLE_VERSION (0)
  - `(handle >> 8n) & 0xFFn` === FheType.Uint8 (2)
  - `(handle >> 16n) & 0xFFFFFFFFFFFFFFFFn` === 31337n
  - `(handle >> 80n) & 0xFFn` === 0 (index)

### Test 2: EIP-712 domain/type structure
- Verify INPUT_VERIFICATION_EIP712 types match the contract's typehash:
  ```
  keccak256("CiphertextVerification(bytes32[] ctHandles,address userAddress,address contractAddress,uint256 contractChainId,bytes extraData)")
  ```
- Verify KMS_DECRYPTION_EIP712 types match:
  ```
  keccak256("PublicDecryptVerification(bytes32[] ctHandles,bytes decryptedResult,bytes extraData)")
  ```

### Test 3: CleartextEncryptedInput.encrypt() proof byte layout
- Create input with 2 values: `add8(42n)` and `add8(99n)`
- Call `encrypt()`
- Assert `inputProof[0]` === 2 (numHandles)
- Assert `inputProof[1]` === 1 (numSigners)
- Assert proof length = `2 + 2*32 + 1*65 + 2*32 = 163 bytes`
- Assert cleartext at offset `2+64+65=131`: `BigInt(0x2a)` (42)
- Assert cleartext at offset `131+32=163`: (would be 163 but length check... actually `2 + 2*32 + 65 + 2*32 = 163 + 32 = 195`? Let me recount):
  - `2 + numHandles*32 + numSigners*65 + numHandles*32`
  - `2 + 2*32 + 1*65 + 2*32 = 2 + 64 + 65 + 64 = 195 bytes`

### Test 4: userDecrypt rejects when ACL returns false
- Mock ACL `persistAllowed` to return `false`
- Assert `userDecrypt` throws `Handle ... is not authorized for user decrypt`

---

## ⚠️ Known Issues & Open Questions

1. **EIP-712 struct fields**: RFC's `CiphertextVerification` struct is WRONG.
   - Use contract definition: `{ctHandles, userAddress, contractAddress, contractChainId, extraData}`
   - Field `contractChainId` = `block.chainid` of dapp chain (31337 on hardhat), NOT gateway chain

2. **KMS extraData**: RFC's `PublicDecryptVerification` is missing `extraData`.
   - Pass `"0x"` (empty bytes) for mock implementation

3. **Index encoding in handle hash**: RFC says `"uint256"` but Solidity uses `uint8`.
   - Must use `["uint8"]` in `solidityPackedKeccak256` for index

4. **KMS verifier address ambiguity**:
   - `fhevm.ts` uses `0xbE0E383937d564D7FF0BC3b46c51f0bF8d5C311A` as `kmsContractAddress`
   - `FHEVMHostAddresses.sol` says `0x901F8942346f7AB3a01F6D7613119Bca447Bb030`
   - These may be proxy vs implementation. The RFC's `constants.ts` uses `0x901F...` (from forge-fhevm)
   - Verify at runtime which is the correct address to call `verifyDecryptionEIP712KMSSignatures` on

5. **`computeMockCiphertext` byte lengths**: The `fheByteLenMap` must compute `ceil(bitWidth / 8)`.
   - Bool=1, Uint4=1, Uint8=1, Uint16=2, Uint32=4, Uint64=8, Uint128=16, Uint160=20, Uint256=32

6. **Signer key verification**: Must verify that `MOCK_INPUT_SIGNER_PK` corresponds to a registered
   coprocessor signer in the deployed `InputVerifier`. Check via `inputVerifier.isSigner(address)`.

7. **ciphertextBlob vs mockCiphertext naming**: In TypeScript:
   - Each per-value ciphertext = `computeMockCiphertext(...)` → `bytes32` hash
   - Bundle hash = `keccak256(concat(perValueCiphertexts))` → this is what's passed to `computeInputHandle`
   - The Solidity `InputProofHelper.computeInputHandle` takes raw ciphertext bytes (not a hash of hashes)
   - The TypeScript design adds an extra hashing layer — this is intentional by design but means the
     TypeScript handle computation differs from the Solidity library function

8. **EIP-1967 impl extraction**: `ethers.getAddress("0x" + implStorage.slice(26))` — the 32-byte slot
   value has the address in the lower 20 bytes (rightmost).

---

## Addresses Summary Table

| Constant | Value | Source |
|----------|-------|--------|
| ACL | `0x50157CFfD6bBFA2DECe204a89ec419c23ef5755D` | FHEVMHostAddresses.sol ✓ |
| FHEVMExecutor (proxy) | `0xe3a9105a3a932253A70F126eb1E3b589C643dD24` | FHEVMHostAddresses.sol ✓ |
| InputVerifier | `0x36772142b74871f255CbD7A3e89B401d3e45825f` | FHEVMHostAddresses.sol ✓ |
| KMSVerifier | `0x901F8942346f7AB3a01F6D7613119Bca447Bb030` | FHEVMHostAddresses.sol ✓ |
| VerifyingContract (InputVerification) | `0x812b06e1CDCE800494b79fFE4f925A504a9A9810` | fhevm.ts ✓ |
| VerifyingContract (Decryption) | `0x5ffdaAB0373E62E2ea2944776209aEf29E631A64` | fhevm.ts ✓ |
| GATEWAY_CHAIN_ID | `10901` | fhevm.ts ✓ |
| MOCK_INPUT_SIGNER_PK | `0x7ec8ada6642fc4ccfb7729bc29c17cf8d21b61abd5642d1db992c0b8672ab901` | forge-fhevm FhevmTest.sol ✓ |
| MOCK_KMS_SIGNER_PK | `0x388b7680e4e1afa06efbfd45cdd1fe39f3c6af381df6555a19661f283b97de91` | forge-fhevm FhevmTest.sol ✓ |

---

## Storage Layout Verification

The `CleartextFHEVMExecutor.storage-layout.txt` confirms:
```
| plaintexts | mapping(bytes32 => uint256) | slot 0 | offset 0 | 32 bytes |
```
No collision with FHEVMExecutor's ERC-7201 namespaced storage at
`0x4613e1771f6b755d243e536fb5a23c5b15e2826575fee921e8fe7a22a760c800`.

---

## CleartextFHEVMExecutor.sol — verifyInput signature (✓ VERIFIED)

The actual override signature (from CleartextFHEVMExecutor.sol, matches FHEVMExecutor):
```solidity
function verifyInput(bytes32 inputHandle, address userAddress, bytes memory inputProof, FheType inputType)
    public override returns (bytes32 result)
```

**NOT** the RFC's `ContextUserInputs` version — that's `InputVerifier.verifyInput`, not `FHEVMExecutor.verifyInput`.
