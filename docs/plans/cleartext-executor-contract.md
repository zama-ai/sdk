# Implementation Plan: CleartextFHEVMExecutor Solidity Contract

> **Unit ID:** `cleartext-executor-contract`

## Overview

Create a standalone Foundry project at `packages/playwright/contracts/` that copies the
fhevm-host contracts already present in `contracts/fhevm-host/`, adds a `CleartextFHEVMExecutor`
contract extending `FHEVMExecutor` with a public `mapping(bytes32 => uint256) plaintexts`, and
overrides all 28 FHE operations to store cleartext results on-chain after calling `super`.

The Foundry project will be self-contained: it reuses the already-copied contract sources from
`contracts/fhevm-host/` via relative imports (no soldeer, no forge-fhevm submodule). OpenZeppelin
dependencies are installed via soldeer. The project uses solc 0.8.27 and evm_version cancun to
match forge-fhevm.

## TDD Applies

**Yes — TDD applies.** This unit adds new observable behavior:

- A new public `plaintexts` mapping readable via `eth_call`
- 28 overridden functions that each compute and store cleartext results
- `verifyInput` override that parses an extended proof format to extract cleartexts
- `_clamp` and `_bitWidthForType` helper functions with specific computation semantics

These are all new code paths with distinct inputs, outputs, and edge cases (wrapping arithmetic,
bit masking, scalar vs. handle operands, extended proof parsing). Forge unit tests should be
written first for key operations, then the contract implemented to make them pass.

---

## Step-by-Step Implementation

### Step 0: Scaffold the Foundry project

**Files to create:**

- `packages/playwright/contracts/foundry.toml`
- `packages/playwright/contracts/remappings.txt`
- `packages/playwright/contracts/.gitignore`

**foundry.toml:**
```toml
[profile.default]
src = "src"
out = "out"
libs = ["dependencies"]
test = "test"
solc = "0.8.27"
evm_version = "cancun"

[dependencies]
"@openzeppelin-contracts" = "5.1.0"
"@openzeppelin-contracts-upgradeable" = "5.1.0"
forge-std = "1.14.0"
```

**remappings.txt:**
```
forge-std/=dependencies/forge-std-1.14.0/src/
@openzeppelin/contracts/=dependencies/@openzeppelin-contracts-5.1.0/
@openzeppelin/contracts-upgradeable/=dependencies/@openzeppelin-contracts-upgradeable-5.1.0/
@openzeppelin-contracts-upgradeable/=dependencies/@openzeppelin-contracts-upgradeable-5.1.0/
@openzeppelin-contracts/=dependencies/@openzeppelin-contracts-5.1.0/
```

**.gitignore:**
```
/out/
/cache/
/dependencies/
```

**Actions:**
1. `mkdir -p packages/playwright/contracts/{src,test}`
2. Write `foundry.toml`, `remappings.txt`, `.gitignore`
3. Run `cd packages/playwright/contracts && forge soldeer install`

### Step 1: Copy fhevm-host contract sources into the Foundry project

Copy the already-present contracts from `contracts/fhevm-host/` into the Foundry project's
`src/fhevm-host/` directory. These are already sanitized (no forge-std imports in production
contracts).

**Source:** `contracts/fhevm-host/`
**Destination:** `packages/playwright/contracts/src/fhevm-host/`

**Files to copy (preserving directory structure):**
```
src/fhevm-host/
├── addresses/
│   └── FHEVMHostAddresses.sol          ← WILL BE PATCHED (Step 2)
├── contracts/
│   ├── ACL.sol
│   ├── ACLEvents.sol
│   ├── FHEEvents.sol
│   ├── FHEVMExecutor.sol
│   ├── HCULimit.sol
│   ├── InputVerifier.sol
│   ├── KMSVerifier.sol
│   ├── emptyProxy/
│   │   └── EmptyUUPSProxy.sol
│   ├── emptyProxyACL/
│   │   └── EmptyUUPSProxyACL.sol
│   ├── immutable/
│   │   └── PauserSet.sol
│   ├── interfaces/
│   │   └── IPauserSet.sol
│   └── shared/
│       ├── ACLOwnable.sol
│       ├── Constants.sol
│       ├── EIP712UpgradeableCrossChain.sol
│       ├── FheType.sol
│       └── UUPSUpgradeableEmptyProxy.sol
```

