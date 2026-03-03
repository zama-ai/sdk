# Plan: CleartextMockFhevm Integration Tests Against Real Hardhat Node

**Goal**: Write vitest integration tests that exercise `CleartextMockFhevm` against a
real Hardhat node with real on-chain contracts (ACL, Executor, InputVerifier) to confirm
the full encrypt → on-chain FHE operations → decrypt pipeline works end-to-end. This
isolates whether E2E "Decrypting..." failures come from the cleartext mock or the UI.

---

## 1. How Contracts Get Deployed (Background)

### 1a. The Hardhat Plugin Deploys FHEVM Infrastructure

When `hardhat node --network hardhat` starts (via `@fhevm/hardhat-plugin`), the plugin
uses `hardhat_setCode` to inject bytecode at **hardcoded deterministic addresses**:

| Contract      | Address                             | Purpose                                   |
| ------------- | ----------------------------------- | ----------------------------------------- |
| FHEVMExecutor | `0xe3a9...dD24` (behind UUPS proxy) | Symbolic FHE execution, handle generation |
| ACL           | `0x5015...755D`                     | Access control for handles                |
| InputVerifier | `0x3677...825f`                     | Verifies encrypted input proofs           |
| KMSVerifier   | `0x901F...b030`                     | Verifies KMS decryption signatures        |
| HCULimit      | `0x0000...0FF4`                     | Handle compute unit limits                |
| PauserSet     | `0x0000...0FF5`                     | Pause management                          |

These addresses are compiled into the Solidity contracts as `constant` values in
`FHEVMHostAddresses.sol` — they're not configurable at runtime. The plugin then
initializes each contract (sets owners, registers KMS/coprocessor signers, sets
thresholds) via transactions from well-known Hardhat accounts.

**Source**: `hardhat/node_modules/@fhevm/hardhat-plugin/src/internal/deploy/setup.ts`
calls `__tryDeploy()` for each contract, which checks if bytecode is already present and
injects it via `mockProvider.setCodeAt()` (wraps `hardhat_setCode`).

### 1b. CleartextMockFhevm.create() Patches the Executor

After the plugin deploys the standard `FHEVMExecutor`, our `CleartextMockFhevm.create()`
replaces its implementation with `CleartextFHEVMExecutor`:

```
CleartextMockFhevm.create(provider, config)
  │
  ├─ eth_getStorageAt(executorProxy, EIP1967_IMPLEMENTATION_SLOT)
  │    → reads the implementation address behind the UUPS proxy
  │
  └─ hardhat_setCode(implementationAddress, CLEARTEXT_EXECUTOR_BYTECODE)
       → replaces the implementation with CleartextFHEVMExecutor
```

The `CleartextFHEVMExecutor` extends `FHEVMExecutor` and adds:

- A `mapping(bytes32 => uint256) public plaintexts` at **storage slot 0**
- Override of every FHE operation (add, sub, mul, etc.) to compute cleartext results
  and store them in `plaintexts[resultHandle]`
- Override of `verifyInput` to extract cleartext values from the inputProof bytes and
  store them in `plaintexts[resultHandle]`
- Override of `trivialEncrypt` to store `plaintexts[result] = pt`

### 1c. How the Full E2E Flow Works

```
Browser (UI)                    Playwright route handler           Hardhat node
─────────────                   ──────────────────────            ─────────────
1. encrypt(value)          ──►  fhevm.createEncryptedInput()      (client-side only,
                                  .add64(value)                    no chain call)
                                  .encrypt()
                                → returns {handles, inputProof}

2. sendTransaction(        ──►  (direct to chain)            ──►  Contract calls
   contract.deposit(                                               TFHE.asEuint64(handle, proof)
   handle, proof))                                                   → FHEVMExecutor.verifyInput()
                                                                     → InputVerifier checks proof
                                                                     → CleartextFHEVMExecutor stores
                                                                       plaintexts[resultHandle] = value
                                                                     → ACL.allowTransient(handle, contract)

3. userDecrypt(handles)    ──►  fhevm.userDecrypt(handles, ...)
                                  │
                                  ├─ try relayer RPC (fails on HH) → fallback:
                                  ├─ eth_call ACL.persistAllowed(handle, signer)
                                  │    → checks persistent ACL permission
                                  └─ eth_call executor.plaintexts(handle)
                                       → reads stored cleartext
```

