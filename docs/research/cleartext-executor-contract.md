# Research: CleartextFHEVMExecutor Solidity Contract

## Unit ID
`cleartext-executor-contract`

## Summary
This unit creates a standalone Foundry project at `packages/playwright/contracts/` that copies the required contracts from `forge-fhevm`, adds a cleartext mock executor contract, and produces a deployable bytecode artifact for hot-swapping in tests.

---

## RFC Reference
- **File**: `/Users/msaug/zama/token-sdk/CLEARTEXT_MOCK_PLAN.md`
- **Section**: §1 — CleartextFHEVMExecutor.sol

---

## Key Reference Paths

### forge-fhevm (source repo to copy from)
- `/Users/msaug/zama/forge-fhevm/` — root of forge-fhevm
- `/Users/msaug/zama/forge-fhevm/foundry.toml` — Foundry project config, solc=0.8.27, evm_version=cancun
- `/Users/msaug/zama/forge-fhevm/remappings.txt` — remapping declarations
- `/Users/msaug/zama/forge-fhevm/src/fhevm-host/contracts/FHEVMExecutor.sol` — **PRIMARY CONTRACT TO INHERIT**
- `/Users/msaug/zama/forge-fhevm/src/fhevm-host/contracts/InputVerifier.sol` — verifyInput inner implementation
- `/Users/msaug/zama/forge-fhevm/src/fhevm-host/contracts/ACL.sol` — ACL contract
- `/Users/msaug/zama/forge-fhevm/src/fhevm-host/contracts/HCULimit.sol` — HCU limit checker
- `/Users/msaug/zama/forge-fhevm/src/fhevm-host/contracts/KMSVerifier.sol` — KMS verifier
- `/Users/msaug/zama/forge-fhevm/src/fhevm-host/contracts/FHEEvents.sol` — FHE event definitions
- `/Users/msaug/zama/forge-fhevm/src/fhevm-host/contracts/shared/FheType.sol` — FheType enum (Bool..Int2048)
- `/Users/msaug/zama/forge-fhevm/src/fhevm-host/contracts/shared/Constants.sol` — HANDLE_VERSION = 0
- `/Users/msaug/zama/forge-fhevm/src/fhevm-host/contracts/shared/UUPSUpgradeableEmptyProxy.sol` — UUPS base
- `/Users/msaug/zama/forge-fhevm/src/fhevm-host/contracts/shared/ACLOwnable.sol` — ACL owner modifier
- `/Users/msaug/zama/forge-fhevm/src/fhevm-host/contracts/shared/EIP712UpgradeableCrossChain.sol` — EIP712 base for InputVerifier
- `/Users/msaug/zama/forge-fhevm/src/fhevm-host/addresses/FHEVMHostAddresses.sol` — hardcoded addresses
- `/Users/msaug/zama/forge-fhevm/src/PlaintextDBMixin.sol` — **CLEARTEXT COMPUTATION LOGIC TO PORT**
- `/Users/msaug/zama/forge-fhevm/src/InputProofHelper.sol` — Input proof assembly helpers
- `/Users/msaug/zama/forge-fhevm/src/FhevmTest.sol` — Full deployment reference (how to deploy contracts in tests)

### Playwright Package (target)
- `/Users/msaug/zama/token-sdk/packages/playwright/fixtures/fhevm.ts` — current fixture using MockFhevmInstance
- `/Users/msaug/zama/token-sdk/packages/playwright/package.json`

---

## Architecture

### Goal
Extend `FHEVMExecutor` to add a `mapping(bytes32 => uint256) public plaintexts` and override all 28 FHE operations to store cleartext results on-chain.

### Deployment Strategy
1. Create Foundry project at `packages/playwright/contracts/`
2. Copy (or add forge-fhevm as git submodule/soldeer dep) the necessary contracts
3. Override FHEVMExecutor with CleartextFHEVMExecutor
4. `forge build` → extract `deployedBytecode` from `out/CleartextFHEVMExecutor.sol/CleartextFHEVMExecutor.json`
5. At test setup: swap implementation via `hardhat_setCode` at the EIP-1967 implementation slot

