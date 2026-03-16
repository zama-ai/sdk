import { describe, expect, test, vi, mockQueryContext } from "../../test-fixtures";
import { delegationStatusQueryOptions } from "../delegation-status";
import { MAX_UINT64 } from "../../contracts/constants";

const DELEGATOR = "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC" as const;
const DELEGATE = "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" as const;

describe("delegationStatusQueryOptions", () => {
  test("returns isDelegated: false when expiryTimestamp is 0n", async ({
    createMockReadonlyToken,
  }) => {
    const readonlyToken = createMockReadonlyToken();
    vi.mocked(readonlyToken.getDelegationExpiry).mockResolvedValue(0n);

    const options = delegationStatusQueryOptions(readonlyToken, {
      delegatorAddress: DELEGATOR,
      delegateAddress: DELEGATE,
    });

    const context = mockQueryContext(options.queryKey);
    const result = await options.queryFn!(context);

    expect(result).toEqual({ isDelegated: false, expiryTimestamp: 0n });
    expect(readonlyToken.signer.getBlockTimestamp).not.toHaveBeenCalled();
  });

  test("returns isDelegated: true when expiryTimestamp is MAX_UINT64 (skips getBlockTimestamp)", async ({
    createMockReadonlyToken,
  }) => {
    const readonlyToken = createMockReadonlyToken();
    vi.mocked(readonlyToken.getDelegationExpiry).mockResolvedValue(MAX_UINT64);

    const options = delegationStatusQueryOptions(readonlyToken, {
      delegatorAddress: DELEGATOR,
      delegateAddress: DELEGATE,
    });

    const context = mockQueryContext(options.queryKey);
    const result = await options.queryFn!(context);

    expect(result).toEqual({ isDelegated: true, expiryTimestamp: MAX_UINT64 });
    expect(readonlyToken.signer.getBlockTimestamp).not.toHaveBeenCalled();
  });

  test("returns isDelegated: true when expiryTimestamp is in the future", async ({
    createMockReadonlyToken,
  }) => {
    const readonlyToken = createMockReadonlyToken();
    const futureTimestamp = BigInt(Math.floor(Date.now() / 1000) + 3600);
    vi.mocked(readonlyToken.getDelegationExpiry).mockResolvedValue(futureTimestamp);
    vi.mocked(readonlyToken.signer.getBlockTimestamp).mockResolvedValue(
      BigInt(Math.floor(Date.now() / 1000)),
    );

    const options = delegationStatusQueryOptions(readonlyToken, {
      delegatorAddress: DELEGATOR,
      delegateAddress: DELEGATE,
    });

    const context = mockQueryContext(options.queryKey);
    const result = await options.queryFn!(context);

    expect(result).toEqual({ isDelegated: true, expiryTimestamp: futureTimestamp });
    expect(readonlyToken.signer.getBlockTimestamp).toHaveBeenCalled();
  });

  test("returns isDelegated: false when expiryTimestamp is in the past", async ({
    createMockReadonlyToken,
  }) => {
    const readonlyToken = createMockReadonlyToken();
    const pastTimestamp = 1000n;
    vi.mocked(readonlyToken.getDelegationExpiry).mockResolvedValue(pastTimestamp);
    vi.mocked(readonlyToken.signer.getBlockTimestamp).mockResolvedValue(2000n);

    const options = delegationStatusQueryOptions(readonlyToken, {
      delegatorAddress: DELEGATOR,
      delegateAddress: DELEGATE,
    });

    const context = mockQueryContext(options.queryKey);
    const result = await options.queryFn!(context);

    expect(result).toEqual({ isDelegated: false, expiryTimestamp: pastTimestamp });
    expect(readonlyToken.signer.getBlockTimestamp).toHaveBeenCalled();
  });
});
