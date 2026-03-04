# Plan: ACL Security Tests for CleartextFhevmInstance

## Overview

Add 5 new test cases to `cleartext-fhevm-instance.test.ts` covering ACL security gaps:
1. **userDecrypt partial ACL failure** — two handles, second denied
2. **userDecrypt ACL checked against signerAddress** — verify `persistAllowed` receives signerAddress not contractAddress
3. **publicDecrypt partial ACL failure** — two handles, second denied
4. **delegatedUserDecrypt partial delegation failure** — two handles, second denied (sequential loop)
5. **Handle normalization** — uppercase hex input produces lowercase normalized keys

## Work Type Assessment

**TDD applies.** This work adds new test cases that verify observable security behavior (error messages, call counts, argument correctness). The tests ARE the deliverable — no implementation changes needed.

## Files to Modify

- `packages/sdk/src/relayer/cleartext/__tests__/cleartext-fhevm-instance.test.ts` — add 5 test cases

No files to create. No implementation changes required.

## Step-by-Step Plan

Since the deliverable is purely tests, we write all 5 tests then run the suite.

### Step 1: userDecrypt partial ACL failure

Add test: `"userDecrypt with partial ACL failure throws with denied handle and makes zero plaintext calls"`

```typescript
it("userDecrypt with partial ACL failure throws with denied handle and makes zero plaintext calls", async () => {
  const handleA = "0x" + "aa".repeat(32);
  const handleB = "0x" + "bb".repeat(32);
  const normalizedB = ethers.toBeHex(ethers.toBigInt(handleB), 32);

  const { provider, calls } = createMockProvider({
    persistAllowed: (_handle, _account) => {
      // Allow first handle, deny second
      return _handle.toLowerCase() !== normalizedB.toLowerCase();
    },
    plaintexts: {
      [handleA.toLowerCase()]: 1n,
      [handleB.toLowerCase()]: 2n,
    },
  });
  const fhevm = new CleartextFhevmInstance(provider, CLEAR_TEXT_MOCK_CONFIG);

  await expect(
    fhevm.userDecrypt({
      handles: [handleA, handleB],
      contractAddress: CONTRACT_ADDRESS,
      signedContractAddresses: [CONTRACT_ADDRESS],
      privateKey: "0x" + "01".repeat(32),
      publicKey: "0x" + "02".repeat(32),
      signature: "0x" + "03".repeat(65),
      signerAddress: USER_ADDRESS,
      startTimestamp: 1,
      durationDays: 1,
    }),
  ).rejects.toThrow(new RegExp(normalizedB));

  // Zero executor/plaintext calls made (error thrown before plaintext fetch)
  const plaintextCalls = calls.filter(
    (call) =>
      call.method === "eth_call" &&
      (call.params[0] as { to: string }).to.toLowerCase() ===
        TEST_FHEVM_ADDRESSES.executor.toLowerCase(),
  );
  expect(plaintextCalls).toHaveLength(0);
});
```

**Verifies AC 1, 2:** Error contains second handle hex; zero plaintext/executor calls.

### Step 2: userDecrypt ACL checked against signerAddress

Add test: `"userDecrypt checks ACL against signerAddress not contractAddress"`

```typescript
it("userDecrypt checks ACL against signerAddress not contractAddress", async () => {
  const handle = "0x" + "cc".repeat(32);
  const persistAllowedAccounts: string[] = [];

  const { provider } = createMockProvider({
    persistAllowed: (_handle, account) => {
      persistAllowedAccounts.push(account);
      return true;
    },
    plaintexts: { [handle.toLowerCase()]: 42n },
  });
  const fhevm = new CleartextFhevmInstance(provider, CLEAR_TEXT_MOCK_CONFIG);

  await fhevm.userDecrypt({
    handles: [handle],
    contractAddress: CONTRACT_ADDRESS,
    signedContractAddresses: [CONTRACT_ADDRESS],
    privateKey: "0x" + "01".repeat(32),
    publicKey: "0x" + "02".repeat(32),
    signature: "0x" + "03".repeat(65),
    signerAddress: USER_ADDRESS,
    startTimestamp: 1,
    durationDays: 1,
  });

  // Every persistAllowed call must use signerAddress (checksummed), NOT contractAddress
  expect(persistAllowedAccounts.length).toBeGreaterThan(0);
  for (const account of persistAllowedAccounts) {
    expect(account.toLowerCase()).toBe(USER_ADDRESS.toLowerCase());
  }
});
```

