# PR Next Steps — `cleartext-mocks` branch

> Concrete refactoring plan to align the current `cleartext-mocks` implementation with the target public API before merging. All decisions finalized.

## Decisions (locked)

| Question | Answer |
|---|---|
| Multi-chain support | **Single-chain only** — one config, one chain. Users needing multi-chain instantiate multiple relayers. |
| Playwright fixture | **Keep CDN interception** — minimal changes to test infra. Fixture uses cleartext relayer behind the proxy. |
| Structured error types | **Defer to follow-up** — keep plain `Error` throws for now. |
| Scope | **Full refactor in this PR** — ship the right API from day one. |
| Config shape | **Nested `contracts` object with optional verifying overrides** |
| Preset source | **Import from `hardhat/deployments.json`** — stays in sync with submodule |
| Factory pattern | **Factory wrapping class** — `createCleartextRelayer()` instantiates the class internally, returns `RelayerSDK` |
| Delegation methods | **Implement both** — `delegatedUserDecrypt` + `createDelegatedUserDecryptEIP712` |
| Export surface | **Minimal** — factory + preset + type + FheType enum only |
| Test apps | **No changes needed** — Playwright CDN interception handles everything |
| Unit tests | **Keep current approach** — test class directly, add thin factory-level tests on top |

---

## Refactoring Tasks

### 1. Define `CleartextChainConfig` type

**File:** `packages/sdk/src/relayer/cleartext/types.ts`

Replace `CleartextFhevmConfig` with:

```ts
export interface CleartextChainConfig {
  chainId: bigint;
  gatewayChainId: number;
  rpcUrl: string | EIP1193Provider;
  contracts: {
    acl: string;
    executor: string;
    inputVerifier: string;
    kmsVerifier: string;
    /** Because the EIP-712 verifying contract for input verification differs from inputVerifier — its a contract on the gateway chain   */
    verifyingInputVerifier: string;
    /** Because the EIP-712 verifying contract for decryption differs from kmsVerifier — its a contract on the gateway chain   */
    verifyingDecryption: string;
  };
}
```

Changes from current `CleartextFhevmConfig`:
- `rpcUrl` replaces the `provider` constructor arg — decouples from ethers
- Nested `contracts` object replaces 8 individual `*Address` fields
- `verifyingInputVerifier` / `verifyingDecryption` are optional overrides defaulting to `inputVerifier` / `kmsVerifier`

### 2. Create `hardhat` preset

**File:** `packages/sdk/src/relayer/cleartext/presets.ts`

```ts
import deployments from "../../../../hardhat/deployments.json" with { type: "json" };
import type { CleartextChainConfig } from "./types";

// Important: brindg all hardhat-related constants in this file to avoid splitting them.
// Those two addresses are constants set to these values: because we mock, there's never a call to the gateway chain, but we need those specific addresses for EIP712 signatures.
export const VERIFYING_CONTRACTS = {
  inputVerification: "0x812b06e1CDCE800494b79fFE4f925A504a9A9810",
  decryption: "0x5ffdaAB0373E62E2ea2944776209aEf29E631A64",
} as const;

export const hardhat = {
  chainId: 31337,
  gatewayChainId: 10_901,
  provider: new JsonRpcProvider("http://127.0.0.1:8545"),
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

Addresses stay in sync with the hardhat submodule automatically. Refactor existing constants that are related to hardhat and consolidate them in this new file.

### 3. Add `createCleartextRelayer` factory function

**File:** `packages/sdk/src/relayer/cleartext/cleartext-fhevm-instance.ts` (or new `factory.ts`)

```ts
import { JsonRpcProvider } from "ethers";
import type { CleartextChainConfig } from "./types";
import type { RelayerSDK } from "../relayer-sdk";

