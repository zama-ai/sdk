# Research: Public API Surface — types, preset, factory, exports

Unit: `public-api-surface`
RFC sections: §1, §2, §3, §6
Date: 2026-03-04

---

## Overview

This unit refactors the cleartext module to expose a minimal, ergonomic public API. The work spans four coordinated changes across `types.ts`, a new `presets.ts`, a new `factory.ts`, and `index.ts`.

---

## Files Involved

### Existing files to modify

| File | Path | Role |
|------|------|------|
| `types.ts` | `packages/sdk/src/relayer/cleartext/types.ts` | Replace `CleartextFhevmConfig` with `CleartextChainConfig` |
| `index.ts` | `packages/sdk/src/relayer/cleartext/index.ts` | Replace broad exports with 4 minimal symbols |
| `constants.ts` | `packages/sdk/src/relayer/cleartext/constants.ts` | Remove `VERIFYING_CONTRACTS` + `GATEWAY_CHAIN_ID` (moving to presets.ts) |
| `cleartext-fhevm-instance.ts` | `packages/sdk/src/relayer/cleartext/cleartext-fhevm-instance.ts` | Internal class — not changed by this unit (stays internal) |
| `encrypted-input.ts` | `packages/sdk/src/relayer/cleartext/encrypted-input.ts` | Uses internal `CleartextFhevmConfig` fields — no changes needed |
| `__tests__/fixtures.ts` | `packages/sdk/src/relayer/cleartext/__tests__/fixtures.ts` | Test config using old `CleartextFhevmConfig` — will need updating when types.ts changes |

### New files to create

| File | Path | Role |
|------|------|------|
| `presets.ts` | `packages/sdk/src/relayer/cleartext/presets.ts` | `hardhat` preset + `VERIFYING_CONTRACTS` constant |
| `factory.ts` | `packages/sdk/src/relayer/cleartext/factory.ts` | `createCleartextRelayer()` public factory |

### Related files (not in this unit's scope)

| File | Path | Change needed |
|------|------|---------------|
| Playwright fixture | `packages/playwright/fixtures/fhevm.ts` | Replace `CleartextFhevmInstance` constructor call with `createCleartextRelayer(hardhat)` |
| New test file | `packages/sdk/src/relayer/cleartext/__tests__/factory.test.ts` | Factory-level integration tests |

### Hardhat deployments source

```
hardhat/deployments.json
```

Contents verified:
```json
{
  "chainId": 31337,
  "fhevm": {
    "executor": "0xe3a9105a3a932253A70F126eb1E3b589C643dD24",
    "acl": "0x50157CFfD6bBFA2DECe204a89ec419c23ef5755D",
    "inputVerifier": "0x36772142b74871f255CbD7A3e89B401d3e45825f",
    "kmsVerifier": "0x901F8942346f7AB3a01F6D7613119Bca447Bb030"
  }
}
```

Import path from `presets.ts`: `../../../../hardhat/deployments.json` (4 levels up from `packages/sdk/src/relayer/cleartext/`)

---

## §1 — `types.ts`: Replace `CleartextFhevmConfig` with `CleartextChainConfig`

### Current shape (VERIFIED)

```ts
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

### Target shape (from RFC §1)

```ts
export interface CleartextChainConfig {
  chainId: bigint;
  gatewayChainId: number;
  rpcUrl: string | Eip1193Provider;
  contracts: {
    acl: string;
    executor: string;
    inputVerifier: string;
    kmsVerifier: string;
    verifyingInputVerifier: string;   // EIP-712 verifying contract (gateway chain) for input verification
    verifyingDecryption: string;      // EIP-712 verifying contract (gateway chain) for decryption
  };
}
```

### Key differences

- `rpcUrl: string | Eip1193Provider` replaces no `provider` field (constructor previously took provider as separate arg)
- 8 flat address fields collapsed into nested `contracts` object
- `verifyingInputVerifier` / `verifyingDecryption` are NOT optional in the RFC definition (always required)
- `chainId` stays as `bigint`, `gatewayChainId` stays as `number`

### CRITICAL: `EIP1193Provider` vs `Eip1193Provider`

The RFC writes `EIP1193Provider` (all caps) but ethers v6 exports `Eip1193Provider` (camelCase). Use:

```ts
import type { Eip1193Provider } from "ethers";
```

Confirmed via: `ethers/lib.esm/ethers.d.ts` — `Eip1193Provider` is exported from `"ethers"` directly.

---

## §2 — `presets.ts`: Hardhat preset

### Source constants to consolidate

From `constants.ts` (VERIFIED):
```ts
export const VERIFYING_CONTRACTS = {
  inputVerification: "0x812b06e1CDCE800494b79fFE4f925A504a9A9810",
  decryption: "0x5ffdaAB0373E62E2ea2944776209aEf29E631A64",
} as const;

