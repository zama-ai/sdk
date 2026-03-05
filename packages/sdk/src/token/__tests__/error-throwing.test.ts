import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RelayerSDK } from "../../relayer/relayer-sdk";
import type { Address } from "../../relayer/relayer-sdk.types";
import { Token } from "../token";
import { NoCiphertextError, DecryptionFailedError, RelayerRequestFailedError } from "../errors";
import type { GenericSigner } from "../token.types";
import { MemoryStorage } from "../memory-storage";
import { createMockRelayer, createMockSigner } from "./test-utils";

const TOKEN = "0x1111111111111111111111111111111111111111" as Address;
const VALID_HANDLE = "0x" + "ab".repeat(32);

describe("NoCiphertextError detection (P3)", () => {
  let sdk: ReturnType<typeof createMockRelayer>;
  let signer: GenericSigner;
  let token: Token;

  beforeEach(() => {
    sdk = createMockRelayer();
    signer = createMockSigner();
    token = new Token({
      relayer: sdk as unknown as RelayerSDK,
      signer,
      storage: new MemoryStorage(),
      sessionStorage: new MemoryStorage(),
      address: TOKEN,
    });
  });

  it("throws NoCiphertextError when relayer returns 400", async () => {
    vi.mocked(signer.readContract).mockResolvedValue(VALID_HANDLE);
    const error = new Error("No ciphertext found") as Error & { statusCode?: number };
    error.statusCode = 400;
    vi.mocked(sdk.userDecrypt).mockRejectedValue(error);

    await expect(token.balanceOf()).rejects.toBeInstanceOf(NoCiphertextError);
  });

  it("throws RelayerRequestFailedError for non-400 HTTP errors", async () => {
    vi.mocked(signer.readContract).mockResolvedValue(VALID_HANDLE);
    const error = new Error("Internal server error") as Error & { statusCode?: number };
    error.statusCode = 500;
    vi.mocked(sdk.userDecrypt).mockRejectedValue(error);

    await expect(token.balanceOf()).rejects.toBeInstanceOf(RelayerRequestFailedError);
    try {
      await token.balanceOf();
    } catch (e) {
      expect((e as RelayerRequestFailedError).statusCode).toBe(500);
    }
  });

  it("throws DecryptionFailedError for errors without statusCode", async () => {
    vi.mocked(signer.readContract).mockResolvedValue(VALID_HANDLE);
    vi.mocked(sdk.userDecrypt).mockRejectedValue(new Error("unknown"));

    await expect(token.balanceOf()).rejects.toBeInstanceOf(DecryptionFailedError);
  });

  it("throws NoCiphertextError for decryptBalance with 400", async () => {
    const error = new Error("No ciphertext") as Error & { statusCode?: number };
    error.statusCode = 400;
    vi.mocked(sdk.userDecrypt).mockRejectedValue(error);

    await expect(token.decryptBalance(VALID_HANDLE as Address)).rejects.toBeInstanceOf(
      NoCiphertextError,
    );
  });

  it("passes through NoCiphertextError without re-wrapping", async () => {
    vi.mocked(signer.readContract).mockResolvedValue(VALID_HANDLE);
    const original = new NoCiphertextError("already typed");
    vi.mocked(sdk.userDecrypt).mockRejectedValue(original);

    try {
      await token.balanceOf();
    } catch (e) {
      expect(e).toBe(original);
    }
  });

  it("passes through RelayerRequestFailedError without re-wrapping", async () => {
    vi.mocked(signer.readContract).mockResolvedValue(VALID_HANDLE);
    const original = new RelayerRequestFailedError("already typed", 503);
    vi.mocked(sdk.userDecrypt).mockRejectedValue(original);

    try {
      await token.balanceOf();
    } catch (e) {
      expect(e).toBe(original);
    }
  });

  it("wraps non-Error thrown value with statusCode 400 as NoCiphertextError", async () => {
    vi.mocked(signer.readContract).mockResolvedValue(VALID_HANDLE);
    vi.mocked(sdk.userDecrypt).mockRejectedValue({ statusCode: 400, message: "bad" });

    await expect(token.balanceOf()).rejects.toBeInstanceOf(NoCiphertextError);
  });

  it("wraps non-Error thrown value with other statusCode as RelayerRequestFailedError", async () => {
    vi.mocked(signer.readContract).mockResolvedValue(VALID_HANDLE);
    vi.mocked(sdk.userDecrypt).mockRejectedValue({ statusCode: 502 });

    const err = await token.balanceOf().catch((e) => e);
    expect(err).toBeInstanceOf(RelayerRequestFailedError);
    expect(err.statusCode).toBe(502);
  });

  it("handles decryptHandles 400 error for batch operations", async () => {
    const error = new Error("No ciphertext") as Error & { statusCode?: number };
    error.statusCode = 400;
    vi.mocked(sdk.userDecrypt).mockRejectedValue(error);

    await expect(token.decryptHandles([VALID_HANDLE as Address])).rejects.toBeInstanceOf(
      NoCiphertextError,
    );
  });
});
