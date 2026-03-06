# Delegated User Decryption Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add delegated user decryption methods to Token/ReadonlyToken so delegates can manage delegation and decrypt balances on behalf of delegators.

**Architecture:** ACL ABI + contract builders → error codes → config threading (aclAddress) → read methods on ReadonlyToken → write methods on Token → decryptBalanceAs → batch statics → exports. TDD throughout.

**Tech Stack:** TypeScript, vitest, viem ABI types, existing RelayerSDK delegation plumbing.

---

### Task 1: ACL ABI

**Files:**

- Create: `packages/sdk/src/abi/acl.abi.ts`

**Step 1: Create ACL ABI with delegation functions**

```ts
export const ACL_ABI = [
  {
    inputs: [
      { internalType: "address", name: "delegate", type: "address" },
      { internalType: "address", name: "contractAddress", type: "address" },
      { internalType: "uint64", name: "expirationDate", type: "uint64" },
    ],
    name: "delegateForUserDecryption",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "delegate", type: "address" },
      { internalType: "address", name: "contractAddress", type: "address" },
    ],
    name: "revokeDelegationForUserDecryption",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "delegator", type: "address" },
      { internalType: "address", name: "delegate", type: "address" },
      { internalType: "address", name: "contractAddress", type: "address" },
    ],
    name: "getUserDecryptionDelegationExpirationDate",
    outputs: [{ internalType: "uint64", name: "", type: "uint64" }],
    stateMutability: "view",
    type: "function",
  },
] as const;
```

**Step 2: Commit**

```bash
git add packages/sdk/src/abi/acl.abi.ts
git commit -m "feat(sdk): add ACL delegation ABI entries"
```

---

### Task 2: ACL Contract Builders

**Files:**

- Create: `packages/sdk/src/contracts/acl.ts`
- Modify: `packages/sdk/src/contracts/index.ts`

**Step 1: Write the test**

Create `packages/sdk/src/contracts/__tests__/acl.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  delegateForUserDecryptionContract,
  revokeDelegationContract,
  getDelegationExpiryContract,
} from "../acl";

const ACL = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const DELEGATE = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const DELEGATOR = "0xcccccccccccccccccccccccccccccccccccccccc";
const CONTRACT = "0xdddddddddddddddddddddddddddddddddddddd";

describe("ACL contract builders", () => {
  it("delegateForUserDecryptionContract builds correct config", () => {
    const config = delegateForUserDecryptionContract(ACL, DELEGATE, CONTRACT, 1700000000n);
    expect(config.address).toBe(ACL);
    expect(config.functionName).toBe("delegateForUserDecryption");
    expect(config.args).toEqual([DELEGATE, CONTRACT, 1700000000n]);
  });

  it("revokeDelegationContract builds correct config", () => {
    const config = revokeDelegationContract(ACL, DELEGATE, CONTRACT);
    expect(config.address).toBe(ACL);
    expect(config.functionName).toBe("revokeDelegationForUserDecryption");
    expect(config.args).toEqual([DELEGATE, CONTRACT]);
  });

  it("getDelegationExpiryContract builds correct config", () => {
    const config = getDelegationExpiryContract(ACL, DELEGATOR, DELEGATE, CONTRACT);
    expect(config.address).toBe(ACL);
    expect(config.functionName).toBe("getUserDecryptionDelegationExpirationDate");
    expect(config.args).toEqual([DELEGATOR, DELEGATE, CONTRACT]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/sdk/src/contracts/__tests__/acl.test.ts`
Expected: FAIL (module not found)

**Step 3: Implement contract builders**

Create `packages/sdk/src/contracts/acl.ts`:

```ts
import { ACL_ABI } from "../abi/acl.abi";
import type { Address } from "../relayer/relayer-sdk.types";
import { assertAddress } from "../utils";
import { FHE_GAS_LIMIT } from "./gas";

export function delegateForUserDecryptionContract(
  aclAddress: Address,
  delegate: Address,
  contractAddress: Address,
  expirationDate: bigint,
) {
  assertAddress(aclAddress, "aclAddress");
  assertAddress(delegate, "delegate");
  assertAddress(contractAddress, "contractAddress");
  return {
    address: aclAddress,
    abi: ACL_ABI,
    functionName: "delegateForUserDecryption",
    args: [delegate, contractAddress, expirationDate],
    gas: FHE_GAS_LIMIT,
  } as const;
}

export function revokeDelegationContract(
  aclAddress: Address,
  delegate: Address,
  contractAddress: Address,
) {
  assertAddress(aclAddress, "aclAddress");
  assertAddress(delegate, "delegate");
  assertAddress(contractAddress, "contractAddress");
  return {
    address: aclAddress,
    abi: ACL_ABI,
    functionName: "revokeDelegationForUserDecryption",
    args: [delegate, contractAddress],
    gas: FHE_GAS_LIMIT,
  } as const;
}

export function getDelegationExpiryContract(
  aclAddress: Address,
  delegator: Address,
  delegate: Address,
  contractAddress: Address,
) {
  assertAddress(aclAddress, "aclAddress");
  assertAddress(delegator, "delegator");
  assertAddress(delegate, "delegate");
  assertAddress(contractAddress, "contractAddress");
  return {
    address: aclAddress,
    abi: ACL_ABI,
    functionName: "getUserDecryptionDelegationExpirationDate",
    args: [delegator, delegate, contractAddress],
  } as const;
}
```

