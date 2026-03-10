import { Topics } from "../../events";
import type { RawLog } from "../../events";
import { describe, expect, it, vi } from "../../test-fixtures";
import type { Address } from "viem";

const RECIPIENT = "0x8888888888888888888888888888888888888888" as Address;
const BURN_HANDLE = ("0x" + "ff".repeat(32)) as Address;

describe("Integration: multi-step workflows", () => {
  describe("shield flow: approve → shield → verify balance", () => {
    it("performs full shield flow with exact approval", async ({
      relayer,
      signer,
      token,
      handle,
    }) => {
      const UNDERLYING = "0x9999999999999999999999999999999999999999" as Address;

      // Step 1: readContract calls for underlying and allowance
      vi.mocked(signer.readContract)
        .mockResolvedValueOnce(UNDERLYING) // #getUnderlying
        .mockResolvedValueOnce(0n) // allowance check (insufficient)
        .mockResolvedValueOnce(handle); // confidentialBalanceOf after wrap

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
      const balanceHandle = await token.confidentialBalanceOf();
      expect(balanceHandle).toBe(handle);

      // Step 4: Decrypt the balance
      const balance = await token.decryptBalance(balanceHandle);
      expect(balance).toBe(1000n);
      expect(relayer.userDecrypt).toHaveBeenCalledWith(
        expect.objectContaining({ handles: [handle] }),
      );
    });
  });

  describe("confidentialTransfer flow: encrypt → transfer → verify", () => {
    it("performs full transfer flow", async ({
      relayer,
      signer,
      tokenAddress,
      token,
      userAddress,
      handle,
      createToken,
      createMockStorage,
    }) => {
      // Step 1: Execute transfer (encrypts amount, sends tx)
      const transferResult = await token.confidentialTransfer(RECIPIENT, 250n);
      expect(transferResult.txHash).toBe("0xtxhash");

      // Verify encrypt was called with correct params
      expect(relayer.encrypt).toHaveBeenCalledWith({
        values: [{ value: 250n, type: "euint64" }],
        contractAddress: tokenAddress,
        userAddress,
      });

      // Verify writeContract was called for the transfer
      expect(signer.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "confidentialTransfer",
          args: expect.arrayContaining([RECIPIENT]),
        }),
      );

      // Step 2: Check sender balance after transfer
      vi.mocked(signer.readContract).mockResolvedValueOnce(handle);
      const senderHandle = await token.confidentialBalanceOf();
      expect(senderHandle).toBe(handle);

      // Step 3: Check receiver balance (different token instance for same contract)
      const receiverToken = createToken({
        relayer,
        signer,
        storage: createMockStorage(),
        sessionStorage: createMockStorage(),
        address: tokenAddress,
      });
      vi.mocked(signer.readContract).mockResolvedValueOnce(handle);
      const receiverHandle = await receiverToken.confidentialBalanceOf(RECIPIENT);
      expect(receiverHandle).toBe(handle);
    });
  });

  describe("unwrap flow: unwrap → finalize → verify", () => {
    it("performs full unwrap and finalize flow", async ({
      relayer,
      signer,
      token,
      tokenAddress,
      userAddress,
    }) => {
      // Step 1: Execute unwrap (encrypts amount, sends tx)
      const unwrapResult = await token.unwrap(500n);
      expect(unwrapResult.txHash).toBe("0xtxhash");

      // Verify encryption happened
      expect(relayer.encrypt).toHaveBeenCalledWith({
        values: [{ value: 500n, type: "euint64" }],
        contractAddress: tokenAddress,
        userAddress,
      });

      // Step 2: Wait for receipt and finalize
      // Mock receipt with UnwrapRequested event
      vi.mocked(signer.waitForTransactionReceipt).mockResolvedValueOnce({
        logs: [
          {
            topics: [Topics.UnwrapRequested, `0x000000000000000000000000${userAddress.slice(2)}`],
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
      expect(relayer.publicDecrypt).toHaveBeenCalledWith([BURN_HANDLE]);

      // Verify finalizeUnwrap contract call
      expect(signer.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: "finalizeUnwrap" }),
      );
    });

    it("performs combined unshield (unwrap + finalize) in one call", async ({
      relayer,
      signer,
      token,
      userAddress,
    }) => {
      // Mock receipt with UnwrapRequested event for the auto-finalize path.
      // unwrap() now calls waitForTransactionReceipt (1st call),
      // then #waitAndFinalizeUnshield calls it again (2nd call) to parse the event,
      // then finalizeUnwrap calls it (3rd call) for the finalize receipt.
      const eventReceipt: { logs: RawLog[] } = {
        logs: [
          {
            topics: [Topics.UnwrapRequested, `0x000000000000000000000000${userAddress.slice(2)}`],
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
      expect(relayer.encrypt).toHaveBeenCalled();
      expect(signer.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: "unwrap" }),
      );
      expect(signer.waitForTransactionReceipt).toHaveBeenCalled();
      expect(relayer.publicDecrypt).toHaveBeenCalledWith([BURN_HANDLE]);
      expect(signer.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: "finalizeUnwrap" }),
      );
    });
  });
});
