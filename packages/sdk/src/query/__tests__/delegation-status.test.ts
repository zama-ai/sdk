import { describe, expect, test, vi } from "../../test-fixtures";
import { delegationStatusQueryOptions } from "../delegation-status";
import { MAX_UINT64 } from "../../contracts/constants";

const DELEGATOR = "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC" as const;
const DELEGATE = "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" as const;

describe("delegationStatusQueryOptions", () => {
  test("is disabled when required params are missing", async ({ sdk, tokenAddress }) => {
    const missingContract = delegationStatusQueryOptions(sdk, {
      contractAddress: undefined,
      delegatorAddress: DELEGATOR,
      delegateAddress: DELEGATE,
    });
    const missingDelegator = delegationStatusQueryOptions(sdk, {
      contractAddress: tokenAddress,
      delegateAddress: DELEGATE,
    });
    const missingDelegate = delegationStatusQueryOptions(sdk, {
      contractAddress: tokenAddress,
      delegatorAddress: DELEGATOR,
    });

    expect(missingContract.enabled).toBe(false);
    expect(missingDelegator.enabled).toBe(false);
    expect(missingDelegate.enabled).toBe(false);
  });

  test("returns isActive: false when expiryTimestamp is 0n", async ({
    sdk,
    tokenAddress,
    provider,
    mockQueryContext,
  }) => {
    vi.mocked(provider.readContract).mockResolvedValue(0n);

    const options = delegationStatusQueryOptions(sdk, {
      contractAddress: tokenAddress,
      delegatorAddress: DELEGATOR,
      delegateAddress: DELEGATE,
    });

    const context = mockQueryContext(options.queryKey);
    const result = await options.queryFn!(context);

    expect(result).toEqual({ isActive: false, expiryTimestamp: 0n });
    expect(provider.getBlockTimestamp).not.toHaveBeenCalled();
  });

  test("returns isActive: true when expiryTimestamp is MAX_UINT64 (skips getBlockTimestamp)", async ({
    sdk,
    tokenAddress,
    provider,
    mockQueryContext,
  }) => {
    vi.mocked(provider.readContract).mockResolvedValue(MAX_UINT64);

    const options = delegationStatusQueryOptions(sdk, {
      contractAddress: tokenAddress,
      delegatorAddress: DELEGATOR,
      delegateAddress: DELEGATE,
    });

    const context = mockQueryContext(options.queryKey);
    const result = await options.queryFn!(context);

    expect(result).toEqual({ isActive: true, expiryTimestamp: MAX_UINT64 });
    expect(provider.getBlockTimestamp).not.toHaveBeenCalled();
  });

  test("returns isActive: true when expiryTimestamp is in the future", async ({
    sdk,
    tokenAddress,
    provider,
    mockQueryContext,
  }) => {
    const futureTimestamp = BigInt(Math.floor(Date.now() / 1000) + 3600);
    vi.mocked(provider.readContract).mockResolvedValue(futureTimestamp);
    vi.mocked(provider.getBlockTimestamp).mockResolvedValue(BigInt(Math.floor(Date.now() / 1000)));

    const options = delegationStatusQueryOptions(sdk, {
      contractAddress: tokenAddress,
      delegatorAddress: DELEGATOR,
      delegateAddress: DELEGATE,
    });

    const context = mockQueryContext(options.queryKey);
    const result = await options.queryFn!(context);

    expect(result).toEqual({ isActive: true, expiryTimestamp: futureTimestamp });
    expect(provider.getBlockTimestamp).toHaveBeenCalled();
  });

  test("returns isActive: false when expiryTimestamp is in the past", async ({
    sdk,
    tokenAddress,
    provider,
    mockQueryContext,
  }) => {
    const pastTimestamp = 1000n;
    vi.mocked(provider.readContract).mockResolvedValue(pastTimestamp);
    vi.mocked(provider.getBlockTimestamp).mockResolvedValue(2000n);

    const options = delegationStatusQueryOptions(sdk, {
      contractAddress: tokenAddress,
      delegatorAddress: DELEGATOR,
      delegateAddress: DELEGATE,
    });

    const context = mockQueryContext(options.queryKey);
    const result = await options.queryFn!(context);

    expect(result).toEqual({ isActive: false, expiryTimestamp: pastTimestamp });
    expect(provider.getBlockTimestamp).toHaveBeenCalled();
  });

  test("queryFn throws when required params are missing from context.queryKey", async ({
    sdk,
    mockQueryContext,
  }) => {
    const options = delegationStatusQueryOptions(sdk, { contractAddress: undefined });

    await expect(options.queryFn!(mockQueryContext(options.queryKey))).rejects.toThrow(
      "delegationStatusQueryOptions: contractAddress must not be null or undefined",
    );
  });
});
