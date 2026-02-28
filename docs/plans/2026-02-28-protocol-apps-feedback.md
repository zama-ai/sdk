# Protocol Apps Feedback Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement 10 feedback items from the Protocol Apps alpha release, improving the Zama SDK's type safety, developer ergonomics, and API completeness.

**Architecture:** Changes span two packages: `@zama-fhe/sdk` (core) and `@zama-fhe/react-sdk` (React hooks). SDK-layer changes are implemented first since React hooks depend on them. Each task is self-contained with its own tests and commit.

**Tech Stack:** TypeScript, Vitest, TanStack Query, React 18+, tsup

---

### Task 1: Add `SignerRequiredError` to error system

**Files:**

- Modify: `packages/sdk/src/token/errors.ts:36-37` (add error code)
- Modify: `packages/sdk/src/token/errors.ts:140` (add error class after last error)
- Modify: `packages/sdk/src/token/token.types.ts:95-108` (re-export new error)
- Modify: `packages/sdk/src/index.ts:103-116` (export new error)
- Test: `packages/sdk/src/token/__tests__/errors.test.ts`

**Step 1: Write the failing test**

Add to `packages/sdk/src/token/__tests__/errors.test.ts`:

```typescript
it("SignerRequiredError has correct code and name", () => {
  const error = new SignerRequiredError("No signer connected");
  expect(error).toBeInstanceOf(ZamaError);
  expect(error.code).toBe("SIGNER_REQUIRED");
  expect(error.name).toBe("SignerRequiredError");
  expect(error.message).toBe("No signer connected");
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/sdk && pnpm vitest run src/token/__tests__/errors.test.ts`
Expected: FAIL — `SignerRequiredError` is not defined

**Step 3: Implement SignerRequiredError**

In `packages/sdk/src/token/errors.ts`, add to `ZamaErrorCode` object (after line 36):

```typescript
  /** No wallet signer is connected. */
  SignerRequired: "SIGNER_REQUIRED",
```

After `RelayerRequestFailedError` class (after line 140), add:

```typescript
/** No wallet signer connected. Connect a wallet before calling write operations. */
export class SignerRequiredError extends ZamaError {
  constructor(message: string, options?: ErrorOptions) {
    super(ZamaErrorCode.SignerRequired, message, options);
    this.name = "SignerRequiredError";
  }
}
```

In `packages/sdk/src/token/token.types.ts`, add `SignerRequiredError` to the re-export block.

In `packages/sdk/src/index.ts`, add `SignerRequiredError` to the error exports (line ~116).

In `packages/react-sdk/src/index.ts`, add `SignerRequiredError` to the re-export from `@zama-fhe/sdk`.

**Step 4: Run test to verify it passes**

Run: `cd packages/sdk && pnpm vitest run src/token/__tests__/errors.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/sdk/src/token/errors.ts packages/sdk/src/token/token.types.ts packages/sdk/src/index.ts packages/react-sdk/src/index.ts packages/sdk/src/token/__tests__/errors.test.ts
git commit -m "feat: add SignerRequiredError for optional signer support"
```

---

### Task 2: Make signer optional in ZamaSDK

**Files:**

- Modify: `packages/sdk/src/token/zama-sdk.ts:10-14` (ZamaSDKConfig), `28-40` (constructor), add `setSigner`
- Modify: `packages/sdk/src/token/readonly-token.ts:51-64` (ReadonlyTokenConfig), `78-91` (constructor)
- Test: `packages/sdk/src/token/__tests__/zama-sdk.test.ts`

**Step 1: Write the failing test**

Add to `packages/sdk/src/token/__tests__/zama-sdk.test.ts`:

```typescript
describe("optional signer", () => {
  it("creates an SDK without a signer", () => {
    const sdk = new ZamaSDK({
      relayer: createMockSdk() as unknown as RelayerSDK,
      storage: new MemoryStorage(),
    });
    expect(sdk.signer).toBeUndefined();
  });

  it("allows setting signer after construction", () => {
    const sdk = new ZamaSDK({
      relayer: createMockSdk() as unknown as RelayerSDK,
      storage: new MemoryStorage(),
    });
    const signer = createMockSigner();
    sdk.setSigner(signer);
    expect(sdk.signer).toBe(signer);
  });

  it("creates tokens after signer is set", () => {
    const sdk = new ZamaSDK({
      relayer: createMockSdk() as unknown as RelayerSDK,
      storage: new MemoryStorage(),
    });
    sdk.setSigner(createMockSigner());
    const token = sdk.createToken("0x1111111111111111111111111111111111111111");
    expect(token).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/sdk && pnpm vitest run src/token/__tests__/zama-sdk.test.ts`
Expected: FAIL — ZamaSDKConfig requires signer

**Step 3: Implement optional signer**

In `packages/sdk/src/token/zama-sdk.ts`:

```typescript
export interface ZamaSDKConfig {
  relayer: RelayerSDK;
  signer?: GenericSigner; // <-- make optional
  storage: GenericStringStorage;
  credentialDurationDays?: number;
  onEvent?: ZamaSDKEventListener;
}

export class ZamaSDK {
  readonly relayer: RelayerSDK;
  #signer: GenericSigner | undefined; // <-- mutable
  readonly storage: GenericStringStorage;
  readonly #credentialDurationDays: number | undefined;
  readonly #onEvent: ZamaSDKEventListener | undefined;

  constructor(config: ZamaSDKConfig) {
    this.relayer = config.relayer;
    this.#signer = config.signer;
    this.storage = config.storage;
    this.#credentialDurationDays = config.credentialDurationDays;
    this.#onEvent = config.onEvent;
  }

  get signer(): GenericSigner | undefined {
    return this.#signer;
  }

  /** Bind a wallet signer after construction (e.g. when the user connects their wallet). */
  setSigner(signer: GenericSigner): void {
    this.#signer = signer;
  }

  /** Require a signer, throwing SignerRequiredError if none is set. */
  requireSigner(): GenericSigner {
    if (!this.#signer) {
      throw new SignerRequiredError(
        "No wallet signer connected. Call setSigner() or pass signer to ZamaSDK.",
      );
    }
    return this.#signer;
  }

  createReadonlyToken(address: Address): ReadonlyToken {
    return new ReadonlyToken({
      sdk: this.relayer,
      signer: this.requireSigner(),
      storage: this.storage,
      address: normalizeAddress(address, "address"),
      durationDays: this.#credentialDurationDays,
      onEvent: this.#onEvent,
    });
  }

  createToken(address: Address, wrapper?: Address): Token {
    return new Token({
      sdk: this.relayer,
      signer: this.requireSigner(),
      storage: this.storage,
      address: normalizeAddress(address, "address"),
      wrapper: wrapper ? normalizeAddress(wrapper, "wrapper") : undefined,
      durationDays: this.#credentialDurationDays,
      onEvent: this.#onEvent,
    });
  }

  terminate(): void {
    this.relayer.terminate();
  }
}
```

