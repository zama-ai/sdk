import { describe, expect, test, vi } from "../../test-fixtures";
import { isDelegationPropagatedQueryOptions } from "../is-delegation-propagated";

const DELEGATOR = "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC" as const;
const DELEGATE = "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" as const;
const HANDLE = `0x${"aa".repeat(32)}` as const;

describe("isDelegationPropagatedQueryOptions", () => {
  test("is disabled when encryptedInputs is empty", ({ sdk }) => {
    const options = isDelegationPropagatedQueryOptions(sdk, {
      encryptedInputs: [],
      delegatorAddress: DELEGATOR,
      delegateAddress: DELEGATE,
    });
    expect(options.enabled).toBe(false);
  });

  test("is disabled when delegatorAddress is missing", ({ sdk, tokenAddress }) => {
    const options = isDelegationPropagatedQueryOptions(sdk, {
      encryptedInputs: [{ encryptedValue: HANDLE, contractAddress: tokenAddress }],
      delegateAddress: DELEGATE,
    });
    expect(options.enabled).toBe(false);
  });

  test("is disabled when delegateAddress is missing", ({ sdk, tokenAddress }) => {
    const options = isDelegationPropagatedQueryOptions(sdk, {
      encryptedInputs: [{ encryptedValue: HANDLE, contractAddress: tokenAddress }],
      delegatorAddress: DELEGATOR,
    });
    expect(options.enabled).toBe(false);
  });

  test("is enabled and delegates to sdk.delegations.isPropagated", async ({
    sdk,
    tokenAddress,
    mockQueryContext,
  }) => {
    const spy = vi.spyOn(sdk.delegations, "isPropagated").mockResolvedValue(true);
    const options = isDelegationPropagatedQueryOptions(sdk, {
      encryptedInputs: [{ encryptedValue: HANDLE, contractAddress: tokenAddress }],
      delegatorAddress: DELEGATOR,
      delegateAddress: DELEGATE,
    });

    expect(options.enabled).toBe(true);

    const result = await options.queryFn!(mockQueryContext(options.queryKey));
    expect(result).toBe(true);
    expect(spy).toHaveBeenCalledWith(
      [{ encryptedValue: HANDLE, contractAddress: tokenAddress }],
      DELEGATOR,
    );
  });

  test("queryFn throws when delegatorAddress is missing from the key", async ({
    sdk,
    tokenAddress,
    mockQueryContext,
  }) => {
    const options = isDelegationPropagatedQueryOptions(sdk, {
      encryptedInputs: [{ encryptedValue: HANDLE, contractAddress: tokenAddress }],
      delegateAddress: DELEGATE,
    });
    await expect(options.queryFn!(mockQueryContext(options.queryKey))).rejects.toThrow(
      "isDelegationPropagatedQueryOptions: delegatorAddress must not be null or undefined",
    );
  });
});
