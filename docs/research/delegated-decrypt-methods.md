# Research: delegated-decrypt-methods

**Unit:** delegated-decrypt-methods
**Task:** Implement `delegatedUserDecrypt` and `createDelegatedUserDecryptEIP712` in `CleartextFhevmInstance`

---

## Files To Modify

| File | Purpose |
|------|---------|
| `packages/sdk/src/relayer/cleartext/cleartext-fhevm-instance.ts` | Main implementation — stubs to replace |
| `packages/sdk/src/relayer/cleartext/__tests__/cleartext-fhevm-instance.test.ts` | Unit tests — add new test cases |

---

## Relevant File Summaries

### `cleartext-fhevm-instance.ts`

- **Class:** `CleartextFhevmInstance implements RelayerSDK`
- **Private state:** `#provider: RpcLike`, `#config: CleartextFhevmConfig`
- **Current `ACL_ABI`** (lines 21–24):
  ```ts
  export const ACL_ABI = [
    "function persistAllowed(bytes32 handle, address account) view returns (bool)",
    "function isAllowedForDecryption(bytes32 handle) view returns (bool)",
  ] as const;
  ```
  → Needs a **third fragment** added:
  ```ts
  "function isHandleDelegatedForUserDecryption(address delegator, address delegate, address contractAddress, bytes32 handle) view returns (bool)",
  ```
- **Current stubs** (lines 176–190):
  - `createDelegatedUserDecryptEIP712` → `throw new Error("Not implemented in cleartext mode")`
  - `delegatedUserDecrypt` → `throw new Error("Not implemented in cleartext mode")`
- **Pattern for ACL calls** — see `#persistAllowed` (line 210–213) and `#isAllowedForDecryption` (lines 216–219):
  ```ts
  async #persistAllowed(handle: string, account: string): Promise<boolean> {
    const data = ACL_INTERFACE.encodeFunctionData("persistAllowed", [handle, account]);
    const result = await this.#ethCall(this.#config.aclAddress, data);
    return ACL_INTERFACE.decodeFunctionResult("persistAllowed", result)[0];
  }
  ```
  New `#isHandleDelegatedForUserDecryption` must follow the same pattern.
- **Pattern for `userDecrypt`** (lines 103–123) — handles normalization + ACL check loop + plaintext reads:
  - Normalize: `ethers.toBeHex(ethers.toBigInt(handle), 32)`
  - ACL check: loop + throw on failure with `Handle ${handle} is not authorized...`
  - Read: `Promise.all(normalizedHandles.map(h => this.#readPlaintext(h)))`
  - Return: `Object.fromEntries(normalizedHandles.map((h, i) => [h, values[i]!]))`
- **Pattern for `createEIP712`** (lines 63–87) — template for `createDelegatedUserDecryptEIP712`:
  ```ts
  const domain = {
    name: "Decryption",
    version: "1",
    chainId: Number(this.#config.chainId),
    verifyingContract: this.#config.verifyingContractAddressDecryption as Address,
  };
  ```
- **`USER_DECRYPT_TYPES`** constant (lines 30–34) — used as the `types` field in EIP-712 payloads. The delegated variant uses the same types object (per RFC §5).
- **`ACL_INTERFACE`** is constructed at module level from `ACL_ABI` (line 28) — adding the new fragment to `ACL_ABI` automatically makes it available.

---

### `cleartext-fhevm-instance.test.ts`

- **`createMockProvider(options)`** — returns a mock that intercepts `eth_call` for ACL and executor addresses.
  - Currently handles: `persistAllowed`, `isAllowedForDecryption`, `plaintexts`
  - **Needs to handle**: `isHandleDelegatedForUserDecryption(delegator, delegate, contractAddress, handle)` with a new `options.isHandleDelegatedForUserDecryption` callback.
- **`MockProviderOptions`** type (lines 18–22) needs a new field.
- **Existing test pattern for ACL** (lines 43–56) shows how to add a new if-branch inside the ACL address block.

---

### `eip712.ts`

- Contains `USER_DECRYPT_EIP712` with `UserDecryptRequestVerification` type fields:
  ```
  publicKey, contractAddresses, startTimestamp, durationDays, extraData
  ```
- `KmsDelegatedUserDecryptEIP712Type` (from `@zama-fhe/relayer-sdk`) uses a **different** primary type `DelegatedUserDecryptRequestVerification` with an extra `delegatorAddress` field:
  ```
  publicKey, contractAddresses, delegatorAddress, startTimestamp, durationDays, extraData
  ```
