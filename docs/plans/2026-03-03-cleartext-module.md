# Self-contained Cleartext Module Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the dynamic `import("@zama-fhe/relayer-sdk/cleartext")` with a self-contained cleartext implementation using ethers.js directly.

**Architecture:** Six small modules in `packages/sdk/src/cleartext/` handle deterministic handle generation, encrypted input building, chain reads from CleartextFHEVMExecutor, ACL permission checks, and a factory that wires everything into the shape `RelayerCleartext` expects. The existing `RelayerCleartext` class stays unchanged except for swapping its import source.

**Tech Stack:** TypeScript, ethers.js (keccak256, AbiCoder, Contract, getAddress, concat, zeroPadValue), Vitest

**Design doc:** `docs/plans/2026-03-03-cleartext-module-design.md`

---

### Task 1: Types module

**Files:**
- Modify: `packages/sdk/src/cleartext/types.ts` (currently doesn't exist as separate file)

**Step 1: Write types.ts**

```typescript
// packages/sdk/src/cleartext/types.ts
import type { Eip1193Provider } from "ethers";

export type CleartextInstanceConfig = {
  network: Eip1193Provider | string;
  chainId: number;
  gatewayChainId: number;
  aclContractAddress: string;
  kmsContractAddress: string;
  inputVerifierContractAddress: string;
  verifyingContractAddressDecryption: string;
  verifyingContractAddressInputVerification: string;
  /** Address of the CleartextFHEVMExecutor contract. */
  cleartextExecutorAddress: string;
};
```

Note: This replaces the `CleartextInstanceConfig` interface currently in `relayer-utils.ts`. After creating this file, update `relayer-utils.ts` to import from here instead of defining its own.

**Step 2: Update relayer-utils.ts**

Remove the `CleartextInstanceConfig` interface definition from `packages/sdk/src/relayer/relayer-utils.ts` and replace with:

```typescript
import type { CleartextInstanceConfig } from "../cleartext/types";
export type { CleartextInstanceConfig };
```

Keep the `HardhatConfig`, `HoodiConfig` satisfies clauses pointing at the re-exported type.

**Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS (no type errors from this change)

**Step 4: Commit**

```
feat(sdk): extract CleartextInstanceConfig to cleartext/types
```

---

### Task 2: Handle generation

**Files:**
- Create: `packages/sdk/src/cleartext/cleartext-handles.ts`
- Create: `packages/sdk/src/cleartext/__tests__/cleartext-handles.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/sdk/src/cleartext/__tests__/cleartext-handles.test.ts
import { describe, it, expect } from "vitest";
import { computeCleartextHandles, parseHandle } from "../cleartext-handles";

const ACL = "0x50157CFfD6bBFA2DECe204a89ec419c23ef5755D";
const CHAIN_ID = 31337;

describe("computeCleartextHandles", () => {
  it("produces handles with correct fheTypeId", () => {
    const { handles } = computeCleartextHandles({
      values: [42n],
      encryptionBits: [8],
      aclContractAddress: ACL,
      chainId: CHAIN_ID,
    });
    expect(handles).toHaveLength(1);
    expect(handles[0]).toHaveLength(66); // 0x + 64 hex chars
    const parsed = parseHandle(handles[0]);
    expect(parsed.fheTypeId).toBe(2); // euint8
    expect(parsed.version).toBe(0);
    expect(parsed.index).toBe(0);
    expect(parsed.chainId).toBe(31337);
  });

  it("is deterministic", () => {
    const params = {
      values: [42n, 1000n],
      encryptionBits: [8, 16] as number[],
      aclContractAddress: ACL,
      chainId: CHAIN_ID,
    };
    const { handles: h1 } = computeCleartextHandles(params);
    const { handles: h2 } = computeCleartextHandles(params);
    expect(h1).toEqual(h2);
  });

  it("produces different handles for different values", () => {
    const base = { encryptionBits: [8], aclContractAddress: ACL, chainId: CHAIN_ID };
    const { handles: h1 } = computeCleartextHandles({ ...base, values: [42n] });
    const { handles: h2 } = computeCleartextHandles({ ...base, values: [43n] });
    expect(h1[0]).not.toBe(h2[0]);
  });

  it("assigns sequential indices", () => {
    const { handles } = computeCleartextHandles({
      values: [1n, 2n, 3n],
      encryptionBits: [8, 16, 32],
      aclContractAddress: ACL,
      chainId: CHAIN_ID,
    });
    expect(parseHandle(handles[0]).index).toBe(0);
    expect(parseHandle(handles[1]).index).toBe(1);
    expect(parseHandle(handles[2]).index).toBe(2);
  });

  it("throws on length mismatch", () => {
    expect(() =>
      computeCleartextHandles({
        values: [42n, 100n],
        encryptionBits: [8],
        aclContractAddress: ACL,
        chainId: CHAIN_ID,
      }),
    ).toThrow("values and encryptionBits must have the same length");
  });
});

describe("parseHandle", () => {
  it("round-trips through computeCleartextHandles", () => {
    const { handles } = computeCleartextHandles({
      values: [42n],
      encryptionBits: [64],
      aclContractAddress: ACL,
      chainId: CHAIN_ID,
    });
    const parsed = parseHandle(handles[0]);
    expect(parsed.fheTypeId).toBe(5); // euint64
    expect(parsed.chainId).toBe(CHAIN_ID);
    expect(parsed.version).toBe(0);
    expect(parsed.computed).toBe(false);
    expect(parsed.index).toBe(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/sdk/src/cleartext/__tests__/cleartext-handles.test.ts`
Expected: FAIL (module not found)

**Step 3: Write implementation**

```typescript
// packages/sdk/src/cleartext/cleartext-handles.ts
import { keccak256, AbiCoder, concat, toBeHex, zeroPadValue, getBytes, hexlify } from "ethers";

const RAW_CT_HASH_DOMAIN_SEPARATOR = "ZK-w_rct";
const HANDLE_HASH_DOMAIN_SEPARATOR = "ZK-w_hdl";
const HANDLE_VERSION = 0;

/** Map encryption bit width → FHE type ID used in handle byte 30. */
const BITS_TO_FHE_TYPE: Record<number, number> = {
  2: 0,    // ebool
  8: 2,    // euint8
  16: 3,   // euint16
  32: 4,   // euint32
  64: 5,   // euint64
  128: 6,  // euint128
  160: 7,  // eaddress
  256: 8,  // euint256
};

/** Parsed handle fields. */
export interface ParsedHandle {
  hash21: string;
  index: number;
  computed: boolean;
  chainId: number;
  fheTypeId: number;
  version: number;
}

/** Parse a bytes32 hex handle into its component fields. */
export function parseHandle(handleHex: string): ParsedHandle {
  const bytes = getBytes(handleHex);
  if (bytes.length !== 32) throw new Error(`Invalid handle length: ${bytes.length}`);
  const indexByte = bytes[21];
  return {
    hash21: hexlify(bytes.slice(0, 21)),
    index: indexByte === 0xff ? -1 : indexByte,
    computed: indexByte === 0xff,
    chainId: Number(BigInt(hexlify(bytes.slice(22, 30)))),
    fheTypeId: bytes[30],
    version: bytes[31],
  };
}

/**
 * Build a deterministic bytes32 handle from plaintext values.
 *
 * Handle layout:
 *   [bytes 0-20]  hash21 = keccak256("ZK-w_hdl" + blobHash + index + aclAddr + chainId)[0:21]
 *   [byte 21]     index
 *   [bytes 22-29] chainId (uint64 big-endian)
 *   [byte 30]     fheTypeId
 *   [byte 31]     version
 */
export function computeCleartextHandles(params: {
  values: bigint[];
  encryptionBits: number[];
  aclContractAddress: string;
  chainId: number;
}): { handles: string[]; fakeCiphertext: Uint8Array } {
  const { values, encryptionBits, aclContractAddress, chainId } = params;

  if (values.length !== encryptionBits.length) {
    throw new Error("values and encryptionBits must have the same length");
  }

  const encoder = new TextEncoder();

  // fakeCiphertext = "CLEARTEXT" + ABI.encode(uint256[])(values)
  const marker = encoder.encode("CLEARTEXT");
  const abiCoder = AbiCoder.defaultAbiCoder();
  const encoded = getBytes(abiCoder.encode(values.map(() => "uint256"), values));
  const fakeCiphertext = new Uint8Array([...marker, ...encoded]);

  // blobHash = keccak256("ZK-w_rct" + fakeCiphertext)
  const domainSep = encoder.encode(RAW_CT_HASH_DOMAIN_SEPARATOR);
  const blobHash = keccak256(concat([domainSep, fakeCiphertext]));

  const handles: string[] = [];

  for (let i = 0; i < values.length; i++) {
    const fheTypeId = BITS_TO_FHE_TYPE[encryptionBits[i]];
    if (fheTypeId === undefined) {
      throw new Error(`Unsupported encryption bits: ${encryptionBits[i]}`);
    }

    // hash21 = keccak256("ZK-w_hdl" + blobHash + index + aclAddr + chainId)[0:21]
    const handleDomainSep = encoder.encode(HANDLE_HASH_DOMAIN_SEPARATOR);
    const indexByte = new Uint8Array([i]);
    const aclBytes = getBytes(aclContractAddress);
    const chainIdBytes = getBytes(zeroPadValue(toBeHex(chainId), 32));

    const fullHash = keccak256(
      concat([handleDomainSep, blobHash, indexByte, aclBytes, chainIdBytes]),
    );

    // Truncate to 21 bytes
    const hash21Bytes = getBytes(fullHash).slice(0, 21);

    // Assemble 32-byte handle
    const handle = new Uint8Array(32);
    handle.set(hash21Bytes, 0);           // bytes 0-20: hash21
    handle[21] = i;                        // byte 21: index
    // bytes 22-29: chainId as uint64 big-endian
    const chainIdBuf = getBytes(zeroPadValue(toBeHex(chainId), 8));
    handle.set(chainIdBuf, 22);
    handle[30] = fheTypeId;                // byte 30: fheTypeId
    handle[31] = HANDLE_VERSION;           // byte 31: version

    handles.push(hexlify(handle));
  }

  return { handles, fakeCiphertext };
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/sdk/src/cleartext/__tests__/cleartext-handles.test.ts`
Expected: PASS

**Step 5: Commit**

```
feat(sdk): add cleartext handle generation
```

---

### Task 3: Encrypted input builder

**Files:**
- Create: `packages/sdk/src/cleartext/cleartext-input.ts`
- Create: `packages/sdk/src/cleartext/__tests__/cleartext-input.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/sdk/src/cleartext/__tests__/cleartext-input.test.ts
import { describe, it, expect } from "vitest";
import { createCleartextEncryptedInput } from "../cleartext-input";

const ACL = "0x50157CFfD6bBFA2DECe204a89ec419c23ef5755D";
const CONTRACT = "0xe3a9105a3a932253A70F126eb1E3b589C643dD24";
const USER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const CHAIN_ID = 31337;

describe("createCleartextEncryptedInput", () => {
  it("accumulates values and produces handles + inputProof", async () => {
    const input = createCleartextEncryptedInput({
      aclContractAddress: ACL,
      chainId: CHAIN_ID,
      contractAddress: CONTRACT,
      userAddress: USER,
    });
    input.add8(42).add16(1000);
    const result = await input.encrypt();

    expect(result.handles).toHaveLength(2);
    expect(result.handles[0]).toBeInstanceOf(Uint8Array);
    expect(result.handles[0].length).toBe(32);
    expect(result.inputProof).toBeInstanceOf(Uint8Array);
    expect(result.inputProof.length).toBeGreaterThan(0);
  });

  it("is deterministic", async () => {
    const make = () => {
      const input = createCleartextEncryptedInput({
        aclContractAddress: ACL,
        chainId: CHAIN_ID,
        contractAddress: CONTRACT,
        userAddress: USER,
      });
      input.add8(42).add16(1000);
      return input.encrypt();
    };
    const r1 = await make();
    const r2 = await make();
    expect(r1.handles[0]).toEqual(r2.handles[0]);
    expect(r1.handles[1]).toEqual(r2.handles[1]);
  });

  it("throws on empty encrypt", async () => {
    const input = createCleartextEncryptedInput({
      aclContractAddress: ACL,
      chainId: CHAIN_ID,
      contractAddress: CONTRACT,
      userAddress: USER,
    });
    await expect(input.encrypt()).rejects.toThrow("at least one value");
  });

  it("enforces 2048-bit limit", () => {
    const input = createCleartextEncryptedInput({
      aclContractAddress: ACL,
      chainId: CHAIN_ID,
      contractAddress: CONTRACT,
      userAddress: USER,
    });
    for (let i = 0; i < 8; i++) input.add256(BigInt(i));
    expect(() => input.add256(9n)).toThrow("2048 bits");
  });

  it("validates value bounds", () => {
    const input = createCleartextEncryptedInput({
      aclContractAddress: ACL,
      chainId: CHAIN_ID,
      contractAddress: CONTRACT,
      userAddress: USER,
    });
    expect(() => input.add8(256)).toThrow("exceeds the limit");
    expect(() => input.addBool(2)).toThrow("must be 0 or 1");
  });

  it("getBits returns accumulated types", () => {
    const input = createCleartextEncryptedInput({
      aclContractAddress: ACL,
      chainId: CHAIN_ID,
      contractAddress: CONTRACT,
      userAddress: USER,
    });
    input.addBool(true).add8(42).add64(123n);
    expect(input.getBits()).toEqual([2, 8, 64]);
  });

  it("supports method chaining", () => {
    const input = createCleartextEncryptedInput({
      aclContractAddress: ACL,
      chainId: CHAIN_ID,
      contractAddress: CONTRACT,
      userAddress: USER,
    });
    const result = input.addBool(false).add8(255).add16(65535).add32(100000);
    expect(result).toBe(input);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/sdk/src/cleartext/__tests__/cleartext-input.test.ts`
Expected: FAIL

**Step 3: Write implementation**

```typescript
// packages/sdk/src/cleartext/cleartext-input.ts
import { getAddress, getBytes, hexlify } from "ethers";
import { computeCleartextHandles } from "./cleartext-handles";

/** Fluent builder for cleartext encrypted inputs. */
export interface CleartextEncryptedInput {
  addBool(value: boolean | number | bigint): CleartextEncryptedInput;
  add8(value: number | bigint): CleartextEncryptedInput;
  add16(value: number | bigint): CleartextEncryptedInput;
  add32(value: number | bigint): CleartextEncryptedInput;
  add64(value: number | bigint): CleartextEncryptedInput;
  add128(value: number | bigint): CleartextEncryptedInput;
  add256(value: number | bigint): CleartextEncryptedInput;
  addAddress(value: string): CleartextEncryptedInput;
  getBits(): number[];
  encrypt(): Promise<{ handles: Uint8Array[]; inputProof: Uint8Array }>;
}

function checkValue(value: number | bigint, bits: number): void {
  if (value == null) throw new Error("Missing value");
  const limit = bits >= 8 ? BigInt(`0x${"ff".repeat(bits / 8)}`) : BigInt(2 ** bits - 1);
  if (BigInt(value) > limit) {
    throw new Error(`The value exceeds the limit for ${bits}bits integer (${limit}).`);
  }
}

/**
 * Build an InputProof from handles and plaintext values.
 *
 * Layout:
 *   [byte 0]     numHandles
 *   [byte 1]     numSigners (0 in cleartext)
 *   [32*n bytes] handles
 *   [remaining]  extraData: 0x00 version + 32-byte padded plaintext per value
 */
function buildInputProof(handleHexes: string[], values: bigint[]): Uint8Array {
  const numHandles = handleHexes.length;
  const header = new Uint8Array([numHandles, 0]); // numHandles, numSigners=0
  const handlesBytes = new Uint8Array(numHandles * 32);
  for (let i = 0; i < numHandles; i++) {
    handlesBytes.set(getBytes(handleHexes[i]), i * 32);
  }
  // extraData: version byte + 32-byte padded value per handle
  const extraData = new Uint8Array(1 + values.length * 32);
  extraData[0] = 0x00; // version
  for (let i = 0; i < values.length; i++) {
    const hex = values[i].toString(16).padStart(64, "0");
    const bytes = getBytes("0x" + hex);
    extraData.set(bytes, 1 + i * 32);
  }
  const result = new Uint8Array(header.length + handlesBytes.length + extraData.length);
  result.set(header, 0);
  result.set(handlesBytes, header.length);
  result.set(extraData, header.length + handlesBytes.length);
  return result;
}

export function createCleartextEncryptedInput(params: {
  aclContractAddress: string;
  chainId: number;
  contractAddress: string;
  userAddress: string;
}): CleartextEncryptedInput {
  const { aclContractAddress, chainId } = params;
  const bits: number[] = [];
  const values: bigint[] = [];

  const checkLimit = (added: number): void => {
    if (bits.reduce((acc, b) => acc + Math.max(2, b), 0) + added > 2048) {
      throw new Error("Packing more than 2048 bits in a single input ciphertext is unsupported");
    }
    if (bits.length + 1 > 256) {
      throw new Error("Packing more than 256 variables in a single input ciphertext is unsupported");
    }
  };

  const self: CleartextEncryptedInput = {
    addBool(value) {
      if (value == null) throw new Error("Missing value");
      if (Number(value) > 1) throw new Error("The value must be 0 or 1.");
      checkLimit(2);
      values.push(BigInt(Number(value)));
      bits.push(2);
      return self;
    },
    add8(value) { checkValue(value, 8); checkLimit(8); values.push(BigInt(value)); bits.push(8); return self; },
    add16(value) { checkValue(value, 16); checkLimit(16); values.push(BigInt(value)); bits.push(16); return self; },
    add32(value) { checkValue(value, 32); checkLimit(32); values.push(BigInt(value)); bits.push(32); return self; },
    add64(value) { checkValue(value, 64); checkLimit(64); values.push(BigInt(value)); bits.push(64); return self; },
    add128(value) { checkValue(value, 128); checkLimit(128); values.push(BigInt(value)); bits.push(128); return self; },
    add256(value) { checkValue(value, 256); checkLimit(256); values.push(BigInt(value)); bits.push(256); return self; },
    addAddress(value) {
      getAddress(value); // throws if not valid checksummed address
      checkLimit(160);
      values.push(BigInt(value));
      bits.push(160);
      return self;
    },
    getBits() { return [...bits]; },
    async encrypt() {
      if (bits.length === 0) throw new Error("Encrypted input must contain at least one value");
      const { handles } = computeCleartextHandles({ values, encryptionBits: bits, aclContractAddress, chainId });
      const inputProof = buildInputProof(handles, values);
      return {
        handles: handles.map((h) => getBytes(h)),
        inputProof,
      };
    },
  };

  return self;
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/sdk/src/cleartext/__tests__/cleartext-input.test.ts`
Expected: PASS

**Step 5: Commit**

```
feat(sdk): add cleartext encrypted input builder
```

---

### Task 4: CleartextExecutor

**Files:**
- Create: `packages/sdk/src/cleartext/cleartext-executor.ts`
- Create: `packages/sdk/src/cleartext/__tests__/cleartext-executor.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/sdk/src/cleartext/__tests__/cleartext-executor.test.ts
import { describe, it, expect, vi } from "vitest";
import { CleartextExecutor } from "../cleartext-executor";

const HANDLE = "0x" + "ab".repeat(32);

describe("CleartextExecutor", () => {
  it("reads a single plaintext", async () => {
    const mockContract = { plaintexts: vi.fn().mockResolvedValue(42n) };
    const executor = new CleartextExecutor(mockContract as any);

    const result = await executor.getPlaintext(HANDLE);
    expect(result).toBe(42n);
    expect(mockContract.plaintexts).toHaveBeenCalledWith(HANDLE);
  });

  it("reads multiple plaintexts", async () => {
    const handle2 = "0x" + "cd".repeat(32);
    const mockContract = {
      plaintexts: vi.fn()
        .mockResolvedValueOnce(42n)
        .mockResolvedValueOnce(100n),
    };
    const executor = new CleartextExecutor(mockContract as any);

    const result = await executor.getPlaintexts([HANDLE, handle2]);
    expect(result).toEqual([42n, 100n]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/sdk/src/cleartext/__tests__/cleartext-executor.test.ts`
Expected: FAIL

**Step 3: Write implementation**

```typescript
// packages/sdk/src/cleartext/cleartext-executor.ts
import { Contract, type Provider } from "ethers";

const EXECUTOR_ABI = ["function plaintexts(bytes32 handle) view returns (uint256)"];

export class CleartextExecutor {
  readonly #contract: { plaintexts(handle: string): Promise<bigint> };

  constructor(contract: { plaintexts(handle: string): Promise<bigint> });
  constructor(params: { executorAddress: string; provider: Provider });
  constructor(arg: any) {
    if ("executorAddress" in arg) {
      this.#contract = new Contract(arg.executorAddress, EXECUTOR_ABI, arg.provider) as any;
    } else {
      this.#contract = arg;
    }
  }

  async getPlaintext(handle: string): Promise<bigint> {
    return this.#contract.plaintexts(handle);
  }

  async getPlaintexts(handles: string[]): Promise<bigint[]> {
    return Promise.all(handles.map((h) => this.getPlaintext(h)));
  }
}
```

**Step 4: Run test**

Run: `pnpm vitest run packages/sdk/src/cleartext/__tests__/cleartext-executor.test.ts`
Expected: PASS

**Step 5: Commit**

```
feat(sdk): add CleartextExecutor for reading plaintexts from chain
```

---

### Task 5: Cleartext decrypt

**Files:**
- Create: `packages/sdk/src/cleartext/cleartext-decrypt.ts`
- Create: `packages/sdk/src/cleartext/__tests__/cleartext-decrypt.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/sdk/src/cleartext/__tests__/cleartext-decrypt.test.ts
import { describe, it, expect, vi } from "vitest";
import { cleartextPublicDecrypt, cleartextUserDecrypt } from "../cleartext-decrypt";

// Build a fake handle with fheTypeId=4 (euint32) at byte 30
function makeHandle(fheTypeId: number): string {
  const bytes = new Uint8Array(32);
  bytes[30] = fheTypeId;
  return "0x" + Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

const HANDLE_EUINT32 = makeHandle(4);
const HANDLE_EBOOL = makeHandle(0);
const USER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const CONTRACT = "0xe3a9105a3a932253A70F126eb1E3b589C643dD24";

function mockExecutor(map: Map<string, bigint>) {
  return {
    getPlaintexts: vi.fn(async (handles: string[]) => handles.map(h => map.get(h) ?? 0n)),
  };
}

function mockAcl(opts: { publicAllowed?: boolean; persistAllowed?: boolean } = {}) {
  return {
    isAllowedForDecryption: vi.fn().mockResolvedValue(opts.publicAllowed ?? true),
    persistAllowed: vi.fn().mockResolvedValue(opts.persistAllowed ?? true),
  };
}

describe("cleartextPublicDecrypt", () => {
  it("returns formatted clearValues when ACL allows", async () => {
    const executor = mockExecutor(new Map([[HANDLE_EUINT32, 42n]]));
    const acl = mockAcl();

    const result = await cleartextPublicDecrypt([HANDLE_EUINT32], executor as any, acl as any);
    expect(result.clearValues[HANDLE_EUINT32]).toBe(42n);
    expect(result.decryptionProof).toBe("0x00");
  });

  it("converts ebool to boolean", async () => {
    const executor = mockExecutor(new Map([[HANDLE_EBOOL, 1n]]));
    const acl = mockAcl();

    const result = await cleartextPublicDecrypt([HANDLE_EBOOL], executor as any, acl as any);
    expect(result.clearValues[HANDLE_EBOOL]).toBe(true);
  });

  it("throws when handle is not allowed for decryption", async () => {
    const executor = mockExecutor(new Map([[HANDLE_EUINT32, 42n]]));
    const acl = mockAcl({ publicAllowed: false });

    await expect(
      cleartextPublicDecrypt([HANDLE_EUINT32], executor as any, acl as any),
    ).rejects.toThrow("not allowed for decryption");
  });
});

describe("cleartextUserDecrypt", () => {
  it("returns formatted results when ACL allows", async () => {
    const executor = mockExecutor(new Map([[HANDLE_EUINT32, 100n]]));
    const acl = mockAcl();

    const result = await cleartextUserDecrypt(
      [{ handle: HANDLE_EUINT32, contractAddress: CONTRACT }],
      USER,
      executor as any,
      acl as any,
    );
    expect(result[HANDLE_EUINT32]).toBe(100n);
  });

  it("throws when user lacks permission", async () => {
    const executor = mockExecutor(new Map([[HANDLE_EUINT32, 100n]]));
    const acl = mockAcl({ persistAllowed: false });

    await expect(
      cleartextUserDecrypt(
        [{ handle: HANDLE_EUINT32, contractAddress: CONTRACT }],
        USER,
        executor as any,
        acl as any,
      ),
    ).rejects.toThrow("not authorized");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/sdk/src/cleartext/__tests__/cleartext-decrypt.test.ts`
Expected: FAIL

**Step 3: Write implementation**

```typescript
// packages/sdk/src/cleartext/cleartext-decrypt.ts
import { getAddress, getBytes, hexlify, AbiCoder } from "ethers";
import type { CleartextExecutor } from "./cleartext-executor";

type ClearValue = bigint | boolean | string;

/** ACL contract interface (subset needed for decrypt checks). */
export interface CleartextACL {
  isAllowedForDecryption(handle: string): Promise<boolean>;
  persistAllowed(handle: string, account: string): Promise<boolean>;
}

/** Extract fheTypeId from byte 30 of a bytes32 handle. */
function getFheTypeId(handleHex: string): number {
  return getBytes(handleHex)[30];
}

/** Format a raw bigint plaintext based on the handle's FHE type. */
function formatPlaintext(value: bigint, fheTypeId: number): ClearValue {
  if (fheTypeId === 0) return value === 1n; // ebool
  if (fheTypeId === 7) return getAddress("0x" + value.toString(16).padStart(40, "0")); // eaddress
  return value; // euint*
}

export async function cleartextPublicDecrypt(
  handles: (Uint8Array | string)[],
  executor: CleartextExecutor,
  acl: CleartextACL,
): Promise<{ clearValues: Record<string, ClearValue>; abiEncodedClearValues: string; decryptionProof: string }> {
  const handlesHex = handles.map(h => typeof h === "string" ? h : hexlify(h));

  // Check ACL permissions
  for (const h of handlesHex) {
    if (!(await acl.isAllowedForDecryption(h))) {
      throw new Error(`Handle ${h} is not allowed for decryption`);
    }
  }

  const rawValues = await executor.getPlaintexts(handlesHex);

  const clearValues: Record<string, ClearValue> = {};
  handlesHex.forEach((h, i) => {
    clearValues[h] = formatPlaintext(rawValues[i], getFheTypeId(h));
  });

  const abiCoder = AbiCoder.defaultAbiCoder();
  const abiEncodedClearValues = abiCoder.encode(
    handlesHex.map(() => "uint256"),
    rawValues,
  );

  return { clearValues, abiEncodedClearValues, decryptionProof: "0x00" };
}

export async function cleartextUserDecrypt(
  handleContractPairs: { handle: Uint8Array | string; contractAddress: string }[],
  userAddress: string,
  executor: CleartextExecutor,
  acl: CleartextACL,
): Promise<Record<string, ClearValue>> {
  const handlesHex = handleContractPairs.map(p =>
    typeof p.handle === "string" ? p.handle : hexlify(p.handle),
  );

  // Check ACL: both user and contract must have persistAllowed
  for (let i = 0; i < handlesHex.length; i++) {
    const h = handlesHex[i];
    const contract = handleContractPairs[i].contractAddress;
    if (!(await acl.persistAllowed(h, userAddress))) {
      throw new Error(`User ${userAddress} is not authorized to decrypt handle ${h}`);
    }
    if (!(await acl.persistAllowed(h, contract))) {
      throw new Error(`Contract ${contract} is not authorized to decrypt handle ${h}`);
    }
  }

  const rawValues = await executor.getPlaintexts(handlesHex);

  const results: Record<string, ClearValue> = {};
  handlesHex.forEach((h, i) => {
    results[h] = formatPlaintext(rawValues[i], getFheTypeId(h));
  });

  return results;
}
```

**Step 4: Run test**

Run: `pnpm vitest run packages/sdk/src/cleartext/__tests__/cleartext-decrypt.test.ts`
Expected: PASS

**Step 5: Commit**

```
feat(sdk): add cleartext public and user decrypt with ACL checks
```

---

### Task 6: createCleartextInstance factory

**Files:**
- Create: `packages/sdk/src/cleartext/cleartext-instance.ts`
- Create: `packages/sdk/src/cleartext/__tests__/cleartext-instance.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/sdk/src/cleartext/__tests__/cleartext-instance.test.ts
import { describe, it, expect, vi } from "vitest";

// Mock ethers Contract and JsonRpcProvider
vi.mock("ethers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ethers")>();
  return {
    ...actual,
    JsonRpcProvider: vi.fn().mockImplementation(() => ({
      getNetwork: vi.fn().mockResolvedValue({ chainId: 31337n }),
    })),
    Contract: vi.fn().mockImplementation(() => ({
      plaintexts: vi.fn().mockResolvedValue(42n),
      isAllowedForDecryption: vi.fn().mockResolvedValue(true),
      persistAllowed: vi.fn().mockResolvedValue(true),
    })),
  };
});

import { createCleartextInstance } from "../cleartext-instance";

const CONFIG = {
  network: "http://127.0.0.1:8545",
  chainId: 31337,
  gatewayChainId: 10901,
  aclContractAddress: "0x50157CFfD6bBFA2DECe204a89ec419c23ef5755D",
  kmsContractAddress: "0x901F8942346f7AB3a01F6D7613119Bca447Bb030",
  inputVerifierContractAddress: "0x36772142b74871f255CbD7A3e89B401d3e45825f",
  verifyingContractAddressDecryption: "0x5ffdaAB0373E62E2ea2944776209aEf29E631A64",
  verifyingContractAddressInputVerification: "0x812b06e1CDCE800494b79fFE4f925A504a9A9810",
  cleartextExecutorAddress: "0xe3a9105a3a932253A70F126eb1E3b589C643dD24",
};

describe("createCleartextInstance", () => {
  it("returns an object with all required methods", async () => {
    const instance = await createCleartextInstance(CONFIG);

    expect(instance.createEncryptedInput).toBeTypeOf("function");
    expect(instance.generateKeypair).toBeTypeOf("function");
    expect(instance.createEIP712).toBeTypeOf("function");
    expect(instance.publicDecrypt).toBeTypeOf("function");
    expect(instance.userDecrypt).toBeTypeOf("function");
    expect(instance.getPublicKey).toBeTypeOf("function");
    expect(instance.getPublicParams).toBeTypeOf("function");
  });

  it("generateKeypair returns public and private keys", async () => {
    const instance = await createCleartextInstance(CONFIG);
    const kp = instance.generateKeypair();
    expect(kp.publicKey).toBeTypeOf("string");
    expect(kp.privateKey).toBeTypeOf("string");
    expect(kp.publicKey.length).toBeGreaterThan(0);
    expect(kp.privateKey.length).toBeGreaterThan(0);
  });

  it("createEncryptedInput returns a builder", async () => {
    const instance = await createCleartextInstance(CONFIG);
    const input = instance.createEncryptedInput(
      CONFIG.cleartextExecutorAddress,
      "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    );
    expect(input.add64).toBeTypeOf("function");
    expect(input.encrypt).toBeTypeOf("function");
  });

  it("getPublicKey returns null", async () => {
    const instance = await createCleartextInstance(CONFIG);
    expect(instance.getPublicKey()).toBeNull();
  });

  it("requestZKProofVerification throws", async () => {
    const instance = await createCleartextInstance(CONFIG);
    await expect(instance.requestZKProofVerification({} as any)).rejects.toThrow(
      "not supported in cleartext mode",
    );
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/sdk/src/cleartext/__tests__/cleartext-instance.test.ts`
Expected: FAIL

**Step 3: Write implementation**

```typescript
// packages/sdk/src/cleartext/cleartext-instance.ts
import { Contract, JsonRpcProvider, randomBytes, hexlify, type Provider, type Eip1193Provider } from "ethers";
import type { CleartextInstanceConfig } from "./types";
import { CleartextExecutor } from "./cleartext-executor";
import { createCleartextEncryptedInput } from "./cleartext-input";
import { cleartextPublicDecrypt, cleartextUserDecrypt, type CleartextACL } from "./cleartext-decrypt";

const ACL_ABI = [
  "function isAllowedForDecryption(bytes32 handle) view returns (bool)",
  "function persistAllowed(bytes32 handle, address account) view returns (bool)",
];

function resolveProvider(network: Eip1193Provider | string): Provider {
  if (typeof network === "string") {
    return new JsonRpcProvider(network);
  }
  // TODO: wrap Eip1193Provider if needed
  return new JsonRpcProvider(network as any);
}

export async function createCleartextInstance(config: CleartextInstanceConfig) {
  const provider = resolveProvider(config.network);
  const { aclContractAddress, chainId, cleartextExecutorAddress } = config;

  const executor = new CleartextExecutor({ executorAddress: cleartextExecutorAddress, provider });
  const aclContract = new Contract(aclContractAddress, ACL_ABI, provider);
  const acl: CleartextACL = {
    isAllowedForDecryption: (handle) => aclContract.isAllowedForDecryption(handle),
    persistAllowed: (handle, account) => aclContract.persistAllowed(handle, account),
  };

  return {
    createEncryptedInput(contractAddress: string, userAddress: string) {
      return createCleartextEncryptedInput({ aclContractAddress, chainId, contractAddress, userAddress });
    },

    async requestZKProofVerification(): Promise<never> {
      throw new Error("requestZKProofVerification is not supported in cleartext mode. Use createEncryptedInput().encrypt() instead.");
    },

    generateKeypair() {
      return { publicKey: hexlify(randomBytes(800)), privateKey: hexlify(randomBytes(1632)) };
    },

    createEIP712(publicKey: string, contractAddresses: string[], startTimestamp: number, durationDays: number) {
      return {
        domain: {
          name: "KMSVerifier",
          version: "1",
          chainId: BigInt(config.gatewayChainId),
          verifyingContract: config.verifyingContractAddressDecryption,
        },
        types: {
          EIP712Domain: [
            { name: "name", type: "string" },
            { name: "version", type: "string" },
            { name: "chainId", type: "uint256" },
            { name: "verifyingContract", type: "address" },
          ],
          UserDecryptRequestVerification: [
            { name: "publicKey", type: "bytes" },
            { name: "contractAddresses", type: "address[]" },
            { name: "startTimestamp", type: "uint256" },
            { name: "durationDays", type: "uint256" },
            { name: "extraData", type: "bytes" },
          ],
        },
        message: {
          publicKey,
          contractAddresses,
          startTimestamp: BigInt(startTimestamp),
          durationDays: BigInt(durationDays),
          extraData: "0x00",
        },
      };
    },

    createDelegatedUserDecryptEIP712(publicKey: string, contractAddresses: string[], delegatorAddress: string, startTimestamp: number, durationDays: number) {
      return {
        domain: {
          name: "KMSVerifier",
          version: "1",
          chainId: BigInt(config.gatewayChainId),
          verifyingContract: config.verifyingContractAddressDecryption,
        },
        types: {
          EIP712Domain: [
            { name: "name", type: "string" },
            { name: "version", type: "string" },
            { name: "chainId", type: "uint256" },
            { name: "verifyingContract", type: "address" },
          ],
          DelegatedUserDecryptRequestVerification: [
            { name: "publicKey", type: "bytes" },
            { name: "contractAddresses", type: "address[]" },
            { name: "delegatorAddress", type: "address" },
            { name: "startTimestamp", type: "uint256" },
            { name: "durationDays", type: "uint256" },
            { name: "extraData", type: "bytes" },
          ],
        },
        message: {
          publicKey,
          contractAddresses,
          delegatorAddress,
          startTimestamp: BigInt(startTimestamp),
          durationDays: BigInt(durationDays),
          extraData: "0x00",
        },
      };
    },

    async publicDecrypt(handles: (string | Uint8Array)[]) {
      return cleartextPublicDecrypt(handles, executor, acl);
    },

    async userDecrypt(
      handles: { handle: string | Uint8Array; contractAddress: string }[],
      _privateKey: string, _publicKey: string, _signature: string,
      _contractAddresses: string[], userAddress: string,
      _startTimestamp: number, _durationDays: number,
    ) {
      return cleartextUserDecrypt(handles, userAddress, executor, acl);
    },

    async delegatedUserDecrypt(
      handleContractPairs: { handle: string | Uint8Array; contractAddress: string }[],
      _privateKey: string, _publicKey: string, _signature: string,
      _contractAddresses: string[], delegatorAddress: string,
      _delegateAddress: string, _startTimestamp: number, _durationDays: number,
    ) {
      return cleartextUserDecrypt(handleContractPairs, delegatorAddress, executor, acl);
    },

    getPublicKey() { return null; },
    getPublicParams() { return null; },
  };
}
```

**Step 4: Run test**

Run: `pnpm vitest run packages/sdk/src/cleartext/__tests__/cleartext-instance.test.ts`
Expected: PASS

**Step 5: Commit**

```
feat(sdk): add createCleartextInstance factory
```

---

### Task 7: Wire up RelayerCleartext and update exports

**Files:**
- Modify: `packages/sdk/src/relayer/relayer-cleartext.ts` (replace import source)
- Delete: `packages/sdk/src/relayer/relayer-sdk-cleartext.d.ts`
- Modify: `packages/sdk/src/cleartext/index.ts` (add new exports)

**Step 1: Update relayer-cleartext.ts**

In `packages/sdk/src/relayer/relayer-cleartext.ts`, change the `#initInstance` method:

```typescript
// Before:
const { createCleartextInstance } = await import("@zama-fhe/relayer-sdk/cleartext");

// After:
const { createCleartextInstance } = await import("../cleartext/cleartext-instance");
```

**Step 2: Delete the ambient module stub**

Delete `packages/sdk/src/relayer/relayer-sdk-cleartext.d.ts`.

**Step 3: Update cleartext/index.ts**

```typescript
// packages/sdk/src/cleartext/index.ts
/**
 * Cleartext backend for `@zama-fhe/sdk` — provides {@link RelayerCleartext}
 * for development and testing without WASM or FHE infrastructure.
 *
 * @packageDocumentation
 */

export { RelayerCleartext } from "../relayer/relayer-cleartext";
export type { RelayerCleartextConfig } from "../relayer/relayer-cleartext";
export { createCleartextInstance } from "./cleartext-instance";
export { CleartextExecutor } from "./cleartext-executor";
export type { CleartextInstanceConfig } from "./types";
```

**Step 4: Run typecheck and build**

Run: `pnpm typecheck && pnpm --filter @zama-fhe/sdk build`
Expected: PASS (no type errors, build succeeds including DTS)

**Step 5: Run all cleartext tests**

Run: `pnpm vitest run packages/sdk/src/cleartext/`
Expected: All PASS

**Step 6: Commit**

```
feat(sdk): wire self-contained cleartext into RelayerCleartext
```

---

### Task 8: Integration test with hardhat

**Files:**
- Create: `packages/sdk/src/cleartext/__tests__/cleartext-integration.test.ts`

**Step 1: Write integration test**

This test verifies the full encrypt → decrypt cycle against a real hardhat node. It requires the hardhat node to be running with the cleartext contracts deployed.

```typescript
// packages/sdk/src/cleartext/__tests__/cleartext-integration.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { JsonRpcProvider } from "ethers";
import { createCleartextInstance } from "../cleartext-instance";
import { HardhatConfig } from "../../relayer/relayer-utils";

// Skip if no local hardhat node is running
const RPC_URL = "http://127.0.0.1:8545";

async function isHardhatRunning(): Promise<boolean> {
  try {
    const provider = new JsonRpcProvider(RPC_URL);
    await provider.getBlockNumber();
    return true;
  } catch {
    return false;
  }
}

describe.skipIf(!await isHardhatRunning())("cleartext integration", () => {
  let instance: Awaited<ReturnType<typeof createCleartextInstance>>;

  beforeAll(async () => {
    instance = await createCleartextInstance({
      ...HardhatConfig,
      network: RPC_URL,
    });
  });

  it("createEncryptedInput produces valid handles", async () => {
    const input = instance.createEncryptedInput(
      HardhatConfig.cleartextExecutorAddress,
      "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    );
    input.add64(42n);
    const result = await input.encrypt();

    expect(result.handles).toHaveLength(1);
    expect(result.handles[0].length).toBe(32);
    expect(result.inputProof.length).toBeGreaterThan(0);
  });

  it("generateKeypair returns keypair", () => {
    const kp = instance.generateKeypair();
    expect(kp.publicKey).toHaveLength(800 * 2 + 2); // hex
    expect(kp.privateKey).toHaveLength(1632 * 2 + 2);
  });
});
```

**Step 2: Run tests**

Run: `pnpm vitest run packages/sdk/src/cleartext/__tests__/cleartext-integration.test.ts`
Expected: PASS (skipped if no hardhat node, passes if node is running)

**Step 3: Commit**

```
test(sdk): add cleartext integration test
```

---

### Task 9: Final verification

**Step 1: Run full test suite**

Run: `pnpm vitest run`
Expected: All PASS

**Step 2: Run build for SDK and react-sdk**

Run: `pnpm --filter @zama-fhe/sdk build && pnpm --filter @zama-fhe/react-sdk build`
Expected: Both PASS (including DTS generation)

**Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 4: Commit any fixups, then squash or keep as-is**
