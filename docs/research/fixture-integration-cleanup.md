# Research: fixture-integration-cleanup

**Unit**: fixture-integration-cleanup
**Title**: Playwright Fixture Integration and Dependency Cleanup
**RFC Sections**: §3 (Playwright Fixture Updates), §4 (Dependency Changes)

---

## Objective

Replace `MockFhevmInstance` from `@fhevm/mock-utils` with the new `CleartextMockFhevm` class in
`packages/playwright/fixtures/fhevm.ts`, remove all coprocessor-sync workarounds (retry loops,
block-mining, mutex), and remove the `@fhevm/mock-utils` npm dependency.

---

## Files to Modify

### 1. `packages/playwright/fixtures/fhevm.ts` (primary target)

**Current state** (✓ VERIFIED by reading file):

| Line(s) | What's there |
|---------|-------------|
| 1 | `import { MockFhevmInstance } from "@fhevm/mock-utils"` |
| 11–32 | `createMockFhevmInstance(chainId, rpcUrl)` — 4-argument `MockFhevmInstance.create(provider, provider, config, properties)` |
| 42 | `let decryptLock: Promise<void> = Promise.resolve()` — mutex for serializing decrypts |
| 88–179 | `/userDecrypt` handler with retry loop (mutex acquire, `MAX_ACL_RETRIES=2`, `hardhat_mine` calls) |
| 118–163 | Block-mining retry block inside `/userDecrypt` |
| 181–256 | `/publicDecrypt` handler with retry loop (mutex acquire, `MAX_RETRIES=10`, `hardhat_mine` calls) |
| 195–237 | Block-mining retry block inside `/publicDecrypt` |

**Changes required** (✓ VERIFIED against RFC §3):

1. **Replace import** (line 1):
   ```ts
   // BEFORE
   import { MockFhevmInstance } from "@fhevm/mock-utils";
   // AFTER
   import { CleartextMockFhevm } from "./cleartext-mock";
   ```

2. **Replace factory function** — `createMockFhevmInstance` (lines 11–32) becomes:
   ```ts
   async function createMockFhevmInstance(rpcUrl: string) {
     const provider = new JsonRpcProvider(rpcUrl);
     const fhevm = await CleartextMockFhevm.create(provider, {
       chainId: BigInt(hardhat.id),
       gatewayChainId: 10_901,
       aclAddress: "0x50157CFfD6bBFA2DECe204a89ec419c23ef5755D",
       executorProxyAddress: "0xe3a9105a3a932253A70F126eb1E3b589C643dD24",
       inputVerifierContractAddress: "0x36772142b74871f255CbD7A3e89B401d3e45825f",
       kmsContractAddress: "0x901F8942346f7AB3a01F6D7613119Bca447Bb030",
       verifyingContractAddressInputVerification: "0x812b06e1CDCE800494b79fFE4f925A504a9A9810",
       verifyingContractAddressDecryption: "0x5ffdaAB0373E62E2ea2944776209aEf29E631A64",
     });
     return fhevm;
   }
   ```
   Alternatively, inline this directly into `mockRelayerSdk` since `createMockFhevmInstance`
   is only called in one place.

   > **⚠ Key difference**: `CleartextMockFhevm.create` takes exactly 2 arguments
   > `(provider, config)`, not 4. No `properties` arg needed.

   > **⚠ Address note**: The old code used `kmsContractAddress: "0xbE0E383937d564D7FF0BC3b46c51f0bF8d5C311A"`.
   > The new `cleartext-mock/constants.ts` has `kmsVerifier: "0x901F8942346f7AB3a01F6D7613119Bca447Bb030"`.
   > Use the constants from `./cleartext-mock/constants.ts` for consistency.

   > **⚠ chainId type**: `CleartextMockConfig.chainId` is `bigint`, not `number`.
   > Must wrap: `BigInt(hardhat.id)`.

3. **Remove `decryptLock` mutex** — delete line 42 and all mutex-acquire patterns in route handlers:
   ```ts
   // DELETE these patterns from /userDecrypt and /publicDecrypt:
   let resolve: () => void;
   const prev = decryptLock;
   decryptLock = new Promise<void>((r) => { resolve = r; });
   await prev;
   // ... and the finally { resolve!(); }
   ```

