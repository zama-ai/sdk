import { describe, it, expect, vi } from "vitest";
import { cleartextPublicDecrypt, cleartextUserDecrypt } from "../cleartext-decrypt";

// Build a fake handle with fheTypeId at byte 30
function makeHandle(fheTypeId: number): string {
  const bytes = new Uint8Array(32);
  bytes[30] = fheTypeId;
  return (
    "0x" +
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
}

const HANDLE_EUINT32 = makeHandle(4);
const HANDLE_EBOOL = makeHandle(0);
const USER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const CONTRACT = "0xe3a9105a3a932253A70F126eb1E3b589C643dD24";

function mockExecutor(map: Map<string, bigint>) {
  return {
    getPlaintexts: vi.fn(async (handles: string[]) => handles.map((h) => map.get(h) ?? 0n)),
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

    const result = await cleartextPublicDecrypt([HANDLE_EUINT32], executor as never, acl as never);
    expect(result.clearValues[HANDLE_EUINT32]).toBe(42n);
    expect(result.decryptionProof).toBe("0x00");
  });

  it("converts ebool to boolean", async () => {
    const executor = mockExecutor(new Map([[HANDLE_EBOOL, 1n]]));
    const acl = mockAcl();

    const result = await cleartextPublicDecrypt([HANDLE_EBOOL], executor as never, acl as never);
    expect(result.clearValues[HANDLE_EBOOL]).toBe(true);
  });

  it("returns eaddress as bigint (matching RelayerSDK interface)", async () => {
    const handleAddress = makeHandle(7); // fheTypeId 7 = eaddress
    const addressValue = BigInt("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
    const executor = mockExecutor(new Map([[handleAddress, addressValue]]));
    const acl = mockAcl();

    const result = await cleartextPublicDecrypt([handleAddress], executor as never, acl as never);
    expect(result.clearValues[handleAddress]).toBe(addressValue);
    expect(result.abiEncodedClearValues).toBeDefined();
    expect(result.abiEncodedClearValues.length).toBeGreaterThan(2);
  });

  it("ABI-encodes mixed types correctly", async () => {
    const handleBool = makeHandle(0);
    const handleUint = makeHandle(4);
    const handleAddr = makeHandle(7);
    const executor = mockExecutor(
      new Map([
        [handleBool, 1n],
        [handleUint, 999n],
        [handleAddr, BigInt("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266")],
      ]),
    );
    const acl = mockAcl();

    const result = await cleartextPublicDecrypt(
      [handleBool, handleUint, handleAddr],
      executor as never,
      acl as never,
    );
    expect(result.clearValues[handleBool]).toBe(true);
    expect(result.clearValues[handleUint]).toBe(999n);
    expect(result.clearValues[handleAddr]).toBe(BigInt("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"));
    expect(result.abiEncodedClearValues.startsWith("0x")).toBe(true);
  });

  it("accepts Uint8Array handles", async () => {
    const handleBytes = new Uint8Array(32);
    handleBytes[30] = 4; // euint32
    const handleHex = "0x" + Array.from(handleBytes).map((b) => b.toString(16).padStart(2, "0")).join("");
    const executor = mockExecutor(new Map([[handleHex, 77n]]));
    const acl = mockAcl();

    const result = await cleartextPublicDecrypt([handleBytes], executor as never, acl as never);
    expect(result.clearValues[handleHex]).toBe(77n);
  });

  it("throws when handle is not allowed for decryption", async () => {
    const executor = mockExecutor(new Map([[HANDLE_EUINT32, 42n]]));
    const acl = mockAcl({ publicAllowed: false });

    await expect(
      cleartextPublicDecrypt([HANDLE_EUINT32], executor as never, acl as never),
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
      executor as never,
      acl as never,
    );
    expect(result[HANDLE_EUINT32]).toBe(100n);
  });

  it("accepts Uint8Array handles", async () => {
    const handleBytes = new Uint8Array(32);
    handleBytes[30] = 4; // euint32
    const handleHex = "0x" + Array.from(handleBytes).map((b) => b.toString(16).padStart(2, "0")).join("");
    const executor = mockExecutor(new Map([[handleHex, 55n]]));
    const acl = mockAcl();

    const result = await cleartextUserDecrypt(
      [{ handle: handleBytes, contractAddress: CONTRACT }],
      USER,
      executor as never,
      acl as never,
    );
    expect(result[handleHex]).toBe(55n);
  });

  it("throws when user lacks permission", async () => {
    const executor = mockExecutor(new Map([[HANDLE_EUINT32, 100n]]));
    const acl = mockAcl({ persistAllowed: false });

    await expect(
      cleartextUserDecrypt(
        [{ handle: HANDLE_EUINT32, contractAddress: CONTRACT }],
        USER,
        executor as never,
        acl as never,
      ),
    ).rejects.toThrow("not authorized");
  });

  it("throws when contract lacks permission", async () => {
    const executor = mockExecutor(new Map([[HANDLE_EUINT32, 100n]]));
    const acl = {
      isAllowedForDecryption: vi.fn().mockResolvedValue(true),
      persistAllowed: vi
        .fn()
        .mockResolvedValueOnce(true) // user allowed
        .mockResolvedValueOnce(false), // contract rejected
    };

    await expect(
      cleartextUserDecrypt(
        [{ handle: HANDLE_EUINT32, contractAddress: CONTRACT }],
        USER,
        executor as never,
        acl as never,
      ),
    ).rejects.toThrow("not authorized");
  });
});
