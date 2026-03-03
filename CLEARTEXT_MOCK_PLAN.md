# CleartextFhevmInstance — Implementation Plan (v2)

## Goal

Provide a first-class `CleartextFhevmInstance` class that **implements `RelayerSDK`**
inside `packages/sdk/src/relayer/`, exported from `@zama-fhe/sdk/cleartext`.

Consumers can instantiate it as a drop-in mock relayer for any EVM network running
the cleartext FHEVM protocol (CleartextFHEVMExecutor + standard ACL/InputVerifier/KMSVerifier).

After this work:

- **`CleartextFhevmInstance implements RelayerSDK`** — same interface as `RelayerWeb`/`RelayerNode`
- **First-class SDK citizen** — importable via `@zama-fhe/sdk/cleartext`, tree-shakeable
- **Zero dependency** on `@fhevm/mock-utils` or `@zama-fhe/relayer-sdk`
- **Zero native addons** (no `node-tfhe`, no `node-tkms`)
- **No patching responsibility** — the class only reads on-chain state; deploying/patching
  the CleartextFHEVMExecutor is the consumer's responsibility
- **Framework-agnostic** — works with any EVM node (Hardhat, Anvil, etc.)

---

## Architecture

```
Consumer code (tests, scripts, Playwright fixtures)
  │
  ├─ 1. Deploy/patch CleartextFHEVMExecutor    (consumer's responsibility)
  │     e.g. hardhat deploy script, hardhat_setCode, forge script
  │
  └─ 2. Instantiate CleartextFhevmInstance      (from @zama-fhe/sdk/cleartext)
       │
       ├─ encrypt(params)          → client-side handle computation + EIP-712 signing
       ├─ userDecrypt(params)      → eth_call ACL.persistAllowed + executor.plaintexts
       ├─ publicDecrypt(handles)   → eth_call ACL.isAllowedForDecryption + executor.plaintexts + KMS sig
       ├─ generateKeypair()        → random bytes (no ML-KEM)
       └─ createEIP712(...)        → EIP-712 typed data construction
```

### Playwright E2E wiring (thin fixture)

```
Browser (Web Worker)
  └─ relayer-sdk.js (mock CDN script — unchanged)
       └─ HTTP calls to Playwright route handlers
            └─ fhevm.ts (thin fixture)
                 └─ import { CleartextFhevmInstance } from "@zama-fhe/sdk/cleartext"
                      └─ standard eth_call to any EVM node
```

---

## Components

### 1. On-chain contracts (out of scope — already handled)

The CleartextFHEVMExecutor and all FHEVM infrastructure contracts (ACL, InputVerifier,
KMSVerifier) are deployed automatically by the `hardhat/` submodule when its node starts.
The Playwright test config spawns the Hardhat node, which runs `hardhat/deploy/deploy.ts`
and deploys everything — including the cleartext executor — at deterministic addresses.

**We don't touch contracts in this work.** The SDK class only reads on-chain state
(`executor.plaintexts`, `ACL.persistAllowed`, etc.) via standard `eth_call`.

---

### 2. CleartextFhevmInstance (TypeScript) — `implements RelayerSDK`

**Where**: `packages/sdk/src/relayer/cleartext/`

**File structure**:

```
packages/sdk/src/relayer/cleartext/
├── index.ts                        # CleartextFhevmInstance class + re-exports
├── cleartext-fhevm-instance.ts     # Main class implementation
├── encrypted-input.ts              # CleartextEncryptedInput builder
├── eip712.ts                       # EIP-712 type definitions
├── handle.ts                       # Handle computation (computeInputHandle, computeMockCiphertext)
├── constants.ts                    # FheType enum, bit widths, signer keys, verifying contracts
└── types.ts                        # CleartextFhevmConfig
```

#### 2.1 Configuration (`types.ts`)

```typescript
export interface CleartextFhevmConfig {
  /** Chain ID of the EVM network (e.g. 31337n for Hardhat). */
  chainId: bigint;
  /** Gateway chain ID used in EIP-712 domains (e.g. 10901). */
  gatewayChainId: number;
  /** Address of the ACL contract. */
  aclAddress: string;
  /** Address of the FHEVMExecutor proxy. */
  executorProxyAddress: string;
  /** Address of the InputVerifier contract. */
  inputVerifierContractAddress: string;
  /** Address of the KMSVerifier contract. */
  kmsContractAddress: string;
  /** EIP-712 verifying contract address for input verification. */
  verifyingContractAddressInputVerification: string;
  /** EIP-712 verifying contract address for decryption. */
  verifyingContractAddressDecryption: string;
}
```

> **Note**: Unlike the current `constants.ts` which imports addresses from
> `hardhat/deployments.json`, all addresses are passed via config.
> This makes the class portable across different networks.

