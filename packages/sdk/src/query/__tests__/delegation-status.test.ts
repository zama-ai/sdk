import { describe, expect, test, vi, mockQueryContext } from "../../test-fixtures";
import { delegationStatusQueryOptions } from "../delegation-status";
import { MAX_UINT64 } from "../../contracts/constants";

const DELEGATOR = "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC" as const;
const DELEGATE = "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" as const;

describe("delegationStatusQueryOptions", () => {
  test("is disabled when required params are missing", async ({ sdk, tokenAddress }) => {
    const missingToken = delegationStatusQueryOptions(sdk, {
      tokenAddress: undefined,
      delegatorAddress: DELEGATOR,
      delegateAddress: DELEGATE,
    });
    const missingDelegator = delegationStatusQueryOptions(sdk, {
      tokenAddress,
      delegateAddress: DELEGATE,
    });
    const missingDelegate = delegationStatusQueryOptions(sdk, {
      tokenAddress,
      delegatorAddress: DELEGATOR,
    });

    expect(missingToken.enabled).toBe(false);
    expect(missingDelegator.enabled).toBe(false);
    expect(missingDelegate.enabled).toBe(false);
  });

  test("returns isDelegated: false when expiryTimestamp is 0n", async ({
    sdk,
    signer,
    relayer,
    tokenAddress,
    aclAddress,
    provider,
  }) => {
    vi.mocked(relayer.getAclAddress).mockResolvedValue(aclAddress);
    vi.mocked(provider.readContract).mockResolvedValue(0n);

    const options = delegationStatusQueryOptions(sdk, {
      tokenAddress,
      delegatorAddress: DELEGATOR,
      delegateAddress: DELEGATE,
    });

    const context = mockQueryContext(options.queryKey);
    const result = await options.queryFn!(context);

    expect(result).toEqual({ isDelegated: false, expiryTimestamp: 0n });
    expect(provider.getBlockTimestamp).not.toHaveBeenCalled();
  });

  test("returns isDelegated: true when expiryTimestamp is MAX_UINT64 (skips getBlockTimestamp)", async ({
    sdk,
    signer,
    relayer,
    tokenAddress,
    aclAddress,
    provider,
  }) => {
    vi.mocked(relayer.getAclAddress).mockResolvedValue(aclAddress);
    vi.mocked(provider.readContract).mockResolvedValue(MAX_UINT64);

    const options = delegationStatusQueryOptions(sdk, {
      tokenAddress,
      delegatorAddress: DELEGATOR,
      delegateAddress: DELEGATE,
    });

    const context = mockQueryContext(options.queryKey);
    const result = await options.queryFn!(context);

    expect(result).toEqual({ isDelegated: true, expiryTimestamp: MAX_UINT64 });
    expect(provider.getBlockTimestamp).not.toHaveBeenCalled();
  });

  test("returns isDelegated: true when expiryTimestamp is in the future", async ({
    sdk,
    signer,
    relayer,
    tokenAddress,
    aclAddress,
    provider,
  }) => {
    const futureTimestamp = BigInt(Math.floor(Date.now() / 1000) + 3600);
    vi.mocked(relayer.getAclAddress).mockResolvedValue(aclAddress);
    vi.mocked(provider.readContract).mockResolvedValue(futureTimestamp);
    vi.mocked(provider.getBlockTimestamp).mockResolvedValue(BigInt(Math.floor(Date.now() / 1000)));

    const options = delegationStatusQueryOptions(sdk, {
      tokenAddress,
      delegatorAddress: DELEGATOR,
      delegateAddress: DELEGATE,
    });

    const context = mockQueryContext(options.queryKey);
    const result = await options.queryFn!(context);

    expect(result).toEqual({ isDelegated: true, expiryTimestamp: futureTimestamp });
    expect(provider.getBlockTimestamp).toHaveBeenCalled();
  });

  test("returns isDelegated: false when expiryTimestamp is in the past", async ({
    sdk,
    signer,
    relayer,
    tokenAddress,
    aclAddress,
    provider,
  }) => {
    const pastTimestamp = 1000n;
    vi.mocked(relayer.getAclAddress).mockResolvedValue(aclAddress);
    vi.mocked(provider.readContract).mockResolvedValue(pastTimestamp);
    vi.mocked(provider.getBlockTimestamp).mockResolvedValue(2000n);

    const options = delegationStatusQueryOptions(sdk, {
      tokenAddress,
      delegatorAddress: DELEGATOR,
      delegateAddress: DELEGATE,
    });

    const context = mockQueryContext(options.queryKey);
    const result = await options.queryFn!(context);

    expect(result).toEqual({ isDelegated: false, expiryTimestamp: pastTimestamp });
    expect(provider.getBlockTimestamp).toHaveBeenCalled();
  });

  test("queryFn throws when required params are missing from context.queryKey", async ({ sdk }) => {
    const options = delegationStatusQueryOptions(sdk, { tokenAddress: undefined });

    await expect(options.queryFn!(mockQueryContext(options.queryKey))).rejects.toThrow(
      "delegationStatusQueryOptions: tokenAddress must not be null or undefined",
    );
  });
});
