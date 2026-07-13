import { createMockRouter, describe, expect, test, vi } from "../../test-fixtures";
import { createMockChain } from "../../test-fixtures/chain";
import { createMockRelayer } from "../../test-fixtures/relayer";
import { delegationStatusQueryOptions } from "../delegation-status";
import { MAX_UINT64 } from "../../contracts/constants";

const DELEGATOR = "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC" as const;
const DELEGATE = "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" as const;
const ACL_CHAIN_1 = "0x1111111111111111111111111111111111111111" as const;
const ACL_CHAIN_2 = "0x2222222222222222222222222222222222222222" as const;

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

  test("reads the ACL address from the currently active chain after switchChain", async ({
    createSDK,
    provider,
    tokenAddress,
    mockQueryContext,
  }) => {
    // `sdk.relayer` follows the router, so a switch to a chain whose ACL differs
    // must query that chain's ACL — not the one active at construction (SDK-458:
    // the frozen `sdk.relayer` field read chains[0] on every chain). Each per-chain
    // backend binds its own chain (as production `createRelayer(chain)` does), so
    // the ACL is read off `relayer.chain`.
    const chain1 = createMockChain({ id: 1, aclContractAddress: ACL_CHAIN_1 });
    const chain2 = createMockChain({ id: 2, aclContractAddress: ACL_CHAIN_2 });
    const router = createMockRouter({
      chains: [chain1, chain2],
      relayers: {
        1: createMockRelayer({ chain: chain1 }),
        2: createMockRelayer({ chain: chain2 }),
      },
      activeChainId: 1,
    });
    const sdk = createSDK({ router });
    router.switchChain(2);

    vi.mocked(provider.readContract).mockResolvedValue(0n);
    const options = delegationStatusQueryOptions(sdk, {
      contractAddress: tokenAddress,
      delegatorAddress: DELEGATOR,
      delegateAddress: DELEGATE,
    });
    await options.queryFn!(mockQueryContext(options.queryKey));

    const call = vi.mocked(provider.readContract).mock.calls[0]?.[0] as { address: string };
    expect(call.address).toBe(ACL_CHAIN_2);
  });
});
