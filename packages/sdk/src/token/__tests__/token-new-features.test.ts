import { beforeEach, describe, expect, it, vi } from "vitest";
import { Topics } from "../../events";
import type { RelayerSDK } from "../../relayer/relayer-sdk";
import type { Address } from "../../relayer/relayer-sdk.types";
import { Token } from "../token";
import {
  NoCiphertextError,
  DecryptionFailedError,
  RelayerRequestFailedError,
  TransactionRevertedError,
} from "../errors";
import type { GenericSigner } from "../token.types";
import { MemoryStorage } from "../memory-storage";

const TOKEN = "0x1111111111111111111111111111111111111111" as Address;
const USER = "0x2222222222222222222222222222222222222222" as Address;
const ZERO_HANDLE = "0x" + "0".repeat(64);
const VALID_HANDLE = "0x" + "ab".repeat(32);

function createMockSdk() {
  return {
    generateKeypair: vi.fn().mockResolvedValue({
      publicKey: "0xpub",
      privateKey: "0xpriv",
    }),
    createEIP712: vi.fn().mockResolvedValue({
      domain: {
        name: "test",
        version: "1",
        chainId: 1,
        verifyingContract: "0xkms",
      },
      types: { UserDecryptRequestVerification: [] },
      message: {
        publicKey: "0xpub",
        contractAddresses: [TOKEN],
        startTimestamp: 1000n,
        durationDays: 1n,
        extraData: "0x",
      },
    }),
    encrypt: vi.fn().mockResolvedValue({
      handles: [new Uint8Array([1, 2, 3])],
      inputProof: new Uint8Array([4, 5, 6]),
    }),
    userDecrypt: vi.fn().mockResolvedValue({
      [VALID_HANDLE]: 1000n,
    }),
    publicDecrypt: vi.fn().mockResolvedValue({
      clearValues: { "0xburn": 500n },
      abiEncodedClearValues: "0x1f4",
      decryptionProof: "0xproof",
    }),
  } as unknown as RelayerSDK;
}

function createMockSigner(): GenericSigner {
  return {
    getAddress: vi.fn().mockResolvedValue(USER),
    signTypedData: vi.fn().mockResolvedValue("0xsig"),
    writeContract: vi.fn().mockResolvedValue("0xtxhash"),
    readContract: vi.fn().mockResolvedValue(ZERO_HANDLE),
    waitForTransactionReceipt: vi.fn().mockResolvedValue({ logs: [] }),
    getChainId: vi.fn().mockResolvedValue(31337),
  };
}