The "Decrypting..." E2E failure happens at step 3. Either:

- The ACL check fails (handle not authorized → error)
- The `plaintexts(handle)` read returns 0 (plaintext never stored)
- The relayer fallback path has a bug
- The UI doesn't process the response correctly

---

## 2. What We Need for Integration Tests

### 2a. Auto-Spawning Hardhat Node

The Playwright config already auto-spawns a HH node:

```ts
// packages/playwright/playwright.config.ts
webServer: [
  {
    command: "npm --prefix ../../hardhat run node",
    port: 8545,
    reuseExistingServer: !CI,
  },
];
```

We'll do the same in vitest with a `globalSetup` script that:

1. Checks if port 8545 is already listening (reuse running node in dev)
2. If not, spawns `npm --prefix hardhat run node` as a child process
3. Waits for the node to be ready (poll `eth_chainId` RPC)
4. Returns a teardown function that kills the process

```ts
// packages/playwright/fixtures/cleartext-mock/__tests__/globalSetup.ts
import { spawn } from "child_process";

export async function setup() {
  if (await isPortListening(8545)) return; // reuse existing node

  const proc = spawn("npm", ["--prefix", "hardhat", "run", "node"], {
    cwd: path.resolve(__dirname, "../../../../.."), // repo root
    stdio: "pipe",
  });

  await waitForRpc("http://localhost:8545");

  return () => {
    proc.kill("SIGTERM");
  };
}
```

The integration test file uses a dedicated vitest config that points to this globalSetup.

### 2b. Snapshot/Revert for Test Isolation

Use `evm_snapshot` / `evm_revert` to keep the node pristine across test runs:

```ts
beforeAll: snapshotId = evm_snapshot();
afterAll: evm_revert(snapshotId);
```

### 2c. Real ACL — No Bypass

The ACL contract is fully deployed and initialized by the HH plugin. We use it as-is.

The ACL permission chain works like this:

1. `executor.trivialEncrypt(value, type)` → internally calls `acl.allowTransient(handle, msg.sender)`
   - This gives the **calling contract** transient (same-tx) permission on the resulting handle

2. With transient permission, the calling contract can then:
   - `acl.allow(handle, someAddress)` → sets **persistent** permission for any address
   - `acl.allowForDecryption([handle])` → marks handle for **public** decryption

3. Decrypt reads the permissions:
   - `userDecrypt` → `acl.persistAllowed(handle, signerAddress)` must be `true`
   - `publicDecrypt` → `acl.isAllowedForDecryption(handle)` must be `true`

This means our test helper contract must call `allow()` and `allowForDecryption()` in the
**same transaction** as `trivialEncrypt()`, while transient permission is still active.

### 2d. CleartextTestHelper.sol — On-Chain Test Contract

Deploy a minimal Solidity contract that exercises real FHE operations and sets ACL
permissions in one atomic transaction.