#### 2.2 Constants (`constants.ts`)

Only truly constant values live here — no network-specific addresses:

```typescript
export enum FheType {
  Bool = 0, Uint4 = 1, Uint8 = 2, Uint16 = 3,
  Uint32 = 4, Uint64 = 5, Uint128 = 6, Uint160 = 7, Uint256 = 8,
}

export const FHE_BIT_WIDTHS: Record<FheType, number> = { ... };

export const HANDLE_VERSION = 0;
export const PREHANDLE_MASK = 0xffffffffffffffffffffffffffffffffffffffffff0000000000000000000000n;

// EIP-712 verifying contract addresses (cross-chain, same on all networks)
export const VERIFYING_CONTRACTS = {
  inputVerification: "0x812b06e1CDCE800494b79fFE4f925A504a9A9810",
  decryption: "0x5ffdaAB0373E62E2ea2944776209aEf29E631A64",
} as const;

export const GATEWAY_CHAIN_ID = 10_901;

// Mock signer private keys (deterministic, match deployed verifier contracts)
export const MOCK_INPUT_SIGNER_PK = "0x7ec8ada6642fc4ccfb7729bc29c17cf8d21b61abd5642d1db992c0b8672ab901";
export const MOCK_KMS_SIGNER_PK   = "0x388b7680e4e1afa06efbfd45cdd1fe39f3c6af381df6555a19661f283b97de91";
```

#### 2.3 Handle computation (`handle.ts`)

Unchanged from current implementation. Port of forge-fhevm's `InputProofHelper`:

- `computeMockCiphertext(fheType, cleartext, random32)` → `string`
- `computeInputHandle(mockCiphertext, index, fheType, aclAddress, chainId)` → `string`

#### 2.4 EIP-712 helpers (`eip712.ts`)

Unchanged from current implementation. Three EIP-712 type definitions:

- `INPUT_VERIFICATION_EIP712` — for signing input proofs
- `KMS_DECRYPTION_EIP712` — for signing public decrypt proofs
- `USER_DECRYPT_EIP712` — for user decrypt authorization

#### 2.5 CleartextEncryptedInput (`encrypted-input.ts`)

Unchanged from current implementation. Builder pattern with typed `add4/add8/.../add256`
methods, `encrypt()` returns `{handles, inputProof}`.

#### 2.6 CleartextFhevmInstance (`cleartext-fhevm-instance.ts`)

**Main class — `implements RelayerSDK`:**

```typescript
import type { RelayerSDK } from "../relayer-sdk";
import type {
  EncryptParams, EncryptResult, UserDecryptParams, PublicDecryptResult,
  FHEKeypair, EIP712TypedData, DelegatedUserDecryptParams,
  KmsDelegatedUserDecryptEIP712Type, InputProofBytesType, ZKProofLike,
} from "../relayer-sdk.types";

type RpcLike = { send(method: string, params: unknown[]): Promise<unknown> };

export class CleartextFhevmInstance implements RelayerSDK {
  readonly #provider: RpcLike;
  readonly #config: CleartextFhevmConfig;

  constructor(provider: RpcLike, config: CleartextFhevmConfig) {
    this.#provider = provider;
    this.#config = config;
  }
```

**Method mapping (RelayerSDK → implementation):**

| RelayerSDK method                                                           | Implementation                                                                                 | Notes                                                                                                                                              |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `generateKeypair()`                                                         | Returns random bytes in `Promise<FHEKeypair>`                                                  | Async wrapper around current sync impl                                                                                                             |
| `createEIP712(publicKey, contractAddresses, startTimestamp, durationDays?)` | Constructs `UserDecryptRequestVerification` EIP-712 typed data                                 | Returns `Promise<EIP712TypedData>` (async wrapper)                                                                                                 |
| `encrypt(params: EncryptParams)`                                            | Creates `CleartextEncryptedInput`, calls `add64(v)` for each value, returns `encrypt()` result | **TODO: WRONG — should take FheType per value. Currently assumes all values are Uint64.**                                                          |
| `userDecrypt(params: UserDecryptParams)`                                    | Reads ACL.persistAllowed + executor.plaintexts via eth_call                                    | Adapts current positional-args impl to single-object `UserDecryptParams`. Maps `params.handles` + `params.contractAddress` → `handleContractPairs` |
| `publicDecrypt(handles: string[])`                                          | Reads ACL.isAllowedForDecryption + executor.plaintexts + KMS-signs proof                       | Current impl already matches signature                                                                                                             |
| `createDelegatedUserDecryptEIP712(...)`                                     | `throw new Error("Not implemented in cleartext mode")`                                         |                                                                                                                                                    |
| `delegatedUserDecrypt(params)`                                              | `throw new Error("Not implemented in cleartext mode")`                                         |                                                                                                                                                    |
| `requestZKProofVerification(zkProof)`                                       | `throw new Error("Not implemented in cleartext mode")`                                         |                                                                                                                                                    |
| `getPublicKey()`                                                            | `return null`                                                                                  | Stub — no real FHE public key in cleartext mode                                                                                                    |
| `getPublicParams(bits)`                                                     | `return null`                                                                                  | Stub — no real FHE public params                                                                                                                   |
| `terminate()`                                                               | No-op                                                                                          | No resources to release                                                                                                                            |