**Step 4: Add exports to contracts/index.ts**

Append to `packages/sdk/src/contracts/index.ts`:

```ts
export {
  delegateForUserDecryptionContract,
  revokeDelegationContract,
  getDelegationExpiryContract,
} from "./acl";
```

**Step 5: Run tests to verify they pass**

Run: `pnpm vitest run packages/sdk/src/contracts/__tests__/acl.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/sdk/src/contracts/acl.ts packages/sdk/src/contracts/__tests__/acl.test.ts packages/sdk/src/contracts/index.ts packages/sdk/src/abi/acl.abi.ts
git commit -m "feat(sdk): add ACL delegation contract builders"
```

---

### Task 3: Delegation Error Codes

**Files:**

- Modify: `packages/sdk/src/token/errors.ts:38` (before `} as const`)
- Modify: `packages/sdk/src/token/token.types.ts:217` (re-exports)
- Modify: `packages/sdk/src/index.ts:137` (exports)

**Step 1: Write the test**

Add to `packages/sdk/src/token/__tests__/errors.test.ts` (existing file — append a new describe block):

```ts
describe("delegation errors", () => {
  it("DelegationSelfNotAllowedError has correct code", () => {
    const err = new DelegationSelfNotAllowedError("self");
    expect(err.code).toBe(ZamaErrorCode.DelegationSelfNotAllowed);
    expect(err).toBeInstanceOf(ZamaError);
  });

  it("DelegationCooldownError has correct code", () => {
    const err = new DelegationCooldownError("cooldown");
    expect(err.code).toBe(ZamaErrorCode.DelegationCooldown);
    expect(err).toBeInstanceOf(ZamaError);
  });

  it("DelegationNotFoundError has correct code", () => {
    const err = new DelegationNotFoundError("not found");
    expect(err.code).toBe(ZamaErrorCode.DelegationNotFound);
    expect(err).toBeInstanceOf(ZamaError);
  });

  it("DelegationExpiredError has correct code", () => {
    const err = new DelegationExpiredError("expired");
    expect(err.code).toBe(ZamaErrorCode.DelegationExpired);
    expect(err).toBeInstanceOf(ZamaError);
  });

  it("matchZamaError matches delegation codes", () => {
    const err = new DelegationNotFoundError("test");
    const result = matchZamaError(err, {
      DELEGATION_NOT_FOUND: () => "matched",
    });
    expect(result).toBe("matched");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/sdk/src/token/__tests__/errors.test.ts`
Expected: FAIL (imports not found)

**Step 3: Add error codes and classes to errors.ts**

Add 4 new entries to `ZamaErrorCode` object (before `} as const` on line 39):

```ts
  /** Delegation cannot target self (delegate === msg.sender). */
  DelegationSelfNotAllowed: "DELEGATION_SELF_NOT_ALLOWED",
  /** Only one delegate/revoke per (delegator, delegate, contract) per block. */
  DelegationCooldown: "DELEGATION_COOLDOWN",
  /** No active delegation found for this (delegator, delegate, contract) tuple. */
  DelegationNotFound: "DELEGATION_NOT_FOUND",
  /** The delegation has expired. */
  DelegationExpired: "DELEGATION_EXPIRED",
```

Add 4 new error classes after `ConfigurationError` (after line 150):

```ts
/** Delegation cannot target self (delegate === msg.sender). */
export class DelegationSelfNotAllowedError extends ZamaError {
  constructor(message: string, options?: ErrorOptions) {
    super(ZamaErrorCode.DelegationSelfNotAllowed, message, options);
    this.name = "DelegationSelfNotAllowedError";
  }
}

/** Only one delegate/revoke per (delegator, delegate, contract) per block. */
export class DelegationCooldownError extends ZamaError {
  constructor(message: string, options?: ErrorOptions) {
    super(ZamaErrorCode.DelegationCooldown, message, options);
    this.name = "DelegationCooldownError";
  }
}

/** No active delegation found for this (delegator, delegate, contract) tuple. */
export class DelegationNotFoundError extends ZamaError {
  constructor(message: string, options?: ErrorOptions) {
    super(ZamaErrorCode.DelegationNotFound, message, options);
    this.name = "DelegationNotFoundError";
  }
}

/** The delegation has expired. */
export class DelegationExpiredError extends ZamaError {
  constructor(message: string, options?: ErrorOptions) {
    super(ZamaErrorCode.DelegationExpired, message, options);
    this.name = "DelegationExpiredError";
  }
}
```

