import type { EncryptValuesReturnType } from "@fhevm/sdk/actions/encrypt";
import type { Address } from "viem";
import { InsufficientConfidentialBalanceError, SignerNotConfiguredError } from "../../errors";
import type { ZamaSDKEvent } from "../../events/sdk-events";
import {
  describe,
  expect,
  joinedLog,
  mockJoinBalance,
  mockJoinReceipt,
  test,
  vi,
} from "../../test-fixtures";
import { BatchState } from "../types";
import { createVaultBatcher, VaultBatcher } from "../vault-batcher";

const BATCHER_ADDRESS = "0x7777777777777777777777777777777777777777" as Address;
const OTHER_ADDRESS = "0x8b8b8b8b8B8B8b8B8B8b8b8b8b8B8B8B8B8b8B8b" as Address;
const FROM_TOKEN = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as Address;
const ZERO_ENCRYPTED = `0x${"00".repeat(32)}` as const;

describe("VaultBatcher", () => {
  test("checksums the batcher address", ({ sdk }) => {
    const batcher = createVaultBatcher(sdk, BATCHER_ADDRESS.toLowerCase() as Address);
    expect(batcher).toBeInstanceOf(VaultBatcher);
    expect(batcher.address).toBe(BATCHER_ADDRESS);
  });

  describe("join", () => {
    test("encrypts the amount, submits join, and reads the batch id from the Joined event", async ({
      sdk,
      provider,
      signer,
      relayer,
      userAddress,
      handle,
      inputProof,
    }) => {
      mockJoinBalance(provider, { fromToken: FROM_TOKEN });
      mockJoinReceipt(provider, { batcher: BATCHER_ADDRESS, account: userAddress });
      const batcher = new VaultBatcher(sdk, BATCHER_ADDRESS);
      const result = await batcher.join(1_000n);

      expect(result.batchId).toBe(12n);
      expect(relayer.encryptValues).toHaveBeenCalledWith({
        values: [{ value: 1_000n, type: "euint64" }],
        contractAddress: BATCHER_ADDRESS,
        userAddress,
      });
      expect(signer.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: "join", args: [userAddress, handle, inputProof] }),
      );
    });

    test("tags the submitted event with the batcher address", async ({
      createSDK,
      provider,
      userAddress,
      events,
    }) => {
      const received: ZamaSDKEvent[] = [];
      const sdk = createSDK({ onEvent: (event) => received.push(event) });
      mockJoinBalance(provider, { fromToken: FROM_TOKEN });
      mockJoinReceipt(provider, { batcher: BATCHER_ADDRESS, account: userAddress });

      await new VaultBatcher(sdk, BATCHER_ADDRESS).join(1_000n);

      expect(received).toContainEqual(
        expect.objectContaining({
          type: events.VaultSubmitted,
          vaultOperation: "join",
          tokenAddress: BATCHER_ADDRESS,
        }),
      );
    });

    test("uses an explicit beneficiary when provided", async ({
      sdk,
      provider,
      signer,
      handle,
      inputProof,
    }) => {
      mockJoinBalance(provider, { fromToken: FROM_TOKEN });
      mockJoinReceipt(provider, { batcher: BATCHER_ADDRESS, account: OTHER_ADDRESS });
      const batcher = new VaultBatcher(sdk, BATCHER_ADDRESS);
      await batcher.join(1_000n, OTHER_ADDRESS);

      expect(signer.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({ args: [OTHER_ADDRESS, handle, inputProof] }),
      );
    });

    test("throws without a configured signer", async ({ createSDK }) => {
      const batcher = new VaultBatcher(createSDK({ signer: undefined }), BATCHER_ADDRESS);
      await expect(batcher.join(1_000n)).rejects.toThrow(SignerNotConfiguredError);
    });

    test("throws when the receipt carries no Joined event", async ({ sdk, provider }) => {
      mockJoinBalance(provider, { fromToken: FROM_TOKEN });
      const batcher = new VaultBatcher(sdk, BATCHER_ADDRESS);
      await expect(batcher.join(1_000n)).rejects.toThrow("No Joined event");
    });

    test("ignores a Joined event credited to a different beneficiary", async ({
      sdk,
      provider,
      userAddress,
    }) => {
      mockJoinBalance(provider, { fromToken: FROM_TOKEN });
      vi.mocked(provider.waitForTransactionReceipt).mockResolvedValue({
        logs: [joinedLog({ batcher: BATCHER_ADDRESS, batchId: 12n, account: OTHER_ADDRESS })],
      });
      const batcher = new VaultBatcher(sdk, BATCHER_ADDRESS);
      await expect(batcher.join(1_000n)).rejects.toThrow(userAddress);
    });

    test("picks the Joined event for the beneficiary it joined for", async ({
      sdk,
      provider,
      userAddress,
    }) => {
      mockJoinBalance(provider, { fromToken: FROM_TOKEN });
      vi.mocked(provider.waitForTransactionReceipt).mockResolvedValue({
        logs: [
          joinedLog({ batcher: BATCHER_ADDRESS, batchId: 11n, account: userAddress }),
          joinedLog({ batcher: BATCHER_ADDRESS, batchId: 12n, account: OTHER_ADDRESS }),
        ],
      });
      const batcher = new VaultBatcher(sdk, BATCHER_ADDRESS);
      const result = await batcher.join(1_000n, OTHER_ADDRESS);
      expect(result.batchId).toBe(12n);
      expect(result.beneficiary).toBe(OTHER_ADDRESS);
    });

    test("throws when encryption returns no values", async ({
      sdk,
      provider,
      relayer,
      inputProof,
    }) => {
      mockJoinBalance(provider, { fromToken: FROM_TOKEN });
      vi.mocked(relayer.encryptValues).mockResolvedValueOnce({
        encryptedValues: [],
        inputProof,
      } as unknown as EncryptValuesReturnType);
      const batcher = new VaultBatcher(sdk, BATCHER_ADDRESS);
      await expect(batcher.join(1_000n)).rejects.toThrow("Encryption returned no encrypted values");
    });

    test("refuses to join more than the confidential balance on fromToken", async ({
      sdk,
      provider,
      signer,
    }) => {
      mockJoinBalance(provider, { fromToken: FROM_TOKEN, balance: 999n });
      const batcher = new VaultBatcher(sdk, BATCHER_ADDRESS);

      await expect(batcher.join(1_000n)).rejects.toThrow(InsufficientConfidentialBalanceError);
      expect(signer.writeContract).not.toHaveBeenCalled();
    });

    test("skips the balance check when asked", async ({ sdk, provider, signer, userAddress }) => {
      mockJoinBalance(provider, { fromToken: FROM_TOKEN, balance: 999n });
      mockJoinReceipt(provider, { batcher: BATCHER_ADDRESS, account: userAddress });
      const batcher = new VaultBatcher(sdk, BATCHER_ADDRESS);

      await batcher.join(1_000n, undefined, { skipBalanceCheck: true });

      expect(signer.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: "join" }),
      );
    });
  });

  describe("quit / dispatchBatch", () => {
    test("submits quit with the batch id", async ({ sdk, signer }) => {
      const batcher = new VaultBatcher(sdk, BATCHER_ADDRESS);
      await batcher.quit(7n);
      expect(signer.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: "quit", args: [7n] }),
      );
    });

    test("submits dispatchBatch with no args", async ({ sdk, signer }) => {
      const batcher = new VaultBatcher(sdk, BATCHER_ADDRESS);
      await batcher.dispatchBatch();
      expect(signer.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: "dispatchBatch", args: [] }),
      );
    });
  });

  describe("claim", () => {
    test("defaults the target account to the connected wallet", async ({
      sdk,
      signer,
      userAddress,
    }) => {
      const batcher = new VaultBatcher(sdk, BATCHER_ADDRESS);
      await batcher.claim(3n);
      expect(signer.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: "claim", args: [3n, userAddress] }),
      );
    });

    test("claims on behalf of an explicit account", async ({ sdk, signer }) => {
      const batcher = new VaultBatcher(sdk, BATCHER_ADDRESS);
      await batcher.claim(3n, OTHER_ADDRESS);
      expect(signer.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({ args: [3n, OTHER_ADDRESS] }),
      );
    });

    test("still requires a signer to submit, even when claiming for someone else", async ({
      createSDK,
    }) => {
      const batcher = new VaultBatcher(createSDK({ signer: undefined }), BATCHER_ADDRESS);
      await expect(batcher.claim(3n, OTHER_ADDRESS)).rejects.toThrow(SignerNotConfiguredError);
    });
  });

  describe("recover", () => {
    test("defaults the refunded account to the connected wallet", async ({
      sdk,
      signer,
      userAddress,
    }) => {
      const batcher = new VaultBatcher(sdk, BATCHER_ADDRESS);
      await batcher.recover(9n);
      expect(signer.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: "recover", args: [9n, userAddress] }),
      );
    });

    test("refunds another depositor on their behalf", async ({ sdk, signer }) => {
      const batcher = new VaultBatcher(sdk, BATCHER_ADDRESS);
      await batcher.recover(9n, OTHER_ADDRESS);
      expect(signer.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: "recover", args: [9n, OTHER_ADDRESS] }),
      );
    });

    test("still requires a signer to submit", async ({ createSDK }) => {
      const batcher = new VaultBatcher(createSDK({ signer: undefined }), BATCHER_ADDRESS);
      await expect(batcher.recover(9n, OTHER_ADDRESS)).rejects.toThrow(SignerNotConfiguredError);
    });
  });

  describe("reads", () => {
    test("passes through view calls to the provider", async ({ sdk, provider }) => {
      vi.mocked(provider.readContract).mockResolvedValueOnce(3480n);
      const batcher = new VaultBatcher(sdk, BATCHER_ADDRESS);
      const minAge = await batcher.minBatchAge();
      expect(minAge).toBe(3480n);
      expect(provider.readContract).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: "minBatchAge", args: [] }),
      );
    });

    test("batchCreatedAt and batchDispatchedAt pass through with the batch id", async ({
      sdk,
      provider,
    }) => {
      vi.mocked(provider.readContract)
        .mockResolvedValueOnce(1_789_130_580n)
        .mockResolvedValueOnce(0n);
      const batcher = new VaultBatcher(sdk, BATCHER_ADDRESS);

      await expect(batcher.batchCreatedAt(58n)).resolves.toBe(1_789_130_580n);
      await expect(batcher.batchDispatchedAt(58n)).resolves.toBe(0n);

      expect(provider.readContract).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ functionName: "batchCreatedAt", args: [58n] }),
      );
      expect(provider.readContract).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ functionName: "batchDispatchedAt", args: [58n] }),
      );
    });
  });

  describe("timeUntilDispatchable", () => {
    test("returns the remaining seconds when the batch is still too young", async ({
      sdk,
      provider,
    }) => {
      vi.mocked(provider.readContract)
        .mockResolvedValueOnce(BatchState.Pending) // batchState
        .mockResolvedValueOnce(1_000n) // batchCreatedAt
        .mockResolvedValueOnce(3_480n); // batchMinBatchAge(batchId)
      vi.mocked(provider.getBlockTimestamp).mockResolvedValueOnce(2_000n); // now

      const batcher = new VaultBatcher(sdk, BATCHER_ADDRESS);
      // eligible at 1_000 + 3_480 = 4_480; now is 2_000 → 2_480 remaining
      await expect(batcher.timeUntilDispatchable(58n)).resolves.toBe(2_480n);
    });

    test("returns 0 once the batch is already old enough", async ({ sdk, provider }) => {
      vi.mocked(provider.readContract)
        .mockResolvedValueOnce(BatchState.Pending) // batchState
        .mockResolvedValueOnce(1_000n) // batchCreatedAt
        .mockResolvedValueOnce(3_480n); // batchMinBatchAge(batchId)
      vi.mocked(provider.getBlockTimestamp).mockResolvedValueOnce(10_000n); // well past eligible

      const batcher = new VaultBatcher(sdk, BATCHER_ADDRESS);
      await expect(batcher.timeUntilDispatchable(58n)).resolves.toBe(0n);
    });

    test.for([BatchState.Dispatched, BatchState.Finalized, BatchState.Canceled])(
      "returns null for a batch in state %s, which can never be dispatched again",
      async (state, { sdk, provider }) => {
        vi.mocked(provider.readContract)
          .mockResolvedValueOnce(state) // batchState
          .mockResolvedValueOnce(1_000n) // batchCreatedAt
          .mockResolvedValueOnce(3_480n); // batchMinBatchAge(batchId)
        vi.mocked(provider.getBlockTimestamp).mockResolvedValueOnce(10_000n);

        const batcher = new VaultBatcher(sdk, BATCHER_ADDRESS);
        await expect(batcher.timeUntilDispatchable(58n)).resolves.toBeNull();
      },
    );
  });

  describe("depositOf", () => {
    test("skips decryption for a zero deposit", async ({ sdk, provider, relayer, userAddress }) => {
      vi.mocked(provider.readContract).mockResolvedValueOnce(ZERO_ENCRYPTED);
      const batcher = new VaultBatcher(sdk, BATCHER_ADDRESS);
      const value = await batcher.depositOf(1n, userAddress);
      expect(value).toBe(0n);
      expect(relayer.decryptValues).not.toHaveBeenCalled();
    });

    test("decrypts a non-zero deposit", async ({ sdk, provider, relayer, userAddress, handle }) => {
      vi.mocked(provider.readContract).mockResolvedValueOnce(handle);
      const batcher = new VaultBatcher(sdk, BATCHER_ADDRESS);
      const value = await batcher.depositOf(1n, userAddress);
      expect(value).toBe(1000n);
      expect(relayer.decryptValues).toHaveBeenCalled();
    });
  });
});