---

## FHEVMExecutor Contract Analysis

### Inheritance Chain
```
CleartextFHEVMExecutor
  └─ FHEVMExecutor
       ├─ UUPSUpgradeableEmptyProxy (OpenZeppelin UUPSUpgradeable)
       ├─ FHEEvents (event declarations for all 28 ops)
       └─ ACLOwnable (onlyACLOwner modifier using acl.owner())
```

### Hardcoded Address Dependencies (from FHEVMHostAddresses.sol)
```solidity
address constant aclAdd         = 0x50157CFfD6bBFA2DECe204a89ec419c23ef5755D;
address constant fhevmExecutorAdd = 0xe3a9105a3a932253A70F126eb1E3b589C643dD24;
address constant kmsVerifierAdd = 0x901F8942346f7AB3a01F6D7613119Bca447Bb030;
address constant inputVerifierAdd = 0xFF3;  // ← placeholder in forge-fhevm; real: 0x36772142b74871f255CbD7A3e89B401d3e45825f
address constant hcuLimitAdd    = 0xFF4;    // ← placeholder in forge-fhevm; real address TBD
address constant pauserSetAdd   = 0xFF5;    // ← not needed for CleartextFHEVMExecutor
```
**CRITICAL**: `inputVerifierAdd` in forge-fhevm is `0xFF3` (a placeholder), not the real deployed address. The standalone Foundry project must use the real Hardhat deployment address `0x36772142b74871f255CbD7A3e89B401d3e45825f`.

### 28 FHE Operations

#### Binary operations (scalarByte arg)
- `fheAdd(lhs, rhs, scalarByte)` — arithmetic add, supported types: Uint8,16,32,64,128
- `fheSub(lhs, rhs, scalarByte)` — arithmetic sub with wrapping: `(a - b + (1 << bitWidth)) & mask`
- `fheMul(lhs, rhs, scalarByte)` — arithmetic mul
- `fheDiv(lhs, rhs, scalarByte)` — scalar only; `a / b`
- `fheRem(lhs, rhs, scalarByte)` — scalar only; `a % b`
- `fheBitAnd(lhs, rhs, scalarByte)` — bitwise AND, Bool+Uint8..256
- `fheBitOr(lhs, rhs, scalarByte)` — bitwise OR
- `fheBitXor(lhs, rhs, scalarByte)` — bitwise XOR
- `fheShl(lhs, rhs, scalarByte)` — left shift by `b % bitWidth`
- `fheShr(lhs, rhs, scalarByte)` — right shift by `b % bitWidth`
- `fheRotl(lhs, rhs, scalarByte)` — rotate left by `b % bitWidth`
- `fheRotr(lhs, rhs, scalarByte)` — rotate right by `b % bitWidth`
- `fheEq(lhs, rhs, scalarByte)` → result type Bool; stores 0 or 1
- `fheNe(lhs, rhs, scalarByte)` → result type Bool; stores 0 or 1
- `fheGe(lhs, rhs, scalarByte)` → result type Bool; `a >= b`
- `fheGt(lhs, rhs, scalarByte)` → result type Bool; `a > b`
- `fheLe(lhs, rhs, scalarByte)` → result type Bool; `a <= b`
- `fheLt(lhs, rhs, scalarByte)` → result type Bool; `a < b`
- `fheMin(lhs, rhs, scalarByte)` — min(a, b) with same type
- `fheMax(lhs, rhs, scalarByte)` — max(a, b) with same type

