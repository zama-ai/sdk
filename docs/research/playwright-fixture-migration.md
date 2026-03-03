# Research: Playwright Fixture Migration to SDK Cleartext

**Unit**: `playwright-fixture-migration`
**Date**: 2026-03-03

---

## Summary

Migrate `packages/playwright/fixtures/fhevm.ts` from the local `cleartext-mock/` implementation
to the first-class `@zama-fhe/sdk/cleartext` entrypoint, then delete
`packages/playwright/fixtures/cleartext-mock/` entirely.

**Key finding**: The SDK cleartext implementation is **already complete** —
`packages/sdk/src/relayer/cleartext/` exists with all files, exported via
`@zama-fhe/sdk/cleartext`. The SDK's `tsup.config.ts` and `package.json` already
register the `cleartext` entrypoint. Only the Playwright fixture and its local mock
directory need to be updated.

---

## Files Read

| File | Purpose |
|------|---------|
| `/Users/msaug/zama/token-sdk/CLEARTEXT_MOCK_PLAN.md` | RFC spec (§4, §5, §7) |
| `packages/playwright/fixtures/fhevm.ts` | **Target file to migrate** |
| `packages/playwright/fixtures/cleartext-mock/index.ts` | Old `CleartextMockFhevm` class |
| `packages/playwright/fixtures/cleartext-mock/constants.ts` | Old constants (FHEVM_ADDRESSES, etc.) |
| `packages/playwright/fixtures/cleartext-mock/types.ts` | Old `CleartextMockConfig` type |
| `packages/playwright/fixtures/cleartext-mock/encrypted-input.ts` | Old builder pattern |
| `packages/playwright/fixtures/cleartext-mock/eip712.ts` | EIP-712 definitions |
| `packages/playwright/fixtures/cleartext-mock/handle.ts` | Handle computation |
| `packages/playwright/fixtures/cleartext-mock/__tests__/index.test.ts` | Old tests |
| `packages/playwright/fixtures/cleartext-mock/__tests__/fixtures.ts` | Old test config |
| `packages/playwright/package.json` | Playwright deps (needs `@zama-fhe/sdk` added) |
| `packages/sdk/src/relayer/cleartext/cleartext-fhevm-instance.ts` | **New SDK class** |
| `packages/sdk/src/relayer/cleartext/index.ts` | SDK cleartext barrel exports |
| `packages/sdk/src/relayer/cleartext/constants.ts` | SDK constants (NO FHEVM_ADDRESSES) |
| `packages/sdk/src/relayer/cleartext/types.ts` | `CleartextFhevmConfig` interface |
| `packages/sdk/src/relayer/relayer-sdk.ts` | `RelayerSDK` interface |
| `packages/sdk/src/relayer/relayer-sdk.types.ts` | `EncryptParams`, `UserDecryptParams`, etc. |
| `packages/sdk/tsup.config.ts` | Already has `cleartext/index` entry |
| `packages/sdk/package.json` | Already exports `./cleartext` |
| `packages/sdk/src/relayer/cleartext/__tests__/cleartext-fhevm-instance.test.ts` | SDK tests |
| `packages/sdk/src/relayer/cleartext/__tests__/fixtures.ts` | SDK test fixtures |

---

## RFC Key Points (§4, §5, §7)

### §4 — Playwright Fixture Updates

**Target file**: `packages/playwright/fixtures/fhevm.ts`

| Before | After |
|--------|-------|
| `import { CleartextMockFhevm } from "./cleartext-mock"` | `import { CleartextFhevmInstance } from "@zama-fhe/sdk/cleartext"` |
| `import { FHEVM_ADDRESSES, ... } from "./cleartext-mock/constants"` | Inline addresses (no SDK export for deployment addresses) |
| `CleartextMockFhevm.create(provider, config)` (async factory) | `new CleartextFhevmInstance(provider, config)` (sync constructor) |
| `fhevm.createEncryptedInput(addr, user).add64(v).encrypt()` | `fhevm.encrypt({ values, contractAddress, userAddress })` |
| `fhevm.userDecrypt(pairs, pk, pubk, sig, addrs, signer, ts, days)` (positional) | `fhevm.userDecrypt({ handles, contractAddress, signerAddress, ... })` (single object) |
| `fhevm.generateKeypair()` (sync) | `await fhevm.generateKeypair()` (async) |
| `fhevm.createEIP712(...)` (sync) | `await fhevm.createEIP712(...)` (async) |