**Step 4: Add re-exports to token.types.ts and index.ts**

In `packages/sdk/src/token/token.types.ts` line 217, add to the re-export:

```ts
  DelegationSelfNotAllowedError,
  DelegationCooldownError,
  DelegationNotFoundError,
  DelegationExpiredError,
```

In `packages/sdk/src/index.ts` line 137 area, add to the error exports:

```ts
  DelegationSelfNotAllowedError,
  DelegationCooldownError,
  DelegationNotFoundError,
  DelegationExpiredError,
```

**Step 5: Run tests to verify they pass**

Run: `pnpm vitest run packages/sdk/src/token/__tests__/errors.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/sdk/src/token/errors.ts packages/sdk/src/token/token.types.ts packages/sdk/src/index.ts packages/sdk/src/token/__tests__/errors.test.ts
git commit -m "feat(sdk): add delegation error codes and classes"
```

---

### Task 4: Thread aclAddress Through Config

**Files:**

- Modify: `packages/sdk/src/token/readonly-token.ts:52-69` (ReadonlyTokenConfig)
- Modify: `packages/sdk/src/token/zama-sdk.ts:12-41` (ZamaSDKConfig)
- Modify: `packages/sdk/src/token/zama-sdk.ts:133-164` (createReadonlyToken/createToken)

**Step 1: Add `aclAddress` to ReadonlyTokenConfig**

In `packages/sdk/src/token/readonly-token.ts`, add to the `ReadonlyTokenConfig` interface (after `address` field, around line 64):

```ts
  /** ACL contract address. Required for delegation methods (`delegateDecryption`, `decryptBalanceAs`, etc.). */
  aclAddress?: Address;
```

Store it in the class (add a protected field):

```ts
protected readonly aclAddress: Address | undefined;
```

Set it in constructor:

```ts
this.aclAddress = config.aclAddress ? normalizeAddress(config.aclAddress, "aclAddress") : undefined;
```

Add a protected helper that throws if missing:

```ts
protected requireAclAddress(): Address {
  if (!this.aclAddress) {
    throw new ConfigurationError(
      "aclAddress is required for delegation operations. Pass it in the token config or ZamaSDKConfig.",
    );
  }
  return this.aclAddress;
}
```

Import `ConfigurationError` from `./errors`.

**Step 2: Add `aclAddress` to ZamaSDKConfig**

In `packages/sdk/src/token/zama-sdk.ts`, add to `ZamaSDKConfig`:

```ts
  /** ACL contract address. Required for delegation methods on tokens created by this SDK. */
  aclAddress?: Address;
```

Store it: `readonly #aclAddress: Address | undefined;`

Set in constructor: `this.#aclAddress = config.aclAddress ? normalizeAddress(config.aclAddress, "aclAddress") : undefined;`

Thread through `createReadonlyToken` and `createToken`:

```ts
aclAddress: this.#aclAddress,
```

**Step 3: Run full test suite to verify no regression**

Run: `pnpm vitest run`
Expected: All existing tests PASS (aclAddress is optional, nothing breaks)

**Step 4: Commit**

```bash
git add packages/sdk/src/token/readonly-token.ts packages/sdk/src/token/zama-sdk.ts
git commit -m "feat(sdk): thread aclAddress through token config"
```

---

### Task 5: Read Methods (isDelegated, getDelegationExpiry)

**Files:**

- Modify: `packages/sdk/src/token/readonly-token.ts`
- Test: `packages/sdk/src/token/__tests__/delegation.test.ts` (new file)

**Step 1: Write the tests**

Create `packages/sdk/src/token/__tests__/delegation.test.ts`:

