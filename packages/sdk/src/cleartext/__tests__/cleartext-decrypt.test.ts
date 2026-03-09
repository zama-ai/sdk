import { describe, it, expect, vi } from "vitest";
import {
  cleartextPublicDecrypt,
  cleartextUserDecrypt,
  cleartextDelegatedUserDecrypt,
  type DecryptionSigningContext,
} from "../cleartext-user-decrypt";

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

const mockSigningCtx: DecryptionSigningContext = {
  privateKey: "0x388b7680e4e1afa06efbfd45cdd1fe39f3c6af381df6555a19661f283b97de91",
  gatewayChainId: 10901,
  verifyingContract: "0x5ffdaAB0373E62E2ea2944776209aEf29E631A64",
};

function mockExecutor(map: Map<string, bigint>) {
  return {
    getPlaintexts: vi.fn(async (handles: string[]) => handles.map((h) => map.get(h) ?? 0n)),
  };
}

function mockAcl(
  opts: {
    publicAllowed?: boolean;
    persistAllowed?: boolean;
    delegated?: boolean;
  } = {},
) {
  return {
    isAllowedForDecryption: vi.fn().mockResolvedValue(opts.publicAllowed ?? true),
    persistAllowed: vi.fn().mockResolvedValue(opts.persistAllowed ?? true),
    isHandleDelegatedForUserDecryption: vi.fn().mockResolvedValue(opts.delegated ?? true),
  };
}