describe("NoCiphertextError detection (P3)", () => {
  let sdk: ReturnType<typeof createMockSdk>;
  let signer: GenericSigner;
  let token: Token;

  beforeEach(() => {
    sdk = createMockSdk();
    signer = createMockSigner();
    token = new Token({
      sdk: sdk as unknown as RelayerSDK,
      signer,
      storage: new MemoryStorage(),
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

describe("Unshield callbacks (P4)", () => {
  let sdk: ReturnType<typeof createMockSdk>;
  let signer: GenericSigner;
  let token: Token;

  function mockReceiptWithUnwrapRequested() {
    vi.mocked(signer.waitForTransactionReceipt).mockResolvedValue({
      logs: [
        {
          topics: [Topics.UnwrapRequested, "0x000000000000000000000000" + USER.slice(2)],
          data: "0x" + "ff".repeat(32),
        },
      ],
    });
  }

  beforeEach(() => {
    sdk = createMockSdk();
    signer = createMockSigner();
    token = new Token({
      sdk: sdk as unknown as RelayerSDK,
      signer,
      storage: new MemoryStorage(),
      address: TOKEN,
    });
  });

  it("fires all callbacks during unshield", async () => {
    mockReceiptWithUnwrapRequested();

    const onUnwrapSubmitted = vi.fn();
    const onFinalizing = vi.fn();
    const onFinalizeSubmitted = vi.fn();

    await token.unshield(50n, { onUnwrapSubmitted, onFinalizing, onFinalizeSubmitted });

    expect(onUnwrapSubmitted).toHaveBeenCalledWith("0xtxhash");
    expect(onFinalizing).toHaveBeenCalledOnce();
    expect(onFinalizeSubmitted).toHaveBeenCalledWith("0xtxhash");
  });

  it("fires all callbacks during unshieldAll", async () => {
    vi.mocked(signer.readContract).mockResolvedValue(VALID_HANDLE);
    mockReceiptWithUnwrapRequested();

    const onUnwrapSubmitted = vi.fn();
    const onFinalizing = vi.fn();
    const onFinalizeSubmitted = vi.fn();

    await token.unshieldAll({ onUnwrapSubmitted, onFinalizing, onFinalizeSubmitted });

    expect(onUnwrapSubmitted).toHaveBeenCalledWith("0xtxhash");
    expect(onFinalizing).toHaveBeenCalledOnce();
    expect(onFinalizeSubmitted).toHaveBeenCalledWith("0xtxhash");
  });

  it("fires callbacks during resumeUnshield", async () => {
    mockReceiptWithUnwrapRequested();

    const onFinalizing = vi.fn();
    const onFinalizeSubmitted = vi.fn();

    await token.resumeUnshield("0xprevioustx", { onFinalizing, onFinalizeSubmitted });

    expect(signer.waitForTransactionReceipt).toHaveBeenCalledWith("0xprevioustx");
    expect(onFinalizing).toHaveBeenCalledOnce();
    expect(onFinalizeSubmitted).toHaveBeenCalledWith("0xtxhash");
  });

  it("works without callbacks (backward compatible)", async () => {
    mockReceiptWithUnwrapRequested();

    const result = await token.unshield(50n);
    expect(result.txHash).toBe("0xtxhash");
    expect(result.receipt).toBeDefined();
  });

  it("completes unshield even when callbacks throw", async () => {
    mockReceiptWithUnwrapRequested();

    const result = await token.unshield(50n, {
      onUnwrapSubmitted: () => {
        throw new Error("callback exploded");
      },
      onFinalizing: () => {
        throw new Error("callback exploded again");
      },
      onFinalizeSubmitted: () => {
        throw new Error("callback exploded a third time");
      },
    });

    expect(result.txHash).toBe("0xtxhash");
    expect(signer.writeContract).toHaveBeenCalledTimes(2); // unwrap + finalize
  });

  it("fires onFinalizing before onFinalizeSubmitted", async () => {
    mockReceiptWithUnwrapRequested();

    const order: string[] = [];
    await token.unshield(50n, {
      onUnwrapSubmitted: () => order.push("unwrapSubmitted"),
      onFinalizing: () => order.push("finalizing"),
      onFinalizeSubmitted: () => order.push("finalizeSubmitted"),
    });

    expect(order).toEqual(["unwrapSubmitted", "finalizing", "finalizeSubmitted"]);
  });

  it("throws TransactionRevertedError when receipt fetch fails", async () => {
    vi.mocked(signer.waitForTransactionReceipt).mockRejectedValue(new Error("network error"));

    await expect(token.unshield(50n)).rejects.toBeInstanceOf(TransactionRevertedError);
  });

  it("throws TransactionRevertedError when no UnwrapRequested event in receipt", async () => {
    vi.mocked(signer.waitForTransactionReceipt).mockResolvedValue({ logs: [] });

    await expect(token.unshield(50n)).rejects.toBeInstanceOf(TransactionRevertedError);
  });

  it("throws TransactionRevertedError when finalize writeContract fails", async () => {
    mockReceiptWithUnwrapRequested();
    vi.mocked(signer.writeContract)
      .mockResolvedValueOnce("0xunwraphash") // unwrap succeeds
      .mockRejectedValueOnce(new Error("finalize failed")); // finalize fails

    await expect(token.unshield(50n)).rejects.toBeInstanceOf(TransactionRevertedError);
  });

  it("throws DecryptionFailedError when publicDecrypt fails during finalize", async () => {
    mockReceiptWithUnwrapRequested();
    vi.mocked(sdk.publicDecrypt).mockRejectedValue(new Error("decrypt error"));

    await expect(token.unshield(50n)).rejects.toBeInstanceOf(DecryptionFailedError);
  });
});

describe("Address normalization (P6)", () => {
  let sdk: ReturnType<typeof createMockSdk>;
  let signer: GenericSigner;

  beforeEach(() => {
    sdk = createMockSdk();
    signer = createMockSigner();
  });

  it("preserves token address case in constructor", () => {
    const token = new Token({
      sdk: sdk as unknown as RelayerSDK,
      signer,
      storage: new MemoryStorage(),
      address: "0xABCDEF1234567890ABCDEF1234567890ABCDEF12" as Address,
    });

    expect(token.address).toBe("0xABCDEF1234567890ABCDEF1234567890ABCDEF12");
  });

  it("preserves wrapper address case in constructor", () => {
    const token = new Token({
      sdk: sdk as unknown as RelayerSDK,
      signer,
      storage: new MemoryStorage(),
      address: TOKEN,
      wrapper: "0xABCDEF1234567890ABCDEF1234567890ABCDEF12" as Address,
    });

    expect(token.wrapper).toBe("0xABCDEF1234567890ABCDEF1234567890ABCDEF12");
  });

  it("defaults wrapper to normalized address when not provided", () => {
    const token = new Token({
      sdk: sdk as unknown as RelayerSDK,
      signer,
      storage: new MemoryStorage(),
      address: "0xABCDEF1234567890ABCDEF1234567890ABCDEF12" as Address,
    });

    expect(token.wrapper).toBe(token.address);
  });

  it("rejects invalid address in constructor", () => {
    expect(
      () =>
        new Token({
          sdk: sdk as unknown as RelayerSDK,
          signer,
          storage: new MemoryStorage(),
          address: "0xinvalid" as Address,
        }),
    ).toThrow("address must be a valid address");
  });
});
