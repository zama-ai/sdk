import { type Address, getAddress } from "viem";
import { describe, expect, it, vi } from "../../test-fixtures";
import { ERC1363NotSupportedError, ZamaErrorCode } from "../../errors";
import { ZamaSDKEvents } from "../../events/sdk-events";

const UNDERLYING = "0x9C9c9c9c9c9c9C9c9c9C9C9c9c9C9c9c9c9c9C9c" as Address;
const OTHER_RECIPIENT = "0x8b8b8b8b8B8B8b8B8B8b8b8b8b8B8B8B8B8b8B8b" as Address;

describe("Token.shield", () => {
  // --- Callbacks (approveAndWrap path) ---

  it("fires onApprovalSubmitted and onShieldSubmitted callbacks", async ({ token, provider }) => {
    vi.mocked(provider.readContract)
      .mockResolvedValueOnce(UNDERLYING) // underlying()
      .mockResolvedValueOnce(false) // supportsInterface (ERC-1363)
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
      .mockResolvedValueOnce(false) // supportsInterface (ERC-1363)
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
      .mockResolvedValueOnce(false) // supportsInterface (ERC-1363)
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
      .mockResolvedValueOnce(false) // supportsInterface (ERC-1363)
      .mockResolvedValueOnce(1000n)
      .mockResolvedValueOnce(1000n);

    const recipient = "0x8b8b8b8b8B8B8b8B8B8b8b8b8b8B8B8B8B8b8B8b" as Address;
    await token.shield(100n, { to: recipient });

    expect(signer.writeContract).toHaveBeenCalled();
  });

  it("awaits approval receipt before submitting the wrap TX", async ({
    token,
    signer,
    provider,
  }) => {
    vi.mocked(provider.readContract)
      .mockResolvedValueOnce(UNDERLYING) // underlying()
      .mockResolvedValueOnce(false) // supportsInterface (ERC-1363)
      .mockResolvedValueOnce(1000n) // ERC-20 balanceOf
      .mockResolvedValueOnce(0n); // allowance — forces approval path

    const callOrder: string[] = [];

    vi.mocked(signer.writeContract).mockImplementation(async (config) => {
      callOrder.push(`write:${(config as { functionName: string }).functionName}`);
      return "0xtxhash";
    });
    vi.mocked(provider.waitForTransactionReceipt).mockImplementation(async () => {
      callOrder.push("receipt");
      return { logs: [] };
    });

    await token.shield(500n);

    expect(callOrder).toEqual(["write:approve", "receipt", "write:wrap", "receipt"]);
  });

  it("performs full shield flow with exact approval", async ({
    token,
    signer,
    relayer,
    handle: fixtureHandle,
    userAddress,
    provider,
  }) => {
    vi.mocked(provider.readContract)
      .mockResolvedValueOnce(UNDERLYING)
      .mockResolvedValueOnce(false) // supportsInterface (ERC-1363)
      .mockResolvedValueOnce(1000n) // ERC-20 balanceOf
      .mockResolvedValueOnce(0n) // allowance
      .mockResolvedValue(fixtureHandle); // subsequent confidentialBalanceOf calls
    vi.mocked(relayer.userDecrypt).mockResolvedValue({
      [fixtureHandle]: 1000n,
    });

    const shieldResult = await token.shield(500n);
    expect(shieldResult.txHash).toBe("0xtxhash");

    expect(signer.writeContract).toHaveBeenCalledTimes(2);
    expect(signer.writeContract).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        functionName: "approve",
        args: expect.arrayContaining([500n]),
      }),
    );
    expect(signer.writeContract).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ functionName: "wrap" }),
    );

    const handle = await token.confidentialBalanceOf(userAddress);
    expect(handle).toBe(fixtureHandle);

    const balance = await token.balanceOf(userAddress);
    expect(balance).toBe(1000n);
    expect(relayer.userDecrypt).toHaveBeenCalledWith(
      expect.objectContaining({ handles: [fixtureHandle] }),
    );
  });

  // --- ERC-1363 routing ---

  describe("ERC-1363 routing", () => {
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
        .mockResolvedValueOnce(UNDERLYING)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(1000n)
        .mockResolvedValueOnce(0n);

      const result = await token.shield(100n);

      expect(result.txHash).toBe("0xtxhash");
      expect(signer.writeContract).toHaveBeenCalledTimes(2);
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
        .mockResolvedValueOnce(UNDERLYING)
        .mockRejectedValueOnce(new Error("supportsInterface reverted"))
        .mockResolvedValueOnce(1000n)
        .mockResolvedValueOnce(0n);

      const result = await token.shield(100n);

      expect(result.txHash).toBe("0xtxhash");
      expect(signer.writeContract).toHaveBeenCalledTimes(2);
    });

    // ERC-165 introspection is the source of truth for routing — if a token
    // advertises ERC-1363 support but reverts on transferAndCall at runtime,
    // we throw rather than falling back. Users can opt out with
    // `shieldStrategy: "approveAndWrap"`.
    it("auto + transferAndCall reverts at runtime: throws (no fallback)", async ({
      token,
      signer,
      provider,
    }) => {
      vi.mocked(provider.readContract)
        .mockResolvedValueOnce(UNDERLYING)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(1000n);

      vi.mocked(signer.writeContract).mockRejectedValueOnce(new Error("transferAndCall reverted"));

      await expect(token.shield(100n)).rejects.toThrow("Shield transaction failed");
      expect(signer.writeContract).toHaveBeenCalledOnce();
    });

    it('explicit "transferAndCall" + not supported: throws ERC1363NotSupportedError', async ({
      token,
      provider,
    }) => {
      vi.mocked(provider.readContract)
        .mockResolvedValueOnce(UNDERLYING)
        .mockResolvedValueOnce(false);

      await expect(token.shield(100n, { shieldStrategy: "transferAndCall" })).rejects.toThrow(
        ERC1363NotSupportedError,
      );
    });

    it('explicit "transferAndCall" + reverts at runtime: does NOT fall back', async ({
      token,
      signer,
      provider,
    }) => {
      vi.mocked(provider.readContract)
        .mockResolvedValueOnce(UNDERLYING)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(1000n);

      vi.mocked(signer.writeContract).mockRejectedValueOnce(new Error("transferAndCall reverted"));

      await expect(token.shield(100n, { shieldStrategy: "transferAndCall" })).rejects.toThrow(
        "Shield transaction failed",
      );

      expect(signer.writeContract).toHaveBeenCalledOnce();
    });

    it('explicit "approveAndWrap": skips detection entirely', async ({
      token,
      signer,
      provider,
    }) => {
      vi.mocked(provider.readContract)
        .mockResolvedValueOnce(UNDERLYING)
        .mockResolvedValueOnce(1000n)
        .mockResolvedValueOnce(0n);

      const result = await token.shield(100n, {
        shieldStrategy: "approveAndWrap",
      });

      expect(result.txHash).toBe("0xtxhash");
      expect(signer.writeContract).toHaveBeenCalledTimes(2);
    });

    it("auto + transferAndCall non-revert error (e.g. user rejection): does NOT fall back", async ({
      token,
      signer,
      provider,
    }) => {
      vi.mocked(provider.readContract)
        .mockResolvedValueOnce(UNDERLYING)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(1000n);

      // Plain Error, not a ContractFunctionRevertedError — represents a user
      // rejection or RPC failure where falling back would be hostile UX.
      vi.mocked(signer.writeContract).mockRejectedValueOnce(new Error("User rejected the request"));

      await expect(token.shield(100n)).rejects.toThrow("Shield transaction failed");
      expect(signer.writeContract).toHaveBeenCalledOnce();
    });

    it("auto + transferAndCall succeeds but receipt fails: does NOT fall back", async ({
      token,
      signer,
      provider,
    }) => {
      vi.mocked(provider.readContract)
        .mockResolvedValueOnce(UNDERLYING)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(1000n);

      vi.mocked(signer.writeContract).mockResolvedValueOnce("0xtxhash");
      vi.mocked(provider.waitForTransactionReceipt).mockRejectedValueOnce(
        new Error("network dropped"),
      );

      await expect(token.shield(100n)).rejects.toThrow("Shield transaction failed");
      // Submission happened exactly once — no second wallet popup.
      expect(signer.writeContract).toHaveBeenCalledOnce();
    });
  });

  // --- Data encoding ---

  describe("transferAndCall data encoding", () => {
    it("self-shield sends empty data (0x)", async ({ token, signer, provider }) => {
      vi.mocked(provider.readContract)
        .mockResolvedValueOnce(UNDERLYING)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(1000n);

      await token.shield(100n);

      const callArgs = vi.mocked(signer.writeContract).mock.calls[0]![0] as unknown as {
        args: readonly unknown[];
      };
      expect(callArgs.args[2]).toBe("0x");
    });

    // The wrapper decodes the recipient via address(bytes20(data)). We send the
    // raw 20-byte address (not ABI-encoded); ABI encoding would left-pad with
    // 12 zero bytes and bytes20() would slice them, corrupting the recipient.
    it("shield-to-other sends raw 20-byte recipient address (not ABI-encoded)", async ({
      token,
      signer,
      provider,
    }) => {
      vi.mocked(provider.readContract)
        .mockResolvedValueOnce(UNDERLYING)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(1000n);

      await token.shield(100n, { to: OTHER_RECIPIENT });

      const callArgs = vi.mocked(signer.writeContract).mock.calls[0]![0] as unknown as {
        args: readonly unknown[];
      };
      expect(callArgs.args[2]).toBe(getAddress(OTHER_RECIPIENT));
    });

    it("explicit to=userAddress (case-insensitive) is treated as self-shield (data: 0x)", async ({
      token,
      signer,
      userAddress,
      provider,
    }) => {
      vi.mocked(provider.readContract)
        .mockResolvedValueOnce(UNDERLYING)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(1000n);

      // Pass the user's own address in lowercase to make sure normalization
      // via getAddress() collapses to the self-shield branch.
      await token.shield(100n, { to: userAddress.toLowerCase() as Address });

      const callArgs = vi.mocked(signer.writeContract).mock.calls[0]![0] as unknown as {
        args: readonly unknown[];
      };
      expect(callArgs.args[2]).toBe("0x");
    });
  });

  // --- approvalStrategy interaction ---

  describe("approvalStrategy interaction with transferAndCall", () => {
    it("approvalStrategy is ignored when transferAndCall path is used", async ({
      token,
      signer,
      provider,
    }) => {
      vi.mocked(provider.readContract)
        .mockResolvedValueOnce(UNDERLYING)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(1000n);

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
  });

  // --- Detection caching ---

  describe("ERC-1363 detection caching", () => {
    it("caches detection result across shield calls", async ({ token, provider }) => {
      vi.mocked(provider.readContract)
        .mockResolvedValueOnce(UNDERLYING)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(1000n)
        .mockResolvedValueOnce(1000n);

      await token.shield(100n);
      await token.shield(200n);

      // underlying (1) + supportsInterface (1) + balanceOf (2) = 4
      expect(provider.readContract).toHaveBeenCalledTimes(4);
    });

    it("isPayable() returns and caches detection result", async ({ token, provider }) => {
      vi.mocked(provider.readContract)
        .mockResolvedValueOnce(UNDERLYING)
        .mockResolvedValueOnce(true);

      expect(await token.isPayable()).toBe(true);
      expect(await token.isPayable()).toBe(true);
      expect(provider.readContract).toHaveBeenCalledTimes(2);
    });

    it("isPayable() caches false when supportsInterface reverts", async ({ token, provider }) => {
      vi.mocked(provider.readContract)
        .mockResolvedValueOnce(UNDERLYING)
        .mockRejectedValueOnce(new Error("supportsInterface reverted"));

      expect(await token.isPayable()).toBe(false);
      expect(await token.isPayable()).toBe(false);
      // First call: underlying (1) + supportsInterface (1) = 2 reads.
      // Second call: cache hit, no additional reads.
      expect(provider.readContract).toHaveBeenCalledTimes(2);
    });

    it("isPayable() caches false when underlying() reverts", async ({ token, provider }) => {
      vi.mocked(provider.readContract).mockRejectedValueOnce(new Error("underlying() reverted"));

      expect(await token.isPayable()).toBe(false);
      expect(await token.isPayable()).toBe(false);
      // The #underlyingPromise retries on failure (separate cache), but
      // #isPayable is cached as false so the second call short-circuits.
      expect(provider.readContract).toHaveBeenCalledTimes(1);
    });
  });

  // --- Events ---

  describe("shieldPath events", () => {
    it("emits ShieldSubmitted with shieldPath: transferAndCall", async ({
      createSDK,
      provider,
      tokenAddress,
    }) => {
      const emitted: unknown[] = [];
      const sdk = createSDK({
        onEvent: (event: unknown) => emitted.push(event),
      });
      const { Token } = await import("../../token/token");
      const token = new Token(sdk, tokenAddress);

      vi.mocked(provider.readContract)
        .mockResolvedValueOnce(UNDERLYING)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(1000n);

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

    it("emits ShieldSubmitted with shieldPath: approveAndWrap", async ({
      createSDK,
      provider,
      tokenAddress,
    }) => {
      const emitted: unknown[] = [];
      const sdk = createSDK({
        onEvent: (event: unknown) => emitted.push(event),
      });
      const { Token } = await import("../../token/token");
      const token = new Token(sdk, tokenAddress);

      vi.mocked(provider.readContract)
        .mockResolvedValueOnce(UNDERLYING)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(1000n)
        .mockResolvedValueOnce(1000n);

      await token.shield(100n);

      const shieldEvents = emitted.filter(
        (e) => (e as { type: string }).type === ZamaSDKEvents.ShieldSubmitted,
      );
      expect(shieldEvents).toHaveLength(1);
      expect(shieldEvents[0]).toEqual(
        expect.objectContaining({
          type: ZamaSDKEvents.ShieldSubmitted,
          shieldPath: "approveAndWrap",
        }),
      );
    });

    it("emits TransactionError with shieldPath: transferAndCall when transferAndCall fails in auto mode", async ({
      createSDK,
      provider,
      tokenAddress,
    }) => {
      const emitted: unknown[] = [];
      const sdk = createSDK({
        onEvent: (event: unknown) => emitted.push(event),
      });
      const { Token } = await import("../../token/token");
      const token = new Token(sdk, tokenAddress);

      vi.mocked(provider.readContract)
        .mockResolvedValueOnce(UNDERLYING)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(1000n);

      vi.mocked(sdk.signer!.writeContract).mockRejectedValueOnce(
        new Error("transferAndCall reverted"),
      );

      await expect(token.shield(100n)).rejects.toThrow();

      const errorEvents = emitted.filter(
        (e) => (e as { type: string }).type === ZamaSDKEvents.TransactionError,
      );
      expect(errorEvents).toHaveLength(1);
      expect(errorEvents[0]).toEqual(
        expect.objectContaining({
          type: ZamaSDKEvents.TransactionError,
          operation: "shield",
          shieldPath: "transferAndCall",
        }),
      );
    });

    it("emits TransactionError with shieldPath: approveAndWrap when approveAndWrap fails", async ({
      createSDK,
      provider,
      tokenAddress,
    }) => {
      const emitted: unknown[] = [];
      const sdk = createSDK({
        onEvent: (event: unknown) => emitted.push(event),
      });
      const { Token } = await import("../../token/token");
      const token = new Token(sdk, tokenAddress);

      vi.mocked(provider.readContract)
        .mockResolvedValueOnce(UNDERLYING)
        .mockResolvedValueOnce(false) // not payable → approveAndWrap path
        .mockResolvedValueOnce(1000n)
        .mockResolvedValueOnce(1000n);

      vi.mocked(sdk.signer!.writeContract).mockRejectedValueOnce(new Error("wrap reverted"));

      await expect(token.shield(100n)).rejects.toThrow();

      const errorEvents = emitted.filter(
        (e) => (e as { type: string }).type === ZamaSDKEvents.TransactionError,
      );
      expect(errorEvents).toHaveLength(1);
      expect(errorEvents[0]).toEqual(
        expect.objectContaining({
          type: ZamaSDKEvents.TransactionError,
          operation: "shield",
          shieldPath: "approveAndWrap",
        }),
      );
    });
  });

  // --- Error class ---

  describe("ERC1363NotSupportedError", () => {
    it("has correct code and includes token address", async ({ token, provider }) => {
      vi.mocked(provider.readContract)
        .mockResolvedValueOnce(UNDERLYING)
        .mockResolvedValueOnce(false);

      try {
        await token.shield(100n, { shieldStrategy: "transferAndCall" });
        expect.unreachable("should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(ERC1363NotSupportedError);
        expect((error as ERC1363NotSupportedError).code).toBe(ZamaErrorCode.ERC1363NotSupported);
        expect((error as ERC1363NotSupportedError).message).toContain(UNDERLYING);
      }
    });
  });

  // --- Query mutation passthrough ---

  it("shieldMutationOptions passes shieldStrategy to token.shield", async ({ mockToken }) => {
    const { shieldMutationOptions } = await import("../../query/shield");
    const options = shieldMutationOptions(mockToken);

    await options.mutationFn({ amount: 1n, shieldStrategy: "transferAndCall" });
    expect(mockToken.shield).toHaveBeenCalledWith(1n, {
      shieldStrategy: "transferAndCall",
    });
  });
});