**What stays the same**: All 5 route handlers + CDN intercept pattern, snapshot/revert isolation.

### §5 — Test Migration

Unit tests move from `packages/playwright/fixtures/cleartext-mock/__tests__/` to
`packages/sdk/src/relayer/cleartext/__tests__/` — **already done** (the SDK `__tests__/`
directory already has `cleartext-fhevm-instance.test.ts`, `eip712.test.ts`,
`encrypted-input.test.ts`, `handle.test.ts`, `fixtures.ts`).

### §7 — Migration Checklist (Playwright-specific steps)

Steps already complete in SDK:
- ✓ `packages/sdk/src/relayer/cleartext/` directory created with all files
- ✓ `tsup.config.ts` has `cleartext/index` entry
- ✓ `packages/sdk/package.json` has `./cleartext` export

Remaining steps for this unit:
1. Update `packages/playwright/fixtures/fhevm.ts` (see diff below)
2. Add `@zama-fhe/sdk: "workspace:*"` to `packages/playwright/package.json`
3. Delete `packages/playwright/fixtures/cleartext-mock/`

---

## Existing Implementation Analysis

### Current `fhevm.ts` (before migration)

```typescript
// Imports
import { CleartextMockFhevm } from "./cleartext-mock";
import { FHEVM_ADDRESSES, GATEWAY_CHAIN_ID, VERIFYING_CONTRACTS } from "./cleartext-mock/constants";

// Factory (async)
const fhevm = await CleartextMockFhevm.create(provider, {
  chainId: BigInt(hardhat.id),
  gatewayChainId: GATEWAY_CHAIN_ID,
  aclAddress: FHEVM_ADDRESSES.acl,
  // ...
});

// /generateKeypair — sync: fhevm.generateKeypair()
// /createEIP712 — sync: fhevm.createEIP712(...)
// /encrypt — builder: fhevm.createEncryptedInput(addr, user).add64(v); input.encrypt()
// /userDecrypt — positional: fhevm.userDecrypt(pairs, pk, pubk, sig, addrs, signer, ts, days)
// /publicDecrypt — OK: fhevm.publicDecrypt(body.handles)
```

### New `CleartextFhevmInstance` (`@zama-fhe/sdk/cleartext`)

```typescript
// Sync constructor
const fhevm = new CleartextFhevmInstance(provider, config);

// All methods are async (implements RelayerSDK):
// - generateKeypair(): Promise<FHEKeypair>
// - createEIP712(pk, addrs, ts, days?): Promise<EIP712TypedData>
// - encrypt(params: EncryptParams): Promise<EncryptResult>
// - userDecrypt(params: UserDecryptParams): Promise<Record<string, bigint>>
// - publicDecrypt(handles: string[]): Promise<PublicDecryptResult>
```

### `EncryptParams` (from `relayer-sdk.types.ts`)

```typescript
interface EncryptParams {
  values: bigint[];
  contractAddress: Address;
  userAddress: Address;
}
```

### `UserDecryptParams` (from `relayer-sdk.types.ts`)

```typescript
interface UserDecryptParams {
  handles: string[];
  contractAddress: Address;
  signedContractAddresses: Address[];
  privateKey: string;
  publicKey: string;
  signature: string;
  signerAddress: Address;
  startTimestamp: number;
  durationDays: number;
}
```

### SDK cleartext `constants.ts` — What it exports (vs. what it doesn't)

