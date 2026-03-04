# Cleartext Relayer — Public API Design

> Living document. Captures design decisions, viem-inspired patterns, and open questions for the `@zama-fhe/sdk/cleartext` module.

## Context

Two approaches exist to replace `@fhevm/mock-utils` with a built-in cleartext backend:

- **PR #48** (zama-ai/sdk): Clean API surface, but fundamentally broken — `decryptionProof: "0x00"` causes on-chain reverts in `KMSVerifier.verifyDecryptionEIP712KMSSignatures()`, and deterministic handles can cause collisions.
- **Branch `cleartext-mocks`** (this repo): Correct internals — real EIP-712 mock signatures, randomized handles, production-faithful proof format. API surface needs refinement.

**Decision: Ship the `cleartext-mocks` branch**, refining its public API using learnings below.

---

## Viem Learnings Applied

| Viem Pattern | How We Apply It |
|---|---|
| Factory functions (`createPublicClient`) | `createCleartextRelayer(config)` — no class constructor in public API |
| Chain definitions as plain spreadable objects | `CleartextChainConfig` — flat, `as const satisfies`, overridable via spread |
| No "test mode" flag — test client is same infra + test actions | Cleartext relayer is a `RelayerSDK` implementation, not a mode toggle |
| Presets are `/*#__PURE__*/` const objects | `hardhat` preset — tree-shakeable, importable, spreadable |
| Transport as lazy factory (URL → internal client) | Accept `rpcUrl: string` or EIP-1193 provider, create transport internally |

---

## Module Location

**`packages/sdk/src/relayer/cleartext/`** → exported as `@zama-fhe/sdk/cleartext`

Rationale: implements `RelayerSDK`, logically belongs under `relayer/`. The subpath export hides internal paths from consumers.

---

## Config Shape

```ts
interface CleartextChainConfig {
  chainId: number;
  gatewayChainId: number;
  rpcUrl: string | EIP1193Provider;
  contracts: {
    acl: string;
    executor: string;
    inputVerifier: string;
    kmsVerifier: string;
  };
}
```

### Design rationale

- **Flat `contracts` object** instead of 8 top-level `*Address` fields — groups related concerns, readable at a glance.
- **`rpcUrl` instead of ethers provider** — decouples from ethers; the factory creates whatever internal transport it needs. Accepts either a URL string or an EIP-1193 provider (e.g. `window.ethereum`, wagmi connector).
- **`chainId: number`** (not `bigint`) — matches viem's `Chain.id` convention and avoids serialization friction.

---

## Presets

```ts
// @zama-fhe/sdk/cleartext
export const hardhat = {
  chainId: 31337,
  gatewayChainId: 31337,
  rpcUrl: 'http://127.0.0.1:8545',
  contracts: {
    acl: '0x...',
    executor: '0x...',
    inputVerifier: '0x...',
    kmsVerifier: '0x...',
  },
} as const satisfies CleartextChainConfig;
```

Users extend presets via spread:

```ts
const myConfig = {
  ...hardhat,
  rpcUrl: 'http://my-node:8545',
  contracts: {
    ...hardhat.contracts,
    acl: '0xMyCustomACL',
  },
};
```

---

## Public API Surface

### Construction

```ts
import { createCleartextRelayer, hardhat } from '@zama-fhe/sdk/cleartext';

// Hardhat (most common)
const relayer = createCleartextRelayer(hardhat);

// Custom fhEVM deployment
const relayer = createCleartextRelayer({
  chainId: 12345,
  gatewayChainId: 12345,
  rpcUrl: 'http://my-l2:8545',
  contracts: {
    acl: '0x...',
    executor: '0x...',
    inputVerifier: '0x...',
    kmsVerifier: '0x...',
  },
});
```

### Integration with ZamaSDK

```ts
// Same as RelayerWeb or RelayerNode — drop-in replacement
const sdk = new ZamaSDK({ relayer, signer, storage });
const token = sdk.createToken('0xTokenAddress');
await token.confidentialTransfer(to, amount);
```

### RelayerSDK compliance