**`encrypt()` implementation detail:**

```typescript
// TODO: WE ACCEPT FOR THIS IMPLEMENTATION BUT THIS IS WRONG AND THIS SHOULD TAKE THE FHE TYPE AS INPUT.
// Currently we treat all values as Uint64. The EncryptParams interface
// does not carry FheType information, so we cannot determine the correct
// type per value. This should be fixed by extending EncryptParams with
// an fheTypes field.
async encrypt(params: EncryptParams): Promise<EncryptResult> {
  const input = new CleartextEncryptedInput(
    params.contractAddress,
    params.userAddress,
    this.#config,
  );
  for (const value of params.values) {
    input.add64(value);
  }
  return input.encrypt();
}
```

**`userDecrypt()` adaptation:**

```typescript
async userDecrypt(params: UserDecryptParams): Promise<Record<string, bigint>> {
  const handleContractPairs = params.handles.map((handle) => ({
    handle,
    contractAddress: params.contractAddress,
  }));

  // Check ACL permissions (parallelized)
  // Read plaintexts from on-chain executor (parallelized)
  // Return Record<handle, cleartext>
  // (same logic as current CleartextMockFhevm.userDecrypt, adapted to single-object params)
}
```

#### 2.7 Package entrypoint (`index.ts`)

```typescript
export { CleartextFhevmInstance } from "./cleartext-fhevm-instance";
export { CleartextEncryptedInput } from "./encrypted-input";
export type { CleartextFhevmConfig } from "./types";
export { FheType, FHE_BIT_WIDTHS } from "./constants";
```

---

### 3. Build & Export Configuration

**`packages/sdk/tsup.config.ts`** — add entry:

```typescript
entry: {
  index: "src/index.ts",
  "viem/index": "src/viem/index.ts",
  "ethers/index": "src/ethers/index.ts",
  "node/index": "src/node/index.ts",
  "cleartext/index": "src/relayer/cleartext/index.ts",  // NEW
  "relayer-sdk.node-worker": "src/worker/relayer-sdk.node-worker.ts",
},
```

**`packages/sdk/package.json`** — add export:

```json
"exports": {
  ".": { ... },
  "./viem": { ... },
  "./ethers": { ... },
  "./node": { ... },
  "./cleartext": {
    "types": "./dist/cleartext/index.d.ts",
    "import": "./dist/cleartext/index.js"
  }
}
```

> The `cleartext` entrypoint only depends on `ethers` (already an optional peer dep).
> No new dependencies needed.

---

### 4. Playwright Fixture Updates

**File**: `packages/playwright/fixtures/fhevm.ts`

#### What changes

| Before                                                              | After                                                                                       |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `import { CleartextMockFhevm } from "./cleartext-mock"`             | `import { CleartextFhevmInstance } from "@zama-fhe/sdk/cleartext"`                          |
| `CleartextMockFhevm.create(provider, config)`                       | `new CleartextFhevmInstance(provider, config)` (sync constructor, no factory)               |
| `fhevm.createEncryptedInput(addr, user)` then `input.add64(v)`      | `fhevm.encrypt({ values, contractAddress, userAddress })` (use RelayerSDK interface)        |
| `fhevm.userDecrypt(pairs, pk, pubk, sig, addrs, signer, ts, days)`  | `fhevm.userDecrypt({ handles, contractAddress, ... })` (use RelayerSDK interface)           |
| `import { FHEVM_ADDRESSES, ... } from "./cleartext-mock/constants"` | `import { ... } from "@zama-fhe/sdk/cleartext"` or configure from deployments.json directly |

The fixture becomes much thinner — just Playwright route wiring that delegates to
`CleartextFhevmInstance` via the standard `RelayerSDK` interface.

#### What stays the same

- Playwright route interception pattern (`page.route(...)`)
- The 5 endpoint routes: `/generateKeypair`, `/createEIP712`, `/encrypt`, `/userDecrypt`, `/publicDecrypt`
- CDN intercept for `relayer-sdk.js`
- Snapshot/revert test isolation

#### What gets removed

- `packages/playwright/fixtures/cleartext-mock/` — entire directory deleted
  (code moved to `packages/sdk/src/relayer/cleartext/`)

---

### 5. Test Migration

**Unit tests** currently in `packages/playwright/fixtures/cleartext-mock/__tests__/`:

