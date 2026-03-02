# CleartextFHEVMExecutor Mock — Implementation Plan

## Goal

Replace the current mock architecture in `packages/playwright/` with a purely
on-chain cleartext approach. After this work:

- **Zero dependency** on `@fhevm/mock-utils` or `@zama-fhe/relayer-sdk`
- **Zero native addons** (no `node-tfhe`, no `node-tkms`)
- **No colocated DB** — all cleartext values stored on-chain in the executor
- **No Hardhat provider interception** — no custom RPC methods, no `FhevmProviderExtender`
- **Framework-agnostic** — works with any EVM node (Hardhat, Anvil, etc.)

---

## Architecture: Before vs After

### Current (what we're replacing)

```
Browser (Web Worker)
  └─ relayer-sdk.js (mock, replaces CDN SDK)
       └─ HTTP calls to Playwright route handlers
            └─ fhevm.ts ← imports MockFhevmInstance from @fhevm/mock-utils
                 │          (requires node-tfhe + node-tkms via relayer-sdk/node)
                 │
                 └─ Sends custom RPC: fhevm_relayer_v1_*
                      └─ Hardhat Node
                           ├─ FhevmProviderExtender (intercepts custom RPCs)
                           ├─ MockCoprocessor (polls eth_getLogs for FHE events)
                           ├─ CoprocessorEventsHandler (computes cleartexts off-chain)
                           └─ FhevmDBMap (in-memory Map<string, string>)
```

### New (on-chain cleartext)

```
Browser (Web Worker)
  └─ relayer-sdk.js (mock, same interception pattern)
       └─ HTTP calls to Playwright route handlers
            └─ fhevm.ts ← imports CleartextMockFhevm (new, ethers-only)
                 │
                 └─ Standard eth_call / eth_sendTransaction
                      └─ Any EVM Node (Hardhat, Anvil, etc.)
                           └─ CleartextFHEVMExecutor (stores cleartexts on every FHE op)
                                ├─ mapping(bytes32 => uint256) public plaintexts
                                ├─ ACL (unchanged — same contract)
                                ├─ InputVerifier (unchanged)
                                └─ KMSVerifier (unchanged)
```

---

## Components

### 1. CleartextFHEVMExecutor.sol

**What**: A Solidity contract that extends the production `FHEVMExecutor` and adds
on-chain cleartext storage. Every FHE operation computes the result in the clear
and stores it in a `mapping(bytes32 => uint256)`.

