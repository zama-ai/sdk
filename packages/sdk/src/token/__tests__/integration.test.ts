import { beforeEach, describe, expect, it, vi } from "vitest";
import { Topics } from "../../events";
import type { RelayerSDK } from "../../relayer/relayer-sdk";
import type { Address } from "../../relayer/relayer-sdk.types";
import { Token } from "../token";
import { MemoryStorage } from "../memory-storage";
import type { GenericSigner } from "../token.types";

const TOKEN = "0x1111111111111111111111111111111111111111" as Address;
const WRAPPER = TOKEN;
const USER = "0x2222222222222222222222222222222222222222" as Address;
const RECIPIENT = "0x8888888888888888888888888888888888888888" as Address;
const UNDERLYING = "0x9999999999999999999999999999999999999999" as Address;
const VALID_HANDLE = ("0x" + "ab".repeat(32)) as Address;
const BURN_HANDLE = ("0x" + "ff".repeat(32)) as Address;

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
      clearValues: {},
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
    readContract: vi.fn(),
    waitForTransactionReceipt: vi.fn().mockResolvedValue({ logs: [] }),
    getChainId: vi.fn().mockResolvedValue(31337),
  };
}

describe("Integration: multi-step workflows", () => {
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
      sessionStorage: new MemoryStorage(),
      address: TOKEN,
    });
  });

  describe("shield flow: approve → shield → verify balance", () => {
    it("performs full shield flow with exact approval", async () => {
      // Step 1: readContract calls for underlying and allowance
      vi.mocked(signer.readContract)
        .mockResolvedValueOnce(UNDERLYING) // #getUnderlying
        .mockResolvedValueOnce(0n) // allowance check (insufficient)
        .mockResolvedValueOnce(VALID_HANDLE); // confidentialBalanceOf after wrap

      // Step 2: Execute shield (triggers approve + wrap)
      const shieldResult = await token.shield(500n);
      expect(shieldResult.txHash).toBe("0xtxhash");

      // Verify approve was called first, then wrap
      expect(signer.writeContract).toHaveBeenCalledTimes(2);
      expect(signer.writeContract).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ functionName: "approve", args: expect.arrayContaining([500n]) }),
      );
      expect(signer.writeContract).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ functionName: "wrap" }),
      );

      // Step 3: Check balance after shield — should read the new handle
      const handle = await token.confidentialBalanceOf();
      expect(handle).toBe(VALID_HANDLE);

      // Step 4: Decrypt the balance
      const balance = await token.decryptBalance(handle);
      expect(balance).toBe(1000n);
      expect(sdk.userDecrypt).toHaveBeenCalledWith(
        expect.objectContaining({ handles: [VALID_HANDLE] }),
      );
    });
  });

  describe("confidentialTransfer flow: encrypt → transfer → verify", () => {
    it("performs full transfer flow", async () => {
      // Step 1: Execute transfer (encrypts amount, sends tx)
      const transferResult = await token.confidentialTransfer(RECIPIENT, 250n);
      expect(transferResult.txHash).toBe("0xtxhash");

      // Verify encrypt was called with correct params
      expect(sdk.encrypt).toHaveBeenCalledWith({
        values: [250n],
        contractAddress: TOKEN,
        userAddress: USER,
      });

      // Verify writeContract was called for the transfer
      expect(signer.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "confidentialTransfer",
          args: expect.arrayContaining([RECIPIENT]),
        }),
      );

      // Step 2: Check sender balance after transfer
      vi.mocked(signer.readContract).mockResolvedValueOnce(VALID_HANDLE);
      const senderHandle = await token.confidentialBalanceOf();
      expect(senderHandle).toBe(VALID_HANDLE);

      // Step 3: Check receiver balance (different token instance for same contract)
      const receiverToken = new Token({
        sdk: sdk as unknown as RelayerSDK,
        signer,
        storage: new MemoryStorage(),
        sessionStorage: new MemoryStorage(),
        address: TOKEN,
      });
      vi.mocked(signer.readContract).mockResolvedValueOnce(VALID_HANDLE);
      const receiverHandle = await receiverToken.confidentialBalanceOf(RECIPIENT);
      expect(receiverHandle).toBe(VALID_HANDLE);
    });
  });

  describe("unwrap flow: unwrap → finalize → verify", () => {
    it("performs full unwrap and finalize flow", async () => {
      // Step 1: Execute unwrap (encrypts amount, sends tx)
      const unwrapResult = await token.unwrap(500n);
      expect(unwrapResult.txHash).toBe("0xtxhash");

      // Verify encryption happened
      expect(sdk.encrypt).toHaveBeenCalledWith({
        values: [500n],
        contractAddress: WRAPPER,
        userAddress: USER,
      });

      // Step 2: Wait for receipt and finalize
      // Mock receipt with UnwrapRequested event
      vi.mocked(signer.waitForTransactionReceipt).mockResolvedValueOnce({
        logs: [
          {
            topics: [Topics.UnwrapRequested, "0x000000000000000000000000" + USER.slice(2)],
            data: BURN_HANDLE,
          },
        ],
      });

      // Reset writeContract mock to track finalize call
      vi.mocked(signer.writeContract).mockClear();
      vi.mocked(signer.writeContract).mockResolvedValue("0xfinalizetx");

      const finalizeResult = await token.finalizeUnwrap(BURN_HANDLE);
      expect(finalizeResult.txHash).toBe("0xfinalizetx");

      // Verify publicDecrypt was called with the burn handle
      expect(sdk.publicDecrypt).toHaveBeenCalledWith([BURN_HANDLE]);

      // Verify finalizeUnwrap contract call
      expect(signer.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: "finalizeUnwrap" }),
      );
    });

    it("performs combined unshield (unwrap + finalize) in one call", async () => {
      // Mock receipt with UnwrapRequested event for the auto-finalize path.
      // unwrap() now calls waitForTransactionReceipt (1st call),
      // then #waitAndFinalizeUnshield calls it again (2nd call) to parse the event,
      // then finalizeUnwrap calls it (3rd call) for the finalize receipt.
      const eventReceipt = {
        logs: [
          {
            topics: [Topics.UnwrapRequested, "0x000000000000000000000000" + USER.slice(2)],
            data: BURN_HANDLE,
          },
        ],
      };
      vi.mocked(signer.waitForTransactionReceipt)
        .mockResolvedValueOnce(eventReceipt) // unwrap receipt
        .mockResolvedValueOnce(eventReceipt) // #waitAndFinalizeUnshield receipt (parses event)
        .mockResolvedValueOnce({ logs: [] }); // finalizeUnwrap receipt

      const unshieldResult = await token.unshield(500n);
      expect(unshieldResult.txHash).toBe("0xtxhash");

      // Verify full pipeline: encrypt → unwrap → waitForReceipt → publicDecrypt → finalizeUnwrap
      expect(sdk.encrypt).toHaveBeenCalled();
      expect(signer.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: "unwrap" }),
      );
      expect(signer.waitForTransactionReceipt).toHaveBeenCalled();
      expect(sdk.publicDecrypt).toHaveBeenCalledWith([BURN_HANDLE]);
      expect(signer.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: "finalizeUnwrap" }),
      );
    });
  });
});
