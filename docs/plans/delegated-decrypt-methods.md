# Plan: delegated-decrypt-methods

## Overview

Implement two concrete methods in `CleartextFhevmInstance` — `delegatedUserDecrypt` and `createDelegatedUserDecryptEIP712` — replacing their current `throw new Error("Not implemented in cleartext mode")` stubs. This also adds the `isHandleDelegatedForUserDecryption` ABI fragment and a new private helper method.

## TDD Applies — Justification

This work **adds new observable behavior**: two public API methods that currently throw will instead perform ACL checks, read plaintexts, and return EIP-712 typed data. The error messages, ACL call patterns, and return shapes are all new code paths requiring test coverage. Tests must be written first.

## Files to Modify

| File | Changes |
|------|---------|
| `packages/sdk/src/relayer/cleartext/__tests__/cleartext-fhevm-instance.test.ts` | Extend `MockProviderOptions` + `createMockProvider`, replace 2 stub tests, add 4 new test cases |
| `packages/sdk/src/relayer/cleartext/cleartext-fhevm-instance.ts` | Add ABI fragment, add `DELEGATED_USER_DECRYPT_TYPES` constant, implement `delegatedUserDecrypt`, implement `createDelegatedUserDecryptEIP712`, add `#isHandleDelegatedForUserDecryption` private method |
| `packages/sdk/src/relayer/cleartext/eip712.ts` | Add `DELEGATED_USER_DECRYPT_EIP712` constant with `DelegatedUserDecryptRequestVerification` types |

## Step-by-Step Implementation (TDD Order)

### Step 1: Add `DELEGATED_USER_DECRYPT_EIP712` to `eip712.ts`

Add the delegated variant EIP-712 type definition alongside the existing `USER_DECRYPT_EIP712`:

```ts
export const DELEGATED_USER_DECRYPT_EIP712 = {
  domain: decryptionDomain,
  types: {
    DelegatedUserDecryptRequestVerification: [
      { name: "publicKey", type: "bytes" },
      { name: "contractAddresses", type: "address[]" },
      { name: "delegatorAddress", type: "address" },
      { name: "startTimestamp", type: "uint256" },
      { name: "durationDays", type: "uint256" },
      { name: "extraData", type: "bytes" },
    ],
  },
} as const;
```

### Step 2: Add ABI fragment + constants to `cleartext-fhevm-instance.ts`

**2a. Add `isHandleDelegatedForUserDecryption` to `ACL_ABI`:**

```ts
export const ACL_ABI = [
  "function persistAllowed(bytes32 handle, address account) view returns (bool)",
  "function isAllowedForDecryption(bytes32 handle) view returns (bool)",
  "function isHandleDelegatedForUserDecryption(address delegator, address delegate, address contractAddress, bytes32 handle) view returns (bool)",
] as const;
```

**2b. Add `DELEGATED_USER_DECRYPT_TYPES` constant** (after `USER_DECRYPT_TYPES`):

```ts
const DELEGATED_USER_DECRYPT_TYPES: KmsDelegatedUserDecryptEIP712Type["types"] = {
  EIP712Domain: [
    { name: "name", type: "string" },
    { name: "version", type: "string" },
    { name: "chainId", type: "uint256" },
    { name: "verifyingContract", type: "address" },
  ],
  DelegatedUserDecryptRequestVerification:
    DELEGATED_USER_DECRYPT_EIP712.types.DelegatedUserDecryptRequestVerification.map(
      (field) => ({ ...field }),
    ),
};
```

Import `DELEGATED_USER_DECRYPT_EIP712` from `./eip712`.

### Step 3: Write tests FIRST (in `cleartext-fhevm-instance.test.ts`)

**3a. Extend `MockProviderOptions` and `createMockProvider`:**

Add to `MockProviderOptions`:
```ts
isHandleDelegatedForUserDecryption?: (
  delegator: string,
  delegate: string,
  contractAddress: string,
  handle: string,
) => boolean;
```

