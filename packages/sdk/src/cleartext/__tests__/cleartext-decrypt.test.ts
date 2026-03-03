import { describe, it, expect, vi } from "vitest";
import { cleartextPublicDecrypt, cleartextUserDecrypt } from "../cleartext-decrypt";

// Build a fake handle with fheTypeId at byte 30
function makeHandle(fheTypeId: number): string {
  const bytes = new Uint8Array(32);
  bytes[30] = fheTypeId;
  return "0x" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
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
