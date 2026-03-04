# Plan: Public API Surface — Types, Preset, Factory, and Exports

Unit: `public-api-surface`
Date: 2026-03-04
Complexity: **medium**

---

## Work Type Assessment

**TDD applies.** This unit changes the observable public API surface:
- New public type (`CleartextChainConfig`) replaces old one (`CleartextFhevmConfig`)
- New factory function (`createCleartextRelayer`) — entirely new public code path
- New preset (`hardhat`) — new exported constant
- `index.ts` exports are narrowed — previously public symbols become internal

The factory function is the core new behavior. Tests should be written before the factory implementation.

---

## Architecture Overview

```
Public API (index.ts)                    Internal
─────────────────────────────           ─────────────────────────────
CleartextChainConfig (types.ts)    →    CleartextFhevmConfig (types.ts)
createCleartextRelayer (factory.ts) →   new CleartextFhevmInstance(provider, config)
hardhat (presets.ts)                     constants.ts (FheType, private keys, etc.)
FheType (constants.ts)
```

The factory acts as adapter: it takes the ergonomic `CleartextChainConfig`, creates a provider from `rpcUrl`, maps `contracts.*` fields to the flat internal field names, and constructs the internal `CleartextFhevmInstance`.

The internal `CleartextFhevmConfig` type is **kept** as-is for `CleartextFhevmInstance` and `CleartextEncryptedInput`. It's just no longer exported.

---

## Step-by-Step Implementation

### Step 1: Add `CleartextChainConfig` to `types.ts`

**File:** `packages/sdk/src/relayer/cleartext/types.ts`

Add the new public interface alongside the existing internal one:

```ts
import type { Eip1193Provider } from "ethers";

// Internal config — used by CleartextFhevmInstance and CleartextEncryptedInput
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

// Public config — user-facing
export interface CleartextChainConfig {
  chainId: bigint;
  gatewayChainId: number;
  rpcUrl: string | Eip1193Provider;
  contracts: {
    acl: string;
    executor: string;
    inputVerifier: string;
    kmsVerifier: string;
    verifyingInputVerifier: string;
    verifyingDecryption: string;
  };
}
```

**Why keep both:** `CleartextFhevmConfig` is used internally by `cleartext-fhevm-instance.ts` (lines 19, 45, 47) and `encrypted-input.ts` (lines 5, 21, 24). Changing these internals is out of scope and would cascade through all tests. The factory does the mapping.

---

### Step 2: Create `presets.ts`

**File:** `packages/sdk/src/relayer/cleartext/presets.ts` (NEW)

```ts
import deployments from "../../../../hardhat/deployments.json" with { type: "json" };
import type { CleartextChainConfig } from "./types";

export const VERIFYING_CONTRACTS = {
  inputVerification: "0x812b06e1CDCE800494b79fFE4f925A504a9A9810",
  decryption: "0x5ffdaAB0373E62E2ea2944776209aEf29E631A64",
} as const;

export const GATEWAY_CHAIN_ID = 10_901;

export const hardhat = {
  chainId: 31337n,
  gatewayChainId: GATEWAY_CHAIN_ID,
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

**Key corrections from RFC §2:**
- `chainId: 31337n` (bigint, not number)
- `rpcUrl: "http://127.0.0.1:8545"` (string, not `new JsonRpcProvider(...)`)

---

### Step 3: Update `constants.ts` — remove moved constants

**File:** `packages/sdk/src/relayer/cleartext/constants.ts`

Remove `VERIFYING_CONTRACTS` and `GATEWAY_CHAIN_ID` (now in `presets.ts`). Keep:
- `FheType` enum (publicly exported)
- `FHE_BIT_WIDTHS` (internal)
- `MOCK_INPUT_SIGNER_PK`, `MOCK_KMS_SIGNER_PK` (internal)
- `HANDLE_VERSION`, `PREHANDLE_MASK` (internal)

---

### Step 4: Update `__tests__/fixtures.ts` — fix broken imports

**File:** `packages/sdk/src/relayer/cleartext/__tests__/fixtures.ts`

Change import from `../constants` to `../presets`:

```ts
import { GATEWAY_CHAIN_ID, VERIFYING_CONTRACTS } from "../presets";
```

Rest of file stays the same — it still uses `CleartextFhevmConfig` (internal type) for test mocks.

---

### Step 5: Write factory tests (TDD — tests first)

**File:** `packages/sdk/src/relayer/cleartext/__tests__/factory.test.ts` (NEW)

Tests to write:
1. `createCleartextRelayer(hardhat)` instantiates without throwing
2. The returned object satisfies the `RelayerSDK` interface shape (has all expected methods)
3. `createCleartextRelayer` with an `Eip1193Provider` mock (object with `request` method) instantiates without throwing
4. The returned object's `terminate()` method runs without error (sanity check)

```ts
import { describe, expect, it } from "vitest";
import { createCleartextRelayer } from "../factory";
import { hardhat } from "../presets";
import type { RelayerSDK } from "../../relayer-sdk";