#### Unary operations
- `fheNeg(ct)` — negation: `~value + 1` with clamp (two's complement)
- `fheNot(ct)` — bitwise NOT: `~value & mask`

#### Special operations
- `fheIfThenElse(control, ifTrue, ifFalse)` — ternary: `control != 0 ? plaintexts[ifTrue] : plaintexts[ifFalse]`
- `fheRand(randType)` — random from seed; deterministic in test context
- `fheRandBounded(upperBound, randType)` — random mod bound
- `cast(ct, toType)` — clamp value to new type
- `trivialEncrypt(pt, toType)` — `plaintexts[result] = pt`
- `verifyInput(inputHandle, userAddress, inputProof, inputType)` — extracts cleartext from extended proof

### Scalar Operand Handling
For binary ops with `scalarByte == 0x01`, the `rhs` parameter is the actual scalar value (not a handle):
```solidity
uint256 b = (scalarByte == 0x01) ? uint256(rhs) : _clamp(plaintexts[rhs], operandType);
```

### Cleartext Helper Functions (ported from PlaintextDBMixin)

```solidity
function _bitWidthForType(FheType fheType) internal pure returns (uint256) {
    if (fheType == FheType.Bool) return 1;
    if (fheType == FheType.Uint4) return 4;
    if (fheType == FheType.Uint8) return 8;
    if (fheType == FheType.Uint16) return 16;
    if (fheType == FheType.Uint32) return 32;
    if (fheType == FheType.Uint64) return 64;
    if (fheType == FheType.Uint128) return 128;
    if (fheType == FheType.Uint160) return 160;
    if (fheType == FheType.Uint256) return 256;
    revert();
}

function _clamp(uint256 value, FheType fheType) internal pure returns (uint256) {
    uint256 bitWidth = _bitWidthForType(fheType);
    if (bitWidth == 256) return value;
    return value & ((1 << bitWidth) - 1);
}
```

---

## Extended Input Proof Format

### Standard Format (consumed by InputVerifier)
```
[numHandles(1)] [numSigners(1)] [handles(N*32)] [signatures(M*65)]
```

### Extended Format (consumed by CleartextFHEVMExecutor)
```
[numHandles(1)] [numSigners(1)] [handles(N*32)] [signatures(M*65)] [cleartexts(N*32)]
```

The `cleartexts(N*32)` bytes become `extraData` in the InputVerifier's `CiphertextVerification` struct. **They are included in the EIP-712 signature**, so the input signer must include them when signing.

`cleartextStart = 2 + numHandles * 32 + numSigners * 65`

### verifyInput Override Implementation

```solidity
// ⚠️ IMPORTANT: The actual FHEVMExecutor.verifyInput signature is:
// function verifyInput(bytes32 inputHandle, address userAddress, bytes memory inputProof, FheType inputType)
// NOT the ContextUserInputs version shown in the RFC (which is InputVerifier.verifyInput)

function verifyInput(
    bytes32 inputHandle,
    address userAddress,
    bytes memory inputProof,
    FheType inputType
) public override returns (bytes32 result) {
    result = super.verifyInput(inputHandle, userAddress, inputProof, inputType);

    uint8 numHandles = uint8(inputProof[0]);
    uint8 numSigners = uint8(inputProof[1]);
    uint256 cleartextStart = 2 + uint256(numHandles) * 32 + uint256(numSigners) * 65;

    // Only attempt extraction if cleartext bytes were appended
    if (inputProof.length > cleartextStart) {
        for (uint8 i = 0; i < numHandles; i++) {
            bytes32 h;
            uint256 hOffset = 2 + uint256(i) * 32;
            assembly { h := mload(add(add(inputProof, 32), hOffset)) }
            if (h == inputHandle) {
                uint256 cleartext;
                uint256 ctOffset = cleartextStart + uint256(i) * 32;
                assembly { cleartext := mload(add(add(inputProof, 32), ctOffset)) }
                plaintexts[result] = cleartext;
                break;
            }
        }
    }
}
```

---

## ⚠️ RFC Discrepancy: verifyInput Signature

The RFC (CLEARTEXT_MOCK_PLAN.md §1) shows:
```solidity
function verifyInput(ContextUserInputs memory context, bytes32 inputHandle, bytes memory inputProof) public override
```
But the actual `FHEVMExecutor.verifyInput` signature (verified in source) is:
```solidity
function verifyInput(bytes32 inputHandle, address userAddress, bytes memory inputProof, FheType inputType) public virtual
```
The RFC shows the `InputVerifier.verifyInput` signature, not the `FHEVMExecutor.verifyInput` signature. **The implementation must use the actual FHEVMExecutor signature.**

---

## Storage Slot Layout (CleartextFHEVMExecutor)

`FHEVMExecutor` uses ERC-7201 namespaced storage:
- `FHEVMExecutorStorageLocation = 0x4613e1771f6b755d243e536fb5a23c5b15e2826575fee921e8fe7a22a760c800`
- The `plaintexts` mapping in `CleartextFHEVMExecutor` will be appended **after** parent storage in the standard inheritance layout
- Verify with `forge inspect CleartextFHEVMExecutor storage-layout` to avoid collisions

---

## Deployment Hot-Swap Flow

```typescript
const IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const implAddress = await provider.getStorage(EXECUTOR_PROXY_ADDRESS, IMPL_SLOT);

await provider.send("hardhat_setCode", [
    ethers.getAddress("0x" + implAddress.slice(26)),
    CLEARTEXT_EXECUTOR_BYTECODE  // from forge build artifact
]);
```

---

## Mock Signer Keys (from forge-fhevm FhevmTest.sol)

```solidity
uint256 internal constant MOCK_INPUT_SIGNER_PK = 0x7ec8ada6642fc4ccfb7729bc29c17cf8d21b61abd5642d1db992c0b8672ab901;
uint256 internal constant MOCK_KMS_SIGNER_PK   = 0x388b7680e4e1afa06efbfd45cdd1fe39f3c6af381df6555a19661f283b97de91;
```

These must match what's registered in the deployed InputVerifier and KMSVerifier on Hardhat.

---

## FHEVM Host Addresses (Production Hardhat deployment)

From `packages/playwright/fixtures/fhevm.ts`:
- ACL: `0x50157CFfD6bBFA2DECe204a89ec419c23ef5755D`
- FHEVMExecutor proxy: `0xe3a9105a3a932253A70F126eb1E3b589C643dD24`
- InputVerifier: `0x36772142b74871f255CbD7A3e89B401d3e45825f`
- KMS verifier (mock-utils): `0xbE0E383937d564D7FF0BC3b46c51f0bF8d5C311A`
- KMS verifier (forge-fhevm): `0x901F8942346f7AB3a01F6D7613119Bca447Bb030`
- `verifyingContractAddressDecryption`: `0x5ffdaAB0373E62E2ea2944776209aEf29E631A64`
- `verifyingContractAddressInputVerification`: `0x812b06e1CDCE800494b79fFE4f925A504a9A9810`

---

## Foundry Project Setup

### foundry.toml for standalone project
```toml
[profile.default]
src = "src"
out = "out"
libs = ["lib"]
test = "test"
solc = "0.8.27"
evm_version = "cancun"

[dependencies]
"@openzeppelin-contracts" = "5.1.0"
"@openzeppelin-contracts-upgradeable" = "5.1.0"
```

Or use `forge-fhevm` as a soldeer dependency:
```toml
[dependencies]
forge-fhevm = { version = "...", git = "https://github.com/zama-ai/forge-fhevm.git" }
```

### Files to Copy from forge-fhevm/src/fhevm-host/
```
contracts/FHEVMExecutor.sol
contracts/FHEEvents.sol
contracts/HCULimit.sol
contracts/ACL.sol
contracts/ACLEvents.sol
contracts/InputVerifier.sol
contracts/KMSVerifier.sol
contracts/emptyProxy/EmptyUUPSProxy.sol
contracts/emptyProxyACL/EmptyUUPSProxyACL.sol
contracts/immutable/PauserSet.sol
contracts/interfaces/IPauserSet.sol
contracts/shared/ACLOwnable.sol
contracts/shared/Constants.sol
contracts/shared/EIP712UpgradeableCrossChain.sol
contracts/shared/FheType.sol
contracts/shared/UUPSUpgradeableEmptyProxy.sol
addresses/FHEVMHostAddresses.sol  ← must update inputVerifierAdd to real address
```

### New File to Create
```
src/CleartextFHEVMExecutor.sol
```

---

## Forge Unit Test Coverage Required

1. `trivialEncrypt` stores correct value: `plaintexts[result] == pt`
2. `fheAdd` computes correct sum: `plaintexts[result] == a + b (mod 2^bitWidth)`
3. `fheSub` wraps on underflow: `plaintexts[result] == (a - b + 2^bitWidth) mod 2^bitWidth`
4. `fheEq` stores 0 or 1: `plaintexts[result] in {0, 1}`
5. `verifyInput` extracts cleartext from extended proof: `plaintexts[result] == cleartextValue`
6. `cast` clamps value to new type: `plaintexts[result] == value & ((1 << newBitWidth) - 1)`
7. `fheRand` stores `block.prevrandao mod bound` (deterministic test)

Note: The RFC says "block.prevrandao mod bound" but PlaintextDBMixin uses `keccak256(seed + "randValue")`. Need to clarify which approach the on-chain version should use. Using `block.prevrandao` is simpler for on-chain; PlaintextDBMixin uses the event seed. For the on-chain version, using the seed from the rand event is more accurate.

---

## Open Questions

1. **kmsVerifier address mismatch**: `fhevm.ts` uses `0xbE0E383937d564D7FF0BC3b46c51f0bF8d5C311A` but forge-fhevm uses `0x901F8942346f7AB3a01F6D7613119Bca447Bb030`. Which is the deployed implementation address vs proxy address?

2. **hcuLimitAdd real address**: In forge-fhevm it's `0xFF4` (placeholder). FHEVMExecutor calls `hcuLimit.checkHCU*` on every op. What is the real HCULimit address in the Hardhat deployment?

3. **Storage slot collision**: Does adding `mapping(bytes32 => uint256) public plaintexts` as a state variable collide with FHEVMExecutorStorage (ERC-7201 at slot `0x4613...`)?  Inheritance appends after parent, so verify with `forge inspect`.

4. **fheRand cleartext source**: The task description says "stores block.prevrandao mod bound" but PlaintextDBMixin uses `keccak256(seed, "randValue")`. The on-chain version should be consistent — should we follow PlaintextDBMixin's seed-based approach or use `block.prevrandao`?

5. **verifyInput signature discrepancy in RFC**: RFC shows `ContextUserInputs memory context` but actual signature is `(bytes32 inputHandle, address userAddress, bytes memory inputProof, FheType inputType)`. Implementation must use actual signature.

6. **extraData EIP-712 inclusion**: The cleartexts appended to inputProof become `extraData` in InputVerifier's CiphertextVerification struct, which is included in the EIP-712 hash. The input signer on the TypeScript side **must include the cleartext bytes when signing**. The current `EMPTY_EXTRA_DATA = hex"00"` placeholder in forge-fhevm tests won't work — need `bytes(N*32 cleartexts)`.

7. **InputVerifier proof caching**: InputVerifier caches proofs by `keccak256(contractAddress, userAddress, inputProof)`. Since our extended proof has extra bytes, it won't collide with standard proofs.

8. **Forge project structure**: Should this be a subpackage with its own soldeer, or copy all source files directly? Direct copy is simpler and removes forge internals (forge-std deps).

---

## What "Remove Hard Dependencies on Forge Internals" Means

- `PlaintextDBMixin` imports `forge-std/Test.sol` and uses `Vm` — **do NOT include these in production contract**
- `FhevmTest.sol` imports `forge-std/Test.sol` and `Vm` — only needed for Forge unit tests
- `CleartextFHEVMExecutor.sol` must be pure Solidity, no forge-std imports
- The Foundry test files (`test/*.t.sol`) can use forge-std

---

## Implementation Plan Sketch

```solidity
// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {FHEVMExecutor} from "./fhevm-host/contracts/FHEVMExecutor.sol";
import {FheType} from "./fhevm-host/contracts/shared/FheType.sol";

contract CleartextFHEVMExecutor is FHEVMExecutor {
    /// @dev handle → plaintext value. Public so the mock client can read via eth_call.
    mapping(bytes32 => uint256) public plaintexts;

    // ── Helpers ────────────────────────────────────────────────
    function _bitWidthForType(FheType fheType) internal pure returns (uint256) { ... }
    function _clamp(uint256 value, FheType t) internal pure returns (uint256) { ... }

    // ── Arithmetic ─────────────────────────────────────────────
    function fheAdd(bytes32 lhs, bytes32 rhs, bytes1 scalarByte) public override returns (bytes32 result) {
        result = super.fheAdd(lhs, rhs, scalarByte);
        FheType t = _typeOf(lhs);
        uint256 a = _clamp(plaintexts[lhs], t);
        uint256 b = scalarByte == 0x01 ? uint256(rhs) : _clamp(plaintexts[rhs], t);
        unchecked { plaintexts[result] = _clamp(a + b, t); }
    }
    // ... 27 more overrides ...

    // ── trivialEncrypt ──────────────────────────────────────────
    function trivialEncrypt(uint256 pt, FheType toType) public override returns (bytes32 result) {
        result = super.trivialEncrypt(pt, toType);
        plaintexts[result] = pt;
    }

    // ── verifyInput ─────────────────────────────────────────────
    function verifyInput(bytes32 inputHandle, address userAddress, bytes memory inputProof, FheType inputType)
        public override returns (bytes32 result)
    {
        result = super.verifyInput(inputHandle, userAddress, inputProof, inputType);
        uint8 numHandles = uint8(inputProof[0]);
        uint8 numSigners = uint8(inputProof[1]);
        uint256 cleartextStart = 2 + uint256(numHandles) * 32 + uint256(numSigners) * 65;
        if (inputProof.length > cleartextStart) {
            for (uint8 i = 0; i < numHandles; i++) {
                bytes32 h;
                uint256 hOffset = 2 + uint256(i) * 32;
                assembly { h := mload(add(add(inputProof, 32), hOffset)) }
                if (h == inputHandle) {
                    uint256 cleartext;
                    uint256 ctOffset = cleartextStart + uint256(i) * 32;
                    assembly { cleartext := mload(add(add(inputProof, 32), ctOffset)) }
                    plaintexts[result] = cleartext;
                    break;
                }
            }
        }
    }
}
```

---

## Notes on Rand Operations

The RFC description says `fheRand` stores `block.prevrandao mod bound`, but `PlaintextDBMixin` uses `keccak256(abi.encodePacked(seed, "randValue"))`.

The seed is derived in `_generateSeed()`:
```solidity
seed = bytes16(keccak256(abi.encodePacked($.counterRand, acl, block.chainid, blockhash(block.number - 1), block.timestamp)));
```

The CleartextFHEVMExecutor overriding `fheRand` should either:
1. Override `_generateRand` and `_generateRandBounded` to store cleartexts, OR
2. Override `fheRand`/`fheRandBounded` to call super then re-derive cleartext from the emitted seed

Option 2 is safer since we know the seed from the event. Using `keccak256(seed, "randValue")` matches PlaintextDBMixin behavior.

For simplicity, the override can just use `block.prevrandao` as stated in the task description (deterministic in test environments where `prevrandao` is controlled), or match PlaintextDBMixin's keccak seed-based approach.