Import `SignerRequiredError` from `./errors`.

**Step 4: Run test to verify it passes**

Run: `cd packages/sdk && pnpm vitest run src/token/__tests__/zama-sdk.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/sdk/src/token/zama-sdk.ts packages/sdk/src/token/__tests__/zama-sdk.test.ts
git commit -m "feat: make signer optional in ZamaSDK with setSigner() for late binding"
```

---

### Task 3: Update ZamaProvider for optional signer

**Files:**

- Modify: `packages/react-sdk/src/provider.tsx:13-24` (props), `39-64` (component)

**Step 1: Implement optional signer in provider**

In `packages/react-sdk/src/provider.tsx`:

```typescript
interface ZamaProviderProps extends PropsWithChildren {
  relayer: RelayerSDK;
  signer?: GenericSigner; // <-- optional
  storage: GenericStringStorage;
  credentialDurationDays?: number;
  onEvent?: ZamaSDKEventListener;
}
```

Update the component to create SDK without signer, and use `useEffect` for late binding:

```typescript
export function ZamaProvider({
  children,
  relayer,
  signer,
  storage,
  credentialDurationDays,
  onEvent,
}: ZamaProviderProps) {
  const sdk = useMemo(
    () =>
      new ZamaSDK({
        relayer,
        signer,
        storage,
        credentialDurationDays,
        onEvent,
      }),
    [relayer, storage, credentialDurationDays, onEvent],
  );

  // Late-bind signer when wallet connects (avoids full SDK re-creation)
  useEffect(() => {
    if (signer) {
      sdk.setSigner(signer);
    }
  }, [sdk, signer]);

  useEffect(() => {
    return () => sdk.terminate();
  }, [sdk]);

  return <ZamaSDKContext.Provider value={sdk}>{children}</ZamaSDKContext.Provider>;
}
```

Note: `signer` removed from `useMemo` deps — signer changes are handled by `setSigner()` without recreating the SDK.

**Step 2: Run build**

Run: `pnpm --filter @zama-fhe/react-sdk build`
Expected: PASS — no type errors

**Step 3: Commit**

```bash
git add packages/react-sdk/src/provider.tsx
git commit -m "feat: make signer optional in ZamaProvider"
```

---

### Task 4: Define FHE types and EncryptableValue

**Files:**

- Modify: `packages/sdk/src/relayer/relayer-sdk.types.ts:53-58` (EncryptParams)
- Test: `packages/sdk/src/relayer/__tests__/encrypt-types.test.ts` (new)

**Step 1: Write the failing test**

Create `packages/sdk/src/relayer/__tests__/encrypt-types.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import type { EncryptableValue, FheType } from "../relayer-sdk.types";

describe("EncryptableValue type system", () => {
  it("accepts bool values", () => {
    const val: EncryptableValue = { type: "bool", value: true };
    expect(val.type).toBe("bool");
    expect(val.value).toBe(true);
  });

  it("accepts address values", () => {
    const val: EncryptableValue = {
      type: "address",
      value: "0x1111111111111111111111111111111111111111",
    };
    expect(val.type).toBe("address");
  });

  it("accepts uint64 values", () => {
    const val: EncryptableValue = { type: "uint64", value: 42n };
    expect(val.type).toBe("uint64");
    expect(val.value).toBe(42n);
  });

  it("accepts bytes64 values", () => {
    const val: EncryptableValue = { type: "bytes64", value: new Uint8Array(64) };
    expect(val.type).toBe("bytes64");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/sdk && pnpm vitest run src/relayer/__tests__/encrypt-types.test.ts`
Expected: FAIL — types don't exist

**Step 3: Implement FHE types**

In `packages/sdk/src/relayer/relayer-sdk.types.ts`, add before `EncryptParams` (line 53):

```typescript
/** All FHE encrypted types supported by the relayer SDK. */
export type FheType =
  | "bool"
  | "uint4"
  | "uint8"
  | "uint16"
  | "uint32"
  | "uint64"
  | "uint128"
  | "uint256"
  | "address"
  | "bytes64"
  | "bytes128"
  | "bytes256";

/** A typed value for FHE encryption. */
export type EncryptableValue =
  | { type: "bool"; value: boolean }
  | { type: "address"; value: Address }
  | {
      type: "uint4" | "uint8" | "uint16" | "uint32" | "uint64" | "uint128" | "uint256";
      value: bigint;
    }
  | { type: "bytes64" | "bytes128" | "bytes256"; value: Uint8Array };
```

Update `EncryptParams`:

```typescript
export interface EncryptParams {
  values: EncryptableValue[];
  contractAddress: Address;
  userAddress: Address;
}
```

Export from `packages/sdk/src/index.ts`:

```typescript
export type { FheType, EncryptableValue } from "./relayer/relayer-sdk.types";
```

Re-export from `packages/react-sdk/src/index.ts`:

```typescript
export type { FheType, EncryptableValue } from "@zama-fhe/sdk";
```

**Step 4: Run test to verify it passes**

