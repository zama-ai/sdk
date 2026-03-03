# Research: CleartextFhevmInstance SDK Core

## Unit ID
`sdk-cleartext-implementation`

## Summary
Port `CleartextMockFhevm` from `packages/playwright/fixtures/cleartext-mock/` into a first-class
SDK citizen at `packages/sdk/src/relayer/cleartext/` implementing the `RelayerSDK` interface,
and export it via a new `@zama-fhe/sdk/cleartext` entrypoint.

---

## RFC Reference
- **File**: `/Users/msaug/zama/token-sdk/CLEARTEXT_MOCK_PLAN.md`
- **Relevant sections**: §2, §2.1–2.7, §3, §5, §6

---

## Key Source Files

### Source files to port (verbatim unless noted)

| From (playwright/fixtures/cleartext-mock/) | To (sdk/src/relayer/cleartext/) | Notes |
|---|---|---|
| `handle.ts` | `handle.ts` | Copy verbatim |
| `eip712.ts` | `eip712.ts` | Copy verbatim |
| `types.ts` | `types.ts` | Rename `CleartextMockConfig` → `CleartextFhevmConfig` |
| `constants.ts` | `constants.ts` | Remove `import deployments from "../../../../hardhat/deployments.json"` + `FHEVM_ADDRESSES` export |
| `encrypted-input.ts` | `encrypted-input.ts` | Update `CleartextMockConfig` → `CleartextFhevmConfig` in import |
| `index.ts` (class body) | `cleartext-fhevm-instance.ts` | Full rewrite to implement `RelayerSDK`; see §2.6 |
| _(new)_ | `index.ts` | Barrel exports |

### SDK interface files (read-only references)

- `/Users/msaug/zama/token-sdk/packages/sdk/src/relayer/relayer-sdk.ts`
  - Defines `RelayerSDK` interface with 11 methods
- `/Users/msaug/zama/token-sdk/packages/sdk/src/relayer/relayer-sdk.types.ts`
  - Defines `EncryptParams`, `EncryptResult`, `UserDecryptParams`, `PublicDecryptResult`,
    `FHEKeypair`, `EIP712TypedData`, `DelegatedUserDecryptParams`
  - `KmsDelegatedUserDecryptEIP712Type`, `InputProofBytesType`, `ZKProofLike` come from
    `export type * from "@zama-fhe/relayer-sdk/bundle"` re-export at bottom of file

### Build config files (to update)

- `/Users/msaug/zama/token-sdk/packages/sdk/tsup.config.ts` — add `"cleartext/index"` entry
- `/Users/msaug/zama/token-sdk/packages/sdk/package.json` — add `"./cleartext"` to `"exports"`

### Test config

- `/Users/msaug/zama/token-sdk/vitest.config.ts`:
  - `include: ["packages/**/*.test.{ts,tsx}"]` — the new tests in `packages/sdk/src/relayer/cleartext/__tests__/` are automatically picked up
  - `exclude: ["**/integration.test.ts"]` — integration tests excluded, staying in playwright
  - Alias: `"@zama-fhe/sdk/(.+)" → "./packages/sdk/src/$1"` — so `@zama-fhe/sdk/cleartext` resolves to `packages/sdk/src/cleartext` (which means tests can import from `../` path)

---

## RelayerSDK Interface — Method Mapping

```typescript
// relayer-sdk.ts defines:
interface RelayerSDK {
  generateKeypair(): Promise<FHEKeypair>;
  createEIP712(publicKey, contractAddresses, startTimestamp, durationDays?): Promise<EIP712TypedData>;
  encrypt(params: EncryptParams): Promise<EncryptResult>;
  userDecrypt(params: UserDecryptParams): Promise<Record<string, bigint>>;
  publicDecrypt(handles: string[]): Promise<PublicDecryptResult>;
  createDelegatedUserDecryptEIP712(...): Promise<KmsDelegatedUserDecryptEIP712Type>;
  delegatedUserDecrypt(params): Promise<Record<string, bigint>>;
  requestZKProofVerification(zkProof): Promise<InputProofBytesType>;
  getPublicKey(): Promise<{publicKeyId: string; publicKey: Uint8Array} | null>;
  getPublicParams(bits): Promise<{publicParams: Uint8Array; publicParamsId: string} | null>;
  terminate(): void;
}
```

