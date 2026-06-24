import { type Address, getAddress } from "viem";
import { describe, expect, test, vi } from "../../test-fixtures";
import { ZamaSDKEvents } from "../../events/sdk-events";
import { ZamaErrorCode } from "../../errors";

const UNDERLYING = "0x9C9c9c9c9c9c9C9c9c9C9C9c9c9C9c9c9c9c9C9c" as Address;
const OTHER_RECIPIENT = "0x8b8b8b8b8B8B8b8B8B8b8b8b8b8B8B8B8B8b8B8b" as Address;

describe("WrappedToken.shield", () => {
  // --- Callbacks (approveAndWrap path) ---

  test("fires onApprovalSubmitted and onShieldSubmitted callbacks", async ({
    wrappedToken: token,
    provider,
  }) => {
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

  test("skips onApprovalSubmitted when allowance is sufficient", async ({
    wrappedToken: token,
    provider,
  }) => {
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

  test("completes shield even when callbacks throw", async ({ wrappedToken: token, provider }) => {
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

  test("passes to parameter for shield recipient", async ({
    wrappedToken: token,
    signer,
    provider,
  }) => {
    vi.mocked(provider.readContract)
      .mockResolvedValueOnce(UNDERLYING)
      .mockResolvedValueOnce(false) // supportsInterface (ERC-1363)
      .mockResolvedValueOnce(1000n)
      .mockResolvedValueOnce(1000n);

    const recipient = "0x8b8b8b8b8B8B8b8B8B8b8b8b8b8B8B8B8B8b8B8b" as Address;
    await token.shield(100n, { to: recipient });

    expect(signer.writeContract).toHaveBeenCalled();
  });

  test("awaits approval receipt before submitting the wrap TX", async ({
    wrappedToken: token,
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

  test("performs full shield flow with exact approval", async ({
    wrappedToken: token,
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
    vi.mocked(relayer.decryptValues).mockResolvedValue({
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
    expect(relayer.decryptValues).toHaveBeenCalledWith(
      expect.objectContaining({ encryptedValues: [fixtureHandle] }),
    );
  });

  // --- ERC-1363 routing ---

  describe("ERC-1363 routing", () => {
    test("auto + ERC-1363 supported: uses transferAndCall on the underlying token", async ({
      wrappedToken: token,
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

    test("auto + ERC-1363 not supported: falls back to approve+wrap", async ({
      wrappedToken: token,
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

    test("auto + supportsInterface reverts: falls back to approve+wrap", async ({
      wrappedToken: token,
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
    test("auto + transferAndCall reverts at runtime: throws (no fallback)", async ({
      wrappedToken: token,
      signer,
      provider,
    }) => {
      vi.mocked(provider.readContract)
        .mockResolvedValueOnce(UNDERLYING)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(1000n);

      vi.mocked(signer.writeContract).mockRejectedValueOnce(new Error("transferAndCall reverted"));

      await expect(token.shield(100n)).rejects.toMatchObject({
        code: ZamaErrorCode.TransactionReverted,
      });
      expect(signer.writeContract).toHaveBeenCalledOnce();
    });

    test("auto + transferAndCall non-revert error (e.g. user rejection): does NOT fall back", async ({
      wrappedToken: token,
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

      await expect(token.shield(100n)).rejects.toMatchObject({
        code: ZamaErrorCode.TransactionReverted,
      });
      expect(signer.writeContract).toHaveBeenCalledOnce();
    });

    test("auto + transferAndCall succeeds but receipt fails: does NOT fall back", async ({
      wrappedToken: token,
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

      await expect(token.shield(100n)).rejects.toMatchObject({
        code: ZamaErrorCode.TransactionReverted,
      });
      // Submission happened exactly once — no second wallet popup.
      expect(signer.writeContract).toHaveBeenCalledOnce();
    });
  });

  // --- Data encoding ---

  describe("transferAndCall data encoding", () => {
    test("self-shield sends empty data (0x)", async ({ wrappedToken: token, signer, provider }) => {
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
    test("shield-to-other sends raw 20-byte recipient address (not ABI-encoded)", async ({
      wrappedToken: token,
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

    test("explicit to=userAddress (case-insensitive) is treated as self-shield (data: 0x)", async ({
      wrappedToken: token,
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
    test("approvalStrategy is ignored when transferAndCall path is used", async ({
      wrappedToken: token,
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

    test("onApprovalSubmitted callback is never fired on transferAndCall path", async ({
      wrappedToken: token,
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
    test("caches detection result across shield calls", async ({
      wrappedToken: token,
      provider,
    }) => {
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

    test("isPayable() returns and caches detection result", async ({
      wrappedToken: token,
      provider,
    }) => {
      vi.mocked(provider.readContract)
        .mockResolvedValueOnce(UNDERLYING)
        .mockResolvedValueOnce(true);

      expect(await token.isPayable()).toBe(true);
      expect(await token.isPayable()).toBe(true);
      expect(provider.readContract).toHaveBeenCalledTimes(2);
    });

    test("isPayable() caches false when supportsInterface reverts", async ({
      wrappedToken: token,
      provider,
    }) => {
      vi.mocked(provider.readContract)
        .mockResolvedValueOnce(UNDERLYING)
        .mockRejectedValueOnce(new Error("supportsInterface reverted"));

      expect(await token.isPayable()).toBe(false);
      expect(await token.isPayable()).toBe(false);
      // First call: underlying (1) + failing supportsInterface (1) = 2 reads.
      // Second call: negative-cache hit, no reads.
      expect(provider.readContract).toHaveBeenCalledTimes(2);
    });

    test("isPayable() caches false when underlying() reverts", async ({
      wrappedToken: token,
      provider,
    }) => {
      vi.mocked(provider.readContract).mockRejectedValueOnce(new Error("underlying() reverted"));

      expect(await token.isPayable()).toBe(false);
      expect(await token.isPayable()).toBe(false);
      expect(provider.readContract).toHaveBeenCalledTimes(1);
    });
  });

  // --- Events ---

  describe("shieldPath events", () => {
    test("emits ShieldSubmitted with shieldPath: transferAndCall", async ({
      createSDK,
      provider,
      tokenAddress,
    }) => {
      const emitted: unknown[] = [];
      const sdk = createSDK({
        onEvent: (event: unknown) => emitted.push(event),
      });
      const { WrappedToken } = await import("../../token/wrapped-token");
      const token = new WrappedToken(sdk, tokenAddress);

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

    test("emits ShieldSubmitted with shieldPath: approveAndWrap", async ({
      createSDK,
      provider,
      tokenAddress,
    }) => {
      const emitted: unknown[] = [];
      const sdk = createSDK({
        onEvent: (event: unknown) => emitted.push(event),
      });
      const { WrappedToken } = await import("../../token/wrapped-token");
      const token = new WrappedToken(sdk, tokenAddress);

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

    test('emits TransactionError with operation: "shield:transferAndCall" when transferAndCall fails', async ({
      createSDK,
      provider,
      tokenAddress,
    }) => {
      const emitted: unknown[] = [];
      const sdk = createSDK({
        onEvent: (event: unknown) => emitted.push(event),
      });
      const { WrappedToken } = await import("../../token/wrapped-token");
      const token = new WrappedToken(sdk, tokenAddress);

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
          operation: "shield:transferAndCall",
        }),
      );
    });

    test('emits TransactionError with operation: "shield:approveAndWrap" when approveAndWrap fails', async ({
      createSDK,
      provider,
      tokenAddress,
    }) => {
      const emitted: unknown[] = [];
      const sdk = createSDK({
        onEvent: (event: unknown) => emitted.push(event),
      });
      const { WrappedToken } = await import("../../token/wrapped-token");
      const token = new WrappedToken(sdk, tokenAddress);

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
          operation: "shield:approveAndWrap",
        }),
      );
    });
  });

  // --- Query mutation passthrough ---

  test("shieldMutationOptions forwards options to token.shield", async ({ mockWrappedToken }) => {
    const { shieldMutationOptions } = await import("../../query/shield");
    const options = shieldMutationOptions(mockWrappedToken);

    await options.mutationFn({ amount: 1n, approvalStrategy: "max" });
    expect(mockWrappedToken.shield).toHaveBeenCalledWith(1n, {
      approvalStrategy: "max",
    });
  });
});