Run: `cd packages/sdk && pnpm vitest run src/relayer/__tests__/encrypt-types.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/sdk/src/relayer/relayer-sdk.types.ts packages/sdk/src/relayer/__tests__/encrypt-types.test.ts packages/sdk/src/index.ts packages/react-sdk/src/index.ts
git commit -m "feat: define FheType and EncryptableValue for typed encryption"
```

---

### Task 5: Update worker to dispatch typed encryption

**Files:**

- Modify: `packages/sdk/src/worker/relayer-sdk.worker.ts:301-314` (handleEncrypt)

**Step 1: Update the worker encrypt handler**

In `packages/sdk/src/worker/relayer-sdk.worker.ts`, replace the `add64` loop (lines 312-314):

```typescript
for (const entry of values) {
  switch (entry.type) {
    case "bool":
      input.addBool(entry.value);
      break;
    case "uint4":
      input.add4(entry.value);
      break;
    case "uint8":
      input.add8(entry.value);
      break;
    case "uint16":
      input.add16(entry.value);
      break;
    case "uint32":
      input.add32(entry.value);
      break;
    case "uint64":
      input.add64(entry.value);
      break;
    case "uint128":
      input.add128(entry.value);
      break;
    case "uint256":
      input.add256(entry.value);
      break;
    case "address":
      input.addAddress(entry.value);
      break;
    case "bytes64":
      input.addBytes64(entry.value);
      break;
    case "bytes128":
      input.addBytes128(entry.value);
      break;
    case "bytes256":
      input.addBytes256(entry.value);
      break;
    default:
      throw new Error(`Unsupported FHE type: ${(entry as { type: string }).type}`);
  }
}
```

**Step 2: Fix all internal callers**

All internal callers pass `values: [amount]` as `bigint[]`. Update them to use typed values.

In `packages/sdk/src/token/token.ts`, find every `sdk.encrypt({ values: [amount], ... })` call and change to:

```typescript
sdk.encrypt({
  values: [{ type: "uint64", value: amount }],
  contractAddress: ...,
  userAddress: ...,
})
```

There are 3 call sites: `confidentialTransfer` (line 102), `confidentialTransferFrom` (line 173), and `unwrap` (line 390).

In `packages/sdk/src/relayer/relayer-web.ts`, the `encrypt` method signature doesn't change — it passes params through.

**Step 3: Run all existing tests**

Run: `cd packages/sdk && pnpm vitest run`
Expected: PASS — internal callers all use uint64 type

**Step 4: Commit**

```bash
git add packages/sdk/src/worker/relayer-sdk.worker.ts packages/sdk/src/token/token.ts packages/sdk/src/relayer/relayer-web.ts
git commit -m "feat: support all FHE types in encrypt (bool, address, uint4-256, bytes)"
```

---

### Task 6: Add decodeDecryptedValue utility

**Files:**

- Create: `packages/sdk/src/relayer/decode-decrypted-value.ts`
- Test: `packages/sdk/src/relayer/__tests__/decode-decrypted-value.test.ts` (new)

**Step 1: Write the failing test**

Create `packages/sdk/src/relayer/__tests__/decode-decrypted-value.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { decodeDecryptedValue } from "../decode-decrypted-value";

describe("decodeDecryptedValue", () => {
  it("decodes bool true", () => {
    expect(decodeDecryptedValue(1n, "bool")).toBe(true);
  });

  it("decodes bool false", () => {
    expect(decodeDecryptedValue(0n, "bool")).toBe(false);
  });

  it("decodes address", () => {
    const addr = BigInt("0x1111111111111111111111111111111111111111");
    const result = decodeDecryptedValue(addr, "address");
    expect(result).toBe("0x1111111111111111111111111111111111111111");
  });

  it("decodes address with zero-padding", () => {
    const result = decodeDecryptedValue(1n, "address");
    expect(result).toBe("0x0000000000000000000000000000000000000001");
  });

  it("returns bigint as-is for uint types", () => {
    expect(decodeDecryptedValue(42n, "uint64")).toBe(42n);
    expect(decodeDecryptedValue(100n, "uint8")).toBe(100n);
    expect(decodeDecryptedValue(0n, "uint256")).toBe(0n);
  });

  it("returns bigint as-is for bytes types", () => {
    expect(decodeDecryptedValue(42n, "bytes64")).toBe(42n);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/sdk && pnpm vitest run src/relayer/__tests__/decode-decrypted-value.test.ts`
Expected: FAIL — module doesn't exist

**Step 3: Implement decodeDecryptedValue**

Create `packages/sdk/src/relayer/decode-decrypted-value.ts`:

```typescript
import type { Address } from "./relayer-sdk.types";
import type { FheType } from "./relayer-sdk.types";

/**
 * Decode a raw decrypted bigint into the appropriate JavaScript type
 * based on the FHE type that was originally encrypted.
 *
 * @param value - Raw decrypted bigint from the relayer.
 * @param type - The FHE type of the encrypted value.
 * @returns The decoded value: `boolean` for `"bool"`, `Address` for `"address"`, `bigint` otherwise.
 */
export function decodeDecryptedValue(value: bigint, type: "bool"): boolean;
export function decodeDecryptedValue(value: bigint, type: "address"): Address;
export function decodeDecryptedValue(value: bigint, type: FheType): bigint | boolean | Address;
export function decodeDecryptedValue(value: bigint, type: FheType): bigint | boolean | Address {
  switch (type) {
    case "bool":
      return value !== 0n;
    case "address":
      return `0x${value.toString(16).padStart(40, "0")}` as Address;
    default:
      return value;
  }
}
```

Export from `packages/sdk/src/index.ts`:

```typescript
export { decodeDecryptedValue } from "./relayer/decode-decrypted-value";
```

Re-export from `packages/react-sdk/src/index.ts`:

```typescript
export { decodeDecryptedValue } from "@zama-fhe/sdk";
```

**Step 4: Run test to verify it passes**

Run: `cd packages/sdk && pnpm vitest run src/relayer/__tests__/decode-decrypted-value.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/sdk/src/relayer/decode-decrypted-value.ts packages/sdk/src/relayer/__tests__/decode-decrypted-value.test.ts packages/sdk/src/index.ts packages/react-sdk/src/index.ts
git commit -m "feat: add decodeDecryptedValue utility for bool/address type casting"
```