```solidity
// packages/playwright/contracts/src/CleartextTestHelper.sol
// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {FHEVMExecutor} from "./fhevm-host/contracts/FHEVMExecutor.sol";
import {ACL} from "./fhevm-host/contracts/ACL.sol";
import {FheType} from "./fhevm-host/contracts/shared/FheType.sol";
import {FHEVMHostAddresses} from "./fhevm-host/addresses/FHEVMHostAddresses.sol";

/// @notice Minimal test helper that calls real FHE operations and sets ACL permissions.
/// Used by vitest integration tests to exercise CleartextMockFhevm decrypt paths
/// against real on-chain state.
contract CleartextTestHelper {
    FHEVMExecutor public immutable executor;
    ACL public immutable acl;

    /// @dev Stores the last handles produced, for test readback.
    bytes32[] public lastHandles;

    constructor() {
        executor = FHEVMExecutor(FHEVMHostAddresses.executorAdd());
        acl = ACL(FHEVMHostAddresses.aclAdd());
    }

    /// @notice trivialEncrypt a value, then grant persistent permission to `allowedAddr`
    ///         and mark it for public decryption.
    /// @dev Must be done in one tx so transient permission from trivialEncrypt is active.
    function trivialEncryptAndAllow(
        uint256 value,
        FheType fheType,
        address allowedAddr
    ) external returns (bytes32 handle) {
        handle = executor.trivialEncrypt(value, fheType);
        // transient permission is now active for `address(this)`
        acl.allow(handle, allowedAddr);
        acl.allowForDecryption(new bytes32[](handle));  // pseudo — see below
        lastHandles.push(handle);
    }

    /// @notice Batch trivialEncrypt + allow for multiple values.
    function batchTrivialEncryptAndAllow(
        uint256[] calldata values,
        FheType[] calldata fheTypes,
        address allowedAddr
    ) external returns (bytes32[] memory handles) {
        require(values.length == fheTypes.length, "length mismatch");
        handles = new bytes32[](values.length);
        bytes32[] memory handlesList = new bytes32[](values.length);

        for (uint256 i = 0; i < values.length; i++) {
            handles[i] = executor.trivialEncrypt(values[i], fheTypes[i]);
            acl.allow(handles[i], allowedAddr);
            handlesList[i] = handles[i];
        }

        // Mark all handles for public decryption
        acl.allowForDecryption(handlesList);

        // Store for later readback
        for (uint256 i = 0; i < handles.length; i++) {
            lastHandles.push(handles[i]);
        }
    }

    /// @notice fheAdd two trivially encrypted values, allow result, return result handle.
    function testFheAdd(
        uint256 a,
        uint256 b,
        FheType fheType,
        address allowedAddr
    ) external returns (bytes32 result) {
        bytes32 lhs = executor.trivialEncrypt(a, fheType);
        bytes32 rhs = executor.trivialEncrypt(b, fheType);
        result = executor.fheAdd(lhs, rhs, 0x00);  // 0x00 = non-scalar

        // Need to allow result — but transient permission on result belongs to executor
        // actually, fheAdd internally calls acl.allowTransient(result, msg.sender)
        // where msg.sender to executor is `this` contract
        acl.allow(result, allowedAddr);
        acl.allowForDecryption(_singletonArray(result));

        lastHandles.push(result);
    }

    /// @notice Helper to get handles count.
    function getHandlesCount() external view returns (uint256) {
        return lastHandles.length;
    }

    function _singletonArray(bytes32 value) internal pure returns (bytes32[] memory arr) {
        arr = new bytes32[](1);
        arr[0] = value;
    }
}
```

> **Note on ACL permission flow**: `executor.trivialEncrypt()` calls
> `acl.allowTransient(result, msg.sender)` where `msg.sender` from the executor's
> perspective is the `CleartextTestHelper` contract. Similarly, `executor.fheAdd()` calls
> `acl.allowTransient(result, msg.sender)` = the helper. This means the helper has
> transient permission and can call `acl.allow(handle, addr)` and
> `acl.allowForDecryption([handle])` in the same tx.

### 2e. Deploying CleartextTestHelper from TypeScript

Compile via forge (already set up in `packages/playwright/contracts/`), then deploy
using ethers `ContractFactory` reading the forge artifact:

```ts
import { readFileSync } from "fs";

function loadForgeArtifact(name: string) {
  const artifact = JSON.parse(
    readFileSync(`packages/playwright/contracts/out/${name}.sol/${name}.json`, "utf-8"),
  );
  return { abi: artifact.abi, bytecode: artifact.bytecode.object };
}

async function deployTestHelper(signer: ethers.Signer) {
  const { abi, bytecode } = loadForgeArtifact("CleartextTestHelper");
  const factory = new ethers.ContractFactory(abi, bytecode, signer);
  const contract = await factory.deploy();
  await contract.waitForDeployment();
  return contract;
}
```

---

## 3. Test Plan

### Test File

`packages/playwright/fixtures/cleartext-mock/__tests__/integration.test.ts`

Uses a vitest config with `globalSetup` for node auto-spawn. Runs with:

```bash
pnpm vitest run --config packages/playwright/fixtures/cleartext-mock/__tests__/vitest.integration.config.ts
```

### Setup

```ts
let provider: ethers.JsonRpcProvider;
let signer: ethers.Signer;
let fhevm: CleartextMockFhevm;
let testHelper: ethers.Contract;
let snapshotId: string;

beforeAll(async () => {
  provider = new ethers.JsonRpcProvider("http://localhost:8545");
  signer = await provider.getSigner(0); // Hardhat account #0

  // 1. Patch executor with cleartext implementation
  fhevm = await CleartextMockFhevm.create(provider, CLEAR_TEXT_MOCK_CONFIG);

  // 2. Deploy test helper contract
  testHelper = await deployTestHelper(signer);

  // 3. Snapshot clean state
  snapshotId = await provider.send("evm_snapshot", []);
});

afterAll(async () => {
  await provider.send("evm_revert", [snapshotId]);
});
```

