import { describe, expect, test, vi } from "../../test-fixtures";
import { DecryptionFailedError, NoCiphertextError, RelayerRequestFailedError } from "../../errors";

describe("NoCiphertextError detection (P3)", () => {
  test("throws NoCiphertextError when relayer returns 400", async ({
    relayer,
    token,
    handle,
    userAddress,
    provider,
  }) => {
    vi.mocked(provider.readContract).mockResolvedValue(handle);
    const error = new Error("No ciphertext found") as Error & { statusCode?: number };
    error.statusCode = 400;
    vi.mocked(relayer.userDecrypt).mockRejectedValue(error);

    await expect(token.balanceOf(userAddress)).rejects.toBeInstanceOf(NoCiphertextError);
  });

  test("throws RelayerRequestFailedError for non-400 HTTP errors", async ({
    relayer,
    token,
    handle,
    userAddress,
    provider,
  }) => {
    vi.mocked(provider.readContract).mockResolvedValue(handle);
    const error = new Error("Internal server error") as Error & { statusCode?: number };
    error.statusCode = 500;
    vi.mocked(relayer.userDecrypt).mockRejectedValue(error);

    await expect(token.balanceOf(userAddress)).rejects.toBeInstanceOf(RelayerRequestFailedError);
    try {
      await token.balanceOf(userAddress);
    } catch (error) {
      expect((error as RelayerRequestFailedError).statusCode).toBe(500);
    }
  });

  test("throws DecryptionFailedError for errors without statusCode", async ({
    relayer,
    token,
    handle,
    userAddress,
    provider,
  }) => {
    vi.mocked(provider.readContract).mockResolvedValue(handle);
    vi.mocked(relayer.userDecrypt).mockRejectedValue(new Error("unknown"));

    await expect(token.balanceOf(userAddress)).rejects.toBeInstanceOf(DecryptionFailedError);
  });

  test("throws NoCiphertextError when sdk.userDecrypt receives 400", async ({
    sdk,
    relayer,
    token,
    handle,
  }) => {
    const error = new Error("No ciphertext") as Error & { statusCode?: number };
    error.statusCode = 400;
    vi.mocked(relayer.userDecrypt).mockRejectedValue(error);

    await expect(
      sdk.decryption.decryptValues([{ encryptedValue: handle, contractAddress: token.address }]),
    ).rejects.toBeInstanceOf(NoCiphertextError);
  });

  test("passes through NoCiphertextError without re-wrapping", async ({
    relayer,
    token,
    handle,
    userAddress,
    provider,
  }) => {
    vi.mocked(provider.readContract).mockResolvedValue(handle);
    const original = new NoCiphertextError("already typed");
    vi.mocked(relayer.userDecrypt).mockRejectedValue(original);

    try {
      await token.balanceOf(userAddress);
    } catch (error) {
      expect(error).toBe(original);
    }
  });

  test("passes through RelayerRequestFailedError without re-wrapping", async ({
    relayer,
    token,
    handle,
    userAddress,
    provider,
  }) => {
    vi.mocked(provider.readContract).mockResolvedValue(handle);
    const original = new RelayerRequestFailedError("already typed", 503);
    vi.mocked(relayer.userDecrypt).mockRejectedValue(original);

    try {
      await token.balanceOf(userAddress);
    } catch (error) {
      expect(error).toBe(original);
    }
  });

  test("wraps non-Error thrown value with statusCode 400 as NoCiphertextError", async ({
    relayer,
    token,
    handle,
    userAddress,
    provider,
  }) => {
    vi.mocked(provider.readContract).mockResolvedValue(handle);
    vi.mocked(relayer.userDecrypt).mockRejectedValue({ statusCode: 400, message: "bad" });

    await expect(token.balanceOf(userAddress)).rejects.toBeInstanceOf(NoCiphertextError);
  });

  test("wraps non-Error thrown value with other statusCode as RelayerRequestFailedError", async ({
    relayer,
    token,
    handle,
    userAddress,
    provider,
  }) => {
    vi.mocked(provider.readContract).mockResolvedValue(handle);
    vi.mocked(relayer.userDecrypt).mockRejectedValue({ statusCode: 502 });

    const err = await token.balanceOf(userAddress).catch((error) => error);
    expect(err).toBeInstanceOf(RelayerRequestFailedError);
    expect(err.statusCode).toBe(502);
  });

  test("handles 400 error for multi-handle sdk.userDecrypt", async ({
    sdk,
    relayer,
    token,
    handle,
  }) => {
    const error = new Error("No ciphertext") as Error & { statusCode?: number };
    error.statusCode = 400;
    vi.mocked(relayer.userDecrypt).mockRejectedValue(error);

    await expect(
      sdk.decryption.decryptValues([{ encryptedValue: handle, contractAddress: token.address }]),
    ).rejects.toBeInstanceOf(NoCiphertextError);
  });
});
