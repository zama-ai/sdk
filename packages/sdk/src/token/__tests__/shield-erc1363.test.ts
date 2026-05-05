import { type Address, encodeAbiParameters, parseAbiParameters, getAddress } from "viem";
import { describe, expect, it, vi } from "../../test-fixtures";
import { ERC1363NotSupportedError, ZamaErrorCode } from "../../errors";
import { ZamaSDKEvents } from "../../events/sdk-events";

const UNDERLYING = "0x9C9c9c9c9c9c9C9c9c9C9C9c9c9C9c9c9c9c9C9c" as Address;
const OTHER_RECIPIENT = "0x8b8b8b8b8B8B8b8B8B8b8b8b8b8B8B8B8B8b8B8b" as Address;

describe("Token.shield — ERC-1363 routing", () => {
  it("auto + ERC-1363 supported: uses transferAndCall on the underlying token", async ({
    token,
    signer,
    provider,
  }) => {
    vi.mocked(provider.readContract)
      .mockResolvedValueOnce(UNDERLYING) // underlying()
      .mockResolvedValueOnce(true) // supportsInterface (ERC-1363)
      .mockResolvedValueOnce(1000n); // ERC-20 balanceOf

    const result = await token.shield(100n);

    expect(result.txHash).toBe("0xtxhash");
    expect(signer.writeContract).toHaveBeenCalledOnce();
    expect(signer.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "transferAndCall" }),
    );
  });

  it("auto + ERC-1363 not supported: falls back to approve+wrap", async ({
    token,
    signer,
    provider,
  }) => {
    vi.mocked(provider.readContract)
      .mockResolvedValueOnce(UNDERLYING) // underlying()
      .mockResolvedValueOnce(false) // supportsInterface (ERC-1363) → false
      .mockResolvedValueOnce(1000n) // ERC-20 balanceOf
      .mockResolvedValueOnce(0n); // allowance

    const result = await token.shield(100n);

    expect(result.txHash).toBe("0xtxhash");
    expect(signer.writeContract).toHaveBeenCalledTimes(2); // approve + wrap
    expect(signer.writeContract).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ functionName: "approve" }),
    );
    expect(signer.writeContract).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ functionName: "wrap" }),
    );
  });

  it("auto + supportsInterface reverts: falls back to approve+wrap", async ({
    token,
    signer,
    provider,
  }) => {
    vi.mocked(provider.readContract)
      .mockResolvedValueOnce(UNDERLYING) // underlying()
      .mockRejectedValueOnce(new Error("supportsInterface reverted")) // supportsInterface fails
      .mockResolvedValueOnce(1000n) // ERC-20 balanceOf
      .mockResolvedValueOnce(0n); // allowance

    const result = await token.shield(100n);

    expect(result.txHash).toBe("0xtxhash");
    expect(signer.writeContract).toHaveBeenCalledTimes(2); // approve + wrap
    expect(signer.writeContract).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ functionName: "approve" }),
    );
    expect(signer.writeContract).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ functionName: "wrap" }),
    );
  });

  it("auto + transferAndCall reverts at runtime: falls back to approve+wrap transparently", async ({
    token,
    signer,
    provider,
  }) => {
    vi.mocked(provider.readContract)
      .mockResolvedValueOnce(UNDERLYING) // underlying()
      .mockResolvedValueOnce(true) // supportsInterface → true
      .mockResolvedValueOnce(1000n) // ERC-20 balanceOf
      .mockResolvedValueOnce(0n); // allowance (for fallback approve+wrap)

    vi.mocked(signer.writeContract)
      .mockRejectedValueOnce(new Error("transferAndCall reverted")) // transferAndCall fails
      .mockResolvedValueOnce("0xtxhash") // approve
      .mockResolvedValueOnce("0xtxhash"); // wrap

    const result = await token.shield(100n);

    expect(result.txHash).toBe("0xtxhash");
    // 3 calls: failed transferAndCall, approve, wrap
    expect(signer.writeContract).toHaveBeenCalledTimes(3);
    expect(signer.writeContract).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ functionName: "transferAndCall" }),
    );
    expect(signer.writeContract).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ functionName: "approve" }),
    );
    expect(signer.writeContract).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ functionName: "wrap" }),
    );
  });

  it('explicit "transferAndCall" + not supported: throws ERC1363NotSupportedError', async ({
    token,
    provider,
  }) => {
    vi.mocked(provider.readContract)
      .mockResolvedValueOnce(UNDERLYING) // underlying()
      .mockResolvedValueOnce(false); // supportsInterface → false

    await expect(token.shield(100n, { shieldStrategy: "transferAndCall" })).rejects.toThrowError(
      ERC1363NotSupportedError,
    );
  });

  it('explicit "transferAndCall" + reverts at runtime: does NOT fall back, throws', async ({
    token,
    signer,
    provider,
  }) => {
    vi.mocked(provider.readContract)
      .mockResolvedValueOnce(UNDERLYING) // underlying()
      .mockResolvedValueOnce(true) // supportsInterface → true
      .mockResolvedValueOnce(1000n); // ERC-20 balanceOf

    vi.mocked(signer.writeContract).mockRejectedValueOnce(new Error("transferAndCall reverted"));

    await expect(token.shield(100n, { shieldStrategy: "transferAndCall" })).rejects.toThrowError(
      "Shield transaction failed",
    );

    // Only one writeContract call — no fallback
    expect(signer.writeContract).toHaveBeenCalledOnce();
  });

  it('explicit "approveAndWrap": skips detection entirely, uses approve+wrap', async ({
    token,
    signer,
    provider,
  }) => {
    vi.mocked(provider.readContract)
      .mockResolvedValueOnce(UNDERLYING) // underlying()
      .mockResolvedValueOnce(1000n) // ERC-20 balanceOf
      .mockResolvedValueOnce(0n); // allowance

    // Note: no supportsInterface call expected — detection is skipped
    const result = await token.shield(100n, { shieldStrategy: "approveAndWrap" });

    expect(result.txHash).toBe("0xtxhash");
    expect(signer.writeContract).toHaveBeenCalledTimes(2); // approve + wrap
    expect(signer.writeContract).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ functionName: "approve" }),
    );
    expect(signer.writeContract).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ functionName: "wrap" }),
    );
  });

  it("shield-to-other with transferAndCall: encodes recipient in data param", async ({
    token,
    signer,
    provider,
  }) => {
    vi.mocked(provider.readContract)
      .mockResolvedValueOnce(UNDERLYING) // underlying()
      .mockResolvedValueOnce(true) // supportsInterface → true
      .mockResolvedValueOnce(1000n); // ERC-20 balanceOf

    await token.shield(100n, { to: OTHER_RECIPIENT });

    expect(signer.writeContract).toHaveBeenCalledOnce();
    const callArgs = vi.mocked(signer.writeContract).mock.calls[0]![0] as {
      functionName: string;
      args: unknown[];
    };
    expect(callArgs.functionName).toBe("transferAndCall");
    // data param should not be "0x" — it should be the ABI-encoded recipient
    expect(callArgs.args[2]).not.toBe("0x");
  });

  it("caches detection result: second shield doesn't call supportsInterface again", async ({
    token,
    provider,
  }) => {
    vi.mocked(provider.readContract)
      .mockResolvedValueOnce(UNDERLYING) // underlying() — first call (cached after)
      .mockResolvedValueOnce(true) // supportsInterface — first call (cached after)
      .mockResolvedValueOnce(1000n) // ERC-20 balanceOf — first shield
      .mockResolvedValueOnce(1000n); // ERC-20 balanceOf — second shield

    await token.shield(100n);
    await token.shield(200n);

    // readContract calls: underlying (1) + supportsInterface (1) + balanceOf (2) = 4
    expect(provider.readContract).toHaveBeenCalledTimes(4);
  });

  it("emits ShieldSubmitted with shieldPath: event contains the path used", async ({
    createSDK,
    provider,
    tokenAddress,
  }) => {
    const emitted: unknown[] = [];
    const sdk = createSDK({ onEvent: (event) => emitted.push(event) });
    const { Token } = await import("../../token/token");
    const token = new Token(sdk, tokenAddress);

    vi.mocked(provider.readContract)
      .mockResolvedValueOnce(UNDERLYING) // underlying()
      .mockResolvedValueOnce(true) // supportsInterface → true
      .mockResolvedValueOnce(1000n); // ERC-20 balanceOf

    await token.shield(100n);

    const shieldEvents = emitted.filter(
      (e) => (e as { type: string }).type === ZamaSDKEvents.ShieldSubmitted,
    );
    expect(shieldEvents).toHaveLength(1);
    expect(shieldEvents[0]).toEqual(
      expect.objectContaining({
        type: ZamaSDKEvents.ShieldSubmitted,
        shieldPath: "transferAndCall",
      }),
    );
  });

  it("supportsTransferAndCall() public method: returns detection result", async ({
    token,
    provider,
  }) => {
    vi.mocked(provider.readContract)
      .mockResolvedValueOnce(UNDERLYING) // underlying()
      .mockResolvedValueOnce(true); // supportsInterface → true

    const result = await token.supportsTransferAndCall();
    expect(result).toBe(true);

    // Subsequent call uses cache — no additional readContract calls
    const result2 = await token.supportsTransferAndCall();
    expect(result2).toBe(true);
    expect(provider.readContract).toHaveBeenCalledTimes(2); // underlying + supportsInterface only
  });

  // --- Data encoding ---

  it("self-shield via transferAndCall sends empty data (0x)", async ({
    token,
    signer,
    provider,
  }) => {
    vi.mocked(provider.readContract)
      .mockResolvedValueOnce(UNDERLYING)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(1000n);

    await token.shield(100n); // no `to` → self-shield

    const callArgs = vi.mocked(signer.writeContract).mock.calls[0]![0] as {
      args: unknown[];
    };
    expect(callArgs.args[2]).toBe("0x");
  });

  it("shield-to-other via transferAndCall sends ABI-encoded recipient", async ({
    token,
    signer,
    provider,
  }) => {
    vi.mocked(provider.readContract)
      .mockResolvedValueOnce(UNDERLYING)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(1000n);

    await token.shield(100n, { to: OTHER_RECIPIENT });

    const callArgs = vi.mocked(signer.writeContract).mock.calls[0]![0] as {
      args: unknown[];
    };
    const expectedData = encodeAbiParameters(parseAbiParameters("address"), [
      getAddress(OTHER_RECIPIENT),
    ]);
    expect(callArgs.args[2]).toBe(expectedData);
  });

  // --- approvalStrategy interaction ---

  it("approvalStrategy is ignored when transferAndCall path is used", async ({
    token,
    signer,
    provider,
  }) => {
    vi.mocked(provider.readContract)
      .mockResolvedValueOnce(UNDERLYING)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(1000n);

    // Pass approvalStrategy: "max" but expect no approve call
    await token.shield(100n, { approvalStrategy: "max" });

    expect(signer.writeContract).toHaveBeenCalledOnce();
    expect(signer.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "transferAndCall" }),
    );
  });

  it("onApprovalSubmitted callback is never fired on transferAndCall path", async ({
    token,
    provider,
  }) => {
    vi.mocked(provider.readContract)
      .mockResolvedValueOnce(UNDERLYING)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(1000n);

    const onApprovalSubmitted = vi.fn();
    await token.shield(100n, { onApprovalSubmitted });

    expect(onApprovalSubmitted).not.toHaveBeenCalled();
  });

  // --- Cache behaviour after runtime revert ---

  it("cache is NOT poisoned after transferAndCall runtime revert in auto mode", async ({
    token,
    signer,
    provider,
  }) => {
    // First shield: transferAndCall reverts, falls back to approveAndWrap
    vi.mocked(provider.readContract)
      .mockResolvedValueOnce(UNDERLYING)
      .mockResolvedValueOnce(true) // supportsInterface → true
      .mockResolvedValueOnce(1000n) // balanceOf
      .mockResolvedValueOnce(0n); // allowance (for fallback)

    vi.mocked(signer.writeContract)
      .mockRejectedValueOnce(new Error("revert")) // transferAndCall fails
      .mockResolvedValueOnce("0xtxhash") // approve
      .mockResolvedValueOnce("0xtxhash"); // wrap

    await token.shield(100n);

    // Second shield: should still try transferAndCall (cache not poisoned)
    vi.mocked(provider.readContract).mockResolvedValueOnce(1000n); // balanceOf only (underlying + supportsInterface cached)
    vi.mocked(signer.writeContract).mockResolvedValueOnce("0xtxhash"); // transferAndCall succeeds this time

    await token.shield(200n);

    // The 4th writeContract call should be transferAndCall, not approve
    expect(signer.writeContract).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({ functionName: "transferAndCall" }),
    );
  });

  // --- Error class ---

  it("ERC1363NotSupportedError has correct code and includes token address", async ({
    token,
    provider,
  }) => {
    vi.mocked(provider.readContract).mockResolvedValueOnce(UNDERLYING).mockResolvedValueOnce(false);

    try {
      await token.shield(100n, { shieldStrategy: "transferAndCall" });
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ERC1363NotSupportedError);
      expect((error as ERC1363NotSupportedError).code).toBe(ZamaErrorCode.ERC1363NotSupported);
      expect((error as ERC1363NotSupportedError).message).toContain(UNDERLYING);
    }
  });

  // --- shieldStrategy passthrough in query mutation ---

  it("shieldMutationOptions passes shieldStrategy to token.shield", async ({ mockToken }) => {
    const { shieldMutationOptions } = await import("../../query/shield");
    const options = shieldMutationOptions(mockToken, mockToken.address);

    await options.mutationFn({ amount: 1n, shieldStrategy: "transferAndCall" });
    expect(mockToken.shield).toHaveBeenCalledWith(1n, {
      shieldStrategy: "transferAndCall",
    });
  });
});