export function createCleartextRelayer(config: CleartextChainConfig): RelayerSDK {
  const relayerConfig = {
    chainId: config.chainId,
    gatewayChainId: config.gatewayChainId,
    aclAddress: config.contracts.acl,
    executorProxyAddress: config.contracts.executor,
    inputVerifierContractAddress: config.contracts.inputVerifier,
    kmsContractAddress: config.contracts.kmsVerifier,
    verifyingContractAddressInputVerification:
      config.contracts.verifyingInputVerifier,
    verifyingContractAddressDecryption:
      config.contracts.verifyingDecryption
  };

  return new CleartextFhevmInstance(config.provider, relayerConfig);
}
```

The class stays internal — not exported from `index.ts`. The factory maps the public config shape to the internal one.

### 4. Implement `delegatedUserDecrypt`

**File:** `packages/sdk/src/relayer/cleartext/cleartext-fhevm-instance.ts`

**Important:** The delegation ACL flow is NOT simply "userDecrypt with a different address." The production gateway (Rust) performs **3 checks** per handle:

1. `acl.isHandleDelegatedForUserDecryption(delegator, delegate, contractAddress, handle)` — checks delegation is active + not expired + both delegator and contract are `persistAllowed`
2. `acl.isAllowed(handle, delegator)` — delegator has access
3. `acl.isAllowed(handle, contractAddress)` — contract has access

Checks 2 & 3 are redundant with the internals of check 1 (the on-chain function already verifies `persistAllowed` for both), but the gateway checks them separately.

**Implementation:**

Add a new ABI fragment:
```ts
const ACL_ABI = [
  "function persistAllowed(bytes32 handle, address account) view returns (bool)",
  "function isAllowedForDecryption(bytes32 handle) view returns (bool)",
  "function isHandleDelegatedForUserDecryption(address delegator, address delegate, address contractAddress, bytes32 handle) view returns (bool)",
] as const;
```

Then:
```ts
async delegatedUserDecrypt(params: DelegatedUserDecryptParams): Promise<Record<string, bigint>> {
  const normalizedHandles = params.handles.map(h => ethers.toBeHex(ethers.toBigInt(h), 32));

  // Check delegation ACL for each handle
  for (const handle of normalizedHandles) {
    const isDelegated = await this.#isHandleDelegatedForUserDecryption(
      params.delegatorAddress,
      params.signerAddress,     // the delegate
      params.contractAddress,
      handle,
    );
    if (!isDelegated) {
      throw new Error(
        `Handle ${handle} is not delegated for user decryption ` +
        `(delegator=${params.delegatorAddress}, delegate=${params.signerAddress}, ` +
        `contract=${params.contractAddress})`
      );
    }
  }

  // Read plaintexts (same as userDecrypt)
  const values = await Promise.all(normalizedHandles.map(h => this.#readPlaintext(h)));
  return Object.fromEntries(normalizedHandles.map((h, i) => [h, values[i]!]));
}
```

This exercises the real on-chain delegation ACL — catching bugs where `delegateUserDecryption()` was never called or the delegation expired.

### 5. Implement `createDelegatedUserDecryptEIP712`

**File:** `packages/sdk/src/relayer/cleartext/cleartext-fhevm-instance.ts`

Replace the throw with:

```ts
async createDelegatedUserDecryptEIP712(
  publicKey: string,
  contractAddresses: Address[],
  delegatorAddress: string,
  startTimestamp: number,
  durationDays: number = 7,
): Promise<KmsDelegatedUserDecryptEIP712Type> {
  const domain = {
    name: "Decryption",
    version: "1",
    chainId: Number(this.#config.chainId),
    verifyingContract: this.#config.verifyingContractAddressDecryption as Address,
  };

  return {
    domain,
    types: USER_DECRYPT_TYPES,  // same types, delegator included in message
    message: {
      publicKey,
      contractAddresses,
      delegatorAddress,
      startTimestamp: BigInt(startTimestamp),
      durationDays: BigInt(durationDays),
      extraData: "0x00",
    },
  };
}
```

### 6. Update `index.ts` exports

**File:** `packages/sdk/src/relayer/cleartext/index.ts`

Replace current (exports everything) with:

```ts
export { createCleartextRelayer } from "./factory";
export { hardhat } from "./presets";
export { FheType } from "./constants";
export type { CleartextChainConfig } from "./types";
```

**NOT exported** (internal only):
- `CleartextFhevmInstance` class
- `MOCK_INPUT_SIGNER_PK`, `MOCK_KMS_SIGNER_PK`
- `ACL_ABI`, `EXECUTOR_ABI`
- `CleartextEncryptedInput`
- `INPUT_VERIFICATION_EIP712`, `KMS_DECRYPTION_EIP712`, `USER_DECRYPT_EIP712`
- `computeInputHandle`, `computeMockCiphertext`
- `GATEWAY_CHAIN_ID`, `VERIFYING_CONTRACTS`, `HANDLE_VERSION`, `PREHANDLE_MASK`, `FHE_BIT_WIDTHS`

### 7. Update Playwright fixture

**File:** `packages/playwright/fixtures/fhevm.ts`

Replace the current construction:
```ts
// BEFORE
import { CleartextFhevmInstance, GATEWAY_CHAIN_ID, VERIFYING_CONTRACTS } from "@zama-fhe/sdk/cleartext";
const fhevm = new CleartextFhevmInstance(provider, { chainId: BigInt(hardhat.id), ... });

// AFTER
import { createCleartextRelayer, hardhat as hardhatPreset } from "@zama-fhe/sdk/cleartext";
const relayer = createCleartextRelayer(hardhatPreset);
```

Keep all CDN interception and route proxying as-is — just swap the constructor call. Remove `JsonRpcProvider` import (handled internally by factory). Remove `deployments.json` import (handled by preset).

### 8. Test apps — NO CHANGES

Test apps (test-vite, test-nextjs) continue using `RelayerWeb`. Playwright CDN interception handles the cleartext routing transparently.

### 9. Update unit tests

**Files:** `packages/sdk/src/relayer/cleartext/__tests__/*.test.ts`

- Keep testing the class directly for detailed unit coverage (handle generation, EIP-712, proof encoding)
- Add thin factory-level integration tests:
  - `createCleartextRelayer(config)` returns a valid `RelayerSDK`
- Add tests for `delegatedUserDecrypt` (ACL check uses delegator address)
- Add tests for `createDelegatedUserDecryptEIP712` (EIP-712 includes delegator field)

---

## Out of Scope (follow-up PRs)

| Item | Why deferred |
|---|---|
| Structured error types (`CleartextError` hierarchy) | Deserves a dedicated PR covering the whole SDK error story |
| Multi-chain support | Single-chain is sufficient for cleartext mode |
| Provider abstraction (remove ethers coupling) | Ethers is already a peer dep; can decouple later with `@noble/secp256k1` |
| `encrypt()` type dispatch improvements | Affects `RelayerSDK` interface — needs broader discussion |
| Config base type shared with `FhevmInstanceConfig` | Useful but not blocking; can align types in a follow-up |
| React SDK cleartext export | Not needed — users pass cleartext relayer to `<ZamaProvider>` directly |

---

## Verification Checklist

- [ ] `createCleartextRelayer(hardhat)` works out of the box against a running Hardhat node
- [ ] `createCleartextRelayer({ ...hardhat, rpcUrl: 'http://custom:8545' })` works for custom nodes
- [ ] `createCleartextRelayer({ chainId: X, ... })` works for fully custom fhEVM deployments
- [ ] Optional `verifyingInputVerifier` / `verifyingDecryption` overrides work correctly
- [ ] All `RelayerSDK` methods work (except `requestZKProofVerification` which throws with guidance)
- [ ] `delegatedUserDecrypt` works with delegator address ACL checks
- [ ] `createDelegatedUserDecryptEIP712` returns correct EIP-712 typed data
- [ ] Unit tests pass
- [ ] Playwright E2E tests pass with CDN interception using the new relayer
- [ ] `@zama-fhe/sdk/cleartext` subpath export resolves correctly
- [ ] `CleartextFhevmInstance` class is NOT exported from the public API
- [ ] Mock private keys are NOT exported from the public API
- [ ] No breaking changes to `@zama-fhe/sdk` main export
