# Implementation Report: Fix Type Boundary Conversions (BytesHexNo0x <-> Hex)

Generated: 2026-03-06

## Task

Replace lying `as Hex` casts at relayer SDK boundaries with real runtime conversions between `BytesHexNo0x` (string without 0x prefix) and `Hex` (`` `0x${string}` ``).

## Changes Made

### 1. `src/worker/relayer-sdk.worker.ts` (web worker)

**RECEIVING from relayer SDK (prefix 0x):**

- `handleGenerateKeypair`: Replaced `keypair.publicKey as GenerateKeypairResponseData["publicKey"]` with `` `0x${keypair.publicKey}` ``; same for privateKey.
- `handleCreateEIP712`: Added `0x` prefix to `eip712.message.publicKey`, `eip712.message.extraData`, and cast `contractAddresses` as `` `0x${string}`[] ``.

**SENDING to relayer SDK (strip 0x):**

- `handleCreateEIP712`: Changed `payload.publicKey` to `payload.publicKey.slice(2)`.
- `handleCreateDelegatedEIP712`: Changed `payload.publicKey` to `payload.publicKey.slice(2)`.
- `handleUserDecrypt`: Changed `payload.privateKey` and `payload.publicKey` to `.slice(2)`. Signature kept as-is (Ethereum signatures are 0x-prefixed by convention).
- `handleDelegatedUserDecrypt`: Same pattern -- `.slice(2)` for privateKey and publicKey.

### 2. `src/worker/relayer-sdk.node-worker.ts` (Node.js worker)

Identical changes to the web worker:

- `handleGenerateKeypair`: Template literal prefix instead of lying cast.
- `handleCreateEIP712`: Strip 0x on input, prefix 0x on output message fields.
- `handleCreateDelegatedEIP712`: Strip 0x from publicKey.
- `handleUserDecrypt`: Strip 0x from privateKey and publicKey.
- `handleDelegatedUserDecrypt`: Strip 0x from privateKey and publicKey.

### 3. `src/relayer/relayer-sdk.ts` (interface)

- Changed `generateKeypair()` return type from `Promise<KeypairType<string>>` to `Promise<KeypairType<Hex>>` since all implementations now return 0x-prefixed values.

### 4. `src/relayer/relayer-node.ts`

- Updated `generateKeypair()` signature to match new interface: `Promise<KeypairType<Hex>>`.

### 5. `src/relayer/relayer-web.ts`

- Updated `generateKeypair()` signature to match new interface: `Promise<KeypairType<Hex>>`.

### 6. `src/relayer/cleartext/cleartext-fhevm-instance.ts`

- Updated `generateKeypair()` signature to `Promise<KeypairType<Hex>>`. Already returned `0x`-prefixed values via viem's `toHex()`.

### 7. `src/token/credentials-manager.ts`

- Removed `as Hex` casts on `keypair.publicKey` and `keypair.privateKey` (lines 362-363) since the interface now returns `KeypairType<Hex>` directly.
- Left `as Hex` casts in `#decryptCredentials` since those recover data from encrypted storage (the values were Hex when encrypted).

## Files NOT Changed

- `src/relayer/cleartext/cleartext-fhevm-instance.ts` `createDelegatedUserDecryptEIP712`: Has `publicKey as KmsDelegatedUserDecryptEIP712Type["message"]["publicKey"]` -- this is a type narrowing, not a BytesHexNo0x boundary. The cleartext implementation doesn't talk to the relayer SDK.

## Verification

```
npx tsc --noEmit 2>&1 | grep "error TS" | grep -v "__tests__"
```

Result: **0 non-test errors.** All type errors are in test files only (test files use string literals like `"sk"` and `"pk"` which don't match the new `Hex` type).

## Boundary Summary

| Direction              | Conversion         | Where                                                                                                                                           |
| ---------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| relayer SDK -> our SDK | `` `0x${value}` `` | generateKeypair result, EIP712 message fields                                                                                                   |
| our SDK -> relayer SDK | `value.slice(2)`   | createEIP712 publicKey, userDecrypt privateKey/publicKey, delegatedUserDecrypt privateKey/publicKey, createDelegatedUserDecryptEIP712 publicKey |
| our SDK -> relayer SDK | kept as-is         | signature (already 0x-prefixed Ethereum sig), addresses (always 0x-prefixed), handles, contractAddresses                                        |
