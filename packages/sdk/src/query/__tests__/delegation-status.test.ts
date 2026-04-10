import { describe, expect, test, vi, mockQueryContext } from "../../test-fixtures";
import { delegationStatusQueryOptions } from "../delegation-status";
import { MAX_UINT64 } from "../../contracts/constants";

const DELEGATOR = "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC" as const;
const DELEGATE = "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" as const;

describe("delegationStatusQueryOptions", () => {
  test("is disabled when required params are missing", async ({
    signer,
    relayer,
    tokenAddress,
  }) => {
    const missingToken = delegationStatusQueryOptions(
      { signer, relayer },
      {
        tokenAddress: undefined,
        delegatorAddress: DELEGATOR,
        delegateAddress: DELEGATE,
      },
    );
    const missingDelegator = delegationStatusQueryOptions(
      { signer, relayer },
      {
        tokenAddress,
        delegateAddress: DELEGATE,
      },
    );
    const missingDelegate = delegationStatusQueryOptions(
      { signer, relayer },
      {
        tokenAddress,
        delegatorAddress: DELEGATOR,
      },
    );

    expect(missingToken.enabled).toBe(false);
    expect(missingDelegator.enabled).toBe(false);
    expect(missingDelegate.enabled).toBe(false);
  });

  test("returns isDelegated: false when expiryTimestamp is 0n", async ({
    signer,
    relayer,
    tokenAddress,
    aclAddress,
  }) => {
    vi.mocked(relayer.getAclAddress).mockResolvedValue(aclAddress);
    vi.mocked(signer.readContract).mockResolvedValue(0n);

    const options = delegationStatusQueryOptions(
      { signer, relayer },
      {
        tokenAddress,
        delegatorAddress: DELEGATOR,
        delegateAddress: DELEGATE,
      },
    );

    const context = mockQueryContext(options.queryKey);
    const result = await options.queryFn!(context);

    expect(result).toEqual({ isDelegated: false, expiryTimestamp: 0n });
    expect(signer.getBlockTimestamp).not.toHaveBeenCalled();
  });

  test("returns isDelegated: true when expiryTimestamp is MAX_UINT64 (skips getBlockTimestamp)", async ({
    signer,
    relayer,
    tokenAddress,
    aclAddress,
  }) => {
    vi.mocked(relayer.getAclAddress).mockResolvedValue(aclAddress);
    vi.mocked(signer.readContract).mockResolvedValue(MAX_UINT64);

    const options = delegationStatusQueryOptions(
      { signer, relayer },
      {
        tokenAddress,
        delegatorAddress: DELEGATOR,
        delegateAddress: DELEGATE,
      },
    );

    const context = mockQueryContext(options.queryKey);
    const result = await options.queryFn!(context);

    expect(result).toEqual({ isDelegated: true, expiryTimestamp: MAX_UINT64 });
    expect(signer.getBlockTimestamp).not.toHaveBeenCalled();
  });

  test("returns isDelegated: true when expiryTimestamp is in the future", async ({
    signer,
    relayer,
    tokenAddress,
    aclAddress,
  }) => {
    const futureTimestamp = BigInt(Math.floor(Date.now() / 1000) + 3600);
    vi.mocked(relayer.getAclAddress).mockResolvedValue(aclAddress);
    vi.mocked(signer.readContract).mockResolvedValue(futureTimestamp);
    vi.mocked(signer.getBlockTimestamp).mockResolvedValue(BigInt(Math.floor(Date.now() / 1000)));

    const options = delegationStatusQueryOptions(
      { signer, relayer },
      {
        tokenAddress,
        delegatorAddress: DELEGATOR,
        delegateAddress: DELEGATE,
      },
    );

    const context = mockQueryContext(options.queryKey);
    const result = await options.queryFn!(context);

    expect(result).toEqual({ isDelegated: true, expiryTimestamp: futureTimestamp });
    expect(signer.getBlockTimestamp).toHaveBeenCalled();
  });

  test("returns isDelegated: false when expiryTimestamp is in the past", async ({
    signer,
    relayer,
    tokenAddress,
    aclAddress,
  }) => {
    const pastTimestamp = 1000n;
    vi.mocked(relayer.getAclAddress).mockResolvedValue(aclAddress);
    vi.mocked(signer.readContract).mockResolvedValue(pastTimestamp);
    vi.mocked(signer.getBlockTimestamp).mockResolvedValue(2000n);

    const options = delegationStatusQueryOptions(
      { signer, relayer },
      {
        tokenAddress,
        delegatorAddress: DELEGATOR,
        delegateAddress: DELEGATE,
      },
    );

    const context = mockQueryContext(options.queryKey);
    const result = await options.queryFn!(context);

    expect(result).toEqual({ isDelegated: false, expiryTimestamp: pastTimestamp });
    expect(signer.getBlockTimestamp).toHaveBeenCalled();
  });

  test("queryFn throws when required params are missing from context.queryKey", async ({
    signer,
    relayer,
  }) => {
    const options = delegationStatusQueryOptions({ signer, relayer }, { tokenAddress: undefined });

    await expect(options.queryFn!(mockQueryContext(options.queryKey))).rejects.toThrow(
      "delegationStatusQueryOptions: tokenAddress must not be null or undefined",
    );
  });
});
