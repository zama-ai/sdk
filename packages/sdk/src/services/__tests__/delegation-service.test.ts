import { getAddress, type Address } from "viem";
import { anvil } from "../../chains";
import { MAX_UINT64, WILDCARD_CONTRACT } from "../../contracts";
import { DelegationCooldownError, TransactionRevertedError } from "../../errors";
import { LoggerService } from "../logger-service";
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
    // Each isDelegated call reads the target contract row and the wildcard row.
    vi.mocked(provider.readContract)
      .mockResolvedValueOnce(MAX_UINT64)
      .mockResolvedValueOnce(0n)
      .mockResolvedValueOnce(20n)
      .mockResolvedValueOnce(0n);
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
    // Each isDelegated call reads the target contract row and the wildcard row.
    vi.mocked(provider.readContract)
      .mockResolvedValueOnce(0n)
      .mockResolvedValueOnce(0n)
      .mockResolvedValueOnce(10n)
      .mockResolvedValueOnce(0n);
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

  test("getStatus reads the target and wildcard rows and reports inactive when both are empty", async ({
    delegationService,
    provider,
    delegatorAddress,
    delegateAddress,
  }) => {
    vi.mocked(provider.readContract).mockResolvedValue(0n);

    await expect(
      delegationService.getStatus({ contractAddress: CONTRACT, delegatorAddress, delegateAddress }),
    ).resolves.toEqual({ isActive: false, expiryTimestamp: 0n });
    expect(provider.readContract).toHaveBeenCalledTimes(2);
    expect(provider.getBlockTimestamp).not.toHaveBeenCalled();
  });

  test("getStatus skips getBlockTimestamp for a permanent delegation", async ({
    delegationService,
    provider,
    delegatorAddress,
    delegateAddress,
  }) => {
    vi.mocked(provider.readContract).mockResolvedValue(MAX_UINT64);

    await expect(
      delegationService.getStatus({ contractAddress: CONTRACT, delegatorAddress, delegateAddress }),
    ).resolves.toEqual({ isActive: true, expiryTimestamp: MAX_UINT64 });
    expect(provider.getBlockTimestamp).not.toHaveBeenCalled();
  });

  test("getStatus falls back to an active wildcard grant when the contract row is empty", async ({
    delegationService,
    provider,
    delegatorAddress,
    delegateAddress,
  }) => {
    vi.mocked(provider.readContract).mockImplementation(
      async (config: { args: readonly unknown[] }) =>
        config.args[2] === WILDCARD_CONTRACT ? MAX_UINT64 : 0n,
    );

    await expect(
      delegationService.getStatus({ contractAddress: CONTRACT, delegatorAddress, delegateAddress }),
    ).resolves.toEqual({ isActive: true, expiryTimestamp: MAX_UINT64 });
  });

  test("getStatus does not double-read the wildcard row when queried directly", async ({
    delegationService,
    provider,
    delegatorAddress,
    delegateAddress,
  }) => {
    vi.mocked(provider.readContract).mockResolvedValue(MAX_UINT64);

    await expect(
      delegationService.getStatus({
        contractAddress: WILDCARD_CONTRACT,
        delegatorAddress,
        delegateAddress,
      }),
    ).resolves.toEqual({ isActive: true, expiryTimestamp: MAX_UINT64 });
    expect(provider.readContract).toHaveBeenCalledTimes(1);
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
    // getStatus reads the target contract row and the wildcard row for each contract.
    vi.mocked(provider.readContract)
      .mockResolvedValueOnce(MAX_UINT64) // activeContract row
      .mockResolvedValueOnce(0n) // activeContract wildcard row (unused, already active)
      .mockResolvedValueOnce(0n) // missingContract row
      .mockResolvedValueOnce(0n) // missingContract wildcard row
      .mockResolvedValueOnce(10n) // expiredContract row
      .mockResolvedValueOnce(0n); // expiredContract wildcard row
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

  test("delegateDecryption rejects the wildcard sentinel as delegateAddress", async ({
    delegationService,
    signer,
    userAddress,
  }) => {
    await expect(
      delegationService.delegateDecryption(signer, {
        contractAddress: CONTRACT,
        delegatorAddress: userAddress,
        delegateAddress: WILDCARD_CONTRACT,
      }),
    ).rejects.toMatchObject({ code: "DELEGATION_DELEGATE_CANNOT_BE_WILDCARD" });
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

  test("delegateDecryption accepts the wildcard sentinel as contractAddress", async ({
    delegationService,
    provider,
    signer,
    userAddress,
    delegateAddress,
  }) => {
    vi.mocked(provider.readContract).mockResolvedValue(0n);

    const result = await delegationService.delegateDecryption(signer, {
      contractAddress: WILDCARD_CONTRACT,
      delegatorAddress: userAddress,
      delegateAddress,
    });

    expect(result).toEqual({ txHash: "0xtxhash", receipt: { logs: [] } });
    expect(signer.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "delegateForUserDecryption",
        args: [delegateAddress, getAddress(WILDCARD_CONTRACT), MAX_UINT64],
      }),
    );
  });

  test("delegateDecryption warns but still submits when the delegate already holds an active wildcard grant", async ({
    createDelegationService,
    provider,
    signer,
    userAddress,
    delegateAddress,
  }) => {
    const warn = vi.fn();
    const service = createDelegationService({
      logger: new LoggerService({ info: vi.fn(), debug: vi.fn(), warn, error: vi.fn() }),
    });
    // Target-contract row is empty (no prior delegation); the wildcard row is permanent.
    vi.mocked(provider.readContract).mockImplementation(async (config: unknown) => {
      const args = (config as { args: readonly unknown[] }).args;
      return args[2] === getAddress(WILDCARD_CONTRACT) ? MAX_UINT64 : 0n;
    });

    const result = await service.delegateDecryption(signer, {
      contractAddress: CONTRACT,
      delegatorAddress: userAddress,
      delegateAddress,
    });

    expect(result).toEqual({ txHash: "0xtxhash", receipt: { logs: [] } });
    expect(signer.writeContract).toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("already holds an active wildcard"),
      undefined,
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
    vi.mocked(signer.writeContract).mockRejectedValue(rootCause);

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