- `handle.test.ts` — handle computation tests
- `encrypted-input.test.ts` — encrypted input builder tests
- `eip712.test.ts` — EIP-712 type tests
- `index.test.ts` — CleartextMockFhevm unit tests
- `fixtures.ts` — shared test config

These move to `packages/sdk/src/relayer/cleartext/__tests__/` with import path updates.
Test names and assertions stay the same; only the class name changes
(`CleartextMockFhevm` → `CleartextFhevmInstance`).

**Integration tests** (`integration.test.ts`, `globalSetup.ts`, `vitest.integration.config.ts`)
stay in Playwright or move to a top-level integration test directory — they need a running
Hardhat node and aren't pure unit tests.

---

### 6. Dependency Changes

**`packages/sdk/package.json`** — no new dependencies. `ethers` is already an optional peer dep.

**`packages/playwright/package.json`**:

```diff
  "dependencies": {
-   (implicitly depends on cleartext-mock/ local files)
+   "@zama-fhe/sdk": "workspace:*"  (already present — just uses the new /cleartext entrypoint)
  }
```

**Root `package.json`** — no changes needed for this work.

---

### 7. Migration Checklist

1. **Create `packages/sdk/src/relayer/cleartext/`** directory
2. **Move source files** from `packages/playwright/fixtures/cleartext-mock/`:
   - `handle.ts` → `packages/sdk/src/relayer/cleartext/handle.ts`
   - `encrypted-input.ts` → `packages/sdk/src/relayer/cleartext/encrypted-input.ts`
   - `eip712.ts` → `packages/sdk/src/relayer/cleartext/eip712.ts`
   - `types.ts` → `packages/sdk/src/relayer/cleartext/types.ts`
   - `constants.ts` → `packages/sdk/src/relayer/cleartext/constants.ts`
     (remove `import deployments from "../../../../hardhat/deployments.json"` — addresses come from config)
3. **Create `cleartext-fhevm-instance.ts`** — new class implementing `RelayerSDK`
   (adapts current `CleartextMockFhevm` methods to the `RelayerSDK` interface)
4. **Create `index.ts`** — barrel exports
5. **Update `tsup.config.ts`** — add `cleartext/index` entry
6. **Update `packages/sdk/package.json`** — add `./cleartext` export
7. **Move unit tests** to `packages/sdk/src/relayer/cleartext/__tests__/`
8. **Update `fhevm.ts`** — import from `@zama-fhe/sdk/cleartext`, use `RelayerSDK` interface
9. **Delete `packages/playwright/fixtures/cleartext-mock/`**
10. **Verify**: `pnpm build`, `pnpm test`, `pnpm typecheck` all pass

---

## Risks & Open Questions

| Risk                                                                    | Mitigation                                                                                                                                                               |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`encrypt()` assumes Uint64 for all values**                           | Big TODO in code. Will be fixed when `EncryptParams` is extended with `fheTypes: FheType[]`. For now this works because the Playwright E2E tests only use Uint64 values. |
| **`constants.ts` had hardcoded import from `hardhat/deployments.json`** | Addresses now come from `CleartextFhevmConfig`. Consumer passes them in. The Playwright fixture reads from `deployments.json` and passes to the constructor.             |
| **Signer key mismatch**                                                 | Mock signer keys are hardcoded constants that match the deployed verifier contracts. Validated in existing tests.                                                        |
| **EIP-712 struct mismatch**                                             | Ported from forge-fhevm, validated in existing unit tests (`eip712.test.ts`).                                                                                            |
| **Handle computation mismatch**                                         | Ported from forge-fhevm, validated in existing unit tests (`handle.test.ts`).                                                                                            |
| **`publicDecrypt` proof format**                                        | Validated in existing unit tests against KMSVerifier expectations.                                                                                                       |

---

## What We Skip (Not Implemented)

| Feature                                         | Behavior                                           |
| ----------------------------------------------- | -------------------------------------------------- |
| `createDelegatedUserDecryptEIP712`              | Throws `"Not implemented in cleartext mode"`       |
| `delegatedUserDecrypt`                          | Throws `"Not implemented in cleartext mode"`       |
| `requestZKProofVerification`                    | Throws `"Not implemented in cleartext mode"`       |
| `getPublicKey`                                  | Returns `null`                                     |
| `getPublicParams`                               | Returns `null`                                     |
| `terminate`                                     | No-op                                              |
| EIP-712 signature verification on `userDecrypt` | Skipped — cleartext mode trusts the caller         |
| Deadline validation on `userDecrypt`            | Skipped — cleartext mode doesn't enforce deadlines |
| ML-KEM keypair generation                       | Replaced with random bytes                         |
| Executor bytecode patching (`hardhat_setCode`)  | Consumer's responsibility, not in the SDK          |