export const GATEWAY_CHAIN_ID = 10_901;
```

These move to `presets.ts`. The RFC notes `GATEWAY_CHAIN_ID` is used for `gatewayChainId: 10_901`.

### RFC §2 preset definition (with correction needed)

The RFC §2 shows `provider: new JsonRpcProvider(...)` in the preset object, but `CleartextChainConfig` defines `rpcUrl: string | Eip1193Provider`. The preset should use `rpcUrl: "http://127.0.0.1:8545"` (string), not a provider instance.

```ts
import deployments from "../../../../hardhat/deployments.json" with { type: "json" };
import type { CleartextChainConfig } from "./types";

export const VERIFYING_CONTRACTS = {
  inputVerification: "0x812b06e1CDCE800494b79fFE4f925A504a9A9810",
  decryption: "0x5ffdaAB0373E62E2ea2944776209aEf29E631A64",
} as const;

export const hardhat = {
  chainId: 31337n,          // bigint — RFC shows 31337 (number), but type requires bigint
  gatewayChainId: 10_901,
  rpcUrl: "http://127.0.0.1:8545",
  contracts: {
    acl: deployments.fhevm.acl,
    executor: deployments.fhevm.executor,
    inputVerifier: deployments.fhevm.inputVerifier,
    kmsVerifier: deployments.fhevm.kmsVerifier,
    verifyingInputVerifier: VERIFYING_CONTRACTS.inputVerification,
    verifyingDecryption: VERIFYING_CONTRACTS.decryption,
  },
} satisfies CleartextChainConfig;
```

**Two RFC discrepancies to fix:**
1. RFC §2 uses `provider: new JsonRpcProvider(...)` — should be `rpcUrl: "http://127.0.0.1:8545"` (string)
2. RFC §2 uses `chainId: 31337` (number) — type requires `chainId: bigint`, so must be `31337n`

### JSON import support

`tsconfig.json` has `"resolveJsonModule": true` (VERIFIED). The `with { type: "json" }` syntax (JSON import assertions) is valid for the `module: "esnext"` + `moduleResolution: bundler` config.

---

## §3 — `factory.ts`: `createCleartextRelayer`

### Factory function signature (RFC §3)

```ts
export function createCleartextRelayer(config: CleartextChainConfig): RelayerSDK
```

### Internal constructor signature (VERIFIED)

`CleartextFhevmInstance(provider: RpcLike, config: CleartextFhevmConfig)` where:
- `RpcLike = Pick<ethers.JsonRpcProvider, "send">`
- `CleartextFhevmConfig` has the 8 flat address fields

### Mapping logic

The factory must:
1. Create a provider from `config.rpcUrl`:
   - `string` → `new JsonRpcProvider(rpcUrl)`
   - `Eip1193Provider` → `new BrowserProvider(rpcUrl)` (BrowserProvider implements `send()`)
2. Map `config.contracts.*` → flat `CleartextFhevmConfig` fields:
   - `config.contracts.acl` → `aclAddress`
   - `config.contracts.executor` → `executorProxyAddress`
   - `config.contracts.inputVerifier` → `inputVerifierContractAddress`
   - `config.contracts.kmsVerifier` → `kmsContractAddress`
   - `config.contracts.verifyingInputVerifier` → `verifyingContractAddressInputVerification`
   - `config.contracts.verifyingDecryption` → `verifyingContractAddressDecryption`
3. Pass `chainId` and `gatewayChainId` unchanged

**NOTE:** The RFC §3 uses `config.provider` at line 109, which is a bug (the field is `rpcUrl`). Factory must create provider from `config.rpcUrl`.

### Provider compatibility

`CleartextFhevmInstance` uses `this.#provider.send(method, params)` — both `JsonRpcProvider` and `BrowserProvider` from ethers v6 implement this method.