### Test 1: `create()` Patches the Executor

**What**: Verify `CleartextMockFhevm.create()` patches the executor on a real node.

**How**: After `create()`, call `executor.plaintexts(0x00...00)` via `eth_call` and
verify it returns `0n` (the function exists and doesn't revert — proving the cleartext
executor bytecode was injected).

**Diagnoses**: If this fails, the executor proxy is broken or the bytecode artifact is
stale.

### Test 2: `trivialEncrypt` Stores Plaintext On-Chain

**What**: Send a real tx calling `testHelper.trivialEncryptAndAllow(42, Uint64, signerAddr)`,
then verify the plaintext is stored in the executor by reading `plaintexts(handle)`.

**How**:

1. Call `testHelper.trivialEncryptAndAllow(42n, FheType.Uint64, signerAddress)` via tx
2. Read the returned handle from the tx receipt (or from `testHelper.lastHandles(0)`)
3. Call `executor.plaintexts(handle)` via `eth_call`
4. Assert it equals `42n`

**Diagnoses**: Confirms `CleartextFHEVMExecutor.trivialEncrypt()` correctly stores
cleartext and that `ACL.allowTransient → allow/allowForDecryption` works in one tx.

### Test 3: `publicDecrypt` With Real On-Chain State

**What**: Verify `fhevm.publicDecrypt()` reads real plaintexts from the executor after
a `trivialEncrypt` tx, using the **real ACL** check.

**How**:

1. Call `testHelper.trivialEncryptAndAllow(99n, FheType.Uint64, signerAddress)` via tx
2. Get the handle
3. Call `fhevm.publicDecrypt([handle])`
4. Assert:
   - `result.clearValues[handle]` === `99n`
   - `result.abiEncodedClearValues` decodes to `[99n]`
   - `result.decryptionProof` has correct format: `[numSigners=1][65-byte signature]`

**Diagnoses**: Tests the on-chain read path (`ACL.isAllowedForDecryption` → `executor.plaintexts`)
via real RPC calls. If this fails, the mock's decrypt logic or the ACL permission setup is broken.

### Test 4: `userDecrypt` With Real On-Chain State

**What**: Verify `fhevm.userDecrypt()` reads real plaintexts and checks real ACL
`persistAllowed` permission.

**How**:

1. Call `testHelper.trivialEncryptAndAllow(7n, FheType.Uint64, signerAddress)` via tx
2. Get the handle
3. Generate a keypair via `fhevm.generateKeypair()`
4. Create EIP-712 typed data via `fhevm.createEIP712(...)`
5. Sign with the Hardhat signer
6. Call `fhevm.userDecrypt(...)` with the handle, keypair, signature, signer address
7. Assert `result[handle]` === `7n`

**Diagnoses**: Tests the full `userDecrypt` path including real `ACL.persistAllowed` check.
If the ACL `allow()` call in `trivialEncryptAndAllow()` didn't work, this will fail.

### Test 5: `fheAdd` Round-Trip — Compute + Decrypt

**What**: Call `testHelper.testFheAdd(10, 32, Uint64, signerAddr)` which trivially encrypts
two values, adds them on-chain, and allows the result. Then decrypt via `publicDecrypt`.

**How**:

1. Call `testHelper.testFheAdd(10n, 32n, FheType.Uint64, signerAddress)` via tx
2. Get the result handle
3. Call `fhevm.publicDecrypt([resultHandle])`
4. Assert `result.clearValues[handle]` === `42n`

**Diagnoses**: Confirms on-chain FHE arithmetic (fheAdd) produces the correct cleartext
result and that the result handle is properly authorized and readable.

### Test 6: `encrypt()` Produces Valid Handles and Proof

**What**: Verify `fhevm.createEncryptedInput().add64(value).encrypt()` works against a
real provider.

**How**:

- Call `encrypt()` — the HH node doesn't support `fhevm_relayer_v1_input_proof`,
  so it falls back to the legacy path