**Where**: New minimal Foundry project that copies the contracts to deploy from `forge-fhevm` (https://github.com/zama-ai/forge-fhevm)
We deploy the entire set of contracts (InputVerifier, KMSVerifier, ACL) from `forge-fhevm` and then replace the implementation of the FHEVMExecutor except that we use our own, CleartextFHEVMExecutor.

GUIDELINE: copy the contract files implementation from `forge-fhevm`, and then simply add the cleartext storage mapping inside it.

**Storage**:
```solidity
/// @dev handle → plaintext value. Public so the mock client can read via eth_call.
mapping(bytes32 => uint256) public plaintexts;
```

**Overridden operations** (28 total, same set as PlaintextDBMixin):

| Category | Functions | Pattern |
|----------|-----------|---------|
| Arithmetic | `fheAdd`, `fheSub`, `fheMul`, `fheDiv`, `fheRem` | `result = super.fheX(lhs, rhs, scalar); plaintexts[result] = clamp(op(a, b), type)` |
| Bitwise | `fheBitAnd`, `fheBitOr`, `fheBitXor` | Same binary pattern |
| Shift/Rotate | `fheShl`, `fheShr`, `fheRotl`, `fheRotr` | Same binary pattern (shift amount clamped to bit width) |
| Comparison | `fheEq`, `fheNe`, `fheGe`, `fheGt`, `fheLe`, `fheLt` | Binary → stores 0 or 1 |
| Min/Max | `fheMin`, `fheMax` | Binary pattern |
| Unary | `fheNeg`, `fheNot` | `result = super.fheX(ct); plaintexts[result] = clamp(op(a), type)` |
| Special | `fheIfThenElse` | Ternary: `control != 0 ? ifTrue : ifFalse` |
| Random | `fheRand`, `fheRandBounded` | Store `block.prevrandao % bound` (deterministic in test) |
| Cast | `cast` | Reinterpret cleartext under new type (clamp) |
| Encrypt | `trivialEncrypt` | `plaintexts[result] = pt` |
| Input | `verifyInput` | Extract cleartext from proof extraData (see below) |

**verifyInput override** — cleartext extraction from input proof:

The input proof format is extended with cleartext values appended after signatures:

```
Standard:   [numHandles(1)] [numSigners(1)] [handles(N*32)] [signatures(M*65)]
Extended:   [numHandles(1)] [numSigners(1)] [handles(N*32)] [signatures(M*65)] [cleartexts(N*32)]
                                                                                ^^^^^^^^^^^^^^^^
                                                                                new: appended as extraData
```

The InputVerifier only parses the standard portion (handles + signatures) and
ignores trailing bytes. The CleartextFHEVMExecutor override reads the appended
cleartexts:

```solidity
function verifyInput(
    ContextUserInputs memory context,
    bytes32 inputHandle,
    bytes memory inputProof
) public override returns (bytes32 result) {
    // Parent validates proof via InputVerifier + grants ACL
    result = super.verifyInput(context, inputHandle, inputProof);

    // Extract cleartext for this handle from appended data
    uint8 numHandles = uint8(inputProof[0]);
    uint8 numSigners = uint8(inputProof[1]);
    uint256 cleartextStart = 2 + uint256(numHandles) * 32 + uint256(numSigners) * 65;

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
```

**Helper functions** (ported from PlaintextDBMixin):

```solidity
function _clamp(uint256 value, FheType t) internal pure returns (uint256);
function _bitWidthForType(FheType t) internal pure returns (uint256);
// _typeOf already exists in FHEVMExecutor
```

**Compilation & deployment**:

1. Create a Foundry project at `packages/playwright/contracts/` (or separate repo)
2. Import `forge-fhevm` as dependency
3. `forge build` → extract `deployedBytecode` from artifact
4. Embed as a hex constant in TypeScript: `const CLEARTEXT_EXECUTOR_BYTECODE = "0x..."`
5. At test setup: swap executor implementation via `hardhat_setCode`

```typescript
// Read implementation address from EIP-1967 slot
const IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const implAddress = await provider.getStorage(EXECUTOR_PROXY_ADDRESS, IMPL_SLOT);

// Hot-swap implementation bytecode either
await provider.send("hardhat_setCode", [
    ethers.getAddress("0x" + implAddress.slice(26)), // extract address from bytes32
    CLEARTEXT_EXECUTOR_BYTECODE
]);
```

No proxy upgrade needed. No signer needed. Just bytecode replacement.

---

### 2. CleartextMockFhevm (TypeScript)

**What**: A lightweight TypeScript class that replaces `MockFhevmInstance` from
`@fhevm/mock-utils`. Zero dependencies beyond `ethers`.

**Where**: `packages/playwright/fixtures/cleartext-mock/`

**File structure**:
```
packages/playwright/fixtures/cleartext-mock/
├── index.ts                        # CleartextMockFhevm class
├── encrypted-input.ts              # CleartextEncryptedInput builder
├── eip712.ts                       # EIP-712 helpers (input verification, KMS, user decrypt)
├── handle.ts                       # Handle computation (port of InputProofHelper)
├── constants.ts                    # Addresses, signer keys, type maps
└── types.ts                        # Shared types
```

#### 2.1 Configuration (`constants.ts`)

```typescript
// FHEVM infrastructure addresses (same for Hardhat & forge-fhevm)
// Use actual deployment addresses
export const FHEVM_ADDRESSES = {
    acl: "0x50157CFfD6bBFA2DECe204a89ec419c23ef5755D",
    executor: "0xe3a9105a3a932253A70F126eb1E3b589C643dD24",
    inputVerifier: "0x36772142b74871f255CbD7A3e89B401d3e45825f",
    kmsVerifier: "0x901F8942346f7AB3a01F6D7613119Bca447Bb030", // actual contract
};

// EIP-712 verifying contracts (cross-chain verification)
export const VERIFYING_CONTRACTS = {
    inputVerification: "0x812b06e1CDCE800494b79fFE4f925A504a9A9810",
    decryption: "0x5ffdaAB0373E62E2ea2944776209aEf29E631A64",
};

// Gateway chain ID (used in EIP-712 domains)
export const GATEWAY_CHAIN_ID = 10901;

// Mock signer private keys
// TODO: Derive from mnemonic or verify against deployed contracts
export const MOCK_INPUT_SIGNER_PK = "0x...";  // coprocessor signer
export const MOCK_KMS_SIGNER_PK = "0x...";    // KMS signer

// FheType enum (matches Solidity)
export enum FheType {
    Bool = 0, Uint4 = 1, Uint8 = 2, Uint16 = 3,
    Uint32 = 4, Uint64 = 5, Uint128 = 6, Uint160 = 7, Uint256 = 8,
}

export const FHE_BIT_WIDTHS: Record<FheType, number> = {
    [FheType.Bool]: 1, [FheType.Uint4]: 4, [FheType.Uint8]: 8,
    [FheType.Uint16]: 16, [FheType.Uint32]: 32, [FheType.Uint64]: 64,
    [FheType.Uint128]: 128, [FheType.Uint160]: 160, [FheType.Uint256]: 256,
};

export const HANDLE_VERSION = 0;
```

#### 2.2 Handle computation (`handle.ts`)

Port of forge-fhevm's `InputProofHelper.computeInputHandle`:

```typescript
export function computeInputHandle(
    mockCiphertext: string,  // keccak256 of the input data
    index: number,
    aclAddress: string,
    chainId: bigint,
    fheType: FheType,
): string {
    const blobHash = ethers.keccak256(
        ethers.concat([ethers.toUtf8Bytes("ZK-w_rct"), ethers.getBytes(mockCiphertext)])
    );
    const handleHash = ethers.keccak256(
        ethers.solidityPacked(
            ["bytes", "bytes32", "uint256", "address", "uint256"],
            [ethers.toUtf8Bytes("ZK-w_hdl"), blobHash, index, aclAddress, chainId]
        )
    );

    // Apply metadata mask and set handle fields
    let handle = BigInt(handleHash) & PREHANDLE_MASK;
    handle |= BigInt(index) << 80n;           // byte 21 = index
    handle |= (chainId & 0xFFFFFFFFFFFFFFFFn) << 16n; // bytes 22-29 = chainId
    handle |= BigInt(fheType) << 8n;          // byte 30 = fheType
    handle |= BigInt(HANDLE_VERSION);         // byte 31 = version
    return ethers.zeroPadValue(ethers.toBeHex(handle), 32);
}

export function computeMockCiphertext(
    fheType: FheType,
    cleartext: bigint,
    random32: Uint8Array,
): string {
    const fheByteLenMap = { ... }; // fheType → byte length
    const clearBytes = uintToBytes(cleartext, fheByteLenMap[fheType]);
    return ethers.keccak256(
        ethers.concat([new Uint8Array([fheType]), clearBytes, random32])
    );
}
```

#### 2.3 EIP-712 helpers (`eip712.ts`)

Three EIP-712 type definitions:

```typescript
// 1. Input verification (signed by coprocessor/input signer)
export const INPUT_VERIFICATION_EIP712 = {
    domain: (chainIdSource: number, verifyingContract: string) => ({
        name: "InputVerification",
        version: "1",
        chainId: chainIdSource,
        verifyingContract,
    }),
    types: {
        CiphertextVerification: [
            { name: "blobHash", type: "bytes32" },
            { name: "handlesList", type: "bytes32[]" },
            { name: "userAddress", type: "address" },
            { name: "contractAddress", type: "address" },
        ],
    },
};

// 2. KMS decryption (signed by KMS signer, used for public decrypt proofs)
export const KMS_DECRYPTION_EIP712 = {
    domain: (chainIdSource: number, verifyingContract: string) => ({
        name: "Decryption",
        version: "1",
        chainId: chainIdSource,
        verifyingContract,
    }),
    types: {
        PublicDecryptVerification: [
            { name: "ctHandles", type: "bytes32[]" },
            { name: "decryptedResult", type: "bytes" },
        ],
    },
};

// 3. User decrypt request (signed by the user — identity bound via signature, not a field)
//    Note: the domain name is "Decryption" (same as KMS), not "UserDecryption".
//    The verifyingContract is verifyingContractAddressDecryption.
export const USER_DECRYPT_EIP712 = {
    domain: (chainIdSource: number, verifyingContract: string) => ({
        name: "Decryption",
        version: "1",
        chainId: chainIdSource,
        verifyingContract,
    }),
    types: {
        UserDecryptRequestVerification: [
            { name: "publicKey", type: "bytes" },
            { name: "contractAddresses", type: "address[]" },
            { name: "startTimestamp", type: "uint256" },
            { name: "durationDays", type: "uint256" },
            { name: "extraData", type: "bytes" },
        ],
    },
};
```

#### 2.4 CleartextEncryptedInput (`encrypted-input.ts`)

Builder pattern for encrypted inputs:

```typescript
export class CleartextEncryptedInput {
    #values: { cleartext: bigint; fheType: FheType }[] = [];
    #contractAddress: string;
    #userAddress: string;
    #config: CleartextMockConfig;
    #inputSignerWallet: ethers.Wallet;

    // Type-specific add methods
    addBool(value: boolean): this   { return this.#add(value ? 1n : 0n, FheType.Bool); }
    add4(value: bigint): this       { return this.#add(value, FheType.Uint4); }
    add8(value: bigint): this       { return this.#add(value, FheType.Uint8); }
    add16(value: bigint): this      { return this.#add(value, FheType.Uint16); }
    add32(value: bigint): this      { return this.#add(value, FheType.Uint32); }
    add64(value: bigint): this      { return this.#add(value, FheType.Uint64); }
    add128(value: bigint): this     { return this.#add(value, FheType.Uint128); }
    add256(value: bigint): this     { return this.#add(value, FheType.Uint256); }
    addAddress(value: string): this { return this.#add(BigInt(value), FheType.Uint160); }

    async encrypt(): Promise<{ handles: Uint8Array[]; inputProof: Uint8Array }> {
        // 1. Compute mock ciphertexts for each value
        const randoms = this.#values.map(() => ethers.randomBytes(32));
        const mockCiphertexts = this.#values.map((v, i) =>
            computeMockCiphertext(v.fheType, v.cleartext, randoms[i])
        );

        // 2. Compute overall ciphertext blob
        const ciphertextBlob = ethers.keccak256(ethers.concat(mockCiphertexts.map(ethers.getBytes)));

        // 3. Compute handles
        const handles = this.#values.map((v, i) =>
            computeInputHandle(ciphertextBlob, i, this.#config.aclAddress, this.#config.chainId, v.fheType)
        );

        // 4. Compute blobHash for EIP-712
        const blobHash = ethers.keccak256(
            ethers.concat([ethers.toUtf8Bytes("ZK-w_rct"), ethers.getBytes(ciphertextBlob)])
        );

        // 5. Sign CiphertextVerification with input signer
        const signature = await this.#inputSignerWallet.signTypedData(
            INPUT_VERIFICATION_EIP712.domain(this.#config.gatewayChainId, this.#config.verifyingContractInputVerification),
            INPUT_VERIFICATION_EIP712.types,
            { blobHash, handlesList: handles, userAddress: this.#userAddress, contractAddress: this.#contractAddress }
        );

        // 6. Build input proof: numHandles + numSigners + handles + signatures + cleartexts
        const numHandles = this.#values.length;
        const numSigners = 1;
        const sigBytes = ethers.getBytes(signature); // 65 bytes

        const proof = ethers.concat([
            new Uint8Array([numHandles]),
            new Uint8Array([numSigners]),
            ...handles.map(h => ethers.getBytes(h)),
            sigBytes,
            // Appended cleartexts (new — read by CleartextFHEVMExecutor.verifyInput)
            ...this.#values.map(v => ethers.zeroPadValue(ethers.toBeHex(v.cleartext), 32)),
        ]);

        return {
            handles: handles.map(h => ethers.getBytes(h)),
            inputProof: ethers.getBytes(proof),
        };
    }
}
```

#### 2.5 CleartextMockFhevm (`index.ts`)

Main class — replaces `MockFhevmInstance`:

```typescript
export class CleartextMockFhevm {
    #provider: ethers.Provider;
    #config: CleartextMockConfig;
    #inputSignerWallet: ethers.Wallet;
    #kmsSignerWallet: ethers.Wallet;
    #executorContract: ethers.Contract;  // CleartextFHEVMExecutor (read plaintexts)
    #aclContract: ethers.Contract;        // ACL (check permissions)

    private constructor(...) { ... }

    static async create(provider: ethers.Provider, config: CleartextMockConfig): Promise<CleartextMockFhevm> {
        // 1. Create signer wallets from mock private keys
        // 2. Create contract instances for executor (read plaintexts) and ACL (check perms)
        // 3. Swap executor implementation via hardhat_setCode (if not already done)
    }
```

**Method implementations**:

```typescript
    // ── generateKeypair ──────────────────────────────────────────────
    // Returns random bytes. No ML-KEM, no TKMS. The private key is
    // never used in cleartext mode.
    generateKeypair(): { publicKey: string; privateKey: string } {
        const bytes = ethers.randomBytes(64);
        return {
            publicKey: ethers.hexlify(bytes.slice(0, 32)),
            privateKey: ethers.hexlify(bytes.slice(32)),
        };
    }

    // ── createEIP712 ─────────────────────────────────────────────────
    // Constructs the EIP-712 typed data for user decrypt authorization.
    // Pure object construction — no crypto.
    // The user's address is NOT a field in the struct — their identity
    // is bound via being the signer of this EIP-712 message.
    createEIP712(
        publicKey: string,
        contractAddresses: string[],
        startTimestamp: number,
        durationDays: number,
    ) {
        return {
            domain: USER_DECRYPT_EIP712.domain(
                this.#config.gatewayChainId,
                this.#config.verifyingContractDecryption,
            ),
            types: USER_DECRYPT_EIP712.types,
            message: {
                publicKey: publicKey,
                contractAddresses: [...contractAddresses],
                startTimestamp: startTimestamp.toString(),
                durationDays: durationDays.toString(),
                extraData: "0x00",
            },
        };
    }

    // ── createEncryptedInput ─────────────────────────────────────────
    createEncryptedInput(contractAddress: string, userAddress: string): CleartextEncryptedInput {
        return new CleartextEncryptedInput(contractAddress, userAddress, this.#config, this.#inputSignerWallet);
    }

    // ── userDecrypt ──────────────────────────────────────────────────
    // Reads cleartexts directly from on-chain CleartextFHEVMExecutor.
    // Checks ACL permissions. Skips ML-KEM, TKMS, signature verification.
    async userDecrypt(
        handleContractPairs: { handle: string; contractAddress: string }[],
        _privateKey: string,     // unused — kept for API compat
        _publicKey: string,      // unused in cleartext mode
        _signature: string,      // skipped — no EIP-712 verification
        contractAddresses: string[],
        userAddress: string,
        _startTimestamp: number,
        _durationDays: number,
    ): Promise<Record<string, bigint>> {
        const results: Record<string, bigint> = {};

        for (const { handle, contractAddress } of handleContractPairs) {
            // 1. ACL check: user must have persistent permission
            const isAllowed: boolean = await this.#aclContract.persistAllowed(handle, userAddress);
            if (!isAllowed) {
                throw new Error(`Handle ${handle} is not authorized for user decrypt by ${userAddress}`);
            }

            // 2. Read cleartext from on-chain executor
            const cleartext: bigint = await this.#executorContract.plaintexts(handle);
            results[handle] = cleartext;
        }

        return results;
    }

    // ── publicDecrypt ────────────────────────────────────────────────
    // Reads cleartexts from chain. Checks ACL isAllowedForDecryption.
    // Produces a valid KMS-signed proof (needed by finalizeUnwrap on-chain).
    async publicDecrypt(
        handles: { handle: string; contractAddress: string }[],
    ): Promise<{
        clearValues: Record<string, bigint>;
        abiEncodedClearValues: string;
        decryptionProof: string;
    }> {
        const handleBytes32List: string[] = [];
        const clearValues: Record<string, bigint> = {};

        for (const { handle } of handles) {
            // 1. ACL check: handle must be allowed for decryption
            const isAllowed: boolean = await this.#aclContract.isAllowedForDecryption(handle);
            if (!isAllowed) {
                throw new Error(`Handle ${handle} is not allowed for public decryption`);
            }

            // 2. Read cleartext
            const cleartext: bigint = await this.#executorContract.plaintexts(handle);
            clearValues[handle] = cleartext;
            handleBytes32List.push(handle);
        }

        // 3. ABI-encode cleartexts
        const abiEncodedClearValues = ethers.AbiCoder.defaultAbiCoder().encode(
            handles.map(() => "uint256"),
            Object.values(clearValues),
        );

        // 4. Sign PublicDecryptVerification with KMS signer
        const signature = await this.#kmsSignerWallet.signTypedData(
            KMS_DECRYPTION_EIP712.domain(
                this.#config.gatewayChainId,
                this.#config.verifyingContractDecryption,
            ),
            KMS_DECRYPTION_EIP712.types,
            {
                ctHandles: handleBytes32List,
                decryptedResult: abiEncodedClearValues,
            },
        );

        // 5. Build decryption proof: numSigners(1) + signature(65)
        const decryptionProof = ethers.concat([
            new Uint8Array([1]),           // numSigners = 1
            ethers.getBytes(signature),    // 65 bytes
        ]);

        return {
            clearValues,
            abiEncodedClearValues,
            decryptionProof: ethers.hexlify(decryptionProof),
        };
    }
```

---

### 3. Playwright Fixture Updates

**File**: `packages/playwright/fixtures/fhevm.ts`

#### What changes

| Before | After |
|--------|-------|
| `import { MockFhevmInstance } from "@fhevm/mock-utils"` | `import { CleartextMockFhevm } from "./cleartext-mock"` |
| `MockFhevmInstance.create(provider, provider, config, properties)` | `CleartextMockFhevm.create(provider, config)` — simpler factory, no InputVerifier/KMSVerifier properties needed |
| Block-mining retry loops (lines 124-163, 198-237) | Remove entirely — cleartexts are available immediately after tx confirmation |
| `decryptLock` mutex for serializing decrypts | Likely removable — no more coprocessor cursor race conditions |
| 130+ lines of retry/error handling | Direct calls, ~40 lines total |

#### What stays the same

- Playwright route interception pattern (`page.route(...)`)
- The 5 endpoint routes: `/generateKeypair`, `/createEIP712`, `/encrypt`, `/userDecrypt`, `/publicDecrypt`
- CDN intercept for `relayer-sdk.js`
- Snapshot/revert test isolation (`viemClient.snapshot()` / `viemClient.revert()`)

#### What gets removed from fhevm.ts

- The `decryptLock` mutex and all retry logic
- All error handling for "Invalid block filter fromBlock=X toBlock=Y"
- All block-mining workarounds (`viemClient.mine({ blocks: ... })`)
- The `createMockFhevmInstance` function (replaced by `CleartextMockFhevm.create`)

#### What gets removed from test.ts

- Post-revert block mining (line 130-132: `await viemClient.mine({ blocks: 100 })`)
  — no longer needed since there's no coprocessor cursor to advance

**File**: `packages/playwright/fixtures/relayer-sdk.js`

This file stays largely unchanged. It already proxies all operations to the
route handlers. Minor adjustments may be needed if the response format changes.

---

### 4. Dependency Changes

**`packages/playwright/package.json`**:
```diff
  "dependencies": {
-   "@fhevm/mock-utils": "0.4.2",
    "@playwright/test": "^1.58.2",
    "ethers": "^6.16.0",
    "viem": "^2.46.3"
  }
```

**Root `package.json`**:
```diff
  "devDependencies": {
-   "@fhevm/mock-utils": "0.4.2",
-   "@zama-fhe/relayer-sdk": "0.4.1",
    ...
  }
```

Note: `@zama-fhe/relayer-sdk` may still be needed as a **peer dependency** of
`@zama-fhe/sdk` for production use. But it's no longer needed for mock/test code.

---

## Risks & Open Questions

| Risk | Mitigation |
|------|------------|
| **Signer key mismatch** — if our mock signer keys don't match the deployed verifiers, all proofs fail | Step 0 validates keys against deployed contracts before any code is written |
| **InputVerifier rejects extended proof** — if InputVerifier parses beyond signatures into our cleartext area | Verify InputVerifier's parsing stops exactly at `2 + N*32 + M*65`. Tested in forge-fhevm. |
| **Storage slot collision** — CleartextFHEVMExecutor's `plaintexts` mapping collides with FHEVMExecutor storage | Inheritance guarantees the mapping is appended after parent storage. Verify with `forge inspect`. |
| **`hardhat_setCode` doesn't work with UUPS proxy** — proxy and implementation interaction breaks | Alternative: deploy new implementation contract and update proxy's EIP-1967 slot with `hardhat_setStorageAt`. |
| **EIP-712 struct mismatch** — our EIP-712 types don't match what on-chain contracts expect | Port exact struct definitions from forge-fhevm Solidity source. Cross-reference with mock-utils. |
| **Handle computation mismatch** — client-computed handles differ from what InputVerifier expects | Port exact algorithm from forge-fhevm's InputProofHelper. Test with a known input vector. |
| **`publicDecrypt` proof format wrong** — `finalizeUnwrap` rejects our KMS proof | Match proof format exactly: `numSigners(1) + signatures(N*65) + extraData`. Test against KMSVerifier. |

---

## What We Skip (Not Implemented)

| Feature | Reason |
|---------|--------|
| `requestZKProofVerification` | Not used by any test |
| `delegatedUserDecrypt` | Not used by current tests |
| `getPublicKey` / `getPublicParams` | Mock stubs in relayer-sdk.js (return dummy data) |
| EIP-712 signature verification on userDecrypt | User's spec: skip in cleartext mode |
| Deadline validation on userDecrypt | User's spec: skip in cleartext mode |
| ML-KEM keypair generation | Replaced with random bytes |
| Any `@zama-fhe/relayer-sdk` import | Entire dependency eliminated |