- The RFC (§5) says to reuse `USER_DECRYPT_TYPES` for the types field, but the actual SDK type (`KmsDelegatedUserDecryptEIP712TypesType`) shows the delegated type has `DelegatedUserDecryptRequestVerification` not `UserDecryptRequestVerification`.

---

### `types.ts` — `CleartextFhevmConfig`

```ts
export interface CleartextFhevmConfig {
  chainId: bigint;
  gatewayChainId: number;
  aclAddress: string;
  executorProxyAddress: string;
  inputVerifierContractAddress: string;
  kmsContractAddress: string;
  verifyingContractAddressInputVerification: string;
  verifyingContractAddressDecryption: string;  // ← used as verifyingContract in EIP-712
}
```

---

### `relayer-sdk.types.ts` — `DelegatedUserDecryptParams`

```ts
export interface DelegatedUserDecryptParams {
  handles: string[];
  contractAddress: Address;
  signedContractAddresses: Address[];
  privateKey: string;
  publicKey: string;
  signature: string;
  delegatorAddress: Address;
  delegateAddress: Address;  // ← this is the "signer" / delegate
  startTimestamp: number;
  durationDays: number;
}
```

**Key note:** The RFC pseudocode uses `params.signerAddress` but the actual type field is `params.delegateAddress`.

---

### `@zama-fhe/relayer-sdk` — `KmsDelegatedUserDecryptEIP712Type`

```ts
type KmsDelegatedUserDecryptEIP712Type = Readonly<{
  types: KmsDelegatedUserDecryptEIP712TypesType;
  primaryType: 'DelegatedUserDecryptRequestVerification';
  domain: KmsEIP712DomainType;  // { name: 'Decryption', version: '1', chainId: bigint, verifyingContract: ChecksummedAddress }
  message: KmsDelegatedUserDecryptEIP712MessageType;
}>;

type KmsDelegatedUserDecryptEIP712MessageType = {
  publicKey: BytesHex;
  contractAddresses: readonly ChecksummedAddress[];
  delegatorAddress: ChecksummedAddress;  // ← the extra field vs UserDecryptRequestVerification
  startTimestamp: string;
  durationDays: string;
  extraData: BytesHex;
};

type KmsDelegatedUserDecryptEIP712TypesType = {
  EIP712Domain: [ ...standard fields... ];
  DelegatedUserDecryptRequestVerification: [
    { name: 'publicKey',          type: 'bytes' },
    { name: 'contractAddresses',  type: 'address[]' },
    { name: 'delegatorAddress',   type: 'address' },
    { name: 'startTimestamp',     type: 'uint256' },
    { name: 'durationDays',       type: 'uint256' },
    { name: 'extraData',          type: 'bytes' },
  ];
};
```

Note: `startTimestamp` and `durationDays` are **strings** in `KmsUserDecryptEIP712MessageType` (not bigint). The local `EIP712TypedData` interface uses `bigint`. The local `createEIP712` uses `BigInt(...)` — `createDelegatedUserDecryptEIP712` should match the `KmsDelegatedUserDecryptEIP712Type` return type exactly.

---

## RFC Specification Summary (§4, §5, §9)

### §4 — `delegatedUserDecrypt`

1. **Add ABI fragment** to `ACL_ABI`:
   ```ts
   "function isHandleDelegatedForUserDecryption(address delegator, address delegate, address contractAddress, bytes32 handle) view returns (bool)",
   ```
2. **Implementation**:
   ```ts
   async delegatedUserDecrypt(params: DelegatedUserDecryptParams): Promise<Record<string, bigint>> {
     const normalizedHandles = params.handles.map(h => ethers.toBeHex(ethers.toBigInt(h), 32));
     for (const handle of normalizedHandles) {
       const isDelegated = await this.#isHandleDelegatedForUserDecryption(
         params.delegatorAddress,
         params.signerAddress,   // NOTE: in actual type this is params.delegateAddress
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
     const values = await Promise.all(normalizedHandles.map(h => this.#readPlaintext(h)));
     return Object.fromEntries(normalizedHandles.map((h, i) => [h, values[i]!]));
   }
   ```
   - ACL check fires **per handle** (sequential loop, not `Promise.all`)
   - Error message contains: `handle`, `delegatorAddress`, `signerAddress/delegateAddress`, `contractAddress`
   - Plaintext read is identical to `userDecrypt` (`#readPlaintext` private method)