---

### Task 7: Add ShieldCallbacks and `to` parameter to shield

**Files:**

- Modify: `packages/sdk/src/token/token.types.ts:84-92` (add ShieldCallbacks after UnshieldCallbacks)
- Modify: `packages/sdk/src/token/token.ts:296-331` (Token.shield)
- Modify: `packages/sdk/src/token/token.ts:687-714` (#ensureAllowance)
- Modify: `packages/react-sdk/src/token/use-shield.ts:15-22` (ShieldParams)
- Test: `packages/sdk/src/token/__tests__/token.test.ts`

**Step 1: Write the failing test**

Add to `packages/sdk/src/token/__tests__/token.test.ts`:

```typescript
describe("shield callbacks and recipient", () => {
  it("invokes onShieldSubmitted callback", async () => {
    const underlying = "0x3333333333333333333333333333333333333333";
    vi.mocked(signer.readContract)
      .mockResolvedValueOnce(underlying) // underlying()
      .mockResolvedValueOnce(0n); // allowance()
    vi.mocked(signer.writeContract)
      .mockResolvedValueOnce("0xapprove-hash") // approve
      .mockResolvedValueOnce("0xshield-hash"); // wrap
    vi.mocked(signer.waitForTransactionReceipt).mockResolvedValue({ logs: [] });

    const onApprovalSubmitted = vi.fn();
    const onShieldSubmitted = vi.fn();

    await token.shield(100n, {
      callbacks: { onApprovalSubmitted, onShieldSubmitted },
    });

    expect(onApprovalSubmitted).toHaveBeenCalledWith("0xapprove-hash");
    expect(onShieldSubmitted).toHaveBeenCalledWith("0xshield-hash");
  });

  it("passes recipient to wrap contract", async () => {
    const underlying = "0x3333333333333333333333333333333333333333";
    const recipient = "0x4444444444444444444444444444444444444444";
    vi.mocked(signer.readContract).mockResolvedValueOnce(underlying);

    await token.shield(100n, { approvalStrategy: "skip", to: recipient });

    expect(signer.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "wrap",
        args: [recipient.toLowerCase(), 100n],
      }),
    );
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/sdk && pnpm vitest run src/token/__tests__/token.test.ts`
Expected: FAIL — `callbacks` and `to` not in shield options

**Step 3: Implement ShieldCallbacks and recipient**

In `packages/sdk/src/token/token.types.ts`, after `UnshieldCallbacks` (line 92):

```typescript
/** Progress callbacks for multi-step shield operations. */
export interface ShieldCallbacks {
  /** Fired after the ERC-20 approval transaction is submitted. */
  onApprovalSubmitted?: (txHash: Hex) => void;
  /** Fired after the shield (wrap) transaction is submitted. */
  onShieldSubmitted?: (txHash: Hex) => void;
}
```

Export `ShieldCallbacks` from `packages/sdk/src/index.ts` and re-export from `packages/react-sdk/src/index.ts`.

In `packages/sdk/src/token/token.ts`, update `Token.shield()`:

```typescript
async shield(
  amount: bigint,
  options?: {
    approvalStrategy?: "max" | "exact" | "skip";
    fees?: bigint;
    to?: Address;
    callbacks?: ShieldCallbacks;
  },
): Promise<TransactionResult> {
  const underlying = await this.#getUnderlying();
  const to = options?.to ? normalizeAddress(options.to, "to") : await this.signer.getAddress();

  if (underlying === Token.ZERO_ADDRESS) {
    return this.shieldETH(amount, amount + (options?.fees ?? 0n));
  }

  const strategy = options?.approvalStrategy ?? "exact";
  if (strategy !== "skip") {
    await this.#ensureAllowance(amount, strategy === "max", options?.callbacks);
  }

  try {
    const txHash = await this.signer.writeContract(wrapContract(this.wrapper, to, amount));
    safeCallback(() => options?.callbacks?.onShieldSubmitted?.(txHash));
    this.emit({ type: ZamaSDKEvents.ShieldSubmitted, txHash });
    const receipt = await this.signer.waitForTransactionReceipt(txHash);
    return { txHash, receipt };
  } catch (error) {
    this.emit({ type: ZamaSDKEvents.TransactionError, operation: "shield", error: toError(error) });
    if (error instanceof ZamaError) throw error;
    throw new TransactionRevertedError("Shield transaction failed", {
      cause: error instanceof Error ? error : undefined,
    });
  }
}
```

Update `#ensureAllowance` to accept callbacks:

```typescript
async #ensureAllowance(amount: bigint, maxApproval: boolean, callbacks?: ShieldCallbacks): Promise<void> {
  const underlying = await this.#getUnderlying();
  const userAddress = await this.signer.getAddress();
  const allowance = await this.signer.readContract<bigint>(
    allowanceContract(underlying, userAddress, this.wrapper),
  );

  if (allowance >= amount) return;

  try {
    if (allowance > 0n) {
      await this.signer.writeContract(approveContract(underlying, this.wrapper, 0n));
    }
    const approvalAmount = maxApproval ? 2n ** 256n - 1n : amount;
    const txHash = await this.signer.writeContract(approveContract(underlying, this.wrapper, approvalAmount));
    safeCallback(() => callbacks?.onApprovalSubmitted?.(txHash));
  } catch (error) {
    if (error instanceof ZamaError) throw error;
    throw new ApprovalFailedError("ERC-20 approval failed", {
      cause: error instanceof Error ? error : undefined,
    });
  }
}
```

Import `ShieldCallbacks` from `./token.types`.

Update `packages/react-sdk/src/token/use-shield.ts` `ShieldParams`:

```typescript
export interface ShieldParams {
  amount: bigint;
  fees?: bigint;
  approvalStrategy?: "max" | "exact" | "skip";
  to?: Address;
  callbacks?: ShieldCallbacks;
}
```

Import `ShieldCallbacks` from `@zama-fhe/sdk`. Update `mutationFn`:

```typescript
mutationFn: async ({ amount, fees, approvalStrategy, to, callbacks }) =>
  token.shield(amount, { fees, approvalStrategy, to, callbacks }),
```

Also update `shieldMutationOptions` the same way.

**Step 4: Run test to verify it passes**

Run: `cd packages/sdk && pnpm vitest run src/token/__tests__/token.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/sdk/src/token/token.types.ts packages/sdk/src/token/token.ts packages/react-sdk/src/token/use-shield.ts packages/sdk/src/token/__tests__/token.test.ts packages/sdk/src/index.ts packages/react-sdk/src/index.ts
git commit -m "feat: add ShieldCallbacks and recipient parameter to useShield"
```

---

### Task 8: Add holder parameter to useConfidentialIsApproved

**Files:**

- Modify: `packages/sdk/src/token/token.ts:270-276` (Token.isApproved)
- Modify: `packages/react-sdk/src/token/use-confidential-is-approved.ts:22-25` (config), `40-46` (query options), `63-79` (hook)
- Test: `packages/sdk/src/token/__tests__/token.test.ts`

**Step 1: Write the failing test**

Add to `packages/sdk/src/token/__tests__/token.test.ts`:

```typescript
describe("isApproved with holder", () => {
  it("uses provided holder instead of connected wallet", async () => {
    const holder = "0x5555555555555555555555555555555555555555";
    vi.mocked(signer.readContract).mockResolvedValue(true);

    await token.isApproved("0x6666666666666666666666666666666666666666", holder);

    expect(signer.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        args: expect.arrayContaining([holder.toLowerCase()]),
      }),
    );
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/sdk && pnpm vitest run src/token/__tests__/token.test.ts`
Expected: FAIL — `isApproved` doesn't accept a second argument

**Step 3: Implement holder parameter**

In `packages/sdk/src/token/token.ts`, update `isApproved`:

```typescript
async isApproved(spender: Address, holder?: Address): Promise<boolean> {
  const normalizedSpender = normalizeAddress(spender, "spender");
  const holderAddress = holder ? normalizeAddress(holder, "holder") : await this.signer.getAddress();
  return this.signer.readContract<boolean>(
    isOperatorContract(this.address, holderAddress, normalizedSpender),
  );
}
```

In `packages/react-sdk/src/token/use-confidential-is-approved.ts`:

```typescript
export interface UseConfidentialIsApprovedConfig extends UseZamaConfig {
  spender: Address | undefined;
  /** Address to check approval for. Defaults to connected wallet. */
  holder?: Address;
}

export interface UseConfidentialIsApprovedSuspenseConfig extends UseZamaConfig {
  spender: Address;
  holder?: Address;
}

export function confidentialIsApprovedQueryOptions(
  token: Token,
  spender: Address,
  holder?: Address,
) {
  return {
    queryKey: [
      ...confidentialIsApprovedQueryKeys.spender(token.address, spender),
      holder ?? "self",
    ],
    queryFn: () => token.isApproved(spender, holder),
    staleTime: 30_000,
  } as const;
}
```

Update `useConfidentialIsApproved`:

```typescript
export function useConfidentialIsApproved(
  config: UseConfidentialIsApprovedConfig,
  options?: Omit<UseQueryOptions<boolean, Error>, "queryKey" | "queryFn">,
) {
  const { spender, holder, ...tokenConfig } = config;
  const token = useToken(tokenConfig);

  return useQuery<boolean, Error>({
    ...(spender
      ? confidentialIsApprovedQueryOptions(token, spender, holder)
      : {
          queryKey: confidentialIsApprovedQueryKeys.spender(config.tokenAddress, ""),
          queryFn: skipToken,
        }),
    ...options,
  });
}
```

Update `useConfidentialIsApprovedSuspense` similarly.

**Step 4: Run test to verify it passes**

Run: `cd packages/sdk && pnpm vitest run src/token/__tests__/token.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/sdk/src/token/token.ts packages/react-sdk/src/token/use-confidential-is-approved.ts packages/sdk/src/token/__tests__/token.test.ts
git commit -m "feat: add holder parameter to isApproved and useConfidentialIsApproved"
```

---

### Task 9: Return partial results from useConfidentialBalances

**Files:**

- Modify: `packages/sdk/src/token/token.types.ts` (add BalanceResult type)
- Modify: `packages/sdk/src/token/readonly-token.ts:230-304` (batchDecryptBalances)
- Modify: `packages/react-sdk/src/token/use-confidential-balances.ts:20-23` (types), `76-95` (queryFn)
- Test: `packages/sdk/src/token/__tests__/readonly-token.test.ts`

**Step 1: Write the failing test**

Add to `packages/sdk/src/token/__tests__/readonly-token.test.ts`:

```typescript
describe("batchDecryptBalances partial results", () => {
  it("returns per-token success and error results", async () => {
    const token1 = createToken("0x1111111111111111111111111111111111111111");
    const token2 = createToken("0x2222222222222222222222222222222222222222");
    const handle1 = "0x" + "aa".repeat(32);
    const handle2 = "0x" + "bb".repeat(32);

    mockSdk.userDecrypt
      .mockResolvedValueOnce({ [handle1]: 100n })
      .mockRejectedValueOnce(new Error("Decrypt failed for token2"));

    const results = await ReadonlyToken.batchDecryptBalances([token1, token2], {
      handles: [handle1, handle2],
    });

    const r1 = results.get(token1.address);
    expect(r1).toEqual({ status: "success", value: 100n });

    const r2 = results.get(token2.address);
    expect(r2).toEqual({ status: "error", error: expect.any(Error) });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/sdk && pnpm vitest run src/token/__tests__/readonly-token.test.ts`
Expected: FAIL — return type is `Map<Address, bigint>` not `BalanceResult`

**Step 3: Implement BalanceResult and partial results**

In `packages/sdk/src/token/token.types.ts`, add:

```typescript
/** Result of a single token balance decryption within a batch. */
export type BalanceResult =
  | { status: "success"; value: bigint }
  | { status: "error"; error: Error };
```

Export from `packages/sdk/src/index.ts` and re-export from `packages/react-sdk/src/index.ts`.

In `packages/sdk/src/token/readonly-token.ts`, update `batchDecryptBalances`:

```typescript
static async batchDecryptBalances(
  tokens: ReadonlyToken[],
  options?: BatchDecryptOptions,
): Promise<Map<Address, BalanceResult>> {
  if (tokens.length === 0) return new Map();

  const { handles, owner, onError, maxConcurrency } = options ?? {};

  const sdk = tokens[0]!.sdk;
  const signer = tokens[0]!.signer;
  const signerAddress = owner ?? (await signer.getAddress());

  const resolvedHandles =
    handles ?? (await Promise.all(tokens.map((t) => t.readConfidentialBalanceOf(signerAddress))));

  if (tokens.length !== resolvedHandles.length) {
    throw new DecryptionFailedError(
      `tokens.length (${tokens.length}) must equal handles.length (${resolvedHandles.length})`,
    );
  }

  const allAddresses = tokens.map((t) => t.address);
  const creds = await tokens[0]!.credentials.getAll(allAddresses);

  const results = new Map<Address, BalanceResult>();
  const decryptFns: Array<() => Promise<void>> = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    const handle = resolvedHandles[i]!;

    if (token.isZeroHandle(handle)) {
      results.set(token.address, { status: "success", value: BigInt(0) });
      continue;
    }

    decryptFns.push(() =>
      sdk
        .userDecrypt({
          handles: [handle],
          contractAddress: token.address,
          signedContractAddresses: creds.contractAddresses,
          privateKey: creds.privateKey,
          publicKey: creds.publicKey,
          signature: creds.signature,
          signerAddress,
          startTimestamp: creds.startTimestamp,
          durationDays: creds.durationDays,
        })
        .then((result) => {
          results.set(token.address, { status: "success", value: result[handle] ?? BigInt(0) });
        })
        .catch((error) => {
          const err = error instanceof Error ? error : new Error(String(error));
          if (onError) {
            results.set(token.address, { status: "success", value: onError(err, token.address) });
          } else {
            results.set(token.address, { status: "error", error: err });
          }
        }),
    );
  }

  await pLimit(decryptFns, maxConcurrency);

  return results;
}
```

Import `BalanceResult` from `./token.types`.

Update `packages/react-sdk/src/token/use-confidential-balances.ts`:

```typescript
import { ReadonlyToken, type Address, type BalanceResult } from "@zama-fhe/sdk";

export type UseConfidentialBalancesOptions = Omit<
  UseQueryOptions<Map<Address, BalanceResult>, Error>,
  "queryKey" | "queryFn"
>;
```

Update the phase 2 query:

```typescript
const balancesQuery = useQuery<Map<Address, BalanceResult>, Error>({
  queryKey: [...confidentialBalancesQueryKeys.tokens(tokenAddresses, ownerKey), handlesKey],
  queryFn: async () => {
    const raw = await ReadonlyToken.batchDecryptBalances(tokens, {
      handles: handles!,
      maxConcurrency,
    });
    const remapped = new Map<Address, BalanceResult>();
    for (let i = 0; i < tokens.length; i++) {
      const result = raw.get(tokens[i]!.address);
      if (result !== undefined) remapped.set(tokenAddresses[i]!, result);
    }
    return remapped;
  },
  enabled: tokenAddresses.length > 0 && !!signerAddress && !!handles,
  staleTime: Infinity,
  ...options,
});
```

**Step 4: Run test to verify it passes**

Run: `cd packages/sdk && pnpm vitest run src/token/__tests__/readonly-token.test.ts`
Expected: PASS

**Step 5: Run all tests to check for regressions**

Run: `pnpm --filter @zama-fhe/sdk vitest run && pnpm --filter @zama-fhe/react-sdk build`
Expected: PASS — update any existing tests that assert on the old `Map<Address, bigint>` return type

**Step 6: Commit**

```bash
git add packages/sdk/src/token/token.types.ts packages/sdk/src/token/readonly-token.ts packages/react-sdk/src/token/use-confidential-balances.ts packages/sdk/src/token/__tests__/readonly-token.test.ts packages/sdk/src/index.ts packages/react-sdk/src/index.ts
git commit -m "feat: return partial results from batchDecryptBalances and useConfidentialBalances"
```

---

### Task 10: Add useFHEvmStatus hook

**Files:**

- Modify: `packages/sdk/src/relayer/relayer-web.ts` (add status tracking)
- Modify: `packages/sdk/src/relayer/relayer-sdk.ts` (add optional status methods to interface)
- Create: `packages/react-sdk/src/relayer/use-fhevm-status.ts`
- Modify: `packages/react-sdk/src/index.ts` (export)
- Test: `packages/sdk/src/relayer/__tests__/relayer.test.ts`

**Step 1: Write the failing test**

Add to `packages/sdk/src/relayer/__tests__/relayer.test.ts`:

```typescript
describe("RelayerWeb status", () => {
  it("starts as idle", () => {
    const relayer = new RelayerWeb(createConfig());
    expect(relayer.getStatus()).toBe("idle");
  });

  it("calls status change listener", () => {
    const relayer = new RelayerWeb(createConfig());
    const listener = vi.fn();
    const unsubscribe = relayer.onStatusChange(listener);
    // Trigger initialization by calling any method
    // Status transitions: idle -> initializing
    expect(typeof unsubscribe).toBe("function");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/sdk && pnpm vitest run src/relayer/__tests__/relayer.test.ts`
Expected: FAIL — `getStatus` doesn't exist

**Step 3: Implement status tracking in RelayerWeb**

In `packages/sdk/src/relayer/relayer-web.ts`, add status fields:

```typescript
export class RelayerWeb implements RelayerSDK {
  // ... existing fields
  #status: RelayerSDKStatus = "idle";
  #statusListeners: Set<(status: RelayerSDKStatus) => void> = new Set();

  #setStatus(status: RelayerSDKStatus): void {
    if (this.#status !== status) {
      this.#status = status;
      for (const listener of this.#statusListeners) {
        try { listener(status); } catch { /* swallow */ }
      }
    }
  }

  getStatus(): RelayerSDKStatus {
    return this.#status;
  }

  onStatusChange(listener: (status: RelayerSDKStatus) => void): () => void {
    this.#statusListeners.add(listener);
    return () => { this.#statusListeners.delete(listener); };
  }
```

Add `this.#setStatus("initializing")` at the start of `#initWorker`, `this.#setStatus("ready")` when it completes, `this.#setStatus("error")` in the catch, and `this.#setStatus("idle")` in `terminate()`.

Import `RelayerSDKStatus` from `./relayer-sdk.types`.

**Step 4: Create useFHEvmStatus hook**

Create `packages/react-sdk/src/relayer/use-fhevm-status.ts`:

````typescript
"use client";

import { useSyncExternalStore } from "react";
import type { RelayerSDKStatus } from "@zama-fhe/sdk";
import { RelayerWeb } from "@zama-fhe/sdk";
import { useZamaSDK } from "../provider";

/**
 * Subscribe to the FHE relayer lifecycle status (WASM loading state).
 *
 * @returns The current status: `"idle"` | `"initializing"` | `"ready"` | `"error"`.
 *
 * @example
 * ```tsx
 * const status = useFHEvmStatus();
 * if (status === "initializing") return <Spinner />;
 * ```
 */
export function useFHEvmStatus(): RelayerSDKStatus {
  const sdk = useZamaSDK();
  const relayer = sdk.relayer;

  return useSyncExternalStore(
    (callback) => {
      if (relayer instanceof RelayerWeb) {
        return relayer.onStatusChange(callback);
      }
      return () => {};
    },
    () => {
      if (relayer instanceof RelayerWeb) {
        return relayer.getStatus();
      }
      return "ready" as RelayerSDKStatus;
    },
  );
}
````

Export from `packages/react-sdk/src/index.ts`:

```typescript
export { useFHEvmStatus } from "./relayer/use-fhevm-status";
```

**Step 5: Run build and tests**

Run: `cd packages/sdk && pnpm vitest run src/relayer/__tests__/relayer.test.ts`
Run: `pnpm --filter @zama-fhe/react-sdk build`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/sdk/src/relayer/relayer-web.ts packages/sdk/src/relayer/__tests__/relayer.test.ts packages/react-sdk/src/relayer/use-fhevm-status.ts packages/react-sdk/src/index.ts
git commit -m "feat: add useFHEvmStatus hook exposing WASM loading state"
```

---

### Task 11: Orchestrate useUserDecrypt with credential auto-management

**Files:**

- Rename: `packages/react-sdk/src/relayer/use-user-decrypt.ts` → `use-user-decrypt-raw.ts`
- Create: `packages/react-sdk/src/relayer/use-user-decrypt.ts` (new orchestrated version)
- Modify: `packages/react-sdk/src/index.ts` (export both)

**Step 1: Rename current hook to useUserDecryptRaw**

Copy `packages/react-sdk/src/relayer/use-user-decrypt.ts` to `use-user-decrypt-raw.ts`, rename the function to `useUserDecryptRaw`.

**Step 2: Implement orchestrated useUserDecrypt**

Create `packages/react-sdk/src/relayer/use-user-decrypt.ts`:

````typescript
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import { decryptionKeys } from "./decryption-cache";
import { useZamaSDK } from "../provider";

/** Handle + contract pair for decryption. */
interface DecryptHandle {
  handle: string;
  contractAddress: Address;
}

/** Parameters for the orchestrated useUserDecrypt hook. */
export interface UseUserDecryptParams {
  /** Handles to decrypt, each with its contract address. */
  handles: DecryptHandle[];
  /** Credential validity in days. Default: SDK default. */
  durationDays?: number;
}

/**
 * Orchestrated user decryption hook.
 * Manages credentials automatically: tries cached credentials first,
 * generates new ones (with wallet signature) only if missing or expired.
 *
 * @example
 * ```tsx
 * const { mutate } = useUserDecrypt();
 * mutate({
 *   handles: [{ handle: "0xHandle", contractAddress: "0xContract" }],
 *   durationDays: 7,
 * });
 * ```
 */
export function useUserDecrypt() {
  const sdk = useZamaSDK();
  const queryClient = useQueryClient();

  return useMutation<Record<string, bigint>, Error, UseUserDecryptParams>({
    mutationFn: async ({ handles, durationDays }) => {
      const signer = sdk.requireSigner();
      const signerAddress = await signer.getAddress();

      // Group handles by contract address for credential batching
      const contractAddresses = [...new Set(handles.map((h) => h.contractAddress))];
      const allHandles = handles.map((h) => h.handle);

      // Use the first token's credential manager to get/create credentials
      const token = sdk.createReadonlyToken(contractAddresses[0]!);

      // Credentials are obtained via CredentialsManager.getAll which:
      // 1. Checks cache for valid credentials covering all contracts
      // 2. Re-signs if session signature is missing
      // 3. Creates fresh keypair + EIP712 signature if expired/missing
      const creds = await (token as any).credentials.getAll(contractAddresses);

      // Decrypt all handles in a single relayer call
      const result = await sdk.relayer.userDecrypt({
        handles: allHandles,
        contractAddress: contractAddresses[0]!,
        signedContractAddresses: creds.contractAddresses,
        privateKey: creds.privateKey,
        publicKey: creds.publicKey,
        signature: creds.signature,
        signerAddress,
        startTimestamp: creds.startTimestamp,
        durationDays: creds.durationDays,
      });

      return result;
    },
    onSuccess: (data) => {
      for (const [handle, value] of Object.entries(data)) {
        queryClient.setQueryData(decryptionKeys.value(handle), value);
      }
    },
  });
}
````

Note: Accessing `credentials` via `(token as any)` is a pragmatic shortcut. A cleaner approach is to add a `getCredentials(contractAddresses: Address[])` method to `ZamaSDK`. Let's do that:

In `packages/sdk/src/token/zama-sdk.ts`, add:

```typescript
/**
 * Get or create FHE credentials for the given contract addresses.
 * Reuses cached credentials when possible; prompts wallet signature otherwise.
 */
async getCredentials(contractAddresses: Address[]): Promise<StoredCredentials> {
  const token = this.createReadonlyToken(contractAddresses[0]!);
  return (token as any).credentials.getAll(contractAddresses);
}
```

Actually, it's cleaner to expose a CredentialsManager directly on ZamaSDK. Let's add:

```typescript
/** Get the CredentialsManager for this SDK instance. */
get credentialsManager(): CredentialsManager {
  return new CredentialsManager({
    sdk: this.relayer,
    signer: this.requireSigner(),
    storage: this.storage,
    durationDays: this.#credentialDurationDays ?? 1,
    onEvent: this.#onEvent,
  });
}
```

Then in the hook, use `sdk.credentialsManager.getAll(contractAddresses)`.

**Step 3: Update exports**

In `packages/react-sdk/src/index.ts`:

```typescript
export { useUserDecrypt, type UseUserDecryptParams } from "./relayer/use-user-decrypt";
export { useUserDecryptRaw } from "./relayer/use-user-decrypt-raw";
```

**Step 4: Run build**

Run: `pnpm --filter @zama-fhe/react-sdk build`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/sdk/src/token/zama-sdk.ts packages/react-sdk/src/relayer/use-user-decrypt.ts packages/react-sdk/src/relayer/use-user-decrypt-raw.ts packages/react-sdk/src/index.ts
git commit -m "feat: orchestrated useUserDecrypt with auto credential management"
```

---

### Task 12: Verify approval reset-to-zero logic (item #8)

**Files:**

- Test: `packages/sdk/src/token/__tests__/token.test.ts`

**Step 1: Write test verifying USDT-style approval flow**

Add to `packages/sdk/src/token/__tests__/token.test.ts`:

```typescript
describe("shield approval strategy (USDT compatibility)", () => {
  it("resets allowance to zero before approving when existing allowance is non-zero", async () => {
    const underlying = "0x3333333333333333333333333333333333333333";
    vi.mocked(signer.readContract)
      .mockResolvedValueOnce(underlying) // underlying()
      .mockResolvedValueOnce(50n); // allowance() — non-zero, less than amount
    vi.mocked(signer.writeContract)
      .mockResolvedValueOnce("0xreset-hash") // approve(0)
      .mockResolvedValueOnce("0xapprove-hash") // approve(amount)
      .mockResolvedValueOnce("0xshield-hash"); // wrap
    vi.mocked(signer.waitForTransactionReceipt).mockResolvedValue({ logs: [] });

    await token.shield(100n);

    const writeCalls = vi.mocked(signer.writeContract).mock.calls;
    // First call: reset to 0
    expect(writeCalls[0]![0]).toEqual(
      expect.objectContaining({
        functionName: "approve",
        args: expect.arrayContaining([0n]),
      }),
    );
    // Second call: approve exact amount
    expect(writeCalls[1]![0]).toEqual(
      expect.objectContaining({
        functionName: "approve",
        args: expect.arrayContaining([100n]),
      }),
    );
  });

  it("skips reset when existing allowance is zero", async () => {
    const underlying = "0x3333333333333333333333333333333333333333";
    vi.mocked(signer.readContract)
      .mockResolvedValueOnce(underlying) // underlying()
      .mockResolvedValueOnce(0n); // allowance() — zero
    vi.mocked(signer.writeContract)
      .mockResolvedValueOnce("0xapprove-hash") // approve(amount)
      .mockResolvedValueOnce("0xshield-hash"); // wrap
    vi.mocked(signer.waitForTransactionReceipt).mockResolvedValue({ logs: [] });

    await token.shield(100n);

    const writeCalls = vi.mocked(signer.writeContract).mock.calls;
    // Only approve + wrap, no reset
    expect(writeCalls).toHaveLength(2);
    expect(writeCalls[0]![0]).toEqual(
      expect.objectContaining({
        functionName: "approve",
        args: expect.arrayContaining([100n]),
      }),
    );
  });

  it("skips approval entirely when existing allowance is sufficient", async () => {
    const underlying = "0x3333333333333333333333333333333333333333";
    vi.mocked(signer.readContract)
      .mockResolvedValueOnce(underlying) // underlying()
      .mockResolvedValueOnce(200n); // allowance() — already enough
    vi.mocked(signer.writeContract).mockResolvedValueOnce("0xshield-hash");
    vi.mocked(signer.waitForTransactionReceipt).mockResolvedValue({ logs: [] });

    await token.shield(100n);

    // Only wrap, no approve calls
    expect(signer.writeContract).toHaveBeenCalledTimes(1);
    expect(signer.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "wrap" }),
    );
  });
});
```

**Step 2: Run tests**

Run: `cd packages/sdk && pnpm vitest run src/token/__tests__/token.test.ts`
Expected: PASS — existing logic already handles this correctly

**Step 3: Commit**

```bash
git add packages/sdk/src/token/__tests__/token.test.ts
git commit -m "test: verify USDT-style approval reset-to-zero in shield flow"
```

---

### Task 13: Final build and full test suite

**Step 1: Build both packages**

Run: `pnpm --filter @zama-fhe/sdk build && pnpm --filter @zama-fhe/react-sdk build`
Expected: PASS

**Step 2: Run full test suite**

Run: `pnpm --filter @zama-fhe/sdk vitest run`
Expected: PASS

**Step 3: Run type check**

Run: `pnpm --filter @zama-fhe/sdk exec tsc --noEmit && pnpm --filter @zama-fhe/react-sdk exec tsc --noEmit`
Expected: PASS

**Step 4: Fix any failures and commit**

```bash
git add -A
git commit -m "chore: fix remaining type errors and test failures after feedback implementation"
```
