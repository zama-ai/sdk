import { describe, expect, vi } from "vitest";
import { test, createMockSigner } from "../../test-fixtures";
import { ReadonlyToken } from "../readonly-token";
import { MemoryStorage } from "../memory-storage";
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

    vi.mocked(signer.readContract).mockResolvedValueOnce(HANDLE_A).mockResolvedValueOnce(HANDLE_B);

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

    vi.mocked(signer.readContract).mockResolvedValueOnce(ZERO);

    const token = new ReadonlyToken({ relayer, signer, storage, sessionStorage, address: TOKEN_A });

    const balances = await ReadonlyToken.batchDecryptBalancesAs([token], {
      delegatorAddress: DELEGATOR,
    });

    expect(balances.get(TOKEN_A)).toBe(0n);
    expect(relayer.delegatedUserDecrypt).not.toHaveBeenCalled();
  });

  test("calls onError callback when decryption fails for a token", async ({ relayer }) => {
    const signer = createMockSigner(DELEGATE);
    const storage = new MemoryStorage();
    const sessionStorage = new MemoryStorage();

    vi.mocked(signer.readContract).mockResolvedValueOnce(HANDLE_A);
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
});