- Verify handles are 32 bytes each
- Verify proof layout: `[numHandles:1][numSigners:1][handles:32*N][signature:65][cleartexts:32*N]`
- Verify cleartext bytes in the proof match the input values

**Diagnoses**: If the relayer fallback doesn't trigger cleanly, encrypt will fail.

### Test 7: Batch Multi-Type — `trivialEncrypt` Multiple Types + `publicDecrypt`

**What**: Batch-encrypt multiple values of different FHE types and decrypt them all.

**How**:

1. Call `testHelper.batchTrivialEncryptAndAllow([1, 200, 1000000, ...], [Bool, Uint8, Uint64, ...], signerAddr)`
2. Get all handles
3. Call `fhevm.publicDecrypt(handles)`
4. Assert each value matches the original input

**Diagnoses**: Catches type-specific encoding bugs (e.g., Bool stored differently).

### Test 8: Full Encrypt → verifyInput → Decrypt Round-Trip

**What**: The most end-to-end test without Playwright. Encrypt client-side, submit
the handles+proof to a contract that calls `TFHE.asEuint64(handle, proof)` (which hits
`executor.verifyInput`), then decrypt.

**How**:

1. `fhevm.createEncryptedInput(testHelperAddr, signerAddr).add64(42n).encrypt()`
2. Call a test helper function that takes `(handle, proof)` and calls `executor.verifyInput(...)`
   then sets ACL permissions
3. `fhevm.publicDecrypt([handle])` → assert `42n`

> This test requires adding a `verifyInputAndAllow` function to `CleartextTestHelper.sol`
> that wraps `executor.verifyInput()` + ACL setup. This is the closest we can get to the
> real E2E flow without a browser.

**Diagnoses**: If this passes but Playwright tests fail, the bug is definitively in the
UI/route-handler layer.

---

## 4. What This Does NOT Test

| Gap                          | Why                                                  | Mitigation                                                                           |
| ---------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Relayer RPC primary path     | HH node doesn't support `fhevm_relayer_v1_*` methods | The fallback is the production path for local dev; relayer path needs a real relayer |
| UI response handling         | No browser/Playwright involved                       | If these tests pass, the bug is in the UI layer                                      |
| Complex multi-contract flows | Test helper is minimal                               | Could be extended with more realistic contract patterns                              |

---

## 5. File Structure

```
packages/playwright/
├── contracts/src/
│   ├── CleartextFHEVMExecutor.sol     # Existing — cleartext executor
│   └── CleartextTestHelper.sol        # NEW — test helper for integration tests
├── fixtures/cleartext-mock/
│   └── __tests__/
│       ├── fixtures.ts                  # Shared config (existing)
│       ├── index.test.ts                # Unit tests with mock provider (existing)
│       ├── handle.test.ts               # Handle computation tests (existing)
│       ├── encrypted-input.test.ts      # EncryptedInput builder tests (existing)
│       ├── eip712.test.ts               # EIP-712 type tests (existing)
│       ├── integration.test.ts          # NEW — integration tests against real HH node
│       ├── globalSetup.ts               # NEW — auto-spawn HH node
│       └── vitest.integration.config.ts # NEW — vitest config for integration tests
```

## 6. Running

```bash
# Option 1: Auto-spawn (default — globalSetup handles the HH node)
pnpm vitest run --config packages/playwright/fixtures/cleartext-mock/__tests__/vitest.integration.config.ts

# Option 2: Manual (if you already have a node running)
# Terminal 1: cd hardhat && npm run node
# Terminal 2:
pnpm vitest run --config packages/playwright/fixtures/cleartext-mock/__tests__/vitest.integration.config.ts

# Run all cleartext-mock tests (unit + integration)
pnpm test -- cleartext-mock
```

The `globalSetup` detects if port 8545 is already listening and reuses the existing node
(like Playwright's `reuseExistingServer: !CI`). In CI, it always spawns a fresh node.

## 7. Implementation Order

1. **Write `CleartextTestHelper.sol`** — compile with forge
2. **Write `globalSetup.ts`** — auto-spawn HH node
3. **Write `vitest.integration.config.ts`** — dedicated vitest config
4. **Write `integration.test.ts`** — tests 1-7 first, test 8 last (requires `verifyInputAndAllow`)
5. **Run and iterate** — fix any issues found