describe("cleartextPublicDecrypt", () => {
  it("returns formatted clearValues when ACL allows", async () => {
    const executor = mockExecutor(new Map([[HANDLE_EUINT32, 42n]]));
    const acl = mockAcl();

    const result = await cleartextPublicDecrypt(
      [HANDLE_EUINT32],
      executor as never,
      acl as never,
      mockSigningCtx,
    );
    expect(result.clearValues[HANDLE_EUINT32]).toBe(42n);
    // Proof is now always a signed EIP-712 proof (1 byte numSigners + 65 byte sig = 66 bytes = 132 hex + "0x" prefix)
    expect(result.decryptionProof.startsWith("0x")).toBe(true);
    expect(result.decryptionProof.length).toBe(2 + 132);
  });

  it("converts ebool true (1n) to boolean true", async () => {
    const executor = mockExecutor(new Map([[HANDLE_EBOOL, 1n]]));
    const acl = mockAcl();

    const result = await cleartextPublicDecrypt(
      [HANDLE_EBOOL],
      executor as never,
      acl as never,
      mockSigningCtx,
    );
    expect(result.clearValues[HANDLE_EBOOL]).toBe(true);
  });

  it("converts ebool false (0n) to boolean false", async () => {
    const executor = mockExecutor(new Map([[HANDLE_EBOOL, 0n]]));
    const acl = mockAcl();

    const result = await cleartextPublicDecrypt(
      [HANDLE_EBOOL],
      executor as never,
      acl as never,
      mockSigningCtx,
    );
    expect(result.clearValues[HANDLE_EBOOL]).toBe(false);
  });

  it("throws on unsupported FHE type ID", async () => {
    const handleUnknown = makeHandle(99);
    const executor = mockExecutor(new Map([[handleUnknown, 1n]]));
    const acl = mockAcl();

    await expect(
      cleartextPublicDecrypt([handleUnknown], executor as never, acl as never, mockSigningCtx),
    ).rejects.toThrow("Unsupported FHE type ID");
  });

  it("returns eaddress as bigint (matching RelayerSDK interface)", async () => {
    const handleAddress = makeHandle(7); // fheTypeId 7 = eaddress
    const addressValue = BigInt("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
    const executor = mockExecutor(new Map([[handleAddress, addressValue]]));
    const acl = mockAcl();

    const result = await cleartextPublicDecrypt(
      [handleAddress],
      executor as never,
      acl as never,
      mockSigningCtx,
    );
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
      mockSigningCtx,
    );
    expect(result.clearValues[handleBool]).toBe(true);
    expect(result.clearValues[handleUint]).toBe(999n);
    expect(result.clearValues[handleAddr]).toBe(
      BigInt("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"),
    );
    expect(result.abiEncodedClearValues.startsWith("0x")).toBe(true);
  });

  it("accepts Uint8Array handles", async () => {
    const handleBytes = new Uint8Array(32);
    handleBytes[30] = 4; // euint32
    const handleHex =
      "0x" +
      Array.from(handleBytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    const executor = mockExecutor(new Map([[handleHex, 77n]]));
    const acl = mockAcl();

    const result = await cleartextPublicDecrypt(
      [handleBytes],
      executor as never,
      acl as never,
      mockSigningCtx,
    );
    expect(result.clearValues[handleHex]).toBe(77n);
  });

  it("throws when handle is not allowed for decryption", async () => {
    const executor = mockExecutor(new Map([[HANDLE_EUINT32, 42n]]));
    const acl = mockAcl({ publicAllowed: false });

    await expect(
      cleartextPublicDecrypt([HANDLE_EUINT32], executor as never, acl as never, mockSigningCtx),
    ).rejects.toThrow("not allowed for decryption");
  });

  it("handles empty handles array", async () => {
    const executor = mockExecutor(new Map());
    const acl = mockAcl();

    const result = await cleartextPublicDecrypt(
      [],
      executor as never,
      acl as never,
      mockSigningCtx,
    );
    expect(result.clearValues).toEqual({});
    expect(result.decryptionProof.startsWith("0x")).toBe(true);
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
    const handleHex =
      "0x" +
      Array.from(handleBytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
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

  it("converts ebool correctly", async () => {
    const executor = mockExecutor(new Map([[HANDLE_EBOOL, 1n]]));
    const acl = mockAcl();

    const result = await cleartextUserDecrypt(
      [{ handle: HANDLE_EBOOL, contractAddress: CONTRACT }],
      USER,
      executor as never,
      acl as never,
    );
    expect(result[HANDLE_EBOOL]).toBe(true);
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

  it("decrypts multiple handles in a single call", async () => {
    const handleA = makeHandle(4); // euint32
    const handleB = makeHandle(5); // euint64
    const executor = mockExecutor(
      new Map([
        [handleA, 10n],
        [handleB, 20n],
      ]),
    );
    const acl = mockAcl();

    const result = await cleartextUserDecrypt(
      [
        { handle: handleA, contractAddress: CONTRACT },
        { handle: handleB, contractAddress: CONTRACT },
      ],
      USER,
      executor as never,
      acl as never,
    );
    expect(result[handleA]).toBe(10n);
    expect(result[handleB]).toBe(20n);
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
    expect(acl.persistAllowed).toHaveBeenCalledWith(HANDLE_EUINT32, USER);
    expect(acl.persistAllowed).toHaveBeenCalledWith(HANDLE_EUINT32, CONTRACT);
  });

  it("handles empty handles array", async () => {
    const executor = mockExecutor(new Map());
    const acl = mockAcl();

    const result = await cleartextUserDecrypt(
      [],
      "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      executor as never,
      acl as never,
    );
    expect(result).toEqual({});
  });
});

const DELEGATE = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

describe("cleartextDelegatedUserDecrypt", () => {
  it("returns formatted results when delegation is valid", async () => {
    const executor = mockExecutor(new Map([[HANDLE_EUINT32, 100n]]));
    const acl = mockAcl({ delegated: true });

    const result = await cleartextDelegatedUserDecrypt(
      [{ handle: HANDLE_EUINT32, contractAddress: CONTRACT }],
      USER,
      DELEGATE,
      executor as never,
      acl as never,
    );
    expect(result[HANDLE_EUINT32]).toBe(100n);
    expect(acl.isHandleDelegatedForUserDecryption).toHaveBeenCalledWith(
      USER,
      DELEGATE,
      CONTRACT,
      HANDLE_EUINT32,
    );
  });

  it("throws when delegation check returns false", async () => {
    const executor = mockExecutor(new Map([[HANDLE_EUINT32, 100n]]));
    const acl = mockAcl({ delegated: false });

    await expect(
      cleartextDelegatedUserDecrypt(
        [{ handle: HANDLE_EUINT32, contractAddress: CONTRACT }],
        USER,
        DELEGATE,
        executor as never,
        acl as never,
      ),
    ).rejects.toThrow("not delegated for user decryption");
  });

  it("converts ebool correctly", async () => {
    const executor = mockExecutor(new Map([[HANDLE_EBOOL, 1n]]));
    const acl = mockAcl({ delegated: true });

    const result = await cleartextDelegatedUserDecrypt(
      [{ handle: HANDLE_EBOOL, contractAddress: CONTRACT }],
      USER,
      DELEGATE,
      executor as never,
      acl as never,
    );
    expect(result[HANDLE_EBOOL]).toBe(true);
  });

  it("handles empty handles array", async () => {
    const executor = mockExecutor(new Map());
    const acl = mockAcl();

    const result = await cleartextDelegatedUserDecrypt(
      [],
      USER,
      DELEGATE,
      executor as never,
      acl as never,
    );
    expect(result).toEqual({});
  });
});