**Exported**: `VERIFYING_CONTRACTS`, `GATEWAY_CHAIN_ID`, `MOCK_INPUT_SIGNER_PK`,
`MOCK_KMS_SIGNER_PK`, `FheType`, `FHE_BIT_WIDTHS`, `HANDLE_VERSION`, `PREHANDLE_MASK`

**NOT exported**: FHEVM deployment addresses (acl, executor, inputVerifier, kmsVerifier).
These are network-specific and must be passed via `CleartextFhevmConfig`.

### FHEVM Deployment Addresses (hardcoded — from cleartext-mock/constants.ts)

```typescript
const FHEVM_ADDRESSES = {
  acl: "0x50157CFfD6bBFA2DECe204a89ec419c23ef5755D",
  executor: "0xe3a9105a3a932253A70F126eb1E3b589C643dD24",
  inputVerifier: "0x36772142b74871f255CbD7A3e89B401d3e45825f",
  kmsVerifier: "0x901F8942346f7AB3a01F6D7613119Bca447Bb030",
};
```

No `deployments.json` file exists in the repo. These addresses must be inlined in
`fhevm.ts` directly (deterministic Hardhat deployment addresses). They match what
`packages/sdk/src/relayer/cleartext/__tests__/fixtures.ts` calls `TEST_FHEVM_ADDRESSES`.

---

## Precise Migration Diff for `fhevm.ts`

### Imports section

```typescript
// BEFORE:
import { CleartextMockFhevm } from "./cleartext-mock";
import { FHEVM_ADDRESSES, GATEWAY_CHAIN_ID, VERIFYING_CONTRACTS } from "./cleartext-mock/constants";

// AFTER:
import { CleartextFhevmInstance, GATEWAY_CHAIN_ID, VERIFYING_CONTRACTS } from "@zama-fhe/sdk/cleartext";

// Add local constant for deployment addresses (no deployments.json exists):
const FHEVM_ADDRESSES = {
  acl: "0x50157CFfD6bBFA2DECe204a89ec419c23ef5755D",
  executor: "0xe3a9105a3a932253A70F126eb1E3b589C643dD24",
  inputVerifier: "0x36772142b74871f255CbD7A3e89B401d3e45825f",
  kmsVerifier: "0x901F8942346f7AB3a01F6D7613119Bca447Bb030",
} as const;
```

### Factory → Constructor

```typescript
// BEFORE:
async function createMockFhevmInstance(rpcUrl: string) {
  const provider = new JsonRpcProvider(rpcUrl);
  const fhevm = await CleartextMockFhevm.create(provider, { ... });
  return fhevm;
}

// AFTER:
function createMockFhevmInstance(rpcUrl: string) {
  const provider = new JsonRpcProvider(rpcUrl);
  return new CleartextFhevmInstance(provider, {
    chainId: BigInt(hardhat.id),
    gatewayChainId: GATEWAY_CHAIN_ID,
    aclAddress: FHEVM_ADDRESSES.acl,
    executorProxyAddress: FHEVM_ADDRESSES.executor,
    inputVerifierContractAddress: FHEVM_ADDRESSES.inputVerifier,
    kmsContractAddress: FHEVM_ADDRESSES.kmsVerifier,
    verifyingContractAddressInputVerification: VERIFYING_CONTRACTS.inputVerification,
    verifyingContractAddressDecryption: VERIFYING_CONTRACTS.decryption,
  });
}
```

### `mockRelayerSdk` function — async changes

```typescript
// BEFORE:
export async function mockRelayerSdk(page: Page, baseURL: string) {
  const fhevm = await createMockFhevmInstance(rpcUrl);  // was async

// AFTER:
export async function mockRelayerSdk(page: Page, baseURL: string) {
  const fhevm = createMockFhevmInstance(rpcUrl);  // now sync
```

### `/generateKeypair` route

```typescript
// BEFORE:
const result = fhevm.generateKeypair();  // sync

// AFTER:
const result = await fhevm.generateKeypair();  // async
```

### `/createEIP712` route