4. **Simplify `/userDecrypt` route handler** (lines 88–179) — remove the entire retry loop.
   The handler body becomes:
   ```ts
   await page.route(`${baseURL}/userDecrypt`, async (route) => {
     const body = route.request().postDataJSON();
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
     const serialized: Record<string, string> = {};
     for (const [key, value] of Object.entries(result)) {
       serialized[key] = String(value);
     }
     await route.fulfill({
       status: 200,
       contentType: "application/json",
       body: JSON.stringify(serialized),
     });
   });
   ```

5. **Simplify `/publicDecrypt` route handler** (lines 181–256) — remove retry loop:
   ```ts
   await page.route(`${baseURL}/publicDecrypt`, async (route) => {
     const body = route.request().postDataJSON();
     const result = await fhevm.publicDecrypt(body.handles);
     const clearValues: Record<string, string> = {};
     for (const [key, value] of Object.entries(result.clearValues)) {
       clearValues[key] = String(value);
     }
     await route.fulfill({
       status: 200,
       contentType: "application/json",
       body: JSON.stringify({
         clearValues,
         abiEncodedClearValues: result.abiEncodedClearValues,
         decryptionProof: result.decryptionProof,
       }),
     });
   });
   ```

6. **Route handlers that stay the same** (no changes needed):
   - `/generateKeypair` — already a simple direct call, no retry
   - `/createEIP712` — already a simple direct call, no retry
   - `/encrypt` — already a simple `await input.encrypt()`, no retry
   - CDN intercept for `relayer-sdk.js` — unchanged

7. **`provider` variable**: Still needed for `CleartextMockFhevm.create(provider, config)`.
   The `provider.send("hardhat_mine", ...)` calls inside the retry blocks are REMOVED,
   but the `provider` itself is still used by `CleartextMockFhevm.create`.

---

### 2. `packages/playwright/fixtures/test.ts` (minor change)

**Current state** (✓ VERIFIED by reading file):

Lines 123–132:
```ts
// Wait for in-flight route handlers (userDecrypt/publicDecrypt) to finish
// before reverting — they mine blocks on the Hardhat node, and concurrent
// mining + revert causes chain state to leak between tests.
await page.unrouteAll({ behavior: "wait" });

await viemClient.revert({ id });
// Mine blocks so the chain advances past the Hardhat coprocessor's stale
// BlockLogCursor — evm_revert doesn't reset the coprocessor cursor, so
// without this it skips blocks where new handles are created in later tests.
await viemClient.mine({ blocks: 100 });
```

**Change required**: Remove lines 129–132 (the `mine` call and its comment):
```ts
// DELETE these 4 lines:
// Mine blocks so the chain advances past the Hardhat coprocessor's stale
// BlockLogCursor — evm_revert doesn't reset the coprocessor cursor, so
// without this it skips blocks where new handles are created in later tests.
await viemClient.mine({ blocks: 100 });
```

The `unrouteAll` and `revert` lines STAY (they still make sense for test isolation).
The comment on line 123–125 about "they mine blocks" also needs updating/removal since
route handlers no longer mine blocks.

---

### 3. `packages/playwright/package.json` (dependency removal)

**Current state** (✓ VERIFIED by reading file):
```json
{
  "dependencies": {
    "@fhevm/mock-utils": "0.4.2",
    "@playwright/test": "^1.58.2",
    "ethers": "^6.16.0",
    "viem": "^2.46.3"
  }
}
```

**Change required**: Remove `"@fhevm/mock-utils": "0.4.2"` from `dependencies`.

---

### 4. Root `package.json` (devDependency changes)

**Current state** (✓ VERIFIED by reading file):
```json
{
  "devDependencies": {
    "@fhevm/mock-utils": "0.4.2",
    "@zama-fhe/relayer-sdk": "0.4.1",
    ...
  }
}
```