**Verifies AC 3:** Every `persistAllowed` mock call has `account === signerAddress`.

### Step 3: publicDecrypt partial ACL failure

Add test: `"publicDecrypt with partial ACL failure throws with denied handle and makes zero plaintext calls"`

```typescript
it("publicDecrypt with partial ACL failure throws with denied handle and makes zero plaintext calls", async () => {
  const handleA = "0x" + "dd".repeat(32);
  const handleB = "0x" + "ee".repeat(32);
  const normalizedB = ethers.toBeHex(ethers.toBigInt(handleB), 32);

  const { provider, calls } = createMockProvider({
    isAllowedForDecryption: (handle) => {
      return handle.toLowerCase() !== normalizedB.toLowerCase();
    },
    plaintexts: {
      [handleA.toLowerCase()]: 10n,
      [handleB.toLowerCase()]: 20n,
    },
  });
  const fhevm = new CleartextFhevmInstance(provider, CLEAR_TEXT_MOCK_CONFIG);

  await expect(fhevm.publicDecrypt([handleA, handleB])).rejects.toThrow(
    new RegExp(normalizedB),
  );

  const plaintextCalls = calls.filter(
    (call) =>
      call.method === "eth_call" &&
      (call.params[0] as { to: string }).to.toLowerCase() ===
        TEST_FHEVM_ADDRESSES.executor.toLowerCase(),
  );
  expect(plaintextCalls).toHaveLength(0);
});
```

**Verifies AC 4, 5:** Error contains second handle; zero plaintext calls.

### Step 4: delegatedUserDecrypt partial delegation failure

Add test: `"delegatedUserDecrypt partial delegation failure throws with second handle and makes exactly 2 delegation calls"`

```typescript
it("delegatedUserDecrypt partial delegation failure throws with second handle and makes exactly 2 delegation calls", async () => {
  const handleA = "0x" + "a1".repeat(32);
  const handleB = "0x" + "b2".repeat(32);
  const normalizedA = ethers.toBeHex(ethers.toBigInt(handleA), 32);
  const normalizedB = ethers.toBeHex(ethers.toBigInt(handleB), 32);
  const delegatorAddress = USER_ADDRESS;
  const delegateAddress = "0x3000000000000000000000000000000000000003";

  const { provider, calls } = createMockProvider({
    isHandleDelegatedForUserDecryption: (_delegator, _delegate, _contract, handle) => {
      // Allow first, deny second
      return handle.toLowerCase() !== normalizedB.toLowerCase();
    },
    plaintexts: {
      [handleA.toLowerCase()]: 7n,
      [handleB.toLowerCase()]: 11n,
    },
  });
  const fhevm = new CleartextFhevmInstance(provider, CLEAR_TEXT_MOCK_CONFIG);

  await expect(
    fhevm.delegatedUserDecrypt({
      handles: [handleA, handleB],
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
  ).rejects.toThrow(new RegExp(normalizedB));

  // Sequential loop: exactly 2 delegation ACL calls (first allowed, second denied)
  const delegationCalls = calls.filter((call) => {
    if (call.method !== "eth_call") return false;
    const tx = call.params[0] as { to: string; data: string };
    if (tx.to.toLowerCase() !== TEST_FHEVM_ADDRESSES.acl.toLowerCase()) return false;
    const parsed = ACL_INTERFACE.parseTransaction({ data: tx.data });
    return parsed?.name === "isHandleDelegatedForUserDecryption";
  });
  expect(delegationCalls).toHaveLength(2);

  // Zero executor/plaintext calls
  const executorCalls = calls.filter(
    (call) =>
      call.method === "eth_call" &&
      (call.params[0] as { to: string }).to.toLowerCase() ===
        TEST_FHEVM_ADDRESSES.executor.toLowerCase(),
  );
  expect(executorCalls).toHaveLength(0);
});
```

