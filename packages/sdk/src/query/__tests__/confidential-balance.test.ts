import type { Address } from "viem";
import { describe, expect, test, vi } from "../../test-fixtures";
import { Token } from "../../token/token";
import { confidentialBalanceQueryOptions } from "../confidential-balance";

describe("confidentialBalanceQueryOptions", () => {
  const tokenAddress = "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a" as Address;
  const owner = "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B" as Address;

  test("query key includes tokenAddress and owner (no handle)", ({ createMockToken, signer }) => {
    const token = createMockToken(tokenAddress);
    const walletAccount = signer.walletAccount.getSnapshot();
    const options = confidentialBalanceQueryOptions(
      token,
      { tokenAddress, account: owner },
      { walletAccount },
    );

    expect(options.queryKey).toEqual([
      "zama.confidentialBalance",
      {
        tokenAddress,
        walletAddress: walletAccount!.address,
        walletChainId: walletAccount!.chainId,
        owner,
      },
    ]);
  });

  test("enabled is true when owner is provided", ({ createMockToken, signer }) => {
    const token = createMockToken(tokenAddress);
    const options = confidentialBalanceQueryOptions(
      token,
      { tokenAddress, account: owner },
      { walletAccount: signer.walletAccount.getSnapshot() },
    );

    expect(options.enabled).toBe(true);
  });

  test("enabled is false when owner is undefined", ({ createMockToken }) => {
    const token = createMockToken(tokenAddress);
    const options = confidentialBalanceQueryOptions(token, { tokenAddress });

    expect(options.enabled).toBe(false);
  });

  test("enabled is false when query.enabled is false", ({ createMockToken, signer }) => {
    const token = createMockToken(tokenAddress);
    const options = confidentialBalanceQueryOptions(
      token,
      { tokenAddress, account: owner, query: { enabled: false } },
      { walletAccount: signer.walletAccount.getSnapshot() },
    );

    expect(options.enabled).toBe(false);
  });

  test("enabled is false when signer-backed credentials are absent", ({ createSDK }) => {
    const sdk = createSDK({ signer: undefined });
    const token = new Token(sdk, tokenAddress);

    const options = confidentialBalanceQueryOptions(token, { tokenAddress, account: owner });

    expect(options.enabled).toBe(false);
  });

  test("queryFn delegates to token.balanceOf using the owner from queryKey", async ({
    createMockToken,
    signer,
    mockQueryContext,
  }) => {
    const token = createMockToken(tokenAddress);
    vi.mocked(token.balanceOf).mockResolvedValue(42n);

    const options = confidentialBalanceQueryOptions(
      token,
      { tokenAddress, account: owner },
      { walletAccount: signer.walletAccount.getSnapshot() },
    );

    const value = await options.queryFn(mockQueryContext(options.queryKey));
    expect(value).toBe(42n);
    expect(token.balanceOf).toHaveBeenCalledWith(owner);
  });
});