| Method | Implementation |
|---|---|
| `generateKeypair()` | Async wrapper: `Promise.resolve({ publicKey: hexlify(randomBytes(32)), privateKey: hexlify(randomBytes(32)) })` |
| `createEIP712(pk, addrs, ts, days?)` | Async wrapper of current `createEIP712` in `CleartextMockFhevm` |
| `encrypt(params)` | Create `CleartextEncryptedInput`, call `add64(v)` for each value (TODO: assumes Uint64) |
| `userDecrypt(params)` | Map `params.handles` + `params.contractAddress` → `handleContractPairs`, then ACL + executor eth_calls |
| `publicDecrypt(handles)` | Unchanged from current impl (already matches signature) |
| `createDelegatedUserDecryptEIP712` | `throw new Error("Not implemented in cleartext mode")` |
| `delegatedUserDecrypt` | `throw new Error("Not implemented in cleartext mode")` |
| `requestZKProofVerification` | `throw new Error("Not implemented in cleartext mode")` |
| `getPublicKey()` | `return null` |
| `getPublicParams(bits)` | `return null` |
| `terminate()` | No-op |

---

## Detailed File Contents

### `types.ts` (new)
```typescript
// Same as current types.ts but rename CleartextMockConfig → CleartextFhevmConfig
export interface CleartextFhevmConfig {
  chainId: bigint;
  gatewayChainId: number;
  aclAddress: string;
  executorProxyAddress: string;
  inputVerifierContractAddress: string;
  kmsContractAddress: string;
  verifyingContractAddressInputVerification: string;
  verifyingContractAddressDecryption: string;
}
```

### `constants.ts` (new)
Remove the `FHEVM_ADDRESSES` export (which imported from hardhat/deployments.json).
Keep everything else verbatim:
- `VERIFYING_CONTRACTS`
- `GATEWAY_CHAIN_ID`
- `MOCK_INPUT_SIGNER_PK`
- `MOCK_KMS_SIGNER_PK`
- `enum FheType { Bool=0, Uint4=1, Uint8=2, Uint16=3, Uint32=4, Uint64=5, Uint128=6, Uint160=7, Uint256=8 }`
- `FHE_BIT_WIDTHS: Record<FheType, number>`
- `HANDLE_VERSION = 0`
- `PREHANDLE_MASK = 0xffffffffffffffffffffffffffffffffffffffffff0000000000000000000000n`

### `handle.ts` (verbatim copy)
- `computeMockCiphertext(fheType, cleartext, random32)` → hex string
- `computeInputHandle(mockCiphertext, index, fheType, aclAddress, chainId)` → hex string

### `eip712.ts` (verbatim copy)
- `INPUT_VERIFICATION_EIP712` — CiphertextVerification typed data
- `KMS_DECRYPTION_EIP712` — PublicDecryptVerification typed data
- `USER_DECRYPT_EIP712` — UserDecryptRequestVerification typed data

### `encrypted-input.ts` (update import only)
- Change `import type { CleartextMockConfig } from "./types"` → `import type { CleartextFhevmConfig } from "./types"`
- Change constructor parameter type `CleartextMockConfig` → `CleartextFhevmConfig`
- All methods unchanged

### `cleartext-fhevm-instance.ts` (new)
```typescript
import { ethers } from "ethers";
import type { RelayerSDK } from "../relayer-sdk";
import type {
  EncryptParams, EncryptResult, UserDecryptParams, PublicDecryptResult,
  FHEKeypair, EIP712TypedData, DelegatedUserDecryptParams,
  KmsDelegatedUserDecryptEIP712Type, InputProofBytesType, ZKProofLike,
} from "../relayer-sdk.types";
import { CleartextEncryptedInput } from "./encrypted-input";
import { MOCK_KMS_SIGNER_PK } from "./constants";
import { KMS_DECRYPTION_EIP712, USER_DECRYPT_EIP712 } from "./eip712";
import type { CleartextFhevmConfig } from "./types";

// ABIs (currently defined in index.ts of cleartext-mock — move to this file)
const ACL_ABI = [
  "function persistAllowed(bytes32 handle, address account) view returns (bool)",
  "function isAllowedForDecryption(bytes32 handle) view returns (bool)",
] as const;
const EXECUTOR_ABI = ["function plaintexts(bytes32 handle) view returns (uint256)"] as const;

type RpcLike = { send(method: string, params: unknown[]): Promise<unknown> };

export class CleartextFhevmInstance implements RelayerSDK {
  readonly #provider: RpcLike;
  readonly #config: CleartextFhevmConfig;

  constructor(provider: RpcLike, config: CleartextFhevmConfig) { ... }

  // Methods per table above
}
```