**Verifies AC 6, 7:** Error includes second handle; exactly 2 delegation calls; zero executor calls.

### Step 5: Handle normalization with uppercase input

Add test: `"userDecrypt normalizes uppercase hex handles to lowercase 0x-prefixed 66-char keys"`

```typescript
it("userDecrypt normalizes uppercase hex handles to lowercase 0x-prefixed 66-char keys", async () => {
  // Uppercase hex input
  const handleUpper = "0x" + "AB".repeat(32); // uppercase
  const normalizedHandle = ethers.toBeHex(ethers.toBigInt(handleUpper), 32); // lowercase

  const { provider } = createMockProvider({
    persistAllowed: () => true,
    plaintexts: { [normalizedHandle.toLowerCase()]: 55n },
  });
  const fhevm = new CleartextFhevmInstance(provider, CLEAR_TEXT_MOCK_CONFIG);

  const result = await fhevm.userDecrypt({
    handles: [handleUpper],
    contractAddress: CONTRACT_ADDRESS,
    signedContractAddresses: [CONTRACT_ADDRESS],
    privateKey: "0x" + "01".repeat(32),
    publicKey: "0x" + "02".repeat(32),
    signature: "0x" + "03".repeat(65),
    signerAddress: USER_ADDRESS,
    startTimestamp: 1,
    durationDays: 1,
  });

  // Result keys are normalized: lowercase, 0x-prefixed, 66 chars
  const keys = Object.keys(result);
  expect(keys).toHaveLength(1);
  expect(keys[0]).toMatch(/^0x[0-9a-f]{64}$/); // lowercase only
  expect(keys[0]).toHaveLength(66);
  expect(result[keys[0]!]).toBe(55n);
});
```

**Verifies AC 8, 9:** Keys are normalized lowercase 0x-prefixed 66-char; values match expected plaintexts.

### Step 6: Run tests

```bash
pnpm run test -- --filter=cleartext-fhevm-instance
```

**Verifies AC 10.**

## Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| `userDecrypt` uses `Promise.all` for ACL checks — both handles checked in parallel, so "first unauthorized index" may be handleA if timing differs | The `findIndex` is deterministic on the resolved array — order matches input order, not resolution order. Test uses handleB (index 1) as denied, so findIndex returns 1 reliably. |
| Handle normalization via `ethers.toBeHex(ethers.toBigInt(handle), 32)` may not lowercase all chars | Verified: `ethers.toBeHex` always produces lowercase hex. |
| Mock provider `persistAllowed` callback receives already-normalized handle from ACL encoding | The mock parses the ABI-encoded call data, so it receives the exact string that was encoded. Test comparisons use `.toLowerCase()` for safety. |

## Acceptance Criteria Mapping

| AC | Test |
|----|------|
| 1. userDecrypt two handles, second denied → error with second handle hex | Step 1 |
| 2. Zero plaintexts/executor calls on partial failure | Step 1 |
| 3. persistAllowed account === signerAddress | Step 2 |
| 4. publicDecrypt two handles, second denied → error with second handle hex | Step 3 |
| 5. Zero plaintexts calls on publicDecrypt partial failure | Step 3 |
| 6. delegatedUserDecrypt partial failure → error with second handle | Step 4 |
| 7. Exactly 2 delegation ACL calls, zero executor calls | Step 4 |
| 8. Uppercase hex input → normalized lowercase 0x-prefixed 66-char keys | Step 5 |
| 9. Normalized result values match expected | Step 5 |
| 10. pnpm run test passes | Step 6 |
