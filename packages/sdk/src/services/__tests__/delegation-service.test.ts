import { getAddress, type Address } from "viem";
import { anvil } from "../../chains";
import { MAX_UINT64 } from "../../contracts";
import { DelegationCooldownError, TransactionRevertedError } from "../../errors";
import { describe, expect, test, vi } from "../../test-fixtures";

const CONTRACT = getAddress("0x3333333333333333333333333333333333333333") as Address;

describe("DelegationService", () => {
  test("reads delegation expiry from the ACL contract", async ({
    delegationService,
    provider,
    delegatorAddress,
    delegateAddress,
  }) => {
    vi.mocked(provider.readContract).mockResolvedValue(1234n);

    await expect(
      delegationService.getDelegationExpiry({
        contractAddress: CONTRACT,
        delegatorAddress,
        delegateAddress,
      }),
    ).resolves.toBe(1234n);
    expect(provider.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: anvil.aclContractAddress,
        functionName: "getUserDecryptionDelegationExpirationDate",
        args: [delegatorAddress, delegateAddress, CONTRACT],
      }),
    );
  });

  test("reports active delegation for permanent and future expiries", async ({
    delegationService,
    provider,
    delegatorAddress,
    delegateAddress,
  }) => {
    vi.mocked(provider.readContract).mockResolvedValueOnce(MAX_UINT64).mockResolvedValueOnce(20n);
    vi.mocked(provider.getBlockTimestamp).mockResolvedValue(10n);

    await expect(
      delegationService.isDelegated({
        contractAddress: CONTRACT,
        delegatorAddress,
        delegateAddress,
      }),
    ).resolves.toBe(true);
    await expect(
      delegationService.isDelegated({
        contractAddress: CONTRACT,
        delegatorAddress,
        delegateAddress,
      }),
    ).resolves.toBe(true);
  });

  test("reports inactive delegation for missing and expired expiries", async ({
    delegationService,
    provider,
    delegatorAddress,
    delegateAddress,
  }) => {
    vi.mocked(provider.readContract).mockResolvedValueOnce(0n).mockResolvedValueOnce(10n);
    vi.mocked(provider.getBlockTimestamp).mockResolvedValue(20n);

    await expect(
      delegationService.isDelegated({
        contractAddress: CONTRACT,
        delegatorAddress,
        delegateAddress,
      }),
    ).resolves.toBe(false);
    await expect(
      delegationService.isDelegated({
        contractAddress: CONTRACT,
        delegatorAddress,
        delegateAddress,
      }),
    ).resolves.toBe(false);
  });

  test("getStatus resolves activity and expiry from a single expiry read", async ({
    delegationService,
    provider,
    delegatorAddress,
    delegateAddress,
  }) => {
    vi.mocked(provider.readContract).mockResolvedValueOnce(0n);

    await expect(
      delegationService.getStatus({ contractAddress: CONTRACT, delegatorAddress, delegateAddress }),
    ).resolves.toEqual({ isActive: false, expiryTimestamp: 0n });
    expect(provider.getBlockTimestamp).not.toHaveBeenCalled();
  });

  test("getStatus skips getBlockTimestamp for a permanent delegation", async ({
    delegationService,
    provider,
    delegatorAddress,
    delegateAddress,
  }) => {
    vi.mocked(provider.readContract).mockResolvedValueOnce(MAX_UINT64);

    await expect(
      delegationService.getStatus({ contractAddress: CONTRACT, delegatorAddress, delegateAddress }),
    ).resolves.toEqual({ isActive: true, expiryTimestamp: MAX_UINT64 });
    expect(provider.getBlockTimestamp).not.toHaveBeenCalled();
  });

  test("isDelegated stays consistent with getStatus for a future expiry", async ({
    delegationService,
    provider,
    delegatorAddress,
    delegateAddress,
  }) => {
    vi.mocked(provider.readContract).mockResolvedValue(20n);
    vi.mocked(provider.getBlockTimestamp).mockResolvedValue(10n);

    await expect(
      delegationService.getStatus({ contractAddress: CONTRACT, delegatorAddress, delegateAddress }),
    ).resolves.toEqual({ isActive: true, expiryTimestamp: 20n });
  });

  test("finds missing and expired delegations by contract", async ({
    delegationService,
    provider,
    delegatorAddress,
    delegateAddress,
  }) => {
    const activeContract = getAddress("0x1111111111111111111111111111111111111111") as Address;
    const missingContract = getAddress("0x2222222222222222222222222222222222222222") as Address;
    const expiredContract = getAddress("0x4444444444444444444444444444444444444444") as Address;
    vi.mocked(provider.readContract)
      .mockResolvedValueOnce(MAX_UINT64)
      .mockResolvedValueOnce(0n)
      .mockResolvedValueOnce(10n);
    vi.mocked(provider.getBlockTimestamp).mockResolvedValue(20n);

    const inactive = await delegationService.findInactiveDelegations(
      [activeContract, missingContract, expiredContract],
      delegatorAddress,
      delegateAddress,
    );

    expect(inactive.get(missingContract)).toMatchObject({ code: "DELEGATION_NOT_FOUND" });
    expect(inactive.get(expiredContract)).toMatchObject({ code: "DELEGATION_EXPIRED" });
    expect(inactive.has(activeContract)).toBe(false);
  });

  test("delegateDecryption validates input before writing to ACL", async ({
    delegationService,
    signer,
    userAddress,
  }) => {
    await expect(
      delegationService.delegateDecryption(signer, {
        contractAddress: CONTRACT,
        delegatorAddress: userAddress,
        delegateAddress: userAddress,
      }),
    ).rejects.toMatchObject({ code: "DELEGATION_SELF_NOT_ALLOWED" });
    expect(signer.writeContract).not.toHaveBeenCalled();
  });

  test("delegateDecryption submits ACL transaction when the requested expiry changes", async ({
    delegationService,
    provider,
    signer,
    userAddress,
    delegateAddress,
  }) => {
    const expirationDate = new Date("2030-01-01T00:00:00Z");
    vi.mocked(provider.readContract).mockResolvedValue(0n);

    const result = await delegationService.delegateDecryption(signer, {
      contractAddress: CONTRACT,
      delegatorAddress: userAddress,
      delegateAddress,
      expirationDate,
    });

    expect(result).toEqual({ txHash: "0xtxhash", receipt: { logs: [] } });
    expect(signer.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "delegateForUserDecryption",
        args: [delegateAddress, CONTRACT, BigInt(Math.floor(expirationDate.getTime() / 1000))],
      }),
    );
  });

  test("delegateDecryption emits submitted event after broadcast before receipt wait", async ({
    createDelegationService,
    provider,
    signer,
    userAddress,
    delegateAddress,
    events,
  }) => {
    const emitEvent = vi.fn();
    const service = createDelegationService({ emitEvent });
    vi.mocked(provider.readContract).mockResolvedValue(0n);
    vi.mocked(provider.waitForTransactionReceipt).mockRejectedValue(new Error("receipt timeout"));

    await expect(
      service.delegateDecryption(signer, {
        contractAddress: CONTRACT,
        delegatorAddress: userAddress,
        delegateAddress,
      }),
    ).rejects.toMatchObject({ code: "TRANSACTION_REVERTED" });

    expect(emitEvent).toHaveBeenCalledWith(
      { type: events.DelegationSubmitted, txHash: "0xtxhash" },
      CONTRACT,
    );
  });

  test("revokeDelegation rejects missing delegations before writing", async ({
    delegationService,
    provider,
    signer,
    userAddress,
    delegateAddress,
  }) => {
    vi.mocked(provider.readContract).mockResolvedValue(0n);

    await expect(
      delegationService.revokeDelegation(signer, {
        contractAddress: CONTRACT,
        delegatorAddress: userAddress,
        delegateAddress,
      }),
    ).rejects.toMatchObject({ code: "DELEGATION_NOT_FOUND" });
    expect(signer.writeContract).not.toHaveBeenCalled();
  });

  test("revokeDelegation emits submitted event after broadcast before receipt wait", async ({
    createDelegationService,
    provider,
    signer,
    userAddress,
    delegateAddress,
    events,
  }) => {
    const emitEvent = vi.fn();
    const service = createDelegationService({ emitEvent });
    vi.mocked(provider.readContract).mockResolvedValue(MAX_UINT64);
    vi.mocked(provider.waitForTransactionReceipt).mockRejectedValue(new Error("receipt timeout"));

    await expect(
      service.revokeDelegation(signer, {
        contractAddress: CONTRACT,
        delegatorAddress: userAddress,
        delegateAddress,
      }),
    ).rejects.toMatchObject({ code: "TRANSACTION_REVERTED" });

    expect(emitEvent).toHaveBeenCalledWith(
      { type: events.RevokeDelegationSubmitted, txHash: "0xtxhash" },
      CONTRACT,
    );
  });

  test("transaction failures are mapped to SDK errors", async ({
    delegationService,
    provider,
    signer,
    userAddress,
    delegateAddress,
  }) => {
    vi.mocked(provider.readContract).mockResolvedValue(MAX_UINT64);
    const rootCause = new Error("AlreadyDelegatedOrRevokedInSameBlock");
    vi.mocked(signer.writeContract!).mockRejectedValue(rootCause);

    const thrown = await delegationService
      .revokeDelegation(signer, {
        contractAddress: CONTRACT,
        delegatorAddress: userAddress,
        delegateAddress,
      })
      .catch((error: Error) => error);

    expect(thrown).toBeInstanceOf(DelegationCooldownError);
    expect(thrown).toMatchObject({ code: "DELEGATION_COOLDOWN" });
    expect((thrown as Error).cause).toBeInstanceOf(TransactionRevertedError);
    expect(((thrown as Error).cause as Error).cause).toBe(rootCause);
  });
});
