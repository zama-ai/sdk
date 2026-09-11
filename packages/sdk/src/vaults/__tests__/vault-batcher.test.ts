import type { EncryptValuesReturnType } from "@fhevm/sdk/actions/encrypt";
import type { Address } from "viem";
import { SignerNotConfiguredError } from "../../errors";
import { describe, expect, test, vi } from "../../test-fixtures";
import { VaultBatcher } from "../vault-batcher";

const BATCHER_ADDRESS = "0x7777777777777777777777777777777777777777" as Address;
const OTHER_ADDRESS = "0x8b8b8b8b8B8B8b8B8B8b8b8b8b8B8B8B8B8b8B8b" as Address;
const ZERO_ENCRYPTED = `0x${"00".repeat(32)}` as const;

describe("VaultBatcher", () => {
  test("checksums the batcher address", ({ sdk }) => {
    const batcher = new VaultBatcher(sdk, BATCHER_ADDRESS);
    expect(batcher.address).toBe(BATCHER_ADDRESS);
  });

  describe("join", () => {
    test("encrypts the amount and submits join with the connected account as beneficiary", async ({
      sdk,
      signer,
      relayer,
      userAddress,
      handle,
      inputProof,
    }) => {
      const batcher = new VaultBatcher(sdk, BATCHER_ADDRESS);
      await batcher.join(1_000n);

      expect(relayer.encryptValues).toHaveBeenCalledWith({
        values: [{ value: 1_000n, type: "euint64" }],
        contractAddress: BATCHER_ADDRESS,
        userAddress,
      });
      expect(signer.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: "join", args: [userAddress, handle, inputProof] }),
      );
    });

    test("uses an explicit beneficiary when provided", async ({
      sdk,
      signer,
      handle,
      inputProof,
    }) => {
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

    test("throws when encryption returns no values", async ({ sdk, relayer, inputProof }) => {
      vi.mocked(relayer.encryptValues).mockResolvedValueOnce({
        encryptedValues: [],
        inputProof,
      } as unknown as EncryptValuesReturnType);
      const batcher = new VaultBatcher(sdk, BATCHER_ADDRESS);
      await expect(batcher.join(1_000n)).rejects.toThrow("Encryption returned no encrypted values");
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

  describe("claim / recover", () => {
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

    test("recovers on behalf of the connected wallet by default", async ({
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
        .mockResolvedValueOnce(1_000n) // batchCreatedAt
        .mockResolvedValueOnce(3_480n); // minBatchAge
      vi.mocked(provider.getBlockTimestamp).mockResolvedValueOnce(2_000n); // now

      const batcher = new VaultBatcher(sdk, BATCHER_ADDRESS);
      // eligible at 1_000 + 3_480 = 4_480; now is 2_000 → 2_480 remaining
      await expect(batcher.timeUntilDispatchable(58n)).resolves.toBe(2_480n);
    });

    test("returns 0 once the batch is already old enough", async ({ sdk, provider }) => {
      vi.mocked(provider.readContract)
        .mockResolvedValueOnce(1_000n) // batchCreatedAt
        .mockResolvedValueOnce(3_480n); // minBatchAge
      vi.mocked(provider.getBlockTimestamp).mockResolvedValueOnce(10_000n); // well past eligible

      const batcher = new VaultBatcher(sdk, BATCHER_ADDRESS);
      await expect(batcher.timeUntilDispatchable(58n)).resolves.toBe(0n);
    });
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