### §5 — `createDelegatedUserDecryptEIP712`

Returns `KmsDelegatedUserDecryptEIP712Type` (not `EIP712TypedData`):

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
    types: USER_DECRYPT_TYPES,  // per RFC — same types as createEIP712
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

**Key difference from `createEIP712`:** message includes `delegatorAddress`.

### §9 — Unit Tests

Required test cases (in `__tests__/cleartext-fhevm-instance.test.ts`):
1. **ACL delegation check fires per handle** — verify `isHandleDelegatedForUserDecryption` is called once per handle
2. **Throws with message containing handle/delegatorAddress/signerAddress/contractAddress on failure** — mock returns `false`, assert error message format
3. **Success path returns correct plaintext mapping** — mock returns `true`, assert `Record<string, bigint>` result
4. **`createDelegatedUserDecryptEIP712` returns domain and message with correct `delegatorAddress` field** — assert domain + message shape

---

## Mock Provider Extension Required

The `createMockProvider` in the test file needs to be extended:

```ts
type MockProviderOptions = {
  persistAllowed?: (handle: string, account: string) => boolean;
  isAllowedForDecryption?: (handle: string) => boolean;
  isHandleDelegatedForUserDecryption?: (delegator: string, delegate: string, contractAddress: string, handle: string) => boolean;
  plaintexts?: Record<string, bigint>;
};
```

And inside the ACL address block:
```ts
if (parsed.name === "isHandleDelegatedForUserDecryption") {
  const [delegator, delegate, contractAddress, handle] = parsed.args;
  const isDelegated = options.isHandleDelegatedForUserDecryption
    ? options.isHandleDelegatedForUserDecryption(String(delegator), String(delegate), String(contractAddress), String(handle))
    : true;  // default: allow
  return ACL_INTERFACE.encodeFunctionResult("isHandleDelegatedForUserDecryption", [isDelegated]);
}
```

---

## Fixtures Reference

From `__tests__/fixtures.ts`:
- `USER_ADDRESS = "0x1000000000000000000000000000000000000001"` — can use as `delegatorAddress`
- `CONTRACT_ADDRESS = "0x2000000000000000000000000000000000000002"` — can use as `contractAddress`
- A new delegate address is needed: `"0x3000000000000000000000000000000000000003"` (already used in existing stub test)
- `CLEAR_TEXT_MOCK_CONFIG` — use for all instance creation

---

## Key Open Questions / Discrepancies

1. **`signerAddress` vs `delegateAddress`**: RFC §4 pseudocode uses `params.signerAddress` but `DelegatedUserDecryptParams` has `delegateAddress`. Implementation must use `params.delegateAddress`. Error message should use the actual value.

2. **`USER_DECRYPT_TYPES` reuse**: RFC §5 says to reuse `USER_DECRYPT_TYPES` (same as `createEIP712`). But `KmsDelegatedUserDecryptEIP712Type` from the SDK has `DelegatedUserDecryptRequestVerification` (not `UserDecryptRequestVerification`) as the type key with an extra `delegatorAddress` field. The implementation should likely define a new `DELEGATED_USER_DECRYPT_TYPES` constant matching the actual SDK type structure, or use `USER_DECRYPT_TYPES` as the RFC says (knowing it'll be used in a cleartext/mock context).

3. **`startTimestamp`/`durationDays` as bigint vs string**: The RFC pseudocode uses `BigInt(startTimestamp)` but `KmsDelegatedUserDecryptEIP712MessageType` declares them as `string`. The local `createEIP712` uses `bigint`. Since the return type is `KmsDelegatedUserDecryptEIP712Type`, this needs reconciliation. Following the RFC's example (`BigInt(...)`) is safe for local usage.

---

## Key Patterns to Follow

1. **Sequential ACL loop** (not `Promise.all`) — check delegation one handle at a time, fail fast
2. **Parallel plaintext reads** (`Promise.all`) — after all ACL checks pass
3. **`ethers.toBeHex(ethers.toBigInt(h), 32)`** — handle normalization (same as `userDecrypt`)
4. **`Object.fromEntries`** — build result map from normalized handles + values
5. **Private method `#isHandleDelegatedForUserDecryption`** — mirror `#persistAllowed` pattern exactly