| Method | Status | Notes |
|---|---|---|
| `encrypt()` | Implemented | Full type dispatch (all `add*` variants) |
| `publicDecrypt()` | Implemented | Real EIP-712 KMS mock signature, 66-byte proof |
| `userDecrypt()` | Implemented | On-chain ACL checks + executor read |
| `generateKeypair()` | Implemented | Random hex pairs (not real FHE keys) |
| `createEIP712()` | Implemented | Full EIP-712 typed data |
| `delegatedUserDecrypt()` | **TODO: implement** | Reuse `userDecrypt` with delegator address for ACL (PR #48 showed this is ~5 lines) |
| `createDelegatedUserDecryptEIP712()` | **TODO: implement** | Same EIP-712 structure with delegator fields |
| `requestZKProofVerification()` | Throws | Not applicable — cleartext mode has no ZK |
| `getPublicKey()` | Returns `null` | No real FHE keys |
| `getPublicParams()` | Returns `null` | No real FHE params |
| `terminate()` | No-op | Nothing to clean up |

Stub-throw methods use actionable error messages:
```ts
throw new Error(
  'requestZKProofVerification is not available in cleartext mode. ' +
  'Use RelayerWeb or RelayerNode for ZK proof verification.'
);
```

---

## Correctness Properties (vs PR #48)

| Property | Our approach | PR #48 | Why it matters |
|---|---|---|---|
| Handle generation | Randomized (per-encryption salt) | Deterministic | Same value encrypted twice → different handles (matches production FHE) |
| Decryption proof | Real EIP-712 signature from `MOCK_KMS_SIGNER_PK` | `"0x00"` stub | `KMSVerifier` contract actually validates the proof on-chain |
| Input proof | Includes EIP-712 signature from `MOCK_INPUT_SIGNER_PK` | No signature (`numSigners=0`) | `InputVerifier` contract validates the signature |
| Proof format | `[0x01][65-byte sig]` (66 bytes) | `"0x00"` (1 byte) | Matches production format exactly |

---

## Open Questions

- [ ] **Provider abstraction**: Should the cleartext module work without ethers? Currently uses `ethers.Wallet` for mock signing. Could use `@noble/secp256k1` directly to remove the ethers coupling — but ethers is already a peer dep via `@zama-fhe/sdk/ethers`.
- [ ] **Config alignment with `FhevmInstanceConfig`**: Should `CleartextChainConfig` share a base type with the production config? The overlap is `chainId`, `gatewayChainId`, and contract addresses. The difference is `rpcUrl` vs `relayerUrl`.
- [ ] **React SDK cleartext export**: Should `@zama-fhe/react-sdk/cleartext` exist? Currently `react-sdk` re-exports from `sdk`. If cleartext is just a `RelayerSDK` implementation, users construct it and pass it to `<ZamaProvider relayer={relayer}>` — no special React integration needed.
- [ ] **`encrypt()` type dispatch**: The high-level `RelayerSDK.encrypt()` takes `EncryptParams` which has a `values: bigint[]` without type info. How should the cleartext relayer infer FHE types? PR #48 hard-codes `add64`. We should do better — options: (a) add `types` field to `EncryptParams`, (b) infer from value range, (c) default to `add256` (safest).

---

## Viem Deep Dives

### Error Handling

Viem uses a `BaseError extends Error` hierarchy. Key properties:

```ts
class BaseError extends Error {
  shortMessage: string;      // human-readable one-liner
  details: string;           // raw technical detail (propagated from cause.message)
  docsPath?: string;         // propagates upward through cause chain → auto-composed docs URL
  metaMessages?: string[];   // extra context lines in the formatted message
  walk(fn?): Error | null;   // traverse the cause chain
}
```

**Two-layer error wrapping pattern:**

1. **Transport layer** (`buildRequest`) — catches raw RPC errors, maps JSON-RPC error codes to typed `RpcError` subclasses (`ParseRpcError`, `InternalRpcError`, `UserRejectedRequestError`, etc.)
2. **Action layer** (`getContractError`) — wraps transport errors with ABI context: contract address, function name, formatted args, docs link → `ContractFunctionExecutionError`. Decodes Solidity `Error(string)` and `Panic(uint)` revert reasons into `ContractFunctionRevertedError`.

**Takeaway for us:** Our cleartext relayer should have structured errors, not bare `throw new Error("...")`. At minimum:

```ts
// Proposed error structure
class CleartextError extends Error {
  shortMessage: string;
  details?: string;
}

class ACLNotAllowedError extends CleartextError { }        // handle not authorized
class ExecutorReadError extends CleartextError { }          // failed to read plaintext
class UnsupportedOperationError extends CleartextError { }  // requestZKProofVerification etc.
```

### Chain.contracts Pattern

Viem's `Chain.contracts` type:

```ts
contracts?: {
  [key: string]: ChainContract | { [sourceId: number]: ChainContract } | undefined;
  // Well-known contracts declared for type-safe access:
  ensUniversalResolver?: ChainContract;
  multicall3?: ChainContract;
} & { [key: string]: ... }  // open for extension

type ChainContract = { address: Address; blockCreated?: number }
```

**How actions resolve contracts at runtime** (`getChainContractAddress`):
1. Check user override (action parameter)
2. Look up `client.chain.contracts[name]`
3. Guard against `blockCreated` (don't query before deployment)
4. Throw `ChainDoesNotSupportContract` if missing

**Takeaway for us:** Our `CleartextChainConfig.contracts` should use named keys (not generic `*Address` fields). The `ChainContract = { address, blockCreated? }` pattern is elegant but overkill for our case — we don't need `blockCreated` since cleartext is always against a fresh local node. Plain `string` addresses suffice.

### Async Initialization — Viem Uses None

| Component | Init Style |
|---|---|
| `createClient()` | **Sync** — calls transport factory synchronously |
| `http()` transport | **Sync** — just stores URL, no connection |
| `webSocket()` transport | **Lazy async** — connection opened on first `request()` |
| Chain contracts lookup | **Sync** — reads from plain object |

There is no `async init()` or `connect()` pattern. All async work is deferred until the first RPC call.

**Takeaway for us:** `createCleartextRelayer()` should be **synchronous**. The config is validated eagerly, but no RPC calls happen until the first `encrypt()` / `publicDecrypt()` / `userDecrypt()` call. This matches our current `#ensureInstance()` lazy-init pattern and is the right design.

### Testing Patterns

Viem's test infrastructure uses `defineAnvil()` — a factory that returns:
- `chain` — patched chain object (local RPC URLs)
- `getClient()` — pre-configured client with `{ mode: 'anvil' }`
- `rpcUrl` — `{ http, ws, ipc }` with pool ID suffix for parallel isolation

**Key insight: No "test mode" — just a different backend.** The test client is the same `createClient()` pointed at a local Anvil instance, extended with test actions (`mine`, `setBalance`, `snapshot`, `revert`).

**State isolation:** Viem does NOT use a global snapshot/revert helper. Each test file sets its own state via `setBalance`, `reset`, or a per-test `setup()` function. Parallel isolation is achieved via pool-ID-suffixed URLs routed to separate Anvil processes.

**Chain definitions:** `foundry`, `hardhat`, `anvil`, `localhost` are all plain objects differing only in `id` and transport support. They're minimal — no contracts, no custom formatters.

**Takeaway for us:** Our `hardhat` preset should be equally minimal — just chain IDs, RPC URL, and contract addresses. Users compose from there. We should NOT try to bundle test lifecycle management (snapshot, mining, etc.) — that's orthogonal to the cleartext relayer's job.

---

## Design Decisions Log

### Decided

| Decision | Choice | Rationale |
|---|---|---|
| Module location | `packages/sdk/src/relayer/cleartext/` | Implements `RelayerSDK`, belongs under relayer |
| Export path | `@zama-fhe/sdk/cleartext` | Clean subpath, hides internal structure |
| Public API shape | Factory function `createCleartextRelayer(config)` | Viem pattern — composable, no class `this` issues |
| Construction | Synchronous | Viem pattern — defer async to first operation |
| Config shape | `CleartextChainConfig` with named `contracts` object | Readable, spreadable, follows viem `Chain.contracts` |
| Presets | `as const satisfies` plain objects | Tree-shakeable, spreadable via `{ ...hardhat, ... }` |
| Handle generation | Randomized (per-encryption salt) | Matches production FHE semantics, prevents collisions |
| Decryption proof | Real EIP-712 mock signature | `KMSVerifier` validates on-chain — `"0x00"` causes reverts |
| Stub methods | Throw `UnsupportedOperationError` with guidance | Fail loudly, point user to `RelayerWeb`/`RelayerNode` |

### TODO

| Decision | Options | Notes |
|---|---|---|
| `delegatedUserDecrypt` | Implement (reuse `userDecrypt` + delegator ACL) | ~5 lines, PR #48 proved the approach |
| `createDelegatedUserDecryptEIP712` | Implement (EIP-712 with delegator fields) | Completes `RelayerSDK` compliance |
| Error types | Structured `CleartextError` hierarchy vs plain `Error` | Viem's pattern is good but may be overkill for v1 |
| Provider abstraction | Keep ethers vs use `@noble/secp256k1` | Ethers is already a peer dep; can decouple later |
| `encrypt()` type dispatch | `add256` default vs `types` field on `EncryptParams` | Affects `RelayerSDK` interface — needs broader discussion |
| React SDK cleartext export | No separate export (just pass to `ZamaProvider`) | Cleartext is a `RelayerSDK` — no React-specific code needed |
| Config base type | Share with `FhevmInstanceConfig` or keep separate | Overlap is `chainId + gatewayChainId + contracts` |

---

## Further Research

- [ ] How does the current `RelayerWeb` / `RelayerNode` config (`transports: Record<number, Partial<FhevmInstanceConfig>>`) compare? Should `CleartextChainConfig` align with this multi-chain transport map pattern, or is single-chain config sufficient for cleartext?
- [ ] Should `createCleartextRelayer` support multi-chain (chain switching like `RelayerWeb`) or is that unnecessary for local dev?
- [ ] How should the Playwright fixture consume the new API? Current fixture intercepts CDN requests — with cleartext relayer, is interception still needed or can Playwright use the relayer directly?