**`userDecrypt` adaptation from current positional args to `UserDecryptParams`:**
```typescript
async userDecrypt(params: UserDecryptParams): Promise<Record<string, bigint>> {
  const handleContractPairs = params.handles.map((handle) => ({
    handle,
    contractAddress: params.contractAddress,
  }));
  const normalizedSignerAddress = ethers.getAddress(params.signerAddress);
  // then same logic as current CleartextMockFhevm.userDecrypt
}
```

### `index.ts` (new barrel)
```typescript
export { CleartextFhevmInstance } from "./cleartext-fhevm-instance";
export { CleartextEncryptedInput } from "./encrypted-input";
export type { CleartextFhevmConfig } from "./types";
export { FheType, FHE_BIT_WIDTHS } from "./constants";
// Also export ABIs if needed for tests
export { ACL_ABI, EXECUTOR_ABI } from "./cleartext-fhevm-instance";
```

---

## Build Config Changes

### `tsup.config.ts`
Add to the first config object's `entry`:
```typescript
"cleartext/index": "src/relayer/cleartext/index.ts",
```

### `package.json`
Add to `"exports"`:
```json
"./cleartext": {
  "types": "./dist/cleartext/index.d.ts",
  "import": "./dist/cleartext/index.js"
}
```

---

## Test Migration

### Unit tests — move to `packages/sdk/src/relayer/cleartext/__tests__/`

| Test file | Status | Import path changes |
|---|---|---|
| `handle.test.ts` | Move verbatim | `../constants` → `../constants`, `../handle` → `../handle` (paths stay relative) |
| `encrypted-input.test.ts` | Move verbatim | `../encrypted-input` → same; `./fixtures` → same |
| `eip712.test.ts` | Move verbatim | `../eip712` → same |
| `index.test.ts` | Move with significant rewrites | See below |
| `fixtures.ts` | Move with changes | Remove FHEVM_ADDRESSES from import; provide fixed addresses |

### `fixtures.ts` update
The fixture currently imports `FHEVM_ADDRESSES` from `../constants` (which is being removed).
Must change to provide addresses directly or from a test constant:
```typescript
// Old
import { FHEVM_ADDRESSES, GATEWAY_CHAIN_ID, VERIFYING_CONTRACTS } from "../constants";
export const CLEAR_TEXT_MOCK_CONFIG: CleartextMockConfig = {
  aclAddress: FHEVM_ADDRESSES.acl,
  executorProxyAddress: FHEVM_ADDRESSES.executor,
  ...
};
```
```typescript
// New — must provide addresses some other way
// Either hardcode them for tests, or import from a test-only fixture
```