**RFC requirement**: Remove `@fhevm/mock-utils` (confirmed safe — only used in
`packages/playwright/fixtures/fhevm.ts` which we're updating).

**RFC requirement**: Remove `@zama-fhe/relayer-sdk` ONLY IF not used in non-test source files.

**⚠ CRITICAL FINDING — DO NOT remove `@zama-fhe/relayer-sdk`**:

`@zama-fhe/relayer-sdk` IS imported by non-test production source files (✓ VERIFIED):
- `packages/sdk/src/worker/relayer-sdk.node-worker.ts:6` — `import type { FhevmInstance, FhevmInstanceConfig } from "@zama-fhe/relayer-sdk/node"`
- `packages/sdk/src/worker/relayer-sdk.node-worker.ts:64` — `const nodeSdk = await import("@zama-fhe/relayer-sdk/node")`
- `packages/sdk/src/relayer/relayer-sdk.types.ts:1` — `import type * as SDK from "@zama-fhe/relayer-sdk/bundle"`
- `packages/sdk/src/relayer/relayer-node.ts:1` — `import type { FhevmInstanceConfig } from "@zama-fhe/relayer-sdk/node"`
- It is also listed as `external` in `packages/sdk/tsup.config.ts` and `packages/react-sdk/tsup.config.ts`

This matches the RFC note: "Note: `@zama-fhe/relayer-sdk` may still be needed as a **peer dependency**
of `@zama-fhe/sdk` for production use."

**Decision**: Only remove `@fhevm/mock-utils` from root devDependencies.
**Do NOT remove** `@zama-fhe/relayer-sdk`.

---

## CleartextMockFhevm API Reference

`CleartextMockFhevm` (✓ VERIFIED by reading `cleartext-mock/index.ts`):

```ts
// Factory — 2 arguments (provider, config)
static async create(provider: RpcLike, config: CleartextMockConfig): Promise<CleartextMockFhevm>

// Methods (same signatures as before, fully compatible with route handler usage):
generateKeypair(): { publicKey: string; privateKey: string }
createEIP712(publicKey, contractAddresses, startTimestamp, durationDays): { domain, types, primaryType, message }
createEncryptedInput(contractAddress, userAddress): CleartextEncryptedInput
async userDecrypt(handleContractPairs, _privateKey, _publicKey, _signature, _signedContractAddresses, signerAddress, _startTimestamp, _durationDays): Promise<Record<string, bigint>>
async publicDecrypt(handles: string[]): Promise<{ clearValues, abiEncodedClearValues, decryptionProof }>
```

`CleartextMockConfig` (✓ VERIFIED by reading `cleartext-mock/types.ts`):
```ts
interface CleartextMockConfig {
  chainId: bigint;                              // NOTE: bigint, not number
  gatewayChainId: number;
  aclAddress: string;                           // NOTE: was "aclContractAddress" in old MockFhevmInstance config
  executorProxyAddress: string;                 // NEW field (not in old config)
  inputVerifierContractAddress: string;
  kmsContractAddress: string;
  verifyingContractAddressInputVerification: string;
  verifyingContractAddressDecryption: string;
}
```

Constants from `cleartext-mock/constants.ts` (✓ VERIFIED):
```ts
FHEVM_ADDRESSES.acl      = "0x50157CFfD6bBFA2DECe204a89ec419c23ef5755D"
FHEVM_ADDRESSES.executor = "0xe3a9105a3a932253A70F126eb1E3b589C643dD24"  // executorProxyAddress
FHEVM_ADDRESSES.inputVerifier = "0x36772142b74871f255CbD7A3e89B401d3e45825f"
FHEVM_ADDRESSES.kmsVerifier   = "0x901F8942346f7AB3a01F6D7613119Bca447Bb030"  // differs from old
VERIFYING_CONTRACTS.inputVerification = "0x812b06e1CDCE800494b79fFE4f925A504a9A9810"
VERIFYING_CONTRACTS.decryption        = "0x5ffdaAB0373E62E2ea2944776209aEf29E631A64"
GATEWAY_CHAIN_ID = 10_901
```

---

## Request/Response Format Compatibility

From `relayer-sdk.js` (✓ VERIFIED by reading):

| Endpoint | Request body | Response expected |
|----------|-------------|-------------------|
| `/generateKeypair` | GET (no body) | `{ publicKey, privateKey }` |
| `/createEIP712` | `{ publicKey, contractAddresses, startTimestamp, durationDays }` | EIP-712 typed data object |
| `/encrypt` | `{ values: string[], contractAddress, userAddress }` | `{ handles: number[][], inputProof: number[] }` |
| `/userDecrypt` | `{ handles: string[], contractAddress, signedContractAddresses, privateKey, publicKey, signature, signerAddress, startTimestamp, durationDays }` | `Record<string, string>` (bigints as strings) |
| `/publicDecrypt` | `{ handles: string[] }` (array of handle strings) | `{ clearValues: Record<string,string>, abiEncodedClearValues, decryptionProof }` |

> **NOTE**: The `/publicDecrypt` body sends `handles` as **a plain array of strings** (not `{handle, contractAddress}[]`).
> `CleartextMockFhevm.publicDecrypt(handles: string[])` matches this perfectly.

---

## Retry/Mutex Logic Being Removed

The following complexity is being deleted because it was only needed to work around the
off-chain coprocessor cursor synchronization issues in `@fhevm/mock-utils`. With
`CleartextMockFhevm`, cleartexts are available immediately after tx confirmation via
on-chain state reads (`eth_call` to `CleartextFHEVMExecutor.plaintexts(handle)`):

| What | Why it existed | Can be removed |
|------|----------------|----------------|
| `decryptLock` mutex | Serializes concurrent block-mining to prevent cursor drift | Yes |
| `MAX_ACL_RETRIES=2` retry loop in userDecrypt | ACL logs not yet processed by coprocessor | Yes |
| `MAX_RETRIES=10` retry loop in publicDecrypt | Same reason | Yes |
| `provider.send("hardhat_mine", ...)` calls | Advance coprocessor cursor | Yes |
| `post-revert viemClient.mine({ blocks: 100 })` in test.ts | Advance stale BlockLogCursor after evm_revert | Yes |

---

## What Does NOT Change

- Playwright route interception pattern (`page.route(...)`)
- The 5 endpoint URLs
- CDN intercept for `relayer-sdk.js`
- `viemClient.snapshot()` / `viemClient.revert()` test isolation
- `page.unrouteAll({ behavior: "wait" })` call (still needed to wait for in-flight handlers)
- `relayer-sdk.js` (no changes needed)

---

## Line Number Reference for Exact Removal Ranges in fhevm.ts

| Block | Lines | Action |
|-------|-------|--------|
| Import `MockFhevmInstance` | 1 | Replace |
| `createMockFhevmInstance` function | 11–32 | Replace |
| `decryptLock` declaration | 42 | Delete |
| `/userDecrypt` mutex acquire | 91–98 | Delete |
| `/userDecrypt` retry loop | 106–163 | Replace with direct `await fhevm.userDecrypt(...)` |
| `/userDecrypt` `try/finally` wrapper | 100, 176–178 | Remove wrapper, keep the body logic |
| `/publicDecrypt` mutex acquire | 183–190 | Delete |
| `/publicDecrypt` retry loop | 195–237 | Replace with direct `await fhevm.publicDecrypt(...)` |
| `/publicDecrypt` `try/finally` wrapper | 192, 253–255 | Remove wrapper, keep the body logic |

---

## Implementation Notes

1. **Import the constants from `./cleartext-mock`** to keep addresses DRY instead of hardcoding
   them again in `fhevm.ts`:
   ```ts
   import { CleartextMockFhevm } from "./cleartext-mock";
   import { FHEVM_ADDRESSES, VERIFYING_CONTRACTS, GATEWAY_CHAIN_ID } from "./cleartext-mock/constants";
   ```

2. **`provider` variable stays**: Still needed for `CleartextMockFhevm.create(provider, config)`.
   Only the `provider.send("hardhat_mine", ...)` call sites are removed.

3. **Error handling in route handlers**: The try/catch blocks inside the retry loops can be
   replaced with simple `try/catch` around the `await` call with a 500 response on error,
   or just let errors propagate naturally (depends on desired behavior).

4. **`pnpm install`**: Must be run after modifying `package.json` files to update lockfile.

---

## References Read

- `/Users/msaug/zama/token-sdk/CLEARTEXT_MOCK_PLAN.md` — Full RFC (§3 Playwright Fixture Updates, §4 Dependency Changes)
- `/Users/msaug/zama/token-sdk/packages/playwright/fixtures/fhevm.ts` — Current implementation (274 lines)
- `/Users/msaug/zama/token-sdk/packages/playwright/fixtures/test.ts` — Test fixture (137 lines)
- `/Users/msaug/zama/token-sdk/packages/playwright/fixtures/relayer-sdk.js` — Mock SDK for browser (155 lines)
- `/Users/msaug/zama/token-sdk/packages/playwright/package.json` — Package dependencies
- `/Users/msaug/zama/token-sdk/package.json` — Root package devDependencies
- `/Users/msaug/zama/token-sdk/packages/playwright/fixtures/cleartext-mock/index.ts` — CleartextMockFhevm class
- `/Users/msaug/zama/token-sdk/packages/playwright/fixtures/cleartext-mock/types.ts` — CleartextMockConfig type
- `/Users/msaug/zama/token-sdk/packages/playwright/fixtures/cleartext-mock/constants.ts` — FHEVM addresses and constants
