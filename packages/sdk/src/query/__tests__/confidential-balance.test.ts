import type { Address } from "viem";
import { describe, expect, test, vi, mockQueryContext } from "../../test-fixtures";
import { ReadonlyToken } from "../../token/readonly-token";
import { ZamaSDK } from "../../zama-sdk";
import { confidentialBalanceQueryOptions } from "../confidential-balance";

describe("confidentialBalanceQueryOptions", () => {
  const tokenAddress = "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a" as Address;
  const owner = "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B" as Address;

  test("query key includes tokenAddress and owner (no handle)", ({ createMockReadonlyToken }) => {
    const token = createMockReadonlyToken(tokenAddress);
    const options = confidentialBalanceQueryOptions(token, {
      tokenAddress,
      account: owner,
    });

    expect(options.queryKey).toEqual(["zama.confidentialBalance", { tokenAddress, owner }]);
  });

  test("enabled is true when owner is provided", ({ createMockReadonlyToken }) => {
    const token = createMockReadonlyToken(tokenAddress);
    const options = confidentialBalanceQueryOptions(token, { tokenAddress, account: owner });

    expect(options.enabled).toBe(true);
  });

  test("enabled is false when owner is undefined", ({ createMockReadonlyToken }) => {
    const token = createMockReadonlyToken(tokenAddress);
    const options = confidentialBalanceQueryOptions(token, { tokenAddress });

    expect(options.enabled).toBe(false);
  });

  test("enabled is false when query.enabled is false", ({ createMockReadonlyToken }) => {
    const token = createMockReadonlyToken(tokenAddress);
    const options = confidentialBalanceQueryOptions(token, {
      tokenAddress,
      account: owner,
      query: { enabled: false },
    });

    expect(options.enabled).toBe(false);
  });

  test("enabled is false when signer-backed credentials are absent", ({
    relayer,
    provider,
    storage,
  }) => {
    const sdk = new ZamaSDK({ relayer, provider, storage });
    const token = new ReadonlyToken(sdk, tokenAddress);

    const options = confidentialBalanceQueryOptions(token, { tokenAddress, account: owner });

    expect(options.enabled).toBe(false);
  });

  test("queryFn delegates to token.balanceOf using the owner from queryKey", async ({
    createMockReadonlyToken,
  }) => {
    const token = createMockReadonlyToken(tokenAddress);
    vi.mocked(token.balanceOf).mockResolvedValue(42n);

    const options = confidentialBalanceQueryOptions(token, {
      tokenAddress,
      account: owner,
    });

    const value = await options.queryFn(mockQueryContext(options.queryKey));
    expect(value).toBe(42n);
    expect(token.balanceOf).toHaveBeenCalledWith(owner);
  });
});