### `index.test.ts` rewrites required
The current test has several issues that require significant adaptation:
1. **`CLEARTEXT_EXECUTOR_BYTECODE` import** — `import { CLEARTEXT_EXECUTOR_BYTECODE } from "../bytecode"` —
   this file **does not exist** in the current cleartext-mock directory. The test for `create` patches
   the implementation will need to be removed (patching is no longer CleartextFhevmInstance's responsibility).
2. **Constructor change** — `CleartextMockFhevm.create(provider, config)` (async static factory)
   becomes `new CleartextFhevmInstance(provider, config)` (sync constructor). Tests using `await create()`
   need updating.
3. **`createEncryptedInput` removed** — replaced by `encrypt(params: EncryptParams)`. Tests testing
   `createEncryptedInput` need to be rewritten to use `encrypt()`.
4. **Positional args → object params** — `userDecrypt(pairs, pk, pubk, sig, addrs, signer, ts, days)`
   becomes `userDecrypt({ handles, contractAddress, ... })`.
5. **ACL_ABI / EXECUTOR_ABI export** — currently exported from `../index`; in new design exported from
   `../cleartext-fhevm-instance` or `../index`.
6. **`abiEncodedClearValues` decode assertion** — Test decodes as `uint256[]` but implementation does
   raw 32-byte concatenation. These are incompatible formats. The assertion will fail unless the
   implementation is changed to use `ethers.AbiCoder.defaultAbiCoder().encode(["uint256[]"], [values])`.

### Integration tests — stay in playwright
- `integration.test.ts` — requires running Hardhat node, stays in playwright
- `globalSetup.ts` — Hardhat node startup, stays in playwright
- `vitest.integration.config.ts` — stays in playwright

---

## Current vs New API Comparison

### Playwright `fhevm.ts` (consumer — for reference only, unit §4 not this unit)

Current usage pattern:
```typescript
// Old fhevm.ts
const fhevm = await CleartextMockFhevm.create(provider, config);
const kp = fhevm.generateKeypair();  // sync
const eip = fhevm.createEIP712(...);  // sync
const input = fhevm.createEncryptedInput(addr, user);
input.add64(value);
const encrypted = await input.encrypt();
await fhevm.userDecrypt(pairs, pk, pubk, sig, addrs, signer, ts, days);
await fhevm.publicDecrypt(handles);
```

New usage pattern (via RelayerSDK):
```typescript
// New fhevm.ts
const fhevm = new CleartextFhevmInstance(provider, config);  // sync ctor
const kp = await fhevm.generateKeypair();  // async
const eip = await fhevm.createEIP712(...);  // async
const encrypted = await fhevm.encrypt({ values, contractAddress, userAddress });
await fhevm.userDecrypt({ handles, contractAddress, signerAddress, ... });
await fhevm.publicDecrypt(handles);
```

---

## Key Implementation Details

### `CleartextEncryptedInput.encrypt()` — ciphertextBlob vs single mockCiphertext
In `encrypted-input.ts`, when multiple values are encrypted:
1. Each value gets its own `mockCiphertext = computeMockCiphertext(fheType, value, random32)`
2. `ciphertextBlob = keccak256(concat(all_mockCiphertexts))`
3. Each handle uses `computeInputHandle(ciphertextBlob, index, fheType, ...)`

The `handle.test.ts` tests `computeInputHandle` with a single `mockCiphertext` directly
(single-value case where `ciphertextBlob = keccak256(concat([mockCiphertext]))`, different from
passing `mockCiphertext` directly).

### Private keys stored as constants (no ML-KEM)
- `MOCK_INPUT_SIGNER_PK = "0x7ec8ada..."` — used to sign input proofs
- `MOCK_KMS_SIGNER_PK = "0x388b768..."` — used to sign KMS decryption proofs

### `RpcLike` type
The current `CleartextMockFhevm` uses `type RpcLike = Pick<ethers.JsonRpcProvider, "send">`.
The new `CleartextFhevmInstance` RFC specifies `type RpcLike = { send(method: string, params: unknown[]): Promise<unknown> }`.
These are equivalent in practice (ethers `JsonRpcProvider.send` matches this signature).

### ACL_ABI and EXECUTOR_ABI
Currently exported from `cleartext-mock/index.ts`. In the new design they need to be accessible
for tests. Options:
1. Export from `cleartext-fhevm-instance.ts` and re-export from `index.ts`
2. Define in a separate `abi.ts` file

### Vitest alias for `@zama-fhe/sdk/cleartext`
The root `vitest.config.ts` has:
```typescript
{ find: /^@zama-fhe\/sdk\/(.+)/, replacement: path.resolve(__dirname, "./packages/sdk/src/$1") }
```
So `@zama-fhe/sdk/cleartext` resolves to `packages/sdk/src/cleartext` during tests.
The `cleartext/index.ts` barrel must be at `packages/sdk/src/relayer/cleartext/index.ts`.
⚠️ This means the alias resolves to `src/cleartext` NOT `src/relayer/cleartext`.
The implementer must either:
- Add a re-export at `packages/sdk/src/cleartext/index.ts`, OR
- Update the vitest alias (preferred if acceptable)

Actually re-reading: the alias maps `@zama-fhe/sdk/cleartext` → `packages/sdk/src/cleartext`.
The actual file is at `packages/sdk/src/relayer/cleartext/index.ts`.
This means the test-time resolution will fail unless there's a file at `src/cleartext/index.ts`.
The tsup entry points to `src/relayer/cleartext/index.ts` which is correct for build.
For tests, either add `src/cleartext/index.ts` re-exporting from `../relayer/cleartext/index.ts`,
OR just use relative imports in the test files (no `@zama-fhe/sdk/cleartext` import in tests).

---

## Open Questions

1. **`abiEncodedClearValues` format**: Current implementation concatenates raw 32-byte values,
   but test uses `ethers.AbiCoder.defaultAbiCoder().decode(["uint256[]"], ...)`. These are
   incompatible. Should the implementation be changed to use proper ABI encoding? Or should
   the test assertion be fixed?

2. **`CLEARTEXT_EXECUTOR_BYTECODE`**: `index.test.ts` imports this from `"../bytecode"` which
   doesn't exist. The test that uses it (`create patches the implementation code`) tests behavior
   (hardhat_setCode patching) that no longer exists in `CleartextFhevmInstance`. This test must
   be removed or completely rewritten.

3. **`eip712.test.ts` EIP-712 spec mismatch**: The test checks for `blobHash` and `handlesList`
   fields in `INPUT_VERIFICATION_EIP712.types.CiphertextVerification`, but the current
   implementation has `ctHandles`, `userAddress`, `contractAddress`, `contractChainId`, `extraData`.
   The test assertion will fail on the current code. Which version is correct?

4. **Vitest alias for `@zama-fhe/sdk/cleartext`**: Resolves to `src/cleartext` not
   `src/relayer/cleartext`. Tests importing via this alias need a shim or use relative paths.

5. **`FHEVM_ADDRESSES` in `fixtures.ts`**: Test fixtures use deterministic Hardhat addresses
   from `deployments.json`. Once `FHEVM_ADDRESSES` is removed from `constants.ts`, these need
   to be provided another way (hardcoded test fixtures or from a separate test-only file).

6. **ACL_ABI / EXECUTOR_ABI export**: These are used in tests. Should they be exported from
   `cleartext-fhevm-instance.ts`, `index.ts`, or a separate file?

---

## Directory Structure (Target)

```
packages/sdk/src/relayer/cleartext/
├── index.ts                        # Barrel: CleartextFhevmInstance, CleartextEncryptedInput, CleartextFhevmConfig, FheType, FHE_BIT_WIDTHS
├── cleartext-fhevm-instance.ts     # Main class implementing RelayerSDK
├── encrypted-input.ts              # CleartextEncryptedInput builder
├── eip712.ts                       # EIP-712 type definitions (3 types)
├── handle.ts                       # Handle computation
├── constants.ts                    # FheType, FHE_BIT_WIDTHS, keys, VERIFYING_CONTRACTS
├── types.ts                        # CleartextFhevmConfig interface
└── __tests__/
    ├── fixtures.ts                 # Test config (updated — no FHEVM_ADDRESSES)
    ├── handle.test.ts              # Handle computation tests
    ├── encrypted-input.test.ts     # EncryptedInput builder tests
    ├── eip712.test.ts              # EIP-712 tests (may need fixing)
    └── index.test.ts               # CleartextFhevmInstance tests (major rewrite)
```

---

## Dependencies

No new dependencies needed:
- `ethers` is already an optional peer dep in `packages/sdk/package.json`
- No new native addons
- No `@fhevm/mock-utils` or `@zama-fhe/relayer-sdk` references needed

---

## Risks

| Risk | Details |
|---|---|
| `encrypt()` Uint64 assumption | All values treated as `Uint64`. A TODO note must be left. Works for current E2E tests. |
| `index.test.ts` has broken imports | `../bytecode` doesn't exist. Test needs major rewrite, not just class rename. |
| EIP-712 field mismatch in `eip712.test.ts` | Test checks for `blobHash`/`handlesList` but impl has `ctHandles`/`contractChainId`/`extraData`. |
| Vitest alias path mismatch | `@zama-fhe/sdk/cleartext` resolves to `src/cleartext` but files are in `src/relayer/cleartext`. |
| `abiEncodedClearValues` format | Test uses ABI decode, impl does raw concat. Incompatible formats. |
| `fixtures.ts` FHEVM_ADDRESSES | Must provide concrete addresses for test fixtures without importing from deployments.json. |
