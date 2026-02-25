import { beforeEach, describe, expect, it, vi } from "vitest";
import { Topics } from "../../events";
import type { RelayerSDK } from "../../relayer/relayer-sdk";
import type { Address } from "../../relayer/relayer-sdk.types";
import { Token } from "../token";
import { TokenError, TokenErrorCode, type GenericSigner } from "../token.types";
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

describe("Token", () => {
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

  describe("balanceOf", () => {
    it("returns 0n for zero handle without decrypting", async () => {
      vi.mocked(signer.readContract).mockResolvedValue(ZERO_HANDLE);

      const balance = await token.balanceOf();

      expect(balance).toBe(0n);
      expect(sdk.userDecrypt).not.toHaveBeenCalled();
    });

    it("decrypts non-zero handle and returns balance", async () => {
      vi.mocked(signer.readContract).mockResolvedValue(VALID_HANDLE);

      const balance = await token.balanceOf();

      expect(balance).toBe(1000n);
      expect(sdk.generateKeypair).toHaveBeenCalled();
      expect(signer.signTypedData).toHaveBeenCalled();
      expect(sdk.userDecrypt).toHaveBeenCalled();
    });

    it("defaults owner to signer address", async () => {
      vi.mocked(signer.readContract).mockResolvedValue(ZERO_HANDLE);

      await token.balanceOf();

      expect(signer.readContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "confidentialBalanceOf",
          args: [USER],
        }),
      );
    });

    it("accepts custom owner address", async () => {
      vi.mocked(signer.readContract).mockResolvedValue(ZERO_HANDLE);
      const otherAddress = "0xdddddddddddddddddddddddddddddddddddddddd" as Address;

      await token.balanceOf(otherAddress);

      expect(signer.readContract).toHaveBeenCalledWith(
        expect.objectContaining({ args: [otherAddress] }),
      );
    });
  });

  describe("confidentialBalanceOf", () => {
    it("returns the raw handle without decrypting", async () => {
      vi.mocked(signer.readContract).mockResolvedValue(VALID_HANDLE);

      const handle = await token.confidentialBalanceOf();

      expect(handle).toBe(VALID_HANDLE);
      expect(sdk.userDecrypt).not.toHaveBeenCalled();
    });
  });

  describe("isConfidential", () => {
    it("returns true when ERC-165 check passes", async () => {
      vi.mocked(signer.readContract).mockResolvedValue(true);

      expect(await token.isConfidential()).toBe(true);
    });

    it("returns false when ERC-165 check fails", async () => {
      vi.mocked(signer.readContract).mockResolvedValue(false);

      expect(await token.isConfidential()).toBe(false);
    });
  });

  describe("isWrapper", () => {
    it("returns true when ERC-165 wrapper check passes", async () => {
      vi.mocked(signer.readContract).mockResolvedValue(true);

      expect(await token.isWrapper()).toBe(true);
    });
  });

  describe("batchDecryptBalances", () => {
    const TOKEN2 = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address;
    const VALID_HANDLE2 = "0x" + "cd".repeat(32);

    it("returns empty map for empty array", async () => {
      const result = await Token.batchDecryptBalances([]);
      expect(result.size).toBe(0);
    });

    it("decrypts pre-read handles without calling readContract", async () => {
      const token2 = new Token({
        sdk: sdk as unknown as RelayerSDK,
        signer,
        storage: new MemoryStorage(),
        address: TOKEN2,
      });

      vi.mocked(sdk.userDecrypt)
        .mockResolvedValueOnce({ [VALID_HANDLE]: 1000n })
        .mockResolvedValueOnce({ [VALID_HANDLE2]: 2000n });

      const result = await Token.batchDecryptBalances([token, token2], {
        handles: [VALID_HANDLE as Address, VALID_HANDLE2 as Address],
      });

      expect(result.get(TOKEN)).toBe(1000n);
      expect(result.get(TOKEN2)).toBe(2000n);
      expect(signer.readContract).not.toHaveBeenCalled();
      expect(signer.signTypedData).toHaveBeenCalledOnce();
    });

    it("skips decryption for zero handles", async () => {
      const token2 = new Token({
        sdk: sdk as unknown as RelayerSDK,
        signer,
        storage: new MemoryStorage(),
        address: TOKEN2,
      });

      const result = await Token.batchDecryptBalances([token, token2], {
        handles: [VALID_HANDLE as Address, ZERO_HANDLE as Address],
      });

      expect(result.get(TOKEN)).toBe(1000n);
      expect(result.get(TOKEN2)).toBe(0n);
      expect(sdk.userDecrypt).toHaveBeenCalledOnce();
    });

    it("returns 0n for tokens that fail decryption", async () => {
      vi.mocked(sdk.userDecrypt).mockRejectedValueOnce(new Error("decrypt failed"));

      const result = await Token.batchDecryptBalances([token], {
        handles: [VALID_HANDLE as Address],
      });

      expect(result.get(TOKEN)).toBe(0n);
    });
  });

  describe("decryptBalance", () => {
    it("returns 0n for zero handle without decrypting", async () => {
      const balance = await token.decryptBalance(ZERO_HANDLE as Address);

      expect(balance).toBe(0n);
      expect(sdk.userDecrypt).not.toHaveBeenCalled();
    });

    it("returns 0n for 0x handle without decrypting", async () => {
      const balance = await token.decryptBalance("0x" as Address);

      expect(balance).toBe(0n);
      expect(sdk.userDecrypt).not.toHaveBeenCalled();
    });

    it("decrypts non-zero handle and returns balance", async () => {
      const balance = await token.decryptBalance(VALID_HANDLE as Address);

      expect(balance).toBe(1000n);
      expect(sdk.userDecrypt).toHaveBeenCalledWith(
        expect.objectContaining({
          handles: [VALID_HANDLE],
          contractAddress: TOKEN,
        }),
      );
    });

    it("does not call readContract (skips on-chain read)", async () => {
      await token.decryptBalance(VALID_HANDLE as Address);

      expect(signer.readContract).not.toHaveBeenCalled();
    });

    it("uses provided owner as signerAddress", async () => {
      const otherOwner = "0xdddddddddddddddddddddddddddddddddddddddd" as Address;
      await token.decryptBalance(VALID_HANDLE as Address, otherOwner);

      expect(sdk.userDecrypt).toHaveBeenCalledWith(
        expect.objectContaining({
          signerAddress: otherOwner,
        }),
      );
    });

    it("defaults signerAddress to signer.getAddress()", async () => {
      await token.decryptBalance(VALID_HANDLE as Address);

      expect(sdk.userDecrypt).toHaveBeenCalledWith(
        expect.objectContaining({
          signerAddress: USER,
        }),
      );
    });

    it("throws TokenError on decryption failure", async () => {
      vi.mocked(sdk.userDecrypt).mockRejectedValueOnce(new Error("decrypt failed"));

      await expect(token.decryptBalance(VALID_HANDLE as Address)).rejects.toThrow(
        "Failed to decrypt balance",
      );
    });

    it("returns 0n when handle not found in decrypt result", async () => {
      vi.mocked(sdk.userDecrypt).mockResolvedValueOnce({});

      const balance = await token.decryptBalance(VALID_HANDLE as Address);

      expect(balance).toBe(0n);
    });
  });

  describe("isZeroHandle", () => {
    it("returns true for zero handle", () => {
      expect(token.isZeroHandle(ZERO_HANDLE)).toBe(true);
    });

    it("returns true for 0x", () => {
      expect(token.isZeroHandle("0x")).toBe(true);
    });

    it("returns false for valid handle", () => {
      expect(token.isZeroHandle(VALID_HANDLE)).toBe(false);
    });
  });

  describe("discoverWrapper", () => {
    const COORDINATOR = "0x5555555555555555555555555555555555555555" as Address;
    const WRAPPER_ADDR = "0xdiscoveredWrapper" as Address;

    it("returns wrapper address when it exists", async () => {
      vi.mocked(signer.readContract)
        .mockResolvedValueOnce(true) // wrapperExists
        .mockResolvedValueOnce(WRAPPER_ADDR); // getWrapper

      const result = await token.discoverWrapper(COORDINATOR);

      expect(result).toBe(WRAPPER_ADDR);
      expect(signer.readContract).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: "wrapperExists" }),
      );
      expect(signer.readContract).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: "getWrapper" }),
      );
    });

    it("returns null when wrapper does not exist", async () => {
      vi.mocked(signer.readContract).mockResolvedValueOnce(false);

      const result = await token.discoverWrapper(COORDINATOR);

      expect(result).toBeNull();
      expect(signer.readContract).toHaveBeenCalledOnce();
    });
  });

  describe("underlyingToken", () => {
    it("reads the underlying token address", async () => {
      const UNDERLYING = "0x9999999999999999999999999999999999999999" as Address;
      vi.mocked(signer.readContract).mockResolvedValueOnce(UNDERLYING);

      const result = await token.underlyingToken();

      expect(result).toBe(UNDERLYING);
      expect(signer.readContract).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: "underlying" }),
      );
    });
  });

  describe("name", () => {
    it("reads the token name", async () => {
      vi.mocked(signer.readContract).mockResolvedValueOnce("My Token");

      const result = await token.name();

      expect(result).toBe("My Token");
      expect(signer.readContract).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: "name" }),
      );
    });
  });

  describe("symbol", () => {
    it("reads the token symbol", async () => {
      vi.mocked(signer.readContract).mockResolvedValueOnce("MTK");

      const result = await token.symbol();

      expect(result).toBe("MTK");
      expect(signer.readContract).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: "symbol" }),
      );
    });
  });

  describe("decimals", () => {
    it("reads the token decimals", async () => {
      vi.mocked(signer.readContract).mockResolvedValueOnce(18);

      const result = await token.decimals();

      expect(result).toBe(18);
      expect(signer.readContract).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: "decimals" }),
      );
    });
  });

  describe("authorize", () => {
    it("generates credentials without reading balance", async () => {
      await token.authorize();

      expect(sdk.generateKeypair).toHaveBeenCalledOnce();
      expect(signer.signTypedData).toHaveBeenCalledOnce();
      expect(signer.readContract).not.toHaveBeenCalled();
    });
  });

  describe("confidentialTransfer", () => {
    it("encrypts amount and sends transaction", async () => {
      const result = await token.confidentialTransfer(
        "0x8888888888888888888888888888888888888888" as Address,
        100n,
      );

      expect(sdk.encrypt).toHaveBeenCalledWith({
        values: [100n],
        contractAddress: TOKEN,
        userAddress: USER,
      });
      expect(signer.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "confidentialTransfer",
        }),
      );
      expect(result.txHash).toBe("0xtxhash");
      expect(result.receipt).toEqual({ logs: [] });
    });
  });

  describe("shield", () => {
    it("checks allowance and shields", async () => {
      vi.mocked(signer.readContract)
        .mockResolvedValueOnce("0x9999999999999999999999999999999999999999") // #getUnderlying (cached for ensureAllowance)
        .mockResolvedValueOnce(0n); // allowance

      const txHash = await token.shield(100n);

      // approve + wrap = 2 writeContract calls
      expect(signer.writeContract).toHaveBeenCalledTimes(2);
      expect(signer.writeContract).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ functionName: "approve" }),
      );
      expect(signer.writeContract).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ functionName: "wrap" }),
      );
      expect(txHash.txHash).toBe("0xtxhash");
      expect(txHash.receipt).toEqual({ logs: [] });
    });

    it("skips approval when allowance is sufficient", async () => {
      vi.mocked(signer.readContract)
        .mockResolvedValueOnce("0x9999999999999999999999999999999999999999") // #getUnderlying (cached for ensureAllowance)
        .mockResolvedValueOnce(200n); // enough allowance

      await token.shield(100n);

      // Only wrap, no approve
      expect(signer.writeContract).toHaveBeenCalledOnce();
      expect(signer.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: "wrap" }),
      );
    });

    it("skips approval when approvalStrategy is skip", async () => {
      vi.mocked(signer.readContract).mockResolvedValueOnce(
        "0x9999999999999999999999999999999999999999",
      ); // #getUnderlying

      await token.shield(100n, { approvalStrategy: "skip" });

      // Only readContract for #getUnderlying, no allowance check
      expect(signer.readContract).toHaveBeenCalledOnce();
      expect(signer.writeContract).toHaveBeenCalledOnce();
    });
  });

  describe("shieldETH", () => {
    it("sends shieldETH with value", async () => {
      const result = await token.shieldETH(1000n);

      expect(signer.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "wrapETH",
          value: 1000n,
        }),
      );
      expect(result.txHash).toBe("0xtxhash");
      expect(result.receipt).toEqual({ logs: [] });
    });
  });

  describe("unwrap", () => {
    it("encrypts amount and sends unwrap to user address", async () => {
      const result = await token.unwrap(50n);

      expect(sdk.encrypt).toHaveBeenCalledWith({
        values: [50n],
        contractAddress: TOKEN,
        userAddress: USER,
      });
      expect(signer.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "unwrap",
          args: expect.arrayContaining([USER, USER]),
        }),
      );
      expect(result.txHash).toBe("0xtxhash");
      expect(result.receipt).toEqual({ logs: [] });
    });
  });

  describe("unwrapAll", () => {
    it("uses existing balance handle and sends to user address", async () => {
      vi.mocked(signer.readContract).mockResolvedValue(VALID_HANDLE);

      await token.unwrapAll();

      expect(sdk.encrypt).not.toHaveBeenCalled();
      expect(signer.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "unwrap",
          args: [USER, USER, VALID_HANDLE],
        }),
      );
    });

    it("throws when balance is zero", async () => {
      vi.mocked(signer.readContract).mockResolvedValue(ZERO_HANDLE);

      await expect(token.unwrapAll()).rejects.toThrow("balance is zero");
    });
  });

  describe("finalizeUnwrap", () => {
    it("decrypts burn amount and finalizes", async () => {
      const burnHandle = "0xburn" as Address;
      const result = await token.finalizeUnwrap(burnHandle);

      expect(sdk.publicDecrypt).toHaveBeenCalledWith([burnHandle]);
      expect(signer.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: "finalizeUnwrap" }),
      );
      expect(result.txHash).toBe("0xtxhash");
      expect(result.receipt).toEqual({ logs: [] });
    });
  });

  describe("unshield", () => {
    const BURN_HANDLE = "0x" + "ff".repeat(32);

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

    it("orchestrates unwrap → receipt → finalizeUnwrap", async () => {
      mockReceiptWithUnwrapRequested();

      const result = await token.unshield(50n);

      expect(sdk.encrypt).toHaveBeenCalled();
      expect(signer.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: "unwrap" }),
      );
      expect(signer.waitForTransactionReceipt).toHaveBeenCalledWith("0xtxhash");
      expect(sdk.publicDecrypt).toHaveBeenCalledWith([BURN_HANDLE]);
      expect(signer.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: "finalizeUnwrap" }),
      );
      expect(result.txHash).toBe("0xtxhash");
      expect(result.receipt).toBeDefined();
    });

    it("throws when no UnwrapRequested event in receipt", async () => {
      vi.mocked(signer.waitForTransactionReceipt).mockResolvedValue({
        logs: [],
      });

      await expect(token.unshield(50n)).rejects.toThrow(
        "No UnwrapRequested event found in unshield receipt",
      );
    });
  });

  describe("unshieldAll", () => {
    const BURN_HANDLE = "0x" + "ff".repeat(32);

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

    it("orchestrates unwrapAll → receipt → finalizeUnwrap", async () => {
      vi.mocked(signer.readContract).mockResolvedValue(VALID_HANDLE);
      mockReceiptWithUnwrapRequested();

      const result = await token.unshieldAll();

      expect(signer.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: "unwrap" }),
      );
      expect(signer.waitForTransactionReceipt).toHaveBeenCalledWith("0xtxhash");
      expect(sdk.publicDecrypt).toHaveBeenCalledWith([BURN_HANDLE]);
      expect(result.txHash).toBe("0xtxhash");
      expect(result.receipt).toBeDefined();
    });

    it("throws when no UnwrapRequested event in receipt", async () => {
      vi.mocked(signer.readContract).mockResolvedValue(VALID_HANDLE);
      vi.mocked(signer.waitForTransactionReceipt).mockResolvedValue({
        logs: [],
      });

      await expect(token.unshieldAll()).rejects.toThrow(
        "No UnwrapRequested event found in unshield receipt",
      );
    });
  });

  // ── Additional coverage ──────────────────────────────────────────────

  describe("confidentialTransfer (error handling)", () => {
    it("wraps non-TokenError in EncryptionFailed", async () => {
      vi.mocked(sdk.encrypt).mockRejectedValueOnce(new Error("boom"));

      await expect(
        token.confidentialTransfer("0x8888888888888888888888888888888888888888" as Address, 100n),
      ).rejects.toSatisfy((err: TokenError) => {
        return (
          err instanceof TokenError &&
          err.code === TokenErrorCode.EncryptionFailed &&
          err.message === "Failed to encrypt transfer amount"
        );
      });
    });
  });

  describe("confidentialTransferFrom", () => {
    it("encrypts amount with from as userAddress and sends transaction", async () => {
      const from = "0xcccccccccccccccccccccccccccccccccccccccc" as Address;
      const to = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address;

      const result = await token.confidentialTransferFrom(from, to, 200n);

      expect(sdk.encrypt).toHaveBeenCalledWith({
        values: [200n],
        contractAddress: TOKEN,
        userAddress: from,
      });
      expect(signer.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "confidentialTransferFrom",
        }),
      );
      expect(result.txHash).toBe("0xtxhash");
      expect(result.receipt).toEqual({ logs: [] });
    });

    it("wraps non-TokenError in EncryptionFailed", async () => {
      vi.mocked(sdk.encrypt).mockRejectedValueOnce(new Error("boom"));

      await expect(
        token.confidentialTransferFrom(
          "0xcccccccccccccccccccccccccccccccccccccccc" as Address,
          "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address,
          200n,
        ),
      ).rejects.toSatisfy((err: TokenError) => {
        return (
          err instanceof TokenError &&
          err.code === TokenErrorCode.EncryptionFailed &&
          err.message === "Failed to encrypt transferFrom amount"
        );
      });
    });
  });

  describe("approve", () => {
    it("calls setOperatorContract with spender", async () => {
      const spender = "0x3333333333333333333333333333333333333333" as Address;

      const result = await token.approve(spender);

      expect(signer.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "setOperator",
          args: expect.arrayContaining([spender]),
        }),
      );
      expect(result.txHash).toBe("0xtxhash");
      expect(result.receipt).toEqual({ logs: [] });
    });

    it("wraps error in ApprovalFailed", async () => {
      vi.mocked(signer.writeContract).mockRejectedValueOnce(new Error("tx failed"));

      await expect(
        token.approve("0x3333333333333333333333333333333333333333" as Address),
      ).rejects.toSatisfy((err: TokenError) => {
        return (
          err instanceof TokenError &&
          err.code === TokenErrorCode.ApprovalFailed &&
          err.message === "Operator approval failed"
        );
      });
    });
  });

  describe("isApproved", () => {
    it("returns boolean result from readContract", async () => {
      vi.mocked(signer.readContract).mockResolvedValueOnce(true);

      const result = await token.isApproved(
        "0x3333333333333333333333333333333333333333" as Address,
      );

      expect(result).toBe(true);
      expect(signer.readContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "isOperator",
        }),
      );
    });
  });

  describe("wrap (additional branches)", () => {
    const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

    it("calls shieldETH when underlying is zero address", async () => {
      vi.mocked(signer.readContract).mockResolvedValueOnce(ZERO_ADDRESS); // #getUnderlying

      const result = await token.shield(100n);

      expect(signer.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "wrapETH",
          value: 100n,
        }),
      );
      expect(result.txHash).toBe("0xtxhash");
      expect(result.receipt).toEqual({ logs: [] });
    });

    it("passes amount + fees as value when underlying is zero address with fees", async () => {
      vi.mocked(signer.readContract).mockResolvedValueOnce(ZERO_ADDRESS); // #getUnderlying

      await token.shield(100n, { fees: 10n });

      expect(signer.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "wrapETH",
          value: 110n,
        }),
      );
    });

    it("approves max uint256 with approvalStrategy max", async () => {
      vi.mocked(signer.readContract)
        .mockResolvedValueOnce("0x9999999999999999999999999999999999999999") // #getUnderlying (cached for ensureAllowance)
        .mockResolvedValueOnce(0n); // allowance

      await token.shield(100n, { approvalStrategy: "max" });

      // First writeContract call is approve with max uint256
      expect(signer.writeContract).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          functionName: "approve",
          args: expect.arrayContaining([2n ** 256n - 1n]),
        }),
      );
    });

    it("resets to zero first when existing non-zero allowance (USDT handling)", async () => {
      vi.mocked(signer.readContract)
        .mockResolvedValueOnce("0x9999999999999999999999999999999999999999") // #getUnderlying (cached for ensureAllowance)
        .mockResolvedValueOnce(50n); // existing non-zero allowance < amount

      await token.shield(100n);

      // reset to zero, then approve exact, then wrap = 3 calls
      expect(signer.writeContract).toHaveBeenCalledTimes(3);
      expect(signer.writeContract).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          functionName: "approve",
          args: expect.arrayContaining([0n]),
        }),
      );
      expect(signer.writeContract).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          functionName: "approve",
          args: expect.arrayContaining([100n]),
        }),
      );
      expect(signer.writeContract).toHaveBeenNthCalledWith(
        3,
        expect.objectContaining({ functionName: "wrap" }),
      );
    });

    it("wraps write failure in TransactionReverted", async () => {
      vi.mocked(signer.readContract).mockResolvedValueOnce(
        "0x9999999999999999999999999999999999999999",
      ); // #getUnderlying
      // skip approval
      vi.mocked(signer.writeContract).mockRejectedValueOnce(new Error("tx failed"));

      await expect(token.shield(100n, { approvalStrategy: "skip" })).rejects.toSatisfy(
        (err: TokenError) => {
          return (
            err instanceof TokenError &&
            err.code === TokenErrorCode.TransactionReverted &&
            err.message === "Shield transaction failed"
          );
        },
      );
    });

    it("wraps allowance check failure in ApprovalFailed", async () => {
      vi.mocked(signer.readContract)
        .mockResolvedValueOnce("0x9999999999999999999999999999999999999999") // #getUnderlying (cached for ensureAllowance)
        .mockResolvedValueOnce(0n); // allowance

      vi.mocked(signer.writeContract).mockRejectedValueOnce(new Error("approve failed"));

      await expect(token.shield(100n)).rejects.toSatisfy((err: TokenError) => {
        return err instanceof TokenError && err.code === TokenErrorCode.ApprovalFailed;
      });
    });
  });

  describe("shieldETH (error wrapping)", () => {
    it("wraps TokenError thrown by writeContract", async () => {
      vi.mocked(signer.writeContract).mockRejectedValueOnce(new Error("tx failed"));

      await expect(token.shieldETH(1000n)).rejects.toMatchObject({
        code: TokenErrorCode.TransactionReverted,
        message: "Shield ETH transaction failed",
      });
    });

    it("re-throws TokenError as-is", async () => {
      const original = new TokenError(TokenErrorCode.EncryptionFailed, "already wrapped");
      vi.mocked(signer.writeContract).mockRejectedValueOnce(original);

      await expect(token.shieldETH(1000n)).rejects.toBe(original);
    });
  });

  describe("shieldETH (additional branches)", () => {
    it("uses custom value parameter when provided", async () => {
      const result = await token.shieldETH(1000n, 2000n);

      expect(signer.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "wrapETH",
          value: 2000n,
        }),
      );
      expect(result.txHash).toBe("0xtxhash");
      expect(result.receipt).toEqual({ logs: [] });
    });
  });

  describe("unwrap (error handling)", () => {
    it("wraps encrypt failure in EncryptionFailed", async () => {
      vi.mocked(sdk.encrypt).mockRejectedValueOnce(new Error("encrypt failed"));

      await expect(token.unwrap(50n)).rejects.toSatisfy((err: TokenError) => {
        return (
          err instanceof TokenError &&
          err.code === TokenErrorCode.EncryptionFailed &&
          err.message === "Failed to encrypt unshield amount"
        );
      });
    });
  });

  describe("unwrapAll (error handling)", () => {
    it("wraps write failure in TransactionReverted", async () => {
      vi.mocked(signer.readContract).mockResolvedValue(VALID_HANDLE);
      vi.mocked(signer.writeContract).mockRejectedValueOnce(new Error("tx failed"));

      await expect(token.unwrapAll()).rejects.toSatisfy((err: TokenError) => {
        return (
          err instanceof TokenError &&
          err.code === TokenErrorCode.TransactionReverted &&
          err.message === "Unshield-all transaction failed"
        );
      });
    });
  });

  describe("finalizeUnwrap (error handling)", () => {
    it("wraps publicDecrypt failure in DecryptionFailed", async () => {
      vi.mocked(sdk.publicDecrypt).mockRejectedValueOnce(new Error("decrypt failed"));

      await expect(token.finalizeUnwrap("0xburn" as Address)).rejects.toSatisfy(
        (err: TokenError) => {
          return (
            err instanceof TokenError &&
            err.code === TokenErrorCode.DecryptionFailed &&
            err.message === "Failed to finalize unshield"
          );
        },
      );
    });
  });

  describe("approveUnderlying", () => {
    it("defaults to max uint256 approval", async () => {
      vi.mocked(signer.readContract)
        .mockResolvedValueOnce("0x9999999999999999999999999999999999999999") // underlying
        .mockResolvedValueOnce(0n); // currentAllowance

      await token.approveUnderlying();

      expect(signer.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "approve",
          args: expect.arrayContaining([2n ** 256n - 1n]),
        }),
      );
    });

    it("resets to zero first when existing non-zero allowance", async () => {
      vi.mocked(signer.readContract)
        .mockResolvedValueOnce("0x9999999999999999999999999999999999999999") // underlying
        .mockResolvedValueOnce(50n); // currentAllowance > 0

      await token.approveUnderlying();

      expect(signer.writeContract).toHaveBeenCalledTimes(2);
      expect(signer.writeContract).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          functionName: "approve",
          args: expect.arrayContaining([0n]),
        }),
      );
      expect(signer.writeContract).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          functionName: "approve",
          args: expect.arrayContaining([2n ** 256n - 1n]),
        }),
      );
    });

    it("accepts custom amount", async () => {
      vi.mocked(signer.readContract)
        .mockResolvedValueOnce("0x9999999999999999999999999999999999999999") // underlying
        .mockResolvedValueOnce(0n); // currentAllowance

      await token.approveUnderlying(500n);

      expect(signer.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "approve",
          args: expect.arrayContaining([500n]),
        }),
      );
    });

    it("wraps error in ApprovalFailed", async () => {
      vi.mocked(signer.readContract)
        .mockResolvedValueOnce("0x9999999999999999999999999999999999999999") // underlying
        .mockResolvedValueOnce(0n); // currentAllowance

      vi.mocked(signer.writeContract).mockRejectedValueOnce(new Error("approve failed"));

      await expect(token.approveUnderlying()).rejects.toSatisfy((err: TokenError) => {
        return (
          err instanceof TokenError &&
          err.code === TokenErrorCode.ApprovalFailed &&
          err.message === "ERC-20 approval failed"
        );
      });
    });
  });
});