**Actions:**
1. `cp -r contracts/fhevm-host packages/playwright/contracts/src/fhevm-host`
2. Fix all import paths: the copied contracts use relative imports (`./`, `../`, `../../`)
   so they should work as-is since the directory structure is preserved. The only remappings
   needed are for `@openzeppelin/` which are handled by `remappings.txt`.

### Step 2: Patch FHEVMHostAddresses.sol

The copied `FHEVMHostAddresses.sol` has placeholder addresses for `inputVerifierAdd` (`0xFF3`)
and `hcuLimitAdd` (`0xFF4`). For the Foundry project to compile and produce bytecode compatible
with the Hardhat deployment, we need to consider:

**Decision:** Keep placeholder addresses as-is. The `CleartextFHEVMExecutor` is deployed via
`hardhat_setCode` bytecode replacement. The addresses in the bytecode are hardcoded constants.
Since the contract calls `super.fheAdd(...)` which calls `hcuLimit.checkHCU*()`, and these calls
go to `0xFF4` (which won't have code in Hardhat), they will revert.

**Mitigation options:**
1. **Option A (Preferred):** Patch addresses to match real Hardhat deployment. We need to
   determine the real `hcuLimitAdd` address from the Hardhat deployment. For `inputVerifierAdd`,
   the real address is `0x36772142b74871f255CbD7A3e89B401d3e45825f`. For `hcuLimitAdd`, we need
   to check the Hardhat deployment — if unknown, we can deploy a no-op HCULimit or set code at
   `0xFF4`.
2. **Option B:** Use `hardhat_setCode` at `0xFF3` and `0xFF4` to deploy stub contracts that
   always return success. This avoids patching addresses.

**For now:** Patch `inputVerifierAdd` to `0x36772142b74871f255CbD7A3e89B401d3e45825f`. Leave
`hcuLimitAdd` as `0xFF4` and plan to deploy a no-op stub at that address during test setup
(this is a concern for the fixture unit, not this unit).

**File to modify:** `packages/playwright/contracts/src/fhevm-host/addresses/FHEVMHostAddresses.sol`

```solidity
address constant inputVerifierAdd = address(0x36772142b74871f255CbD7A3e89B401d3e45825f);
// hcuLimitAdd stays 0xFF4 — a no-op stub will be deployed at test setup
```

### Step 3: Write Forge unit tests (TDD — tests first)

**File to create:** `packages/playwright/contracts/test/CleartextFHEVMExecutor.t.sol`

The test contract must deploy the full fhevm infrastructure (ACL, InputVerifier, HCULimit, etc.)
or mock them. Since these contracts require UUPS proxy deployment and complex initialization,
the simplest approach for unit testing is:

**Test Harness Strategy:**
- Deploy ACL, HCULimit stub, InputVerifier stub at their expected addresses using
  `vm.etch(address, code)` or forge's `deployCodeTo`
- Deploy `CleartextFHEVMExecutor` at the executor address
- Use `vm.prank` to simulate calls from an authorized contract
- Use `vm.store` to set up ACL permissions as needed

**Test cases (in order of implementation):**

```solidity
contract CleartextFHEVMExecutorTest is Test {
    CleartextFHEVMExecutor executor;

    function setUp() public {
        // Deploy stubs at hardcoded addresses
        // Deploy and initialize CleartextFHEVMExecutor
        // Set up ACL permissions for test caller
    }

    // --- Test 1: trivialEncrypt stores correct value ---
    function test_trivialEncrypt_storesPlaintext() public {
        bytes32 result = executor.trivialEncrypt(42, FheType.Uint8);
        assertEq(executor.plaintexts(result), 42);
    }

    // --- Test 2: fheAdd computes correct sum ---
    function test_fheAdd_computesSum() public {
        bytes32 a = executor.trivialEncrypt(10, FheType.Uint8);
        bytes32 b = executor.trivialEncrypt(20, FheType.Uint8);
        bytes32 result = executor.fheAdd(a, b, 0x00);
        assertEq(executor.plaintexts(result), 30);
    }

    // --- Test 3: fheAdd with scalar ---
    function test_fheAdd_scalar() public {
        bytes32 a = executor.trivialEncrypt(10, FheType.Uint8);
        bytes32 result = executor.fheAdd(a, bytes32(uint256(20)), 0x01);
        assertEq(executor.plaintexts(result), 30);
    }

    // --- Test 4: fheSub wraps on underflow ---
    function test_fheSub_wrapsOnUnderflow() public {
        bytes32 a = executor.trivialEncrypt(5, FheType.Uint8);
        bytes32 b = executor.trivialEncrypt(10, FheType.Uint8);
        bytes32 result = executor.fheSub(a, b, 0x00);
        // 5 - 10 + 256 = 251 (mod 256)
        assertEq(executor.plaintexts(result), 251);
    }

    // --- Test 5: fheEq stores 0 or 1 ---
    function test_fheEq_storesBoolean() public {
        bytes32 a = executor.trivialEncrypt(42, FheType.Uint8);
        bytes32 b = executor.trivialEncrypt(42, FheType.Uint8);
        bytes32 result = executor.fheEq(a, b, 0x00);
        assertEq(executor.plaintexts(result), 1);

        bytes32 c = executor.trivialEncrypt(99, FheType.Uint8);
        bytes32 result2 = executor.fheEq(a, c, 0x00);
        assertEq(executor.plaintexts(result2), 0);
    }

    // --- Test 6: cast clamps value to new type ---
    function test_cast_clampsToNewType() public {
        bytes32 a = executor.trivialEncrypt(300, FheType.Uint16);
        bytes32 result = executor.cast(a, FheType.Uint8);
        // 300 & 0xFF = 44
        assertEq(executor.plaintexts(result), 44);
    }

    // --- Test 7: fheRand stores deterministic value ---
    function test_fheRand_storesDeterministicValue() public {
        bytes32 result = executor.fheRand(FheType.Uint8);
        // Value should be non-zero and clamped to uint8 range
        uint256 plaintext = executor.plaintexts(result);
        assertLe(plaintext, 255);
    }

    // --- Test 8: verifyInput extracts cleartext from extended proof ---
    function test_verifyInput_extractsCleartext() public {
        // Build extended proof with appended cleartexts
        // Call verifyInput
        // Assert plaintexts[result] == expected cleartext
    }

    // --- Test 9: _clamp masks correctly ---
    // (Tested indirectly through trivialEncrypt + cast)

    // --- Test 10: fheNot with mask ---
    function test_fheNot_masksCorrectly() public {
        bytes32 a = executor.trivialEncrypt(0x0F, FheType.Uint8);
        bytes32 result = executor.fheNot(a);
        assertEq(executor.plaintexts(result), 0xF0);
    }
}
```

**Note on test harness complexity:** The main challenge is that `FHEVMExecutor` functions call
`acl.isAllowed()`, `acl.allowTransient()`, and `hcuLimit.checkHCU*()` internally. The test
harness must either:
- Deploy real ACL + HCULimit contracts (complex initialization), OR
- Deploy minimal mock contracts at the expected addresses that always return success

**Recommended approach:** Create minimal mock contracts:
- `MockACL`: `isAllowed() returns true`, `allowTransient()` is a no-op, `owner()` returns test address
- `MockHCULimit`: all `checkHCU*()` functions are no-ops
- `MockInputVerifier`: `verifyInput()` returns the inputHandle as-is

**Files to create for test infrastructure:**
- `packages/playwright/contracts/test/mocks/MockACL.sol`
- `packages/playwright/contracts/test/mocks/MockHCULimit.sol`
- `packages/playwright/contracts/test/mocks/MockInputVerifier.sol`

### Step 4: Implement CleartextFHEVMExecutor.sol

**File to create:** `packages/playwright/contracts/src/CleartextFHEVMExecutor.sol`

```solidity
// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {FHEVMExecutor} from "./fhevm-host/contracts/FHEVMExecutor.sol";
import {FheType} from "./fhevm-host/contracts/shared/FheType.sol";

contract CleartextFHEVMExecutor is FHEVMExecutor {
    /// @dev handle → plaintext value. Public so the mock client can read via eth_call.
    mapping(bytes32 => uint256) public plaintexts;

    // ── Helpers ────────────────────────────────────────────────
    function _bitWidthForType(FheType fheType) internal pure returns (uint256);
    function _clamp(uint256 value, FheType t) internal pure returns (uint256);

    // ── 20 Binary op overrides ─────────────────────────────────
    // Pattern for arithmetic (fheAdd, fheSub, fheMul, fheDiv, fheRem):
    function fheAdd(bytes32 lhs, bytes32 rhs, bytes1 scalarByte) public override returns (bytes32 result) {
        result = super.fheAdd(lhs, rhs, scalarByte);
        FheType t = _typeOf(lhs);
        uint256 a = _clamp(plaintexts[lhs], t);
        uint256 b = (scalarByte == 0x01) ? uint256(rhs) : _clamp(plaintexts[rhs], t);
        unchecked { plaintexts[result] = _clamp(a + b, t); }
    }
    // ... fheSub (wrapping), fheMul, fheDiv, fheRem
    // ... fheBitAnd, fheBitOr, fheBitXor
    // ... fheShl, fheShr, fheRotl, fheRotr
    // ... fheEq, fheNe, fheGe, fheGt, fheLe, fheLt (result type Bool → store 0/1)
    // ... fheMin, fheMax

    // ── 2 Unary op overrides ───────────────────────────────────
    function fheNeg(bytes32 ct) public override returns (bytes32 result);
    function fheNot(bytes32 ct) public override returns (bytes32 result);

    // ── Special ops ────────────────────────────────────────────
    function fheIfThenElse(bytes32 control, bytes32 ifTrue, bytes32 ifFalse) public override returns (bytes32 result);
    function fheRand(FheType randType) public override returns (bytes32 result);
    function fheRandBounded(uint256 upperBound, FheType randType) public override returns (bytes32 result);
    function cast(bytes32 ct, FheType toType) public override returns (bytes32 result);
    function trivialEncrypt(uint256 pt, FheType toType) public override returns (bytes32 result);
    function verifyInput(bytes32 inputHandle, address userAddress, bytes memory inputProof, FheType inputType)
        public override returns (bytes32 result);
}
```

**Critical implementation details by operation category:**

#### Binary arithmetic (fheAdd, fheMul):
```solidity
uint256 a = _clamp(plaintexts[lhs], t);
uint256 b = (scalarByte == 0x01) ? uint256(rhs) : _clamp(plaintexts[rhs], t);
unchecked { plaintexts[result] = _clamp(a + b, t); } // or a * b
```

#### fheSub (wrapping subtraction):
```solidity
uint256 bitWidth = _bitWidthForType(t);
unchecked { plaintexts[result] = _clamp(a - b + (1 << bitWidth), t); }
```
Note: for `bitWidth == 256`, `(1 << 256)` overflows — must handle with `unchecked` and the
natural uint256 wrapping. Actually `_clamp` for 256-bit is identity, so the unchecked wrap of
`a - b` in uint256 is already correct. PlaintextDBMixin uses the `+ (1 << bitWidth)` pattern
which works for < 256 bits. For 256 bits, the subtraction naturally wraps in unchecked.

**Special handling needed:**
```solidity
if (bitWidth == 256) {
    unchecked { plaintexts[result] = a - b; }
} else {
    unchecked { plaintexts[result] = _clamp(a - b + (1 << bitWidth), t); }
}
```

#### fheDiv / fheRem (scalar-only):
These are always scalar (`scalarByte == 0x01` enforced by parent). `b = uint256(rhs)` directly.
```solidity
plaintexts[result] = a / b;  // fheDiv
plaintexts[result] = a % b;  // fheRem
```

#### Shift/Rotate:
```solidity
// fheShl
uint256 shift = b % bitWidth;
plaintexts[result] = _clamp(a << shift, t);

// fheRotl
uint256 shift = b % bitWidth;
if (shift == 0) { plaintexts[result] = a; }
else { plaintexts[result] = _clamp((a << shift) | (a >> (bitWidth - shift)), t); }
```

#### Comparison (fheEq, fheNe, fheGe, fheGt, fheLe, fheLt):
Result type is always `Bool`. Parent's `_binaryOp` already sets result type to `FheType.Bool`.
```solidity
plaintexts[result] = (a == b) ? 1 : 0;  // fheEq
```

#### fheNeg:
```solidity
FheType t = _typeOf(ct);
uint256 value = _clamp(plaintexts[ct], t);
unchecked { plaintexts[result] = _clamp(~value + 1, t); }
```

#### fheNot:
```solidity
FheType t = _typeOf(ct);
uint256 value = _clamp(plaintexts[ct], t);
uint256 bitWidth = _bitWidthForType(t);
uint256 mask = (bitWidth == 256) ? type(uint256).max : (1 << bitWidth) - 1;
plaintexts[result] = ~value & mask;
```

#### fheIfThenElse:
```solidity
plaintexts[result] = (plaintexts[control] == 1) ? plaintexts[ifTrue] : plaintexts[ifFalse];
```

#### fheRand / fheRandBounded:
The parent `fheRand` calls `_generateSeed()` then `_generateRand()`, emits `FheRand(seed, result)`.
We override `fheRand` to call super (which generates the seed), then compute a cleartext from
the seed matching PlaintextDBMixin's approach:

```solidity
function fheRand(FheType randType) public override returns (bytes32 result) {
    result = super.fheRand(randType);
    // Re-derive seed from the FHEVMExecutorStorage counterRand
    // Problem: seed was generated inside super, we can't access it after the call.
    // Solution: override _generateRand and _generateRandBounded instead.
}
```

**Better approach:** Override `_generateRand` and `_generateRandBounded` (both are `internal virtual`):

```solidity
function _generateRand(FheType randType, bytes16 seed) internal override returns (bytes32 result) {
    result = super._generateRand(randType, seed);
    uint256 randomValue = uint256(keccak256(abi.encodePacked(seed, "randValue")));
    plaintexts[result] = _clamp(randomValue, randType);
}

function _generateRandBounded(uint256 upperBound, FheType randType, bytes16 seed) internal override returns (bytes32 result) {
    result = super._generateRandBounded(upperBound, randType, seed);
    uint256 randomValue = uint256(keccak256(abi.encodePacked(seed, "randBoundedValue")));
    plaintexts[result] = randomValue % upperBound;
}
```

This approach matches PlaintextDBMixin behavior exactly and avoids needing to re-derive the seed.

#### trivialEncrypt:
```solidity
function trivialEncrypt(uint256 pt, FheType toType) public override returns (bytes32 result) {
    result = super.trivialEncrypt(pt, toType);
    plaintexts[result] = pt;
}
```

#### verifyInput:
```solidity
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
```

#### cast:
```solidity
function cast(bytes32 ct, FheType toType) public override returns (bytes32 result) {
    result = super.cast(ct, toType);
    plaintexts[result] = _clamp(plaintexts[ct], toType);
}
```

### Step 5: Run `forge build` and fix compilation errors

**Actions:**
1. `cd packages/playwright/contracts && forge build`
2. Fix any import path issues (likely `@openzeppelin/` remapping)
3. Fix any pragma version mismatches (parent uses `^0.8.24`, we use `^0.8.27` — compatible)
4. Iterate until `forge build` succeeds

### Step 6: Run tests and iterate

**Actions:**
1. `cd packages/playwright/contracts && forge test -vvv`
2. Fix any failing tests (TDD green phase)
3. Iterate until all tests pass

### Step 7: Verify storage layout

**Actions:**
1. `cd packages/playwright/contracts && forge inspect CleartextFHEVMExecutor storage-layout`
2. Verify `plaintexts` mapping slot does not collide with `FHEVMExecutorStorage` (ERC-7201 at `0x4613...`)
3. Since the parent uses namespaced storage (ERC-7201) and `plaintexts` is a regular state variable,
   they occupy different slot spaces. The mapping will be at slot 0 (first state var in child).
   This is safe because the parent's storage is at a computed namespace slot.

### Step 8: Verify artifact output

**Actions:**
1. Check `packages/playwright/contracts/out/CleartextFHEVMExecutor.sol/CleartextFHEVMExecutor.json`
2. Verify it contains a `deployedBytecode` field
3. This artifact will be consumed by the TypeScript fixture in a later unit

---

## Files Summary

### Files to create

| File | Purpose |
|------|---------|
| `packages/playwright/contracts/foundry.toml` | Foundry project config (solc 0.8.27, cancun) |
| `packages/playwright/contracts/remappings.txt` | Import remappings for OpenZeppelin |
| `packages/playwright/contracts/.gitignore` | Ignore out/, cache/, dependencies/ |
| `packages/playwright/contracts/src/fhevm-host/**` | Copied fhevm-host contracts (entire tree) |
| `packages/playwright/contracts/src/CleartextFHEVMExecutor.sol` | Main contract |
| `packages/playwright/contracts/test/CleartextFHEVMExecutor.t.sol` | Forge unit tests |
| `packages/playwright/contracts/test/mocks/MockACL.sol` | Test mock for ACL |
| `packages/playwright/contracts/test/mocks/MockHCULimit.sol` | Test mock for HCULimit |
| `packages/playwright/contracts/test/mocks/MockInputVerifier.sol` | Test mock for InputVerifier |

### Files to modify

| File | Change |
|------|--------|
| `packages/playwright/contracts/src/fhevm-host/addresses/FHEVMHostAddresses.sol` | Patch inputVerifierAdd to real address |

---

## Risks and Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| **HCULimit calls revert** — parent calls `hcuLimit.checkHCU*()` at `0xFF4` which has no code | High | Deploy no-op HCULimit stub at `0xFF4` in test setup; or mock it in Forge tests with `vm.etch` |
| **InputVerifier at placeholder address** — `super.verifyInput()` calls `inputVerifier.verifyInput()` at whatever address is compiled in | High | Patch address or deploy mock InputVerifier; Forge tests use mock anyway |
| **Storage collision** — `plaintexts` mapping at slot 0 vs parent ERC-7201 namespaced storage | Low | ERC-7201 uses computed slots far from 0; verify with `forge inspect` |
| **fheSub 256-bit wrapping** — `(1 << 256)` overflows in Solidity | Medium | Special-case 256-bit: rely on natural uint256 unchecked wrapping |
| **OpenZeppelin version mismatch** — parent contracts use `^0.8.24`, child uses `^0.8.27` | Low | Both compile under solc 0.8.27; pragma `^0.8.24` allows 0.8.27 |
| **Large contract size** — FHEVMExecutor is ~39KB, child adds more code | Medium | Monitor with `forge build --sizes`; if over 24KB limit, optimize |
| **Seed access for fheRand** — can't access seed after `super.fheRand()` returns | Medium | Override `_generateRand`/`_generateRandBounded` instead (both are `internal virtual`) |

---

## Verification Against Acceptance Criteria

| # | Criterion | How to verify |
|---|-----------|---------------|
| 1 | Foundry project exists with proper config | `ls packages/playwright/contracts/foundry.toml` |
| 2 | CleartextFHEVMExecutor compiles | `forge build` exits 0 |
| 3 | `forge build` produces deployedBytecode | `jq '.deployedBytecode.object' out/CleartextFHEVMExecutor.sol/CleartextFHEVMExecutor.json` |
| 4 | All 28 overrides call super + store plaintext | Code review + test coverage |
| 5 | verifyInput parses extended proof correctly | `test_verifyInput_extractsCleartext` passes |
| 6 | `_clamp` masks to bit width correctly | `test_cast_clampsToNewType` + `test_fheNot_masksCorrectly` pass |
| 7 | No storage collision | `forge inspect CleartextFHEVMExecutor storage-layout` shows no overlap with `0x4613...` |
| 8 | All tests pass | `forge test` exits 0 |
