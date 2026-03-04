# Self-contained cleartext module

## Goal

Replace the dynamic `import("@zama-fhe/relayer-sdk/cleartext")` dependency with a
self-contained implementation inside `packages/sdk/src/cleartext/` that uses only
`ethers` for chain interaction and cryptographic primitives.

## Context

The token SDK's `RelayerCleartext` class currently delegates to a not-yet-published
`@zama-fhe/relayer-sdk/cleartext` sub-path export, stubbed via an ambient `.d.ts`
with `any`-typed returns. The reference implementation lives in the relayer-sdk
source and uses heavy internal types (`FhevmHandle`, `ACL`, `InputProof`,
`FhevmHostChainConfig`, etc.) that cannot be imported from the token SDK.

By rewriting the ~400 lines of cleartext logic using ethers.js directly, we:

- Remove the dependency on an unreleased relayer-sdk feature
- Produce a smaller bundle (no WASM, no heavy relayer-sdk code path)
- Gain full control over cleartext behavior

## Handle format (bytes32)

```
[bytes 0-20]  hash21    keccak256("ZK-w_hdl" + blobHash + index + aclAddr + chainId)[0:21]
[byte 21]     index     (0xff if computed result)
[bytes 22-29] chainId   uint64, big-endian
[byte 30]     fheTypeId (0=ebool, 2=euint8, 3=euint16, 4=euint32, 5=euint64, 6=euint128, 7=eaddress, 8=euint256)
[byte 31]     version   (0)
```

Where:

- `blobHash = keccak256("ZK-w_rct" + fakeCiphertext)`
- `fakeCiphertext = TextEncoder("CLEARTEXT") + ABI.encode(uint256[])(values)`

## InputProof byte layout

```
[byte 0]                          numHandles (uint8)
[byte 1]                          numSigners (uint8, always 0 in cleartext)
[bytes 2 .. 2+32*numHandles]     handles (32 bytes each)
[remaining bytes]                 extraData: 0x00 version byte + 32-byte padded plaintext per value
```

## Module structure

All files in `packages/sdk/src/cleartext/`:

| File                    | Responsibility                                                                |
| ----------------------- | ----------------------------------------------------------------------------- |
| `types.ts`              | `CleartextInstanceConfig` type definition                                     |
| `cleartext-handles.ts`  | `computeCleartextHandles()` — deterministic handle generation                 |
| `cleartext-input.ts`    | `createCleartextEncryptedInput()` — builder returning `{handles, inputProof}` |
| `cleartext-executor.ts` | `CleartextExecutor` — reads `plaintexts(bytes32)` from CleartextFHEVMExecutor |
| `cleartext-decrypt.ts`  | `cleartextPublicDecrypt()` + `cleartextUserDecrypt()` with ACL checks         |
| `cleartext-instance.ts` | `createCleartextInstance()` — factory wiring everything together              |
| `index.ts`              | Public re-exports                                                             |

## ACL contract interaction

Two read-only calls via `ethers.Contract`:

- `isAllowedForDecryption(bytes32 handle) → bool` — for public decrypt
- `persistAllowed(bytes32 handle, address account) → bool` — for user decrypt (check both user and contract addresses)

## Changes to existing files

1. **`relayer-cleartext.ts`** — Replace `import("@zama-fhe/relayer-sdk/cleartext")` with local `import("../cleartext/cleartext-instance")`
2. **Delete `relayer-sdk-cleartext.d.ts`** — Ambient module stub no longer needed
3. **`cleartext/index.ts`** — Export from local modules

## What we omit

- No `FhevmHostChainConfig` / `loadFromChain` — all addresses come from config
- No `KmsEIP712` class — cleartext mode builds dummy EIP-712 with ethers
- No `InputProof` class — just byte concatenation
- No `FhevmHandle` class — utility functions for bytes32 encoding/decoding
- No tests ported from the relayer-sdk (they test internal types we don't use)

## Trade-offs

- (+) No dependency on unreleased relayer-sdk feature
- (+) Smaller bundle, no WASM
- (+) Full control over cleartext behavior
- (-) Must keep handle encoding in sync with contracts if format changes
- (-) ~400 lines of new code to maintain