```ts
import { describe, expect, it, vi } from "../../test-fixtures";
import { ReadonlyToken } from "../readonly-token";
import { Token } from "../token";
import type { Address } from "../token.types";
import { ZamaErrorCode, ConfigurationError } from "../errors";
import { MemoryStorage } from "../memory-storage";

const ACL = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address;
const TOKEN_ADDR = "0x1111111111111111111111111111111111111111" as Address;
const DELEGATOR = "0xcccccccccccccccccccccccccccccccccccccccc" as Address;
const DELEGATE = "0xdddddddddddddddddddddddddddddddddddddd" as Address;

describe("delegation read methods", () => {
  function createReadonlyToken(signer: any, relayer: any, opts: { aclAddress?: Address } = {}) {
    return new ReadonlyToken({
      relayer,
      signer,
      storage: new MemoryStorage(),
      sessionStorage: new MemoryStorage(),
      address: TOKEN_ADDR,
      aclAddress: opts.aclAddress,
    });
  }

  it("getDelegationExpiry reads from ACL contract", async ({ signer, relayer }) => {
    vi.mocked(signer.readContract).mockResolvedValue(1700000000n);
    const token = createReadonlyToken(signer, relayer, { aclAddress: ACL });

    const expiry = await token.getDelegationExpiry(DELEGATOR, DELEGATE);

    expect(signer.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: ACL,
        functionName: "getUserDecryptionDelegationExpirationDate",
        args: [DELEGATOR, DELEGATE, TOKEN_ADDR],
      }),
    );
    expect(expiry).toBe(1700000000n);
  });

  it("isDelegated returns true when expiry is in the future", async ({ signer, relayer }) => {
    const futureTimestamp = BigInt(Math.floor(Date.now() / 1000) + 3600);
    vi.mocked(signer.readContract).mockResolvedValue(futureTimestamp);
    const token = createReadonlyToken(signer, relayer, { aclAddress: ACL });

    expect(await token.isDelegated(DELEGATOR, DELEGATE)).toBe(true);
  });

  it("isDelegated returns false when expiry is 0", async ({ signer, relayer }) => {
    vi.mocked(signer.readContract).mockResolvedValue(0n);
    const token = createReadonlyToken(signer, relayer, { aclAddress: ACL });

    expect(await token.isDelegated(DELEGATOR, DELEGATE)).toBe(false);
  });

  it("isDelegated returns false when expiry is in the past", async ({ signer, relayer }) => {
    vi.mocked(signer.readContract).mockResolvedValue(1000n);
    const token = createReadonlyToken(signer, relayer, { aclAddress: ACL });

    expect(await token.isDelegated(DELEGATOR, DELEGATE)).toBe(false);
  });

  it("throws ConfigurationError when aclAddress is missing", async ({ signer, relayer }) => {
    const token = createReadonlyToken(signer, relayer);

    await expect(token.getDelegationExpiry(DELEGATOR, DELEGATE)).rejects.toThrow(
      ConfigurationError,
    );
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/sdk/src/token/__tests__/delegation.test.ts`
Expected: FAIL (methods don't exist)

**Step 3: Implement read methods on ReadonlyToken**

Add to `packages/sdk/src/token/readonly-token.ts`, before the closing `}` of the class:

```ts
  /**
   * Check whether a delegation is active for this token's contract address.
   *
   * @param delegator - The address that granted the delegation.
   * @param delegate - The address that received delegation rights.
   * @returns `true` if the delegation exists and has not expired.
   * @throws {@link ConfigurationError} if `aclAddress` was not provided.
   */
  async isDelegated(delegator: Address, delegate: Address): Promise<boolean> {
    const expiry = await this.getDelegationExpiry(delegator, delegate);
    return expiry > 0n && expiry >= BigInt(Math.floor(Date.now() / 1000));
  }

  /**
   * Get the expiration timestamp of a delegation for this token.
   *
   * @param delegator - The address that granted the delegation.
   * @param delegate - The address that received delegation rights.
   * @returns Unix timestamp as bigint. `0n` = no delegation. `2^64 - 1` = permanent.
   * @throws {@link ConfigurationError} if `aclAddress` was not provided.
   */
  async getDelegationExpiry(delegator: Address, delegate: Address): Promise<bigint> {
    const acl = this.requireAclAddress();
    const normalizedDelegator = normalizeAddress(delegator, "delegator");
    const normalizedDelegate = normalizeAddress(delegate, "delegate");
    return this.signer.readContract(
      getDelegationExpiryContract(acl, normalizedDelegator, normalizedDelegate, this.address),
    );
  }
```

Import `getDelegationExpiryContract` from `"../contracts"` and `ConfigurationError` from `"./errors"`.

**Step 4: Run tests to verify they pass**

Run: `pnpm vitest run packages/sdk/src/token/__tests__/delegation.test.ts`
Expected: PASS

**Step 5: Run full test suite for regression**

Run: `pnpm vitest run`
Expected: All PASS

**Step 6: Commit**

```bash
git add packages/sdk/src/token/readonly-token.ts packages/sdk/src/token/__tests__/delegation.test.ts
git commit -m "feat(sdk): add isDelegated and getDelegationExpiry to ReadonlyToken"
```

---

### Task 6: Write Methods (delegateDecryption, revokeDelegation)

**Files:**

- Modify: `packages/sdk/src/token/token.ts`
- Modify: `packages/sdk/src/token/__tests__/delegation.test.ts`

**Step 1: Add write method tests to delegation.test.ts**

Append a new describe block:

```ts
describe("delegation write methods", () => {
  function createDelegationToken(signer: any, relayer: any, opts: { aclAddress?: Address } = {}) {
    return new Token({
      relayer,
      signer,
      storage: new MemoryStorage(),
      sessionStorage: new MemoryStorage(),
      address: TOKEN_ADDR,
      aclAddress: opts.aclAddress,
    });
  }

  it("delegateDecryption calls ACL with expiration date", async ({ signer, relayer }) => {
    const token = createDelegationToken(signer, relayer, { aclAddress: ACL });
    const expiry = new Date("2030-01-01T00:00:00Z");

    await token.delegateDecryption(DELEGATE, { expirationDate: expiry });

    expect(signer.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: ACL,
        functionName: "delegateForUserDecryption",
        args: [DELEGATE, TOKEN_ADDR, BigInt(Math.floor(expiry.getTime() / 1000))],
      }),
    );
  });

  it("delegateDecryption without expiration uses uint64 max", async ({ signer, relayer }) => {
    const token = createDelegationToken(signer, relayer, { aclAddress: ACL });

    await token.delegateDecryption(DELEGATE);

    expect(signer.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "delegateForUserDecryption",
        args: [DELEGATE, TOKEN_ADDR, 2n ** 64n - 1n],
      }),
    );
  });

  it("delegateDecryption returns TransactionResult", async ({ signer, relayer }) => {
    const token = createDelegationToken(signer, relayer, { aclAddress: ACL });

    const result = await token.delegateDecryption(DELEGATE);

    expect(result).toEqual({ txHash: "0xtxhash", receipt: { logs: [] } });
  });

  it("revokeDelegation calls ACL correctly", async ({ signer, relayer }) => {
    const token = createDelegationToken(signer, relayer, { aclAddress: ACL });

    await token.revokeDelegation(DELEGATE);

    expect(signer.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: ACL,
        functionName: "revokeDelegationForUserDecryption",
        args: [DELEGATE, TOKEN_ADDR],
      }),
    );
  });

  it("delegateDecryption throws ConfigurationError without aclAddress", async ({
    signer,
    relayer,
  }) => {
    const token = createDelegationToken(signer, relayer);

    await expect(token.delegateDecryption(DELEGATE)).rejects.toThrow(ConfigurationError);
  });

  it("delegateDecryption wraps revert as TransactionRevertedError", async ({ signer, relayer }) => {
    vi.mocked(signer.writeContract).mockRejectedValue(new Error("revert"));
    const token = createDelegationToken(signer, relayer, { aclAddress: ACL });

    await expect(token.delegateDecryption(DELEGATE)).rejects.toThrow(
      expect.objectContaining({ code: ZamaErrorCode.TransactionReverted }),
    );
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/sdk/src/token/__tests__/delegation.test.ts`
Expected: FAIL (methods don't exist on Token)

**Step 3: Implement write methods on Token**

Add to `packages/sdk/src/token/token.ts`, before the `// PRIVATE HELPERS` comment:

```ts
  // DELEGATION OPERATIONS

  /**
   * Delegate decryption rights for this token to another address.
   * Calls `ACL.delegateForUserDecryption()` on-chain.
   *
   * @param delegate - Address to delegate decryption rights to.
   * @param options - Optional expiration date. If omitted, delegation is permanent.
   * @returns The transaction hash and mined receipt.
   * @throws {@link ConfigurationError} if `aclAddress` was not provided.
   * @throws {@link TransactionRevertedError} if the delegation transaction reverts.
   */
  async delegateDecryption(
    delegate: Address,
    options?: { expirationDate?: Date },
  ): Promise<TransactionResult> {
    const acl = this.requireAclAddress();
    const normalizedDelegate = normalizeAddress(delegate, "delegate");
    const expirationDate = options?.expirationDate
      ? BigInt(Math.floor(options.expirationDate.getTime() / 1000))
      : 2n ** 64n - 1n; // permanent

    try {
      const txHash = await this.signer.writeContract(
        delegateForUserDecryptionContract(acl, normalizedDelegate, this.address, expirationDate),
      );
      const receipt = await this.signer.waitForTransactionReceipt(txHash);
      return { txHash, receipt };
    } catch (error) {
      if (error instanceof ZamaError) throw error;
      throw new TransactionRevertedError("Delegation transaction failed", {
        cause: error instanceof Error ? error : undefined,
      });
    }
  }

  /**
   * Revoke decryption delegation for this token.
   * Calls `ACL.revokeDelegationForUserDecryption()` on-chain.
   *
   * @param delegate - Address to revoke delegation from.
   * @returns The transaction hash and mined receipt.
   * @throws {@link ConfigurationError} if `aclAddress` was not provided.
   * @throws {@link TransactionRevertedError} if the revocation transaction reverts.
   */
  async revokeDelegation(delegate: Address): Promise<TransactionResult> {
    const acl = this.requireAclAddress();
    const normalizedDelegate = normalizeAddress(delegate, "delegate");

    try {
      const txHash = await this.signer.writeContract(
        revokeDelegationContract(acl, normalizedDelegate, this.address),
      );
      const receipt = await this.signer.waitForTransactionReceipt(txHash);
      return { txHash, receipt };
    } catch (error) {
      if (error instanceof ZamaError) throw error;
      throw new TransactionRevertedError("Revoke delegation transaction failed", {
        cause: error instanceof Error ? error : undefined,
      });
    }
  }
```

Import `delegateForUserDecryptionContract` and `revokeDelegationContract` from `"../contracts"`.

**Step 4: Run tests to verify they pass**

Run: `pnpm vitest run packages/sdk/src/token/__tests__/delegation.test.ts`
Expected: PASS

**Step 5: Run full test suite for regression**

Run: `pnpm vitest run`
Expected: All PASS

**Step 6: Commit**

```bash
git add packages/sdk/src/token/token.ts packages/sdk/src/token/__tests__/delegation.test.ts
git commit -m "feat(sdk): add delegateDecryption and revokeDelegation to Token"
```

---

### Task 7: decryptBalanceAs on ReadonlyToken

**Files:**

- Modify: `packages/sdk/src/token/readonly-token.ts`
- Modify: `packages/sdk/src/token/__tests__/delegation.test.ts`

**Step 1: Add tests for decryptBalanceAs**

Append to `delegation.test.ts`:

```ts
const VALID_HANDLE = ("0x" + "ab".repeat(32)) as Address;
const ZERO_HANDLE = "0x" + "0".repeat(64);

describe("decryptBalanceAs", () => {
  function createReadonlyTokenWithAcl(signer: any, relayer: any) {
    return new ReadonlyToken({
      relayer,
      signer,
      storage: new MemoryStorage(),
      sessionStorage: new MemoryStorage(),
      address: TOKEN_ADDR,
      aclAddress: ACL,
    });
  }

  it("returns 0n for zero handle without calling relayer", async ({ signer, relayer }) => {
    vi.mocked(signer.readContract).mockResolvedValue(ZERO_HANDLE);
    const token = createReadonlyTokenWithAcl(signer, relayer);

    const balance = await token.decryptBalanceAs(DELEGATOR);

    expect(relayer.delegatedUserDecrypt).not.toHaveBeenCalled();
    expect(balance).toBe(0n);
  });

  it("calls delegatedUserDecrypt with correct params", async ({ signer, relayer }) => {
    vi.mocked(signer.readContract).mockResolvedValue(VALID_HANDLE);
    vi.mocked(relayer.createDelegatedUserDecryptEIP712).mockResolvedValue({
      domain: { name: "test", version: "1", chainId: 1, verifyingContract: "0xkms" },
      types: { DelegatedUserDecryptRequestVerification: [] },
      message: {
        publicKey: "0xpub",
        contractAddresses: [TOKEN_ADDR],
        delegatorAddress: DELEGATOR,
        startTimestamp: 1000n,
        durationDays: 1n,
        extraData: "0x",
      },
    });
    vi.mocked(relayer.delegatedUserDecrypt).mockResolvedValue({
      [VALID_HANDLE]: 500n,
    });
    const token = createReadonlyTokenWithAcl(signer, relayer);

    const balance = await token.decryptBalanceAs(DELEGATOR);

    expect(balance).toBe(500n);
    expect(relayer.generateKeypair).toHaveBeenCalled();
    expect(relayer.createDelegatedUserDecryptEIP712).toHaveBeenCalledWith(
      "0xpub",
      [TOKEN_ADDR],
      DELEGATOR,
      expect.any(Number),
      expect.any(Number),
    );
    expect(relayer.delegatedUserDecrypt).toHaveBeenCalledWith(
      expect.objectContaining({
        handles: [VALID_HANDLE],
        contractAddress: TOKEN_ADDR,
        delegatorAddress: DELEGATOR,
      }),
    );
  });

  it("throws ConfigurationError without aclAddress", async ({ signer, relayer }) => {
    const token = new ReadonlyToken({
      relayer,
      signer,
      storage: new MemoryStorage(),
      sessionStorage: new MemoryStorage(),
      address: TOKEN_ADDR,
    });

    // decryptBalanceAs doesn't strictly require aclAddress — it only needs relayer
    // But we've included it in the interface that requires it. Skip this test if
    // the method doesn't require aclAddress.
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/sdk/src/token/__tests__/delegation.test.ts`
Expected: FAIL (method doesn't exist)

**Step 3: Implement decryptBalanceAs**

Add to ReadonlyToken class in `readonly-token.ts`:

```ts
  /**
   * Decrypt the delegator's balance for this token using delegated credentials.
   * The connected signer must be the delegate with an active delegation.
   *
   * @param delegator - The address whose balance to decrypt.
   * @param options - Optional owner override (defaults to delegator).
   * @returns The decrypted plaintext balance as a bigint.
   * @throws {@link DecryptionFailedError} if delegated decryption fails.
   */
  async decryptBalanceAs(
    delegator: Address,
    options?: { owner?: Address },
  ): Promise<bigint> {
    const normalizedDelegator = normalizeAddress(delegator, "delegator");
    const owner = options?.owner
      ? normalizeAddress(options.owner, "owner")
      : normalizedDelegator;

    const handle = await this.readConfidentialBalanceOf(owner);
    if (this.isZeroHandle(handle)) return BigInt(0);

    // Check persistent cache (keyed by delegator, not delegate)
    const cached = await loadCachedBalance({
      storage: this.storage,
      tokenAddress: this.address,
      owner: normalizedDelegator,
      handle,
    });
    if (cached !== null) return cached;

    // Get delegate's own credentials (keypair + base credential)
    const creds = await this.credentials.allow(this.address);
    const delegateAddress = await this.signer.getAddress();

    // Get delegated EIP-712 typed data and sign it
    const delegatedEIP712 = await this.sdk.createDelegatedUserDecryptEIP712(
      creds.publicKey,
      [this.address],
      normalizedDelegator,
      creds.startTimestamp,
      creds.durationDays,
    );
    const delegatedSignature = await this.signer.signTypedData(delegatedEIP712);

    const t0 = Date.now();
    try {
      this.emit({ type: ZamaSDKEvents.DecryptStart });
      const result = await this.sdk.delegatedUserDecrypt({
        handles: [handle],
        contractAddress: this.address,
        signedContractAddresses: [this.address],
        privateKey: creds.privateKey,
        publicKey: creds.publicKey,
        signature: delegatedSignature,
        delegatorAddress: normalizedDelegator,
        delegateAddress,
        startTimestamp: creds.startTimestamp,
        durationDays: creds.durationDays,
      });
      this.emit({ type: ZamaSDKEvents.DecryptEnd, durationMs: Date.now() - t0 });

      const value = (result[handle] as bigint | undefined) ?? BigInt(0);
      await saveCachedBalance({
        storage: this.storage,
        tokenAddress: this.address,
        owner: normalizedDelegator,
        handle,
        value,
      });
      return value;
    } catch (error) {
      this.emit({
        type: ZamaSDKEvents.DecryptError,
        error: toError(error),
        durationMs: Date.now() - t0,
      });
      throw wrapDecryptError(error, "Failed to decrypt delegated balance");
    }
  }
```

**Step 4: Run tests to verify they pass**

Run: `pnpm vitest run packages/sdk/src/token/__tests__/delegation.test.ts`
Expected: PASS

**Step 5: Run full test suite for regression**

Run: `pnpm vitest run`
Expected: All PASS

**Step 6: Commit**

```bash
git add packages/sdk/src/token/readonly-token.ts packages/sdk/src/token/__tests__/delegation.test.ts
git commit -m "feat(sdk): add decryptBalanceAs for delegated balance decryption"
```

---

### Task 8: Batch Static Methods

**Files:**

- Modify: `packages/sdk/src/token/token.ts`
- Modify: `packages/sdk/src/token/__tests__/delegation.test.ts`

**Step 1: Add batch tests**

Append to `delegation.test.ts`:

```ts
describe("batch delegation", () => {
  const TOKEN2 = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" as Address;

  it("delegateDecryptionBatch calls delegateDecryption on each token", async ({
    signer,
    relayer,
  }) => {
    const token1 = new Token({
      relayer,
      signer,
      storage: new MemoryStorage(),
      sessionStorage: new MemoryStorage(),
      address: TOKEN_ADDR,
      aclAddress: ACL,
    });
    const token2 = new Token({
      relayer,
      signer,
      storage: new MemoryStorage(),
      sessionStorage: new MemoryStorage(),
      address: TOKEN2,
      aclAddress: ACL,
    });

    const results = await Token.delegateDecryptionBatch([token1, token2], DELEGATE);

    expect(results.size).toBe(2);
    expect(results.get(TOKEN_ADDR)).toEqual(expect.objectContaining({ txHash: "0xtxhash" }));
    expect(results.get(TOKEN2)).toEqual(expect.objectContaining({ txHash: "0xtxhash" }));
  });

  it("delegateDecryptionBatch captures per-token errors", async ({ signer, relayer }) => {
    vi.mocked(signer.writeContract)
      .mockResolvedValueOnce("0xtxhash")
      .mockRejectedValueOnce(new Error("revert"));

    const token1 = new Token({
      relayer,
      signer,
      storage: new MemoryStorage(),
      sessionStorage: new MemoryStorage(),
      address: TOKEN_ADDR,
      aclAddress: ACL,
    });
    const token2 = new Token({
      relayer,
      signer,
      storage: new MemoryStorage(),
      sessionStorage: new MemoryStorage(),
      address: TOKEN2,
      aclAddress: ACL,
    });

    const results = await Token.delegateDecryptionBatch([token1, token2], DELEGATE);

    expect(results.get(TOKEN_ADDR)).toEqual(expect.objectContaining({ txHash: "0xtxhash" }));
    expect(results.get(TOKEN2)).toBeInstanceOf(Error);
  });

  it("revokeDelegationBatch works", async ({ signer, relayer }) => {
    const token1 = new Token({
      relayer,
      signer,
      storage: new MemoryStorage(),
      sessionStorage: new MemoryStorage(),
      address: TOKEN_ADDR,
      aclAddress: ACL,
    });

    const results = await Token.revokeDelegationBatch([token1], DELEGATE);

    expect(results.size).toBe(1);
    expect(results.get(TOKEN_ADDR)).toEqual(expect.objectContaining({ txHash: "0xtxhash" }));
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/sdk/src/token/__tests__/delegation.test.ts`
Expected: FAIL (static methods don't exist)

**Step 3: Implement batch statics on Token**

Add static methods to Token class:

```ts
  /**
   * Delegate decryption rights across multiple tokens in parallel.
   * Returns a per-token result map with partial success semantics.
   *
   * @param tokens - Array of Token instances to delegate on.
   * @param delegate - Address to delegate decryption rights to.
   * @param options - Optional expiration date.
   * @returns Map from token address to TransactionResult or ZamaError.
   */
  static async delegateDecryptionBatch(
    tokens: Token[],
    delegate: Address,
    options?: { expirationDate?: Date },
  ): Promise<Map<Address, TransactionResult | ZamaError>> {
    const results = new Map<Address, TransactionResult | ZamaError>();
    const settled = await Promise.allSettled(
      tokens.map((t) => t.delegateDecryption(delegate, options)),
    );
    for (let i = 0; i < tokens.length; i++) {
      const outcome = settled[i]!;
      if (outcome.status === "fulfilled") {
        results.set(tokens[i]!.address, outcome.value);
      } else {
        const err =
          outcome.reason instanceof ZamaError
            ? outcome.reason
            : new TransactionRevertedError("Delegation failed", {
                cause: outcome.reason instanceof Error ? outcome.reason : undefined,
              });
        results.set(tokens[i]!.address, err);
      }
    }
    return results;
  }

  /**
   * Revoke delegation across multiple tokens in parallel.
   * Returns a per-token result map with partial success semantics.
   *
   * @param tokens - Array of Token instances to revoke delegation on.
   * @param delegate - Address to revoke delegation from.
   * @returns Map from token address to TransactionResult or ZamaError.
   */
  static async revokeDelegationBatch(
    tokens: Token[],
    delegate: Address,
  ): Promise<Map<Address, TransactionResult | ZamaError>> {
    const results = new Map<Address, TransactionResult | ZamaError>();
    const settled = await Promise.allSettled(
      tokens.map((t) => t.revokeDelegation(delegate)),
    );
    for (let i = 0; i < tokens.length; i++) {
      const outcome = settled[i]!;
      if (outcome.status === "fulfilled") {
        results.set(tokens[i]!.address, outcome.value);
      } else {
        const err =
          outcome.reason instanceof ZamaError
            ? outcome.reason
            : new TransactionRevertedError("Revoke delegation failed", {
                cause: outcome.reason instanceof Error ? outcome.reason : undefined,
              });
        results.set(tokens[i]!.address, err);
      }
    }
    return results;
  }
```

**Step 4: Run tests to verify they pass**

Run: `pnpm vitest run packages/sdk/src/token/__tests__/delegation.test.ts`
Expected: PASS

**Step 5: Run full test suite for regression**

Run: `pnpm vitest run`
Expected: All PASS

**Step 6: Commit**

```bash
git add packages/sdk/src/token/token.ts packages/sdk/src/token/__tests__/delegation.test.ts
git commit -m "feat(sdk): add delegateDecryptionBatch and revokeDelegationBatch statics"
```

---

### Task 9: Public Exports

**Files:**

- Modify: `packages/sdk/src/index.ts`

**Step 1: Add new exports**

Add ACL ABI export:

```ts
export { ACL_ABI } from "./abi/acl.abi";
```

Add contract builder exports:

```ts
export {
  delegateForUserDecryptionContract,
  revokeDelegationContract,
  getDelegationExpiryContract,
} from "./contracts";
```

Verify error exports already added in Task 3. If not, add:

```ts
  DelegationSelfNotAllowedError,
  DelegationCooldownError,
  DelegationNotFoundError,
  DelegationExpiredError,
```

**Step 2: Run typecheck**

Run: `pnpm --filter @zama-fhe/sdk typecheck`
Expected: No errors

**Step 3: Run build**

Run: `pnpm build:sdk`
Expected: Build succeeds

**Step 4: Run full test suite**

Run: `pnpm vitest run`
Expected: All PASS

**Step 5: Commit**

```bash
git add packages/sdk/src/index.ts
git commit -m "feat(sdk): export delegation ABIs, contracts, and errors"
```

---

### Task 10: API Reports & Final Verification

**Step 1: Regenerate API reports**

Run: `pnpm api-report:sdk`

This will update the `packages/sdk/etc/*.api.md` files.

**Step 2: Run lint**

Run: `pnpm lint`
Expected: No errors

**Step 3: Run full test suite one final time**

Run: `pnpm vitest run`
Expected: All PASS

**Step 4: Commit API reports**

```bash
git add packages/sdk/etc/
git commit -m "chore(sdk): update API reports for delegation feature"
```
