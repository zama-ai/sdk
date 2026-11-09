import type { EncryptValuesReturnType } from "@fhevm/sdk/actions/encrypt";
import type { Address } from "viem";
import {
  ChainMismatchError,
  ConfigurationError,
  InsufficientConfidentialBalanceError,
  SignerNotConfiguredError,
  VaultBatchNotDispatchedError,
} from "../../errors";
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
import { Token } from "../../token";
import type { GenericProvider } from "../../types/provider";
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
    test("sends the amount to the batcher with confidentialTransferAndCall and reads the batch id from the Joined event", async ({
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
        contractAddress: FROM_TOKEN,
        userAddress,
        options: { operation: "vault-join" },
      });
      expect(Token.prototype.decryptBalance).toHaveBeenCalledWith(userAddress, "vault-join");
      expect(signer.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          address: FROM_TOKEN,
          functionName: "confidentialTransferAndCall",
          args: [BATCHER_ADDRESS, handle, inputProof, "0x"],
        }),
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

    test("calls the pulling join, with input bound to the batcher, for another beneficiary", async ({
      sdk,
      provider,
      signer,
      relayer,
      handle,
      inputProof,
    }) => {
      mockJoinBalance(provider, { fromToken: FROM_TOKEN });
      mockJoinReceipt(provider, { batcher: BATCHER_ADDRESS, account: OTHER_ADDRESS });
      const batcher = new VaultBatcher(sdk, BATCHER_ADDRESS);
      await batcher.join(1_000n, OTHER_ADDRESS);

      expect(relayer.encryptValues).toHaveBeenCalledWith(
        expect.objectContaining({ contractAddress: BATCHER_ADDRESS }),
      );
      expect(signer.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          address: BATCHER_ADDRESS,
          functionName: "join",
          args: [OTHER_ADDRESS, handle, inputProof],
        }),
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
        expect.objectContaining({ functionName: "confidentialTransferAndCall" }),
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

  describe("finalize", () => {
    const UNWRAP_REQUEST_ID = `0x${"ab".repeat(32)}` as const;
    const UNWRAP_AMOUNT = `0x${"cd".repeat(32)}` as const;

    function mockDispatchedBatch(
      provider: GenericProvider,
      state: BatchState = BatchState.Dispatched,
    ): void {
      vi.mocked(provider.readContract).mockImplementation(async (config) => {
        switch (config.functionName) {
          case "batchState": {
            return state;
          }
          case "unwrapRequestId": {
            return UNWRAP_REQUEST_ID;
          }
          case "fromToken": {
            return FROM_TOKEN;
          }
          case "unwrapAmount": {
            return UNWRAP_AMOUNT;
          }
          default: {
            throw new Error(`Unexpected read ${config.functionName}`);
          }
        }
      });
    }

    test("decrypts the batch's unwrap amount and submits dispatchBatchCallback", async ({
      sdk,
      provider,
      relayer,
      signer,
    }) => {
      mockDispatchedBatch(provider);
      const result = await new VaultBatcher(sdk, BATCHER_ADDRESS).finalize(7n);

      expect(provider.readContract).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: "unwrapRequestId", args: [7n] }),
      );
      expect(provider.readContract).toHaveBeenCalledWith(
        expect.objectContaining({
          address: FROM_TOKEN,
          functionName: "unwrapAmount",
          args: [UNWRAP_REQUEST_ID],
        }),
      );
      expect(relayer.decryptPublicValuesWithSignatures).toHaveBeenCalledWith({
        encryptedValues: [UNWRAP_AMOUNT],
        options: { operation: "vault-finalize" },
      });
      expect(signer.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          address: BATCHER_ADDRESS,
          functionName: "dispatchBatchCallback",
          args: [7n, 500n, expect.any(String)],
        }),
      );
      expect(result.txHash).toBe("0xtxhash");
    });

    test("tags the submitted event as a finalize", async ({ createSDK, provider, events }) => {
      const received: ZamaSDKEvent[] = [];
      const sdk = createSDK({ onEvent: (event) => received.push(event) });
      mockDispatchedBatch(provider);

      await new VaultBatcher(sdk, BATCHER_ADDRESS).finalize(7n);

      expect(received).toContainEqual(
        expect.objectContaining({
          type: events.VaultSubmitted,
          vaultOperation: "finalize",
          tokenAddress: BATCHER_ADDRESS,
        }),
      );
    });

    test("throws without a configured signer before reading anything", async ({
      createSDK,
      provider,
    }) => {
      const batcher = new VaultBatcher(createSDK({ signer: undefined }), BATCHER_ADDRESS);
      await expect(batcher.finalize(7n)).rejects.toThrow(SignerNotConfiguredError);
      expect(provider.readContract).not.toHaveBeenCalled();
    });

    test("prepareFinalize builds the callback without a signer", async ({
      createSDK,
      provider,
    }) => {
      mockDispatchedBatch(provider);
      const batcher = new VaultBatcher(createSDK({ signer: undefined }), BATCHER_ADDRESS);

      const prepared = await batcher.prepareFinalize(7n);

      expect(prepared).toMatchObject({
        batchId: 7n,
        unwrapAmountCleartext: 500n,
        call: expect.objectContaining({
          address: BATCHER_ADDRESS,
          functionName: "dispatchBatchCallback",
          args: [7n, 500n, prepared.decryptionProof],
        }),
      });
    });

    test.for([BatchState.Pending, BatchState.Finalized, BatchState.Canceled])(
      "refuses a batch in state %s before decrypting anything",
      async (state, { sdk, provider, relayer, signer }) => {
        mockDispatchedBatch(provider, state);
        const batcher = new VaultBatcher(sdk, BATCHER_ADDRESS);

        const error = await batcher.finalize(7n).catch((error: unknown) => error);

        expect(error).toBeInstanceOf(VaultBatchNotDispatchedError);
        expect(error).toMatchObject({ batcher: BATCHER_ADDRESS, batchId: 7n, state });
        expect(relayer.decryptPublicValuesWithSignatures).not.toHaveBeenCalled();
        expect(signer.writeContract).not.toHaveBeenCalled();
      },
    );
  });

  describe("timeUntilCallbackDeadline", () => {
    test("returns the seconds left before a dispatched batch would be canceled", async ({
      sdk,
      provider,
    }) => {
      vi.mocked(provider.readContract)
        .mockResolvedValueOnce(BatchState.Dispatched) // batchState
        .mockResolvedValueOnce(1_000n) // batchDispatchedAt
        .mockResolvedValueOnce(600n); // batchCallbackDeadline
      vi.mocked(provider.getBlockTimestamp).mockResolvedValueOnce(1_200n);

      const batcher = new VaultBatcher(sdk, BATCHER_ADDRESS);
      // canceled from 1_000 + 600 = 1_600; now is 1_200 → 400 remaining
      await expect(batcher.timeUntilCallbackDeadline(58n)).resolves.toBe(400n);
    });

    test("returns 0 from the deadline on, when finalize cancels", async ({ sdk, provider }) => {
      vi.mocked(provider.readContract)
        .mockResolvedValueOnce(BatchState.Dispatched)
        .mockResolvedValueOnce(1_000n)
        .mockResolvedValueOnce(600n);
      vi.mocked(provider.getBlockTimestamp).mockResolvedValueOnce(1_600n);

      const batcher = new VaultBatcher(sdk, BATCHER_ADDRESS);
      await expect(batcher.timeUntilCallbackDeadline(58n)).resolves.toBe(0n);
    });

    test.for([BatchState.Pending, BatchState.Finalized, BatchState.Canceled])(
      "returns null for a batch in state %s, which has nothing to finalize",
      async (state, { sdk, provider }) => {
        vi.mocked(provider.readContract)
          .mockResolvedValueOnce(state)
          .mockResolvedValueOnce(1_000n)
          .mockResolvedValueOnce(600n);
        vi.mocked(provider.getBlockTimestamp).mockResolvedValueOnce(1_200n);

        const batcher = new VaultBatcher(sdk, BATCHER_ADDRESS);
        await expect(batcher.timeUntilCallbackDeadline(58n)).resolves.toBeNull();
      },
    );
  });

  describe("join progress", () => {
    test("reports the join's hash once sent, before the receipt", async ({
      sdk,
      provider,
      userAddress,
    }) => {
      mockJoinBalance(provider, { fromToken: FROM_TOKEN });
      mockJoinReceipt(provider, { batcher: BATCHER_ADDRESS, account: userAddress });
      const onJoinSubmitted = vi.fn();

      const result = await new VaultBatcher(sdk, BATCHER_ADDRESS).join(1_000n, undefined, {
        onJoinSubmitted,
      });

      expect(onJoinSubmitted).toHaveBeenCalledWith(result.txHash);
    });
  });

  describe("chainId", () => {
    test("reads every value and the block time on the given chain", async ({ sdk, provider }) => {
      vi.mocked(provider.readContract).mockResolvedValue(BatchState.Finalized);
      const batcher = new VaultBatcher(sdk, BATCHER_ADDRESS, { chainId: 11155111 });

      await batcher.batchStatus(58n);

      for (const [call] of vi.mocked(provider.readContract).mock.calls) {
        expect(call).toMatchObject({ chainId: 11155111 });
      }
      expect(provider.getBlockTimestamp).toHaveBeenCalledWith(11155111);
    });

    test("refuses a write while the signer is on another chain", async ({ sdk, signer }) => {
      const batcher = new VaultBatcher(sdk, BATCHER_ADDRESS, { chainId: 11155111 });

      await expect(batcher.claim(7n)).rejects.toMatchObject({
        name: "ChainMismatchError",
        targetChainId: 11155111,
        message: expect.stringContaining("targets chain 11155111"),
      });
      expect(signer.writeContract).not.toHaveBeenCalled();
    });

    test("refuses a join on another chain before reading the balance or encrypting", async ({
      sdk,
      provider,
      relayer,
    }) => {
      const batcher = new VaultBatcher(sdk, BATCHER_ADDRESS, { chainId: 11155111 });

      await expect(batcher.join(100n)).rejects.toBeInstanceOf(ChainMismatchError);
      expect(provider.readContract).not.toHaveBeenCalled();
      expect(relayer.encryptValues).not.toHaveBeenCalled();
    });
  });

  test("batchState refuses a state the SDK does not know", async ({ sdk, provider }) => {
    vi.mocked(provider.readContract).mockResolvedValueOnce(7);
    await expect(new VaultBatcher(sdk, BATCHER_ADDRESS).batchState(58n)).rejects.toBeInstanceOf(
      ConfigurationError,
    );
  });

  describe("batchStatus", () => {
    function mockBatch(
      provider: GenericProvider,
      state: BatchState,
      reads: { createdAt: bigint; dispatchedAt: bigint; now: bigint },
    ) {
      vi.mocked(provider.readContract)
        .mockResolvedValueOnce(state) // batchState
        .mockResolvedValueOnce(reads.createdAt) // batchCreatedAt
        .mockResolvedValueOnce(reads.dispatchedAt) // batchDispatchedAt
        .mockResolvedValueOnce(600n) // batchMinBatchAge
        .mockResolvedValueOnce(600n); // batchCallbackDeadline
      vi.mocked(provider.getBlockTimestamp).mockResolvedValueOnce(reads.now);
    }

    test("gives a pending batch when it becomes dispatchable", async ({ sdk, provider }) => {
      mockBatch(provider, BatchState.Pending, { createdAt: 1_000n, dispatchedAt: 0n, now: 1_200n });

      const batcher = new VaultBatcher(sdk, BATCHER_ADDRESS);
      await expect(batcher.batchStatus(58n)).resolves.toEqual({
        state: BatchState.Pending,
        createdAt: 1_000n,
        dispatchableAt: 1_600n,
        secondsUntilDispatchable: 400n,
      });
    });

    test("gives a dispatched batch its callback deadline, 0 seconds once passed", async ({
      sdk,
      provider,
    }) => {
      mockBatch(provider, BatchState.Dispatched, {
        createdAt: 900n,
        dispatchedAt: 1_000n,
        now: 1_700n,
      });

      const batcher = new VaultBatcher(sdk, BATCHER_ADDRESS);
      await expect(batcher.batchStatus(58n)).resolves.toEqual({
        state: BatchState.Dispatched,
        createdAt: 900n,
        dispatchableAt: 1_500n,
        dispatchedAt: 1_000n,
        callbackDeadlineAt: 1_600n,
        secondsUntilCallbackDeadline: 0n,
      });
    });

    test.for([BatchState.Finalized, BatchState.Canceled])(
      "gives a batch in state %s its timestamps",
      async (state, { sdk, provider }) => {
        mockBatch(provider, state, { createdAt: 900n, dispatchedAt: 1_000n, now: 2_000n });

        const batcher = new VaultBatcher(sdk, BATCHER_ADDRESS);
        await expect(batcher.batchStatus(58n)).resolves.toEqual({
          state,
          createdAt: 900n,
          dispatchableAt: 1_500n,
          dispatchedAt: 1_000n,
        });
      },
    );
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
      expect(relayer.decryptValues).toHaveBeenCalledWith(
        expect.objectContaining({ options: { operation: "vault-deposit-of" } }),
      );
    });
  });
});
