import type { Address } from "viem";
import { describe, expect, it, vi } from "../../test-fixtures";

const UNDERLYING = "0x9C9c9c9c9c9c9C9c9c9C9C9c9c9C9c9c9c9c9C9c" as Address;

describe("Token.shield", () => {
  it("fires onApprovalSubmitted and onShieldSubmitted callbacks", async ({ token, provider }) => {
    vi.mocked(provider.readContract)
      .mockResolvedValueOnce(UNDERLYING) // underlying()
      .mockResolvedValueOnce(1000n) // ERC-20 balanceOf
      .mockResolvedValueOnce(0n); // allowance

    const onApprovalSubmitted = vi.fn();
    const onShieldSubmitted = vi.fn();

    await token.shield(100n, { onApprovalSubmitted, onShieldSubmitted });

    expect(onApprovalSubmitted).toHaveBeenCalledWith("0xtxhash");
    expect(onShieldSubmitted).toHaveBeenCalledWith("0xtxhash");
  });

  it("skips onApprovalSubmitted when allowance is sufficient", async ({ token, provider }) => {
    vi.mocked(provider.readContract)
      .mockResolvedValueOnce(UNDERLYING)
      .mockResolvedValueOnce(1000n)
      .mockResolvedValueOnce(1000n);

    const onApprovalSubmitted = vi.fn();
    const onShieldSubmitted = vi.fn();

    await token.shield(100n, { onApprovalSubmitted, onShieldSubmitted });

    expect(onApprovalSubmitted).not.toHaveBeenCalled();
    expect(onShieldSubmitted).toHaveBeenCalledOnce();
  });

  it("completes shield even when callbacks throw", async ({ token, provider }) => {
    vi.mocked(provider.readContract)
      .mockResolvedValueOnce(UNDERLYING)
      .mockResolvedValueOnce(1000n)
      .mockResolvedValueOnce(0n);

    const result = await token.shield(100n, {
      onApprovalSubmitted: () => {
        throw new Error("callback exploded");
      },
      onShieldSubmitted: () => {
        throw new Error("callback exploded again");
      },
    });

    expect(result.txHash).toBe("0xtxhash");
  });

  it("passes to parameter for shield recipient", async ({ token, signer, provider }) => {
    vi.mocked(provider.readContract)
      .mockResolvedValueOnce(UNDERLYING)
      .mockResolvedValueOnce(1000n)
      .mockResolvedValueOnce(1000n);

    const recipient = "0x8b8b8b8b8B8B8b8B8B8b8b8b8b8B8B8B8B8b8B8b" as Address;
    await token.shield(100n, { to: recipient });

    expect(signer.writeContract).toHaveBeenCalled();
  });

  it("performs full shield flow with exact approval", async ({
    token,
    signer,
    relayer,
    handle: fixtureHandle,
    provider,
  }) => {
    vi.mocked(provider.readContract)
      .mockResolvedValueOnce(UNDERLYING)
      .mockResolvedValueOnce(1000n) // ERC-20 balanceOf
      .mockResolvedValueOnce(0n) // allowance
      .mockResolvedValue(fixtureHandle); // subsequent confidentialBalanceOf calls
    vi.mocked(relayer.userDecrypt).mockResolvedValue({ [fixtureHandle]: 1000n });

    const shieldResult = await token.shield(500n);
    expect(shieldResult.txHash).toBe("0xtxhash");

    expect(signer.writeContract).toHaveBeenCalledTimes(2);
    expect(signer.writeContract).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ functionName: "approve", args: expect.arrayContaining([500n]) }),
    );
    expect(signer.writeContract).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ functionName: "wrap" }),
    );

    const handle = await token.confidentialBalanceOf();
    expect(handle).toBe(fixtureHandle);

    const balance = await token.balanceOf();
    expect(balance).toBe(1000n);
    expect(relayer.userDecrypt).toHaveBeenCalledWith(
      expect.objectContaining({ handles: [fixtureHandle] }),
    );
  });
});
