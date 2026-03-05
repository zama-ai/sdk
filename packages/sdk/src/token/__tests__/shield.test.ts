import { describe, expect, it, vi } from "../../test-fixtures";
import type { Address } from "../../relayer/relayer-sdk.types";

const UNDERLYING = "0x9999999999999999999999999999999999999999" as Address;

describe("Token.shield", () => {
  it("fires onApprovalSubmitted and onShieldSubmitted callbacks", async ({
    relayer,
    signer,
    createToken,
    storage,
    sessionStorage,
    tokenAddress,
  }) => {
    vi.mocked(signer.readContract).mockResolvedValue(UNDERLYING);
    const token = createToken({
      relayer,
      signer,
      storage,
      sessionStorage,
      address: tokenAddress,
      wrapper: tokenAddress,
    });
    vi.mocked(signer.readContract).mockResolvedValueOnce(UNDERLYING).mockResolvedValueOnce(0n);

    const onApprovalSubmitted = vi.fn();
    const onShieldSubmitted = vi.fn();

    await token.shield(100n, {
      callbacks: { onApprovalSubmitted, onShieldSubmitted },
    });

    expect(onApprovalSubmitted).toHaveBeenCalledWith("0xtxhash");
    expect(onShieldSubmitted).toHaveBeenCalledWith("0xtxhash");
  });

  it("skips onApprovalSubmitted when allowance is sufficient", async ({
    relayer,
    signer,
    createToken,
    storage,
    sessionStorage,
    tokenAddress,
  }) => {
    vi.mocked(signer.readContract).mockResolvedValue(UNDERLYING);
    const token = createToken({
      relayer,
      signer,
      storage,
      sessionStorage,
      address: tokenAddress,
      wrapper: tokenAddress,
    });
    vi.mocked(signer.readContract).mockResolvedValueOnce(UNDERLYING).mockResolvedValueOnce(1000n);

    const onApprovalSubmitted = vi.fn();
    const onShieldSubmitted = vi.fn();

    await token.shield(100n, {
      callbacks: { onApprovalSubmitted, onShieldSubmitted },
    });

    expect(onApprovalSubmitted).not.toHaveBeenCalled();
    expect(onShieldSubmitted).toHaveBeenCalledOnce();
  });

  it("completes shield even when callbacks throw", async ({
    relayer,
    signer,
    createToken,
    storage,
    sessionStorage,
    tokenAddress,
  }) => {
    vi.mocked(signer.readContract).mockResolvedValue(UNDERLYING);
    const token = createToken({
      relayer,
      signer,
      storage,
      sessionStorage,
      address: tokenAddress,
      wrapper: tokenAddress,
    });
    vi.mocked(signer.readContract).mockResolvedValueOnce(UNDERLYING).mockResolvedValueOnce(0n);

    const result = await token.shield(100n, {
      callbacks: {
        onApprovalSubmitted: () => {
          throw new Error("callback exploded");
        },
        onShieldSubmitted: () => {
          throw new Error("callback exploded again");
        },
      },
    });

    expect(result.txHash).toBe("0xtxhash");
  });

  it("passes to parameter for shield recipient", async ({
    relayer,
    signer,
    createToken,
    storage,
    sessionStorage,
    tokenAddress,
  }) => {
    vi.mocked(signer.readContract).mockResolvedValue(UNDERLYING);
    const token = createToken({
      relayer,
      signer,
      storage,
      sessionStorage,
      address: tokenAddress,
      wrapper: tokenAddress,
    });
    vi.mocked(signer.readContract).mockResolvedValueOnce(UNDERLYING).mockResolvedValueOnce(1000n);

    const recipient = "0x8888888888888888888888888888888888888888" as Address;
    await token.shield(100n, { to: recipient });

    expect(signer.writeContract).toHaveBeenCalled();
  });

  it("performs full shield flow with exact approval", async ({
    relayer,
    signer,
    createToken,
    storage,
    sessionStorage,
    tokenAddress,
    handle: fixtureHandle,
  }) => {
    vi.mocked(signer.readContract).mockResolvedValue(UNDERLYING);
    const token = createToken({
      relayer,
      signer,
      storage,
      sessionStorage,
      address: tokenAddress,
      wrapper: tokenAddress,
    });
    vi.mocked(signer.readContract)
      .mockResolvedValueOnce(UNDERLYING)
      .mockResolvedValueOnce(0n)
      .mockResolvedValueOnce(fixtureHandle);

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

    const balance = await token.decryptBalance(handle);
    expect(balance).toBe(1000n);
    expect(relayer.userDecrypt).toHaveBeenCalledWith(
      expect.objectContaining({ handles: [fixtureHandle] }),
    );
  });
});