```typescript
// BEFORE:
const result = fhevm.createEIP712(body.publicKey, body.contractAddresses, body.startTimestamp, body.durationDays);

// AFTER:
const result = await fhevm.createEIP712(body.publicKey, body.contractAddresses, body.startTimestamp, body.durationDays);
```

### `/encrypt` route

```typescript
// BEFORE:
const input = fhevm.createEncryptedInput(body.contractAddress, body.userAddress);
for (const value of body.values) {
  input.add64(BigInt(value));
}
const encrypted = await input.encrypt();
await route.fulfill({
  ...
  body: JSON.stringify({
    handles: encrypted.handles.map((h: Uint8Array) => Array.from(h)),
    inputProof: Array.from(encrypted.inputProof),
  }),
});

// AFTER:
const encrypted = await fhevm.encrypt({
  values: body.values.map((v: string | number | bigint) => BigInt(v)),
  contractAddress: body.contractAddress,
  userAddress: body.userAddress,
});
await route.fulfill({
  ...
  body: JSON.stringify({
    handles: encrypted.handles.map((h: Uint8Array) => Array.from(h)),
    inputProof: Array.from(encrypted.inputProof),
  }),
});
```

### `/userDecrypt` route

```typescript
// BEFORE:
const handleContractPairs = body.handles.map((handle: string) => ({
  handle,
  contractAddress: body.contractAddress,
}));
const result = await fhevm.userDecrypt(
  handleContractPairs,
  body.privateKey,
  body.publicKey,
  body.signature,
  body.signedContractAddresses,
  body.signerAddress,
  body.startTimestamp,
  body.durationDays,
);

// AFTER:
const result = await fhevm.userDecrypt({
  handles: body.handles,
  contractAddress: body.contractAddress,
  signedContractAddresses: body.signedContractAddresses,
  privateKey: body.privateKey,
  publicKey: body.publicKey,
  signature: body.signature,
  signerAddress: body.signerAddress,
  startTimestamp: body.startTimestamp,
  durationDays: body.durationDays,
});
```

### `/publicDecrypt` route

No changes needed — `fhevm.publicDecrypt(body.handles)` signature is the same.

---

## Package.json Changes

### `packages/playwright/package.json`

```diff
  "dependencies": {
    "@playwright/test": "^1.58.2",
+   "@zama-fhe/sdk": "workspace:*",
    "ethers": "^6.16.0",
    "viem": "^2.46.3"
  },
```

---

## Directory Deletion

After `fhevm.ts` is updated, delete the entire `packages/playwright/fixtures/cleartext-mock/` directory:
- `index.ts` — `CleartextMockFhevm` class (moved to SDK)
- `constants.ts` — constants (moved to SDK, addresses hardcoded in fixture)
- `types.ts` — `CleartextMockConfig` type (replaced by `CleartextFhevmConfig`)
- `encrypted-input.ts` — builder (moved to SDK)
- `eip712.ts` — EIP-712 defs (moved to SDK)
- `handle.ts` — handle computation (moved to SDK)
- `__tests__/` — unit tests (moved to SDK's `__tests__/`)

---

## Open Questions

1. **`deployments.json`** — The RFC mentions reading from `hardhat/deployments.json`, but this file
   doesn't exist. The addresses from `cleartext-mock/constants.ts` are deterministic and match
   `TEST_FHEVM_ADDRESSES` in the SDK tests. The safe approach is to inline them directly in `fhevm.ts`.
   Should they be read dynamically from a file that gets generated at Hardhat startup?

2. **`@zama-fhe/sdk` peer vs. direct dep in playwright** — Should it be in `dependencies` or
   `devDependencies` in `packages/playwright/package.json`? Given it's a workspace package
   used at runtime by the fixture, `dependencies` seems correct.

3. **`FHEVM_ADDRESSES` not exported from SDK** — The SDK's `cleartext/constants.ts` intentionally
   doesn't export FHEVM deployment addresses (they're network-specific). The fixture needs
   to source them somewhere. Confirmed: inline them directly in `fhevm.ts` for now.
