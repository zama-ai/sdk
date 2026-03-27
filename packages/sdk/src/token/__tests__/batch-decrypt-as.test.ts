import { describe, expect, vi } from "vitest";
import { test, createMockSigner } from "../../test-fixtures";
import { saveCachedUserDecryption } from "../../decrypt-cache";
import { ReadonlyToken } from "../readonly-token";
import { MemoryStorage } from "../../storage/memory-storage";
import { MAX_UINT64 } from "../../contracts/constants";
import type { Address } from "viem";
import type { Handle } from "../../relayer/relayer-sdk.types";

const TOKEN_A = "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a" as Address;
const TOKEN_B = "0x7A7a7A7a7a7a7a7A7a7a7a7A7a7A7A7A7A7A7a7A" as Address;
const DELEGATOR = "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC" as Address;
const DELEGATE = "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" as Address;
const HANDLE_A = ("0x" + "a1".repeat(32)) as Handle;
const HANDLE_B = ("0x" + "b2".repeat(32)) as Handle;

function mockCredsResult(contractAddresses: Address[]) {
  return {
    publicKey: "0xpub",
    privateKey: "0xpriv",
    signature: "0xsig",
    contractAddresses,
    startTimestamp: Math.floor(Date.now() / 1000),
    durationDays: 1,
    delegatorAddress: DELEGATOR,
    delegateAddress: DELEGATE,
  };
}

function stubDelegatedCredentials(token: ReadonlyToken, contractAddresses: Address[]) {
  const allowMock = vi.fn().mockResolvedValue(mockCredsResult(contractAddresses));
  // Override the lazy getter for testing
  Object.defineProperty(token, "delegatedCredentials", {
    value: { allow: allowMock },
    configurable: true,
  });
  return allowMock;
}

