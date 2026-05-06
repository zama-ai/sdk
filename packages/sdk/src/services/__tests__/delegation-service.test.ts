import { getAddress, type Address } from "viem";
import { MAX_UINT64 } from "../../contracts";
import { describe, expect, test, vi } from "../../test-fixtures";

const CONTRACT = getAddress("0x3333333333333333333333333333333333333333") as Address;

describe("DelegationService", () => {
  test("reads delegation expiry from the ACL contract", async ({
    delegationService,
    provider,
    aclAddress,
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
        address: aclAddress,
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

  test("transaction failures are mapped to SDK errors", async ({
    delegationService,
    provider,
    signer,
    userAddress,
    delegateAddress,
  }) => {
    vi.mocked(provider.readContract).mockResolvedValue(MAX_UINT64);
    vi.mocked(signer.writeContract).mockRejectedValue(
      new Error("AlreadyDelegatedOrRevokedInSameBlock"),
    );

    await expect(
      delegationService.revokeDelegation(signer, {
        contractAddress: CONTRACT,
        delegatorAddress: userAddress,
        delegateAddress,
      }),
    ).rejects.toMatchObject({ code: "DELEGATION_COOLDOWN" });
  });
});
