import type { Address } from "viem";
import { describe, expect, test, vi } from "../../test-fixtures";
import { ZamaErrorCode } from "../../errors";

const UNDERLYING = "0x9C9c9c9c9c9c9C9c9c9C9C9c9c9C9c9c9c9c9C9c" as Address;
const OTHER_RECIPIENT = "0x8b8b8b8b8B8B8b8B8B8b8b8b8b8B8B8B8B8b8B8b" as Address;

describe("WrappedToken.wrap", () => {
  test("wrapMutationOptions forwards options to token.wrap", async ({ mockWrappedToken }) => {
    const { wrapMutationOptions } = await import("../../query/wrap");
    const options = wrapMutationOptions(mockWrappedToken);

    await options.mutationFn({ amount: 1n });
    expect(mockWrappedToken.wrap).toHaveBeenCalledWith(1n, undefined);

    await options.mutationFn({ amount: 2n, to: "0x8b8b8b8b8B8B8b8B8B8b8b8b8b8B8B8B8B8b8B8b" });
    expect(mockWrappedToken.wrap).toHaveBeenLastCalledWith(2n, {
      to: "0x8b8b8b8b8B8B8b8B8B8b8b8b8b8B8B8B8B8b8B8b",
    });
  });

  test("submits wrap when balance and allowance are sufficient", async ({
    wrappedToken: token,
    signer,
    provider,
  }) => {
    vi.mocked(provider.readContract)
      .mockResolvedValueOnce(UNDERLYING) // underlying()
      .mockResolvedValueOnce(1000n) // ERC-20 balanceOf
      .mockResolvedValueOnce(1000n); // allowance

    const result = await token.wrap(100n);

    expect(result.txHash).toBe("0xtxhash");
    expect(signer.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "wrap" }),
    );
  });

  test("routes to the recipient from options.to", async ({
    wrappedToken: token,
    signer,
    provider,
  }) => {
    vi.mocked(provider.readContract)
      .mockResolvedValueOnce(UNDERLYING)
      .mockResolvedValueOnce(1000n)
      .mockResolvedValueOnce(1000n);

    await token.wrap(100n, { to: OTHER_RECIPIENT });

    const callArgs = vi.mocked(signer.writeContract).mock.calls[0]![0] as unknown as {
      args: readonly unknown[];
    };
    expect(callArgs.args[0]).toBe(OTHER_RECIPIENT);
  });

  test("fires onWrapSubmitted", async ({ wrappedToken: token, provider }) => {
    vi.mocked(provider.readContract)
      .mockResolvedValueOnce(UNDERLYING)
      .mockResolvedValueOnce(1000n)
      .mockResolvedValueOnce(1000n);

    const onWrapSubmitted = vi.fn();
    await token.wrap(100n, { onWrapSubmitted });
    expect(onWrapSubmitted).toHaveBeenCalledWith("0xtxhash");
  });

  test("throws InsufficientERC20BalanceError when balance < amount", async ({
    wrappedToken: token,
    signer,
    provider,
  }) => {
    vi.mocked(provider.readContract).mockResolvedValueOnce(UNDERLYING).mockResolvedValueOnce(50n); // balance < 100

    await expect(token.wrap(100n)).rejects.toMatchObject({
      code: ZamaErrorCode.InsufficientERC20Balance,
    });
    expect(signer.writeContract).not.toHaveBeenCalled();
  });

  test("throws InsufficientAllowanceError when allowance < amount", async ({
    wrappedToken: token,
    signer,
    provider,
  }) => {
    vi.mocked(provider.readContract)
      .mockResolvedValueOnce(UNDERLYING)
      .mockResolvedValueOnce(1000n) // balance ok
      .mockResolvedValueOnce(50n); // allowance < 100

    await expect(token.wrap(100n)).rejects.toMatchObject({
      code: ZamaErrorCode.InsufficientAllowance,
    });
    expect(signer.writeContract).not.toHaveBeenCalled();
  });
});