---

## §6 — `index.ts`: Minimal exports

### Current exports (VERIFIED — 15+ symbols)

```ts
export { CleartextFhevmInstance, ACL_ABI, EXECUTOR_ABI } from "./cleartext-fhevm-instance";
export { CleartextEncryptedInput } from "./encrypted-input";
export { INPUT_VERIFICATION_EIP712, KMS_DECRYPTION_EIP712, USER_DECRYPT_EIP712 } from "./eip712";
export { computeInputHandle, computeMockCiphertext } from "./handle";
export type { CleartextFhevmConfig } from "./types";
export {
  FHE_BIT_WIDTHS, FheType, GATEWAY_CHAIN_ID, HANDLE_VERSION,
  MOCK_INPUT_SIGNER_PK, MOCK_KMS_SIGNER_PK, PREHANDLE_MASK, VERIFYING_CONTRACTS,
} from "./constants";
```

### Target exports (RFC §6)

```ts
export { createCleartextRelayer } from "./factory";
export { hardhat } from "./presets";
export { FheType } from "./constants";
export type { CleartextChainConfig } from "./types";
```

### NOT exported (internal only, from RFC §6)

- `CleartextFhevmInstance` class
- `MOCK_INPUT_SIGNER_PK`, `MOCK_KMS_SIGNER_PK`
- `ACL_ABI`, `EXECUTOR_ABI`
- `CleartextEncryptedInput`
- `INPUT_VERIFICATION_EIP712`, `KMS_DECRYPTION_EIP712`, `USER_DECRYPT_EIP712`
- `computeInputHandle`, `computeMockCiphertext`
- `GATEWAY_CHAIN_ID`, `VERIFYING_CONTRACTS`, `HANDLE_VERSION`, `PREHANDLE_MASK`, `FHE_BIT_WIDTHS`

---

## Factory-Level Integration Tests

### New test file: `__tests__/factory.test.ts`

Per RFC §9, tests should verify:
1. `createCleartextRelayer(config)` returns a valid `RelayerSDK` instance
2. The returned instance implements all `RelayerSDK` methods

Test strategy: pass a mock `rpcUrl` string or use a `hardhatPreset`-like config with mocked provider.

Since `CleartextChainConfig.rpcUrl` is `string | Eip1193Provider`, tests can:
- Use a string URL → factory creates `new JsonRpcProvider(...)` internally
- Or mock an `Eip1193Provider` object

The factory tests should be "thin" — just verify the returned object is a valid `RelayerSDK`, not re-test all methods (those are covered by `cleartext-fhevm-instance.test.ts`).

---

## Constants.ts Impact

After moving `VERIFYING_CONTRACTS` and `GATEWAY_CHAIN_ID` to `presets.ts`, `constants.ts` will retain:
- `FheType` (enum) — exported from index.ts
- `FHE_BIT_WIDTHS` — internal use by encrypted-input.ts and handle.ts
- `MOCK_INPUT_SIGNER_PK`, `MOCK_KMS_SIGNER_PK` — internal use, NOT exported
- `HANDLE_VERSION`, `PREHANDLE_MASK` — internal use by handle.ts

`__tests__/fixtures.ts` imports `GATEWAY_CHAIN_ID` and `VERIFYING_CONTRACTS` from `../constants`. After the move, fixtures.ts must import from `../presets` instead (or the constants.ts can re-export for backward compat within tests).

---

## Build Configuration