describe("createCleartextRelayer", () => {
  it("instantiates from hardhat preset without throwing", () => {
    const relayer = createCleartextRelayer(hardhat);
    expect(relayer).toBeDefined();
  });

  it("returns an object satisfying RelayerSDK shape", () => {
    const relayer = createCleartextRelayer(hardhat);
    // Check all RelayerSDK methods exist
    expect(typeof relayer.generateKeypair).toBe("function");
    expect(typeof relayer.createEIP712).toBe("function");
    expect(typeof relayer.encrypt).toBe("function");
    expect(typeof relayer.userDecrypt).toBe("function");
    expect(typeof relayer.publicDecrypt).toBe("function");
    expect(typeof relayer.createDelegatedUserDecryptEIP712).toBe("function");
    expect(typeof relayer.delegatedUserDecrypt).toBe("function");
    expect(typeof relayer.requestZKProofVerification).toBe("function");
    expect(typeof relayer.getPublicKey).toBe("function");
    expect(typeof relayer.getPublicParams).toBe("function");
    expect(typeof relayer.terminate).toBe("function");
  });

  it("accepts Eip1193Provider input", () => {
    const mockEip1193 = { request: async () => {} };
    const relayer = createCleartextRelayer({
      ...hardhat,
      rpcUrl: mockEip1193 as any,
    });
    expect(relayer).toBeDefined();
  });

  it("terminate() runs without error", () => {
    const relayer = createCleartextRelayer(hardhat);
    expect(() => relayer.terminate()).not.toThrow();
  });
});
```

---

### Step 6: Implement `factory.ts`

**File:** `packages/sdk/src/relayer/cleartext/factory.ts` (NEW)

```ts
import { BrowserProvider, JsonRpcProvider } from "ethers";
import type { RelayerSDK } from "../relayer-sdk";
import { CleartextFhevmInstance } from "./cleartext-fhevm-instance";
import type { CleartextChainConfig, CleartextFhevmConfig } from "./types";

export function createCleartextRelayer(config: CleartextChainConfig): RelayerSDK {
  const provider =
    typeof config.rpcUrl === "string"
      ? new JsonRpcProvider(config.rpcUrl)
      : new BrowserProvider(config.rpcUrl);

  const internalConfig: CleartextFhevmConfig = {
    chainId: config.chainId,
    gatewayChainId: config.gatewayChainId,
    aclAddress: config.contracts.acl,
    executorProxyAddress: config.contracts.executor,
    inputVerifierContractAddress: config.contracts.inputVerifier,
    kmsContractAddress: config.contracts.kmsVerifier,
    verifyingContractAddressInputVerification: config.contracts.verifyingInputVerifier,
    verifyingContractAddressDecryption: config.contracts.verifyingDecryption,
  };

  return new CleartextFhevmInstance(provider, internalConfig);
}
```

**Key correction from RFC §3:** Uses `config.rpcUrl` (not `config.provider` as the RFC mistakenly shows at line 109).

**Provider discrimination:** `typeof config.rpcUrl === "string"` → `JsonRpcProvider`; else → `BrowserProvider`. Both implement `send()` which is what `RpcLike = Pick<JsonRpcProvider, "send">` requires.

---

### Step 7: Replace `index.ts` exports

**File:** `packages/sdk/src/relayer/cleartext/index.ts`

Replace entire contents with:

```ts
export { createCleartextRelayer } from "./factory";
export { hardhat } from "./presets";
export { FheType } from "./constants";
export type { CleartextChainConfig } from "./types";
```

This removes 15+ symbols and exposes exactly 4: `createCleartextRelayer`, `hardhat`, `FheType`, `CleartextChainConfig`.

---

### Step 8: Update Playwright fixture (out-of-scope but necessary for build)

**File:** `packages/playwright/fixtures/fhevm.ts`

The Playwright fixture imports `CleartextFhevmInstance`, `GATEWAY_CHAIN_ID`, `VERIFYING_CONTRACTS` from `@zama-fhe/sdk/cleartext` — all of which will no longer be exported. Update to use the new API:

```ts
import { createCleartextRelayer, hardhat } from "@zama-fhe/sdk/cleartext";