describe("ReadonlyToken.batchDecryptBalancesAs", () => {
  test("decrypts balances for multiple tokens using delegated credentials", async ({ relayer }) => {
    const signer = createMockSigner(DELEGATE);
    const storage = new MemoryStorage();
    const sessionStorage = new MemoryStorage();

    // readContract order: confidentialBalanceOf(A), confidentialBalanceOf(B), getDelegationExpiry
    vi.mocked(signer.readContract)
      .mockResolvedValueOnce(HANDLE_A) // confidentialBalanceOf(tokenA)
      .mockResolvedValueOnce(HANDLE_B) // confidentialBalanceOf(tokenB)
      .mockResolvedValueOnce(MAX_UINT64); // getDelegationExpiry → permanent

    vi.mocked(relayer.delegatedUserDecrypt)
      .mockResolvedValueOnce({ [HANDLE_A]: 100n })
      .mockResolvedValueOnce({ [HANDLE_B]: 200n });

    const tokenA = new ReadonlyToken({
      relayer,
      signer,
      storage,
      sessionStorage,
      address: TOKEN_A,
    });
    const tokenB = new ReadonlyToken({
      relayer,
      signer,
      storage,
      sessionStorage,
      address: TOKEN_B,
    });

    const allowMock = stubDelegatedCredentials(tokenA, [TOKEN_A, TOKEN_B]);

    const balances = await ReadonlyToken.batchDecryptBalancesAs([tokenA, tokenB], {
      delegatorAddress: DELEGATOR,
    });

    expect(balances.get(TOKEN_A)).toBe(100n);
    expect(balances.get(TOKEN_B)).toBe(200n);
    expect(allowMock).toHaveBeenCalledOnce();
    expect(allowMock).toHaveBeenCalledWith(DELEGATOR, TOKEN_A, TOKEN_B);
    expect(relayer.delegatedUserDecrypt).toHaveBeenCalledTimes(2);
  });

  test("returns empty map for empty token list", async () => {
    const result = await ReadonlyToken.batchDecryptBalancesAs([], {
      delegatorAddress: DELEGATOR,
    });
    expect(result.size).toBe(0);
  });

  test("returns 0n for zero handles without calling relayer", async ({ relayer }) => {
    const signer = createMockSigner(DELEGATE);
    const storage = new MemoryStorage();
    const sessionStorage = new MemoryStorage();
    const ZERO = ("0x" + "00".repeat(32)) as Handle;

    // Only confidentialBalanceOf — zero handle means all cached, no preFlightCheck
    vi.mocked(signer.readContract).mockResolvedValueOnce(ZERO);

    const token = new ReadonlyToken({ relayer, signer, storage, sessionStorage, address: TOKEN_A });

    const balances = await ReadonlyToken.batchDecryptBalancesAs([token], {
      delegatorAddress: DELEGATOR,
    });

    expect(balances.get(TOKEN_A)).toBe(0n);
    expect(relayer.delegatedUserDecrypt).not.toHaveBeenCalled();
    // Pre-flight is skipped when all balances resolve from cache (zero handles),
    // so getDelegationExpiry never calls readContract.
    expect(signer.readContract).toHaveBeenCalledTimes(1);
  });

  test("skips pre-flight delegation check when balance is pre-cached", async ({ relayer }) => {
    const signer = createMockSigner(DELEGATE);
    const storage = new MemoryStorage();
    const sessionStorage = new MemoryStorage();

    await saveCachedUserDecryption(storage, DELEGATE, TOKEN_A, HANDLE_A, 42n);

    vi.mocked(signer.readContract).mockResolvedValueOnce(HANDLE_A); // confidentialBalanceOf

    const token = new ReadonlyToken({ relayer, signer, storage, sessionStorage, address: TOKEN_A });

    const balances = await ReadonlyToken.batchDecryptBalancesAs([token], {
      delegatorAddress: DELEGATOR,
    });

    // Only confidentialBalanceOf — pre-flight skipped because cache resolved everything.
    expect(signer.readContract).toHaveBeenCalledTimes(1);
    expect(relayer.delegatedUserDecrypt).not.toHaveBeenCalled();
    expect(balances.get(TOKEN_A)).toBe(42n);
  });

  test("calls onError callback when decryption fails for a token", async ({ relayer }) => {
    const signer = createMockSigner(DELEGATE);
    const storage = new MemoryStorage();
    const sessionStorage = new MemoryStorage();

    // readContract order: confidentialBalanceOf, getDelegationExpiry
    vi.mocked(signer.readContract)
      .mockResolvedValueOnce(HANDLE_A) // confidentialBalanceOf
      .mockResolvedValueOnce(MAX_UINT64); // getDelegationExpiry → permanent
    vi.mocked(relayer.delegatedUserDecrypt).mockRejectedValueOnce(new Error("decrypt failed"));

    const token = new ReadonlyToken({ relayer, signer, storage, sessionStorage, address: TOKEN_A });
    stubDelegatedCredentials(token, [TOKEN_A]);
    const onError = vi.fn().mockReturnValue(0n);

    const balances = await ReadonlyToken.batchDecryptBalancesAs([token], {
      delegatorAddress: DELEGATOR,
      onError,
    });

    expect(balances.get(TOKEN_A)).toBe(0n);
    expect(onError).toHaveBeenCalledOnce();
  });

  // ── RED tests: I-1 — batch pre-flight delegation check ────────────────

  test("throws DelegationNotFoundError when no delegation exists", async ({ relayer }) => {
    const signer = createMockSigner(DELEGATE);
    const storage = new MemoryStorage();
    const sessionStorage = new MemoryStorage();

    // readContract order: confidentialBalanceOf (non-zero handle), getDelegationExpiry → 0n
    vi.mocked(signer.readContract)
      .mockResolvedValueOnce(HANDLE_A) // confidentialBalanceOf → non-zero, goes to uncached
      .mockResolvedValueOnce(0n); // getDelegationExpiry → no delegation

    const token = new ReadonlyToken({ relayer, signer, storage, sessionStorage, address: TOKEN_A });

    await expect(
      ReadonlyToken.batchDecryptBalancesAs([token], { delegatorAddress: DELEGATOR }),
    ).rejects.toThrow(
      expect.objectContaining({
        code: "DELEGATION_NOT_FOUND",
        message: expect.stringContaining(TOKEN_A),
      }),
    );
    expect(relayer.delegatedUserDecrypt).not.toHaveBeenCalled();
  });

  test("throws DelegationExpiredError when delegation has expired", async ({ relayer }) => {
    const signer = createMockSigner(DELEGATE);
    const storage = new MemoryStorage();
    const sessionStorage = new MemoryStorage();

    // readContract order: confidentialBalanceOf (non-zero handle), getDelegationExpiry → past
    vi.mocked(signer.readContract)
      .mockResolvedValueOnce(HANDLE_A) // confidentialBalanceOf → non-zero, goes to uncached
      .mockResolvedValueOnce(1000n); // getDelegationExpiry → past timestamp
    vi.mocked(signer.getBlockTimestamp).mockResolvedValue(2000n);

    const token = new ReadonlyToken({ relayer, signer, storage, sessionStorage, address: TOKEN_A });

    await expect(
      ReadonlyToken.batchDecryptBalancesAs([token], { delegatorAddress: DELEGATOR }),
    ).rejects.toThrow(
      expect.objectContaining({
        code: "DELEGATION_EXPIRED",
        message: expect.stringContaining(TOKEN_A),
      }),
    );
    expect(relayer.delegatedUserDecrypt).not.toHaveBeenCalled();
  });

  test("batch succeeds when delegation is permanently active", async ({ relayer }) => {
    const signer = createMockSigner(DELEGATE);
    const storage = new MemoryStorage();
    const sessionStorage = new MemoryStorage();

    // readContract order: confidentialBalanceOf, getDelegationExpiry
    vi.mocked(signer.readContract)
      .mockResolvedValueOnce(HANDLE_A) // confidentialBalanceOf
      .mockResolvedValueOnce(MAX_UINT64); // getDelegationExpiry → permanent
    vi.mocked(relayer.delegatedUserDecrypt).mockResolvedValueOnce({ [HANDLE_A]: 42n });

    const token = new ReadonlyToken({ relayer, signer, storage, sessionStorage, address: TOKEN_A });
    stubDelegatedCredentials(token, [TOKEN_A]);

    const balances = await ReadonlyToken.batchDecryptBalancesAs([token], {
      delegatorAddress: DELEGATOR,
    });

    expect(balances.get(TOKEN_A)).toBe(42n);
    expect(signer.getBlockTimestamp).not.toHaveBeenCalled();
  });

  // ── RED test: I-2 — onError callback that throws ──────────────────────

  test("catches errors thrown by onError callback and aggregates them", async ({ relayer }) => {
    const signer = createMockSigner(DELEGATE);
    const storage = new MemoryStorage();
    const sessionStorage = new MemoryStorage();

    // readContract order: confidentialBalanceOf, getDelegationExpiry
    vi.mocked(signer.readContract)
      .mockResolvedValueOnce(HANDLE_A) // confidentialBalanceOf
      .mockResolvedValueOnce(MAX_UINT64); // getDelegationExpiry → permanent
    vi.mocked(relayer.delegatedUserDecrypt).mockRejectedValueOnce(new Error("decrypt failed"));

    const token = new ReadonlyToken({ relayer, signer, storage, sessionStorage, address: TOKEN_A });
    stubDelegatedCredentials(token, [TOKEN_A]);

    const throwingOnError = vi.fn().mockImplementation(() => {
      throw new Error("callback exploded");
    });

    // After fix: callback error is caught and aggregated as a DecryptionFailedError
    await expect(
      ReadonlyToken.batchDecryptBalancesAs([token], {
        delegatorAddress: DELEGATOR,
        onError: throwingOnError,
      }),
    ).rejects.toThrow("callback exploded");
  });

  // ── RED test: I-3 — saveCachedBalance failure doesn't fail decryption ─

  test("succeeds even when cache write fails", async ({ relayer }) => {
    const signer = createMockSigner(DELEGATE);
    const storage = new MemoryStorage();
    const sessionStorage = new MemoryStorage();

    // readContract order: confidentialBalanceOf, getDelegationExpiry
    vi.mocked(signer.readContract)
      .mockResolvedValueOnce(HANDLE_A) // confidentialBalanceOf
      .mockResolvedValueOnce(MAX_UINT64); // getDelegationExpiry → permanent
    vi.mocked(relayer.delegatedUserDecrypt).mockResolvedValueOnce({ [HANDLE_A]: 99n });

    const token = new ReadonlyToken({ relayer, signer, storage, sessionStorage, address: TOKEN_A });
    stubDelegatedCredentials(token, [TOKEN_A]);

    // Sabotage the storage to make saveCachedBalance fail
    vi.spyOn(storage, "set").mockRejectedValue(new Error("storage full"));

    const balances = await ReadonlyToken.batchDecryptBalancesAs([token], {
      delegatorAddress: DELEGATOR,
    });

    // Decryption should still succeed despite cache write failure
    expect(balances.get(TOKEN_A)).toBe(99n);
  });
});