- **tsup entry point**: `"cleartext/index": "src/relayer/cleartext/index.ts"` (VERIFIED in `tsup.config.ts`)
- **package.json exports**: `"./cleartext": { "types": "./dist/cleartext/index.d.ts", "import": "./dist/cleartext/index.js" }` (VERIFIED)
- **JSON imports**: Supported — `resolveJsonModule: true` in tsconfig.json
- **Vitest alias**: `@zama-fhe/sdk/(.+)` → `packages/sdk/src/$1` (tests use relative imports, not alias)

---

## Playwright Fixture (§7) — Affected but Not in This Unit

Current `packages/playwright/fixtures/fhevm.ts` directly constructs `CleartextFhevmInstance`:
```ts
import { CleartextFhevmInstance, GATEWAY_CHAIN_ID, VERIFYING_CONTRACTS } from "@zama-fhe/sdk/cleartext";
import deployments from "../../../hardhat/deployments.json" with { type: "json" };
const fhevm = new CleartextFhevmInstance(provider, { chainId: BigInt(hardhat.id), ... });
```

After the API refactor, this should become:
```ts
import { createCleartextRelayer, hardhat as hardhatPreset } from "@zama-fhe/sdk/cleartext";
const relayer = createCleartextRelayer(hardhatPreset);
```

---

## `RelayerSDK` Interface (VERIFIED)

Located at: `packages/sdk/src/relayer/relayer-sdk.ts`

Methods that `CleartextFhevmInstance` currently implements:
- `generateKeypair()` ✓
- `createEIP712()` ✓
- `encrypt()` ✓
- `userDecrypt()` ✓
- `publicDecrypt()` ✓
- `createDelegatedUserDecryptEIP712()` — currently throws "Not implemented" (RFC §5 adds implementation)
- `delegatedUserDecrypt()` — currently throws "Not implemented" (RFC §4 adds implementation)
- `requestZKProofVerification()` — throws, per spec
- `getPublicKey()` — returns null
- `getPublicParams()` — returns null
- `terminate()` — no-op

---

## Open Questions

1. **RFC §2 discrepancy — `provider` vs `rpcUrl` in preset**: The RFC shows `provider: new JsonRpcProvider(...)` but `CleartextChainConfig` has `rpcUrl: string | Eip1193Provider`. The preset should use `rpcUrl: "http://127.0.0.1:8545"` — confirm this interpretation.

2. **RFC §2 discrepancy — `chainId` type**: RFC shows `chainId: 31337` (number literal) but `CleartextChainConfig.chainId` is `bigint`. Preset must use `31337n`. The `satisfies CleartextChainConfig` check will catch this.

3. **`constants.ts` cleanup**: Should `VERIFYING_CONTRACTS` and `GATEWAY_CHAIN_ID` be deleted from `constants.ts` (and `__tests__/fixtures.ts` updated to import from `presets.ts`) or kept in `constants.ts` and re-exported from `presets.ts`? The RFC says "consolidate in presets.ts" — suggests deletion from constants.ts and update of fixtures.ts.

4. **`BrowserProvider` for `Eip1193Provider` input**: `CleartextFhevmInstance` uses `RpcLike = Pick<ethers.JsonRpcProvider, "send">`. `BrowserProvider` from ethers extends `JsonRpcApiProvider` which also has `.send()`. Need to verify `BrowserProvider.send()` is compatible.

5. **Factory test approach**: Since the factory creates a `JsonRpcProvider` internally, integration tests need to either start a real RPC or mock at the provider level. The RFC says "thin factory-level tests" — mocking may be preferred.

---

## Implementation Order

1. `types.ts` — rename type, add `rpcUrl`, add nested `contracts`
2. `presets.ts` — create with `VERIFYING_CONTRACTS`, `hardhat` preset; update `constants.ts` to remove moved constants
3. `factory.ts` — implement `createCleartextRelayer` with provider creation + config mapping
4. `index.ts` — replace exports with minimal 4-symbol set
5. `__tests__/fixtures.ts` — update import of `GATEWAY_CHAIN_ID`/`VERIFYING_CONTRACTS` to come from `../presets`
6. `__tests__/factory.test.ts` — add thin factory integration tests
7. `packages/playwright/fixtures/fhevm.ts` — update to use new factory API (§7)