function createMockFhevmInstance(rpcUrl: string) {
  return createCleartextRelayer({ ...hardhat, rpcUrl });
}
```

This is listed as "out of scope" in the research but **must be done** in this unit because the build will fail if the Playwright fixture imports non-existent exports.

---

### Step 9: Verify

1. `pnpm run typecheck` — zero errors
2. `pnpm vitest run packages/sdk/src/relayer/cleartext` — all existing + new tests pass
3. Verify that importing `CleartextFhevmInstance` or `MOCK_INPUT_SIGNER_PK` from `@zama-fhe/sdk/cleartext` produces a TS error (AC7, AC8)

---

## Files Summary

### Files to create
| File | Purpose |
|------|---------|
| `packages/sdk/src/relayer/cleartext/presets.ts` | Hardhat preset + VERIFYING_CONTRACTS |
| `packages/sdk/src/relayer/cleartext/factory.ts` | `createCleartextRelayer()` factory |
| `packages/sdk/src/relayer/cleartext/__tests__/factory.test.ts` | Factory integration tests |

### Files to modify
| File | Change |
|------|--------|
| `packages/sdk/src/relayer/cleartext/types.ts` | Add `CleartextChainConfig` interface |
| `packages/sdk/src/relayer/cleartext/constants.ts` | Remove `VERIFYING_CONTRACTS` and `GATEWAY_CHAIN_ID` |
| `packages/sdk/src/relayer/cleartext/index.ts` | Replace with 4 minimal exports |
| `packages/sdk/src/relayer/cleartext/__tests__/fixtures.ts` | Update imports to `../presets` |
| `packages/playwright/fixtures/fhevm.ts` | Use `createCleartextRelayer` + `hardhat` preset |

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| `BrowserProvider.send()` signature differs from `JsonRpcProvider.send()` | Factory may create incompatible provider for EIP1193Provider input | Both extend `JsonRpcApiProvider` which implements `send()`. Verified in ethers v6 source. |
| JSON import assertion `with { type: "json" }` not supported by test runner | `presets.ts` tests fail | `resolveJsonModule: true` is already in tsconfig. Vitest supports this natively. |
| Other packages import internal symbols from `@zama-fhe/sdk/cleartext` | Build breaks in downstream packages | Only `packages/playwright/fixtures/fhevm.ts` imports internal symbols — updated in Step 8. |
| `hardhat/deployments.json` import path `../../../../hardhat/deployments.json` may break if directory structure changes | Build breaks | Path is relative and verified correct (4 levels up from `packages/sdk/src/relayer/cleartext/`). |

---

## Acceptance Criteria Verification

| AC# | Criterion | How Verified |
|-----|-----------|--------------|
| 1 | `CleartextChainConfig` has correct fields | Typecheck: `satisfies` in presets.ts enforces shape |
| 2 | `hardhat` preset uses addresses from `deployments.json` | Read presets.ts; addresses match JSON |
| 3 | `VERIFYING_CONTRACTS` exported from presets.ts | Import in tests + presets.ts |
| 4 | Hardhat constants consolidated in presets.ts | `grep GATEWAY_CHAIN_ID constants.ts` returns nothing |
| 5 | `createCleartextRelayer` maps fields correctly | Factory test + typecheck |
| 6 | index.ts exports exactly 4 symbols | Read index.ts; only 4 export lines |
| 7 | `CleartextFhevmInstance` not importable | Typecheck: any import attempt → TS error |
| 8 | `MOCK_*` keys not importable | Typecheck: any import attempt → TS error |
| 9 | Factory test passes with hardhat preset | `vitest run factory.test.ts` |
| 10 | `pnpm run typecheck` passes | Run typecheck |