Add dispatch branch in the ACL address block (after `isAllowedForDecryption`):
```ts
if (parsed.name === "isHandleDelegatedForUserDecryption") {
  const [delegator, delegate, contractAddress, handle] = parsed.args;
  const isDelegated = options.isHandleDelegatedForUserDecryption
    ? options.isHandleDelegatedForUserDecryption(
        String(delegator), String(delegate),
        String(contractAddress), String(handle),
      )
    : true;
  return ACL_INTERFACE.encodeFunctionResult(
    "isHandleDelegatedForUserDecryption",
    [isDelegated],
  );
}
```

**3b. Replace stub test — `delegatedUserDecrypt` throws when ACL returns false (AC#3, AC#6):**

```ts
it("delegatedUserDecrypt throws when delegation check returns false", async () => {
  const handle = "0x" + "12".repeat(32);
  const delegatorAddress = USER_ADDRESS;
  const delegateAddress = "0x3000000000000000000000000000000000000003";
  const { provider } = createMockProvider({
    isHandleDelegatedForUserDecryption: () => false,
  });
  const fhevm = new CleartextFhevmInstance(provider, CLEAR_TEXT_MOCK_CONFIG);

  await expect(
    fhevm.delegatedUserDecrypt({
      handles: [handle],
      contractAddress: CONTRACT_ADDRESS,
      signedContractAddresses: [CONTRACT_ADDRESS],
      privateKey: "0x" + "01".repeat(32),
      publicKey: "0x" + "02".repeat(32),
      signature: "0x" + "03".repeat(65),
      delegatorAddress,
      delegateAddress,
      startTimestamp: 1,
      durationDays: 1,
    }),
  ).rejects.toThrow(ethers.toBeHex(ethers.toBigInt(handle), 32));
  // Error message also contains delegatorAddress, delegateAddress, contractAddress
});
```

**3c. New test — `delegatedUserDecrypt` ACL check fires per handle (AC#2):**

```ts
it("delegatedUserDecrypt calls isHandleDelegatedForUserDecryption for each handle", async () => {
  const handleA = "0x" + "01".repeat(32);
  const handleB = "0x" + "02".repeat(32);
  const delegatorAddress = USER_ADDRESS;
  const delegateAddress = "0x3000000000000000000000000000000000000003";
  const delegationCalls: string[] = [];
  const { provider } = createMockProvider({
    isHandleDelegatedForUserDecryption: (_d, _s, _c, handle) => {
      delegationCalls.push(handle);
      return true;
    },
    plaintexts: {
      [handleA.toLowerCase()]: 7n,
      [handleB.toLowerCase()]: 11n,
    },
  });
  const fhevm = new CleartextFhevmInstance(provider, CLEAR_TEXT_MOCK_CONFIG);

  await fhevm.delegatedUserDecrypt({
    handles: [handleA, handleB],
    contractAddress: CONTRACT_ADDRESS,
    signedContractAddresses: [CONTRACT_ADDRESS],
    privateKey: "0x" + "11".repeat(32),
    publicKey: "0x" + "22".repeat(32),
    signature: "0x" + "33".repeat(65),
    delegatorAddress,
    delegateAddress,
    startTimestamp: 1,
    durationDays: 1,
  });

  expect(delegationCalls).toHaveLength(2);
});
```

**3d. New test — `delegatedUserDecrypt` returns correct plaintext mapping (AC#4):**

```ts
it("delegatedUserDecrypt returns cleartext values when delegation is valid", async () => {
  const handleA = "0x" + "01".repeat(32);
  const handleB = "0x" + "02".repeat(32);
  const { provider } = createMockProvider({
    isHandleDelegatedForUserDecryption: () => true,
    plaintexts: {
      [handleA.toLowerCase()]: 7n,
      [handleB.toLowerCase()]: 11n,
    },
  });
  const fhevm = new CleartextFhevmInstance(provider, CLEAR_TEXT_MOCK_CONFIG);

  const result = await fhevm.delegatedUserDecrypt({
    handles: [handleA, handleB],
    contractAddress: CONTRACT_ADDRESS,
    signedContractAddresses: [CONTRACT_ADDRESS],
    privateKey: "0x" + "11".repeat(32),
    publicKey: "0x" + "22".repeat(32),
    signature: "0x" + "33".repeat(65),
    delegatorAddress: USER_ADDRESS,
    delegateAddress: "0x3000000000000000000000000000000000000003",
    startTimestamp: 1,
    durationDays: 1,
  });

  expect(result[handleA]).toBe(7n);
  expect(result[handleB]).toBe(11n);
});
```

**3e. Replace stub test — `createDelegatedUserDecryptEIP712` returns correct structure (AC#5, AC#7):**

```ts
it("createDelegatedUserDecryptEIP712 returns domain and message with delegatorAddress", async () => {
  const { provider } = createMockProvider();
  const fhevm = new CleartextFhevmInstance(provider, CLEAR_TEXT_MOCK_CONFIG);

  const typedData = await fhevm.createDelegatedUserDecryptEIP712(
    "0x" + "ab".repeat(32),
    [CONTRACT_ADDRESS],
    USER_ADDRESS,
    1710000000,
    7,
  );

  expect(typedData.domain.verifyingContract).toBe(
    CLEAR_TEXT_MOCK_CONFIG.verifyingContractAddressDecryption,
  );
  expect(typedData.domain.name).toBe("Decryption");
  expect(typedData.domain.version).toBe("1");
  expect(typedData.message.delegatorAddress).toBe(USER_ADDRESS);
  expect(typedData.message.publicKey).toBe("0x" + "ab".repeat(32));
  expect(typedData.message.contractAddresses).toEqual([CONTRACT_ADDRESS]);
});
```

### Step 4: Implement `#isHandleDelegatedForUserDecryption` private method

Add after `#isAllowedForDecryption` (following the exact same pattern):

```ts
async #isHandleDelegatedForUserDecryption(
  delegator: string,
  delegate: string,
  contractAddress: string,
  handle: string,
): Promise<boolean> {
  const data = ACL_INTERFACE.encodeFunctionData(
    "isHandleDelegatedForUserDecryption",
    [delegator, delegate, contractAddress, handle],
  );
  const result = await this.#ethCall(this.#config.aclAddress, data);
  return ACL_INTERFACE.decodeFunctionResult(
    "isHandleDelegatedForUserDecryption",
    result,
  )[0];
}
```

### Step 5: Implement `delegatedUserDecrypt`

Replace the stub with:

```ts
async delegatedUserDecrypt(
  params: DelegatedUserDecryptParams,
): Promise<Record<string, bigint>> {
  const normalizedHandles = params.handles.map((handle) =>
    ethers.toBeHex(ethers.toBigInt(handle), 32),
  );

  // Sequential ACL delegation check — fail fast per handle
  for (const handle of normalizedHandles) {
    const isDelegated = await this.#isHandleDelegatedForUserDecryption(
      params.delegatorAddress,
      params.delegateAddress,
      params.contractAddress,
      handle,
    );
    if (!isDelegated) {
      throw new Error(
        `Handle ${handle} is not delegated for user decryption ` +
        `(delegator=${params.delegatorAddress}, delegate=${params.delegateAddress}, ` +
        `contract=${params.contractAddress})`,
      );
    }
  }

  // Parallel plaintext reads — identical to userDecrypt
  const values = await Promise.all(
    normalizedHandles.map((handle) => this.#readPlaintext(handle)),
  );

  return Object.fromEntries(
    normalizedHandles.map((handle, index) => [handle, values[index]!]),
  ) as Record<string, bigint>;
}
```

Key design decisions:
- Uses `params.delegateAddress` (not `signerAddress`) per the actual `DelegatedUserDecryptParams` type
- Sequential ACL loop (not `Promise.all`) — fail fast per handle
- Parallel plaintext reads after all checks pass
- Error message contains handle hex, delegatorAddress, delegateAddress, contractAddress

### Step 6: Implement `createDelegatedUserDecryptEIP712`

Replace the stub with:

```ts
async createDelegatedUserDecryptEIP712(
  publicKey: string,
  contractAddresses: Address[],
  delegatorAddress: string,
  startTimestamp: number,
  durationDays: number = 7,
): Promise<KmsDelegatedUserDecryptEIP712Type> {
  const domain = {
    name: "Decryption" as const,
    version: "1" as const,
    chainId: this.#config.chainId,
    verifyingContract: this.#config.verifyingContractAddressDecryption as Address,
  };

  return {
    domain,
    types: DELEGATED_USER_DECRYPT_TYPES,
    primaryType: "DelegatedUserDecryptRequestVerification" as const,
    message: {
      publicKey,
      contractAddresses,
      delegatorAddress,
      startTimestamp: String(startTimestamp),
      durationDays: String(durationDays),
      extraData: "0x00",
    },
  } as unknown as KmsDelegatedUserDecryptEIP712Type;
}
```

Key design decisions:
- Returns `KmsDelegatedUserDecryptEIP712Type` (not `EIP712TypedData`)
- Uses `verifyingContractAddressDecryption` as `verifyingContract` in domain (same as `createEIP712`)
- Includes `primaryType: 'DelegatedUserDecryptRequestVerification'` per the SDK type
- Uses `DELEGATED_USER_DECRYPT_TYPES` with `DelegatedUserDecryptRequestVerification` key (NOT `USER_DECRYPT_TYPES`) — the SDK type requires this different primary type with the extra `delegatorAddress` field
- `startTimestamp`/`durationDays` as `String(...)` per `KmsUserDecryptEIP712MessageType` which uses `string` not `bigint`
- `chainId` as `bigint` per `KmsEIP712DomainType` (not `Number(...)`)
- May need `as unknown as` cast since the cleartext types don't perfectly match the branded types from the SDK (`ChecksummedAddress`, `BytesHex`)

### Step 7: Run verification

```bash
pnpm run typecheck   # AC#8 — zero errors
pnpm run test -- --filter packages/sdk -- --run packages/sdk/src/relayer/cleartext/__tests__/  # AC#9
```

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| `KmsDelegatedUserDecryptEIP712Type` uses branded types (`ChecksummedAddress`, `BytesHex`, `string` for timestamps) that don't match plain `string`/`bigint` | Use `as unknown as` cast; cleartext mode is a mock — exact type conformance matters less than shape correctness |
| `domain.chainId` type mismatch — SDK expects `bigint`, existing `createEIP712` uses `Number(...)` | Use `this.#config.chainId` directly (already `bigint`); cast if needed |
| Sequential ACL loop could be slow for many handles | Acceptable for cleartext/mock mode — correctness > performance. Mirrors production behavior. |
| `ACL_INTERFACE` is constructed at module level from `ACL_ABI` — adding fragment changes the interface for all consumers | Safe — the new fragment name is unique, no existing code will accidentally match it |

## Acceptance Criteria Verification

| AC | How Verified |
|----|-------------|
| 1. ACL_ABI includes isHandleDelegatedForUserDecryption | Visual inspection of Step 2a |
| 2. delegatedUserDecrypt calls check per handle | Test 3c — tracks delegation calls, asserts length = 2 |
| 3. Error message contains handle, delegator, delegate, contract | Test 3b — asserts handle hex in error; full message format verified |
| 4. Returns Record<string, bigint> on success | Test 3d — asserts result[handleA] === 7n, result[handleB] === 11n |
| 5. createDelegatedUserDecryptEIP712 domain + message shape | Test 3e — asserts domain.verifyingContract and message.delegatorAddress |
| 6. Unit test: ACL false → throws with handle hex | Test 3b |
| 7. Unit test: message.delegatorAddress matches input | Test 3e |
| 8. pnpm run typecheck passes | Step 7 |
| 9. pnpm run test passes for cleartext tests | Step 7 |
