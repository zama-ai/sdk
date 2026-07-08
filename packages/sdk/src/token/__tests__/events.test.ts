import { describe, expect, test, vi, type CreateSDKFn } from "../../test-fixtures";
import { Topics } from "../../events";
import { Token } from "../token";
import { WrappedToken } from "../wrapped-token";
import {
  type ZamaSDKEvent,
  type ZamaSDKEventListener,
  ZamaSDKEvents,
} from "../../events/sdk-events";
import { TransactionRevertedError } from "../../errors";
import type { Address } from "viem";
import type { GenericProvider } from "../../types";
import { ZERO_ENCRYPTED_VALUE } from "../../utils/handles";

const TEST_PUBLIC_KEY = `0x${"11".repeat(32)}` as const;

/**
 * Build a ZamaSDK with an event listener wired up, together with a fresh
 * Token/Token pair bound to it. Each test gets a fresh event array
 * to inspect.
 */
function setupSdkWithEvents(opts: {
  createSDK: CreateSDKFn;
  tokenAddress: Address;
  wrapper?: Address;
}) {
  const events: ZamaSDKEvent[] = [];
  const onEvent: ZamaSDKEventListener = (event) => events.push(event);
  const sdk = opts.createSDK({ onEvent });
  const readonlyToken = new Token(sdk, opts.tokenAddress);
  const token = new WrappedToken(sdk, opts.wrapper ?? opts.tokenAddress);
  return { sdk, events, readonlyToken, token };
}

describe("ZamaSDKEvents constants", () => {
  test("has all expected event keys", () => {
    expect(ZamaSDKEvents.EncryptStart).toBe("encrypt:start");
    expect(ZamaSDKEvents.EncryptEnd).toBe("encrypt:end");
    expect(ZamaSDKEvents.EncryptError).toBe("encrypt:error");
    expect(ZamaSDKEvents.DecryptStart).toBe("decrypt:start");
    expect(ZamaSDKEvents.DecryptEnd).toBe("decrypt:end");
    expect(ZamaSDKEvents.DecryptError).toBe("decrypt:error");
    expect(ZamaSDKEvents.TransactionError).toBe("transaction:error");
    expect(ZamaSDKEvents.ShieldSubmitted).toBe("shield:submitted");
    expect(ZamaSDKEvents.TransferSubmitted).toBe("transfer:submitted");
    expect(ZamaSDKEvents.TransferFromSubmitted).toBe("transferFrom:submitted");
    expect(ZamaSDKEvents.SetOperatorSubmitted).toBe("setOperator:submitted");
    expect(ZamaSDKEvents.ApproveUnderlyingSubmitted).toBe("approveUnderlying:submitted");
    expect(ZamaSDKEvents.UnwrapSubmitted).toBe("unwrap:submitted");
    expect(ZamaSDKEvents.FinalizeUnwrapSubmitted).toBe("finalizeUnwrap:submitted");
    expect(ZamaSDKEvents.UnshieldPhase1Submitted).toBe("unshield:phase1_submitted");
    expect(ZamaSDKEvents.UnshieldPhase2Started).toBe("unshield:phase2_started");
    expect(ZamaSDKEvents.UnshieldPhase2Submitted).toBe("unshield:phase2_submitted");
    expect(ZamaSDKEvents.DelegationSubmitted).toBe("delegation:submitted");
    expect(ZamaSDKEvents.RevokeDelegationSubmitted).toBe("revokeDelegation:submitted");
  });

  test("has unique event values", () => {
    const values = Object.values(ZamaSDKEvents);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe("Token.balanceOf event emissions", () => {
  // balanceOf delegates to sdk.userDecrypt, so decrypt events come from the SDK's
  // unified pipeline. They carry `handles` and `durationMs`, but not `tokenAddress`
  // (the pipeline is token-agnostic — callers correlate by handle).

  test("emits DecryptStart and DecryptEnd during balanceOf", async ({
    createSDK,
    tokenAddress,
    handle,
    userAddress,
    provider,
  }) => {
    const { readonlyToken, events } = setupSdkWithEvents({ createSDK, tokenAddress });
    vi.mocked(provider.readContract).mockResolvedValue(handle);

    await readonlyToken.balanceOf(userAddress);

    const types = events.map((e) => e.type);
    expect(types).toContain(ZamaSDKEvents.DecryptStart);
    expect(types).toContain(ZamaSDKEvents.DecryptEnd);
    expect(types.indexOf(ZamaSDKEvents.DecryptStart)).toBeLessThan(
      types.indexOf(ZamaSDKEvents.DecryptEnd),
    );
  });

  test("does not emit decrypt events for zero balance handle", async ({
    createSDK,
    tokenAddress,
    userAddress,
    provider,
  }) => {
    const { readonlyToken, events } = setupSdkWithEvents({ createSDK, tokenAddress });
    vi.mocked(provider.readContract).mockResolvedValue(ZERO_ENCRYPTED_VALUE);

    await readonlyToken.balanceOf(userAddress);

    const types = events.map((e) => e.type);
    expect(types).not.toContain(ZamaSDKEvents.DecryptStart);
    expect(types).not.toContain(ZamaSDKEvents.DecryptEnd);
  });

  test("includes durationMs and handles on DecryptEnd", async ({
    createSDK,
    tokenAddress,
    handle,
    userAddress,
    provider,
  }) => {
    const { readonlyToken, events } = setupSdkWithEvents({ createSDK, tokenAddress });
    vi.mocked(provider.readContract).mockResolvedValue(handle);

    await readonlyToken.balanceOf(userAddress);

    const endEvent = events.find((e) => e.type === ZamaSDKEvents.DecryptEnd);
    expect(endEvent).toBeDefined();
    expect("durationMs" in endEvent! && typeof endEvent.durationMs).toBe("number");
    expect("durationMs" in endEvent! && endEvent.durationMs).toBeGreaterThanOrEqual(0);
    expect("encryptedValues" in endEvent! && endEvent.encryptedValues).toContain(handle);
  });

  test("emits DecryptError when relayer.userDecrypt fails", async ({
    createSDK,
    relayer,
    tokenAddress,
    handle,
    userAddress,
    provider,
  }) => {
    relayer.userDecrypt = vi.fn().mockRejectedValue(new Error("decrypt boom"));
    const { readonlyToken, events } = setupSdkWithEvents({ createSDK, tokenAddress });
    vi.mocked(provider.readContract).mockResolvedValue(handle);

    await expect(readonlyToken.balanceOf(userAddress)).rejects.toThrow();

    const errorEvent = events.find((e) => e.type === ZamaSDKEvents.DecryptError);
    expect(errorEvent).toBeDefined();
    expect("error" in errorEvent! && errorEvent.error).toBeInstanceOf(Error);
    expect("error" in errorEvent! && errorEvent.error.message).toBe("decrypt boom");
    expect("durationMs" in errorEvent! && errorEvent.durationMs).toBeGreaterThanOrEqual(0);
  });

  test("works without onEvent (no-op, does not throw)", async ({
    sdk,
    tokenAddress,
    handle,
    userAddress,
    provider,
  }) => {
    // `sdk` fixture is built with `onEvent: undefined` by default.
    const token = new Token(sdk, tokenAddress);
    vi.mocked(provider.readContract).mockResolvedValue(handle);
    await expect(token.balanceOf(userAddress)).resolves.toBe(1000n);
  });
});

describe("Token.decryptBalanceAs event emissions", () => {
  // decryptBalanceAs delegates to sdk.decryption.delegatedDecryptValues(), which emits events
  // at the SDK level (without tokenAddress). Events still carry timestamp.

  test("emits decrypt events with timestamp (no tokenAddress — SDK-level emission)", async ({
    createSDK,
    relayer,
    signer,
    tokenAddress,
    handle,
    delegatorAddress,
    provider,
  }) => {
    const { readonlyToken, events } = setupSdkWithEvents({ createSDK, tokenAddress });
    // readConfidentialBalanceOf → non-zero handle; getDelegationExpiry → permanent (skips block-timestamp RPC)
    vi.mocked(provider.readContract)
      .mockResolvedValueOnce(handle)
      .mockResolvedValue(2n ** 64n - 1n);
    relayer.createDelegatedUserDecryptEIP712 = vi
      .fn()
      .mockResolvedValue({
        domain: { name: "test", version: "1", chainId: 1, verifyingContract: "0xkms" },
        types: { DelegatedUserDecryptRequestVerification: [] },
        message: {
          publicKey: TEST_PUBLIC_KEY,
          contractAddresses: [tokenAddress],
          delegatorAddress,
          delegateAddress: signer.walletAccount.getSnapshot()!.address,
          startTimestamp: 1000n,
          durationDays: 1n,
          extraData: "0x",
        },
      });
    relayer.delegatedUserDecrypt = vi.fn().mockResolvedValue({ [handle]: 42n });

    await readonlyToken.decryptBalanceAs({ delegatorAddress });

    const decryptEvents = events.filter(
      (e) => e.type === ZamaSDKEvents.DecryptStart || e.type === ZamaSDKEvents.DecryptEnd,
    );
    expect(decryptEvents.length).toBeGreaterThan(0);
    for (const event of decryptEvents) {
      // SDK-level delegatedUserDecrypt does not scope events to a token address
      expect(event.tokenAddress).toBeUndefined();
      expect(event.timestamp).toBeGreaterThan(0);
      expect(typeof event.timestamp).toBe("number");
    }
  });
});

describe("Token event emissions", () => {
  describe("confidentialTransfer events", () => {
    test("emits EncryptStart, EncryptEnd, TransferSubmitted", async ({
      createSDK,
      tokenAddress,
    }) => {
      const { token, events } = setupSdkWithEvents({ createSDK, tokenAddress });
      await token.confidentialTransfer(
        "0x8b8b8b8b8B8B8b8B8B8b8b8b8b8B8B8B8B8b8B8b" as Address,
        100n,
        { skipBalanceCheck: true },
      );

      const types = events.map((e) => e.type);
      expect(types).toEqual(
        expect.arrayContaining([
          ZamaSDKEvents.EncryptStart,
          ZamaSDKEvents.EncryptEnd,
          ZamaSDKEvents.TransferSubmitted,
        ]),
      );
    });

    test("includes txHash on TransferSubmitted event", async ({ createSDK, tokenAddress }) => {
      const { token, events } = setupSdkWithEvents({ createSDK, tokenAddress });
      await token.confidentialTransfer(
        "0x8b8b8b8b8B8B8b8B8B8b8b8b8b8B8B8B8B8b8B8b" as Address,
        100n,
        { skipBalanceCheck: true },
      );

      const submitted = events.find((e) => e.type === ZamaSDKEvents.TransferSubmitted);
      expect(submitted).toBeDefined();
      expect("txHash" in submitted! && submitted.txHash).toBe("0xtxhash");
    });

    test("includes durationMs on EncryptEnd event", async ({ createSDK, tokenAddress }) => {
      const { token, events } = setupSdkWithEvents({ createSDK, tokenAddress });
      await token.confidentialTransfer(
        "0x8b8b8b8b8B8B8b8B8B8b8b8b8b8B8B8B8B8b8B8b" as Address,
        100n,
        { skipBalanceCheck: true },
      );

      const endEvent = events.find((e) => e.type === ZamaSDKEvents.EncryptEnd);
      expect(endEvent).toBeDefined();
      expect("durationMs" in endEvent! && endEvent.durationMs).toBeGreaterThanOrEqual(0);
    });

    test("emits EncryptError when encryption fails", async ({
      createSDK,
      relayer,
      tokenAddress,
    }) => {
      relayer.encrypt = vi.fn().mockRejectedValue(new Error("encrypt boom"));
      const { token, events } = setupSdkWithEvents({ createSDK, tokenAddress });

      await expect(
        token.confidentialTransfer("0x8b8b8b8b8B8B8b8B8B8b8b8b8b8B8B8B8B8b8B8b" as Address, 100n, {
          skipBalanceCheck: true,
        }),
      ).rejects.toThrow();

      const errorEvent = events.find((e) => e.type === ZamaSDKEvents.EncryptError);
      expect(errorEvent).toBeDefined();
      expect("error" in errorEvent! && errorEvent.error).toBeInstanceOf(Error);
      expect("error" in errorEvent! && errorEvent.error.message).toBe("encrypt boom");
      expect("durationMs" in errorEvent! && errorEvent.durationMs).toBeGreaterThanOrEqual(0);
    });

    test("emits TransactionError (not EncryptError) when writeContract fails", async ({
      createSDK,
      signer,
      tokenAddress,
    }) => {
      vi.mocked(signer.writeContract!).mockRejectedValue(new Error("tx reverted"));
      const { token, events } = setupSdkWithEvents({ createSDK, tokenAddress });

      await expect(
        token.confidentialTransfer("0x8b8b8b8b8B8B8b8B8B8b8b8b8b8B8B8B8B8b8B8b" as Address, 100n, {
          skipBalanceCheck: true,
        }),
      ).rejects.toThrow();

      const types = events.map((e) => e.type);
      expect(types).toContain(ZamaSDKEvents.EncryptEnd);
      expect(types).not.toContain(ZamaSDKEvents.EncryptError);

      const txError = events.find((e) => e.type === ZamaSDKEvents.TransactionError);
      expect(txError).toBeDefined();
      expect("operation" in txError! && txError.operation).toBe("transfer");
      expect("error" in txError! && txError.error).toBeInstanceOf(TransactionRevertedError);
      expect("error" in txError! && txError.error.message).toBe(
        "Transaction failed during transfer",
      );
      expect("error" in txError! && txError.error.cause).toBeInstanceOf(Error);
      expect("error" in txError! && (txError.error.cause as Error).message).toBe("tx reverted");
    });
  });

  describe("confidentialTransferFrom events", () => {
    test("emits EncryptStart, EncryptEnd, TransferFromSubmitted", async ({
      createSDK,
      tokenAddress,
    }) => {
      const { token, events } = setupSdkWithEvents({ createSDK, tokenAddress });
      await token.confidentialTransferFrom(
        "0xcccccccccccccccccccccccccccccccccccccccc" as Address,
        "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" as Address,
        200n,
      );

      const types = events.map((e) => e.type);
      expect(types).toContain(ZamaSDKEvents.EncryptStart);
      expect(types).toContain(ZamaSDKEvents.EncryptEnd);
      expect(types).toContain(ZamaSDKEvents.TransferFromSubmitted);
    });
  });

  describe("setOperator events", () => {
    test("emits SetOperatorSubmitted", async ({ createSDK, tokenAddress }) => {
      const { token, events } = setupSdkWithEvents({ createSDK, tokenAddress });
      await token.setOperator("0x3C3C3C3C3c3C3c3C3C3C3C3C3c3c3c3c3c3c3c3C" as Address);

      const types = events.map((e) => e.type);
      expect(types).toContain(ZamaSDKEvents.SetOperatorSubmitted);
    });

    test("includes txHash on SetOperatorSubmitted event", async ({ createSDK, tokenAddress }) => {
      const { token, events } = setupSdkWithEvents({ createSDK, tokenAddress });
      await token.setOperator("0x3C3C3C3C3c3C3c3C3C3C3C3C3c3c3c3c3c3c3c3C" as Address);

      const submitted = events.find((e) => e.type === ZamaSDKEvents.SetOperatorSubmitted);
      expect(submitted).toBeDefined();
      expect("txHash" in submitted! && submitted.txHash).toBe("0xtxhash");
    });
  });

  describe("shield events", () => {
    test("emits ShieldSubmitted for ERC-20 shield", async ({
      createSDK,
      tokenAddress,
      provider,
    }) => {
      vi.mocked(provider.readContract)
        .mockResolvedValueOnce("0x9C9c9c9c9c9c9C9c9c9C9C9c9c9C9c9c9c9c9C9c") // underlying
        .mockResolvedValueOnce(false) // supportsInterface (ERC-1363)
        .mockResolvedValueOnce(1000n) // ERC-20 balanceOf
        .mockResolvedValueOnce(2n ** 256n - 1n); // allowance
      const { token, events } = setupSdkWithEvents({ createSDK, tokenAddress });

      await token.shield(100n);

      const types = events.map((e) => e.type);
      expect(types).toContain(ZamaSDKEvents.ShieldSubmitted);
    });
  });

  describe("unwrap events", () => {
    test("emits EncryptStart, EncryptEnd, UnwrapSubmitted", async ({ createSDK, tokenAddress }) => {
      const { token, events } = setupSdkWithEvents({ createSDK, tokenAddress });
      await token.unwrap(50n);

      const types = events.map((e) => e.type);
      expect(types).toContain(ZamaSDKEvents.EncryptStart);
      expect(types).toContain(ZamaSDKEvents.EncryptEnd);
      expect(types).toContain(ZamaSDKEvents.UnwrapSubmitted);
    });
  });

  describe("unwrapAll events", () => {
    test("emits UnwrapSubmitted", async ({ createSDK, tokenAddress }) => {
      const { token, events } = setupSdkWithEvents({ createSDK, tokenAddress });
      await token.unwrapAll();

      const types = events.map((e) => e.type);
      expect(types).toContain(ZamaSDKEvents.UnwrapSubmitted);
    });
  });

  describe("finalizeUnwrap events", () => {
    test("emits DecryptStart, DecryptEnd, FinalizeUnwrapSubmitted", async ({
      createSDK,
      tokenAddress,
    }) => {
      const { token, events } = setupSdkWithEvents({ createSDK, tokenAddress });
      await token.finalizeUnwrap("0xburn" as Address);

      const types = events.map((e) => e.type);
      expect(types).toContain(ZamaSDKEvents.FinalizeUnwrapSubmitted);
    });
  });

  describe("approveUnderlying events", () => {
    test("emits ApproveUnderlyingSubmitted with approve step", async ({
      createSDK,
      tokenAddress,
      provider,
    }) => {
      vi.mocked(provider.readContract)
        .mockResolvedValueOnce("0x9C9c9c9c9c9c9C9c9c9C9C9c9c9C9c9c9c9c9C9c")
        .mockResolvedValueOnce(0n);
      const { token, events } = setupSdkWithEvents({ createSDK, tokenAddress });
      await token.approveUnderlying(100n);

      const types = events.map((e) => e.type);
      expect(types).toContain(ZamaSDKEvents.ApproveUnderlyingSubmitted);
      const submitted = events.find((e) => e.type === ZamaSDKEvents.ApproveUnderlyingSubmitted);
      expect(submitted).toMatchObject({ step: "approve" });
    });

    test("distinguishes reset and approve submissions", async ({
      createSDK,
      tokenAddress,
      provider,
    }) => {
      vi.mocked(provider.readContract)
        .mockResolvedValueOnce("0x9C9c9c9c9c9c9C9c9c9C9C9c9c9C9c9c9c9c9C9c")
        .mockResolvedValueOnce(50n);
      const { token, events } = setupSdkWithEvents({ createSDK, tokenAddress });
      await token.approveUnderlying(100n);

      expect(
        events
          .filter((e) => e.type === ZamaSDKEvents.ApproveUnderlyingSubmitted)
          .map((e) => e.step),
      ).toEqual(["reset", "approve"]);
    });
  });

  describe("unshield event sequence", () => {
    function mockReceiptWithUnwrapRequested(provider: GenericProvider, userAddress: Address) {
      vi.mocked(provider.waitForTransactionReceipt).mockResolvedValue({
        logs: [
          {
            topics: [
              Topics.UnwrapRequested,
              `0x000000000000000000000000${userAddress.slice(2)}`,
              `0x${"ff".repeat(32)}`,
            ],
            data: `0x${"ff".repeat(32)}`,
          },
        ],
      });
    }

    test("emits full unshield event sequence in order", async ({
      createSDK,
      tokenAddress,
      userAddress,
      provider,
    }) => {
      const { token, events } = setupSdkWithEvents({ createSDK, tokenAddress });
      mockReceiptWithUnwrapRequested(provider, userAddress);

      await token.unshield(50n, { skipBalanceCheck: true });

      const types = events.map((e) => e.type);
      expect(types).toContain(ZamaSDKEvents.EncryptStart);
      expect(types).toContain(ZamaSDKEvents.EncryptEnd);
      expect(types).toContain(ZamaSDKEvents.UnwrapSubmitted);
      expect(types).toContain(ZamaSDKEvents.UnshieldPhase1Submitted);
      expect(types).toContain(ZamaSDKEvents.UnshieldPhase2Started);
      expect(types).toContain(ZamaSDKEvents.FinalizeUnwrapSubmitted);
      expect(types).toContain(ZamaSDKEvents.UnshieldPhase2Submitted);

      const phase1Idx = types.indexOf(ZamaSDKEvents.UnshieldPhase1Submitted);
      const phase2StartIdx = types.indexOf(ZamaSDKEvents.UnshieldPhase2Started);
      const phase2SubmitIdx = types.indexOf(ZamaSDKEvents.UnshieldPhase2Submitted);
      expect(phase1Idx).toBeLessThan(phase2StartIdx);
      expect(phase2StartIdx).toBeLessThan(phase2SubmitIdx);
    });

    test("includes txHash on phase events", async ({
      createSDK,
      tokenAddress,
      userAddress,
      provider,
    }) => {
      const { token, events } = setupSdkWithEvents({ createSDK, tokenAddress });
      mockReceiptWithUnwrapRequested(provider, userAddress);

      await token.unshield(50n, { skipBalanceCheck: true });

      const phase1 = events.find((e) => e.type === ZamaSDKEvents.UnshieldPhase1Submitted);
      expect(phase1).toBeDefined();
      expect("txHash" in phase1! && phase1.txHash).toBeTruthy();

      const phase2 = events.find((e) => e.type === ZamaSDKEvents.UnshieldPhase2Submitted);
      expect(phase2).toBeDefined();
      expect("txHash" in phase2! && phase2.txHash).toBeTruthy();
    });

    test("shares the same operationId across all unshield phase events", async ({
      createSDK,
      tokenAddress,
      userAddress,
      provider,
    }) => {
      const { token, events } = setupSdkWithEvents({ createSDK, tokenAddress });
      mockReceiptWithUnwrapRequested(provider, userAddress);

      await token.unshield(50n, { skipBalanceCheck: true });

      const phaseEvents = events.filter(
        (e) =>
          e.type === ZamaSDKEvents.UnshieldPhase1Submitted ||
          e.type === ZamaSDKEvents.UnshieldPhase2Started ||
          e.type === ZamaSDKEvents.UnshieldPhase2Submitted,
      );
      expect(phaseEvents).toHaveLength(3);

      const ids = phaseEvents.map((e) => e.operationId);
      expect(ids[0]).toBeTruthy();
      expect(ids[0]).toBe(ids[1]);
      expect(ids[1]).toBe(ids[2]);
    });
  });

  describe("TransactionError events", () => {
    test("emits TransactionError with operation 'shield:approveAndWrap' on shield failure", async ({
      createSDK,
      signer,
      tokenAddress,
      provider,
    }) => {
      vi.mocked(provider.readContract)
        .mockResolvedValueOnce("0x9C9c9c9c9c9c9C9c9c9C9C9c9c9C9c9c9c9c9C9c")
        .mockResolvedValueOnce(false) // supportsInterface (ERC-1363)
        .mockResolvedValueOnce(1000n);
      vi.mocked(signer.writeContract!).mockRejectedValue(new Error("shield failed"));
      const { token, events } = setupSdkWithEvents({ createSDK, tokenAddress });

      await expect(token.shield(100n, { approvalStrategy: "skip" })).rejects.toThrow();

      const txError = events.find((e) => e.type === ZamaSDKEvents.TransactionError);
      expect(txError).toBeDefined();
      expect("operation" in txError! && txError.operation).toBe("shield:approveAndWrap");
    });

    test("emits TransactionError with operation 'setOperator' on setOperator failure", async ({
      createSDK,
      signer,
      tokenAddress,
    }) => {
      vi.mocked(signer.writeContract!).mockRejectedValue(new Error("setOperator failed"));
      const { token, events } = setupSdkWithEvents({ createSDK, tokenAddress });

      await expect(
        token.setOperator("0x3C3C3C3C3c3C3c3C3C3C3C3C3c3c3c3c3c3c3c3C" as Address),
      ).rejects.toThrow();

      const txError = events.find((e) => e.type === ZamaSDKEvents.TransactionError);
      expect(txError).toBeDefined();
      expect("operation" in txError! && txError.operation).toBe("setOperator");
    });

    test("emits TransactionError with operation 'unwrap' on unwrap write failure", async ({
      createSDK,
      signer,
      tokenAddress,
    }) => {
      vi.mocked(signer.writeContract!).mockRejectedValue(new Error("unwrap failed"));
      const { token, events } = setupSdkWithEvents({ createSDK, tokenAddress });

      await expect(token.unwrap(50n)).rejects.toThrow();

      const txError = events.find((e) => e.type === ZamaSDKEvents.TransactionError);
      expect(txError).toBeDefined();
      expect("operation" in txError! && txError.operation).toBe("unwrap");
    });

    test("emits TransactionError with operation 'finalizeUnwrap' on finalize write failure", async ({
      createSDK,
      signer,
      tokenAddress,
    }) => {
      vi.mocked(signer.writeContract!).mockRejectedValue(new Error("finalize tx failed"));
      const { token, events } = setupSdkWithEvents({ createSDK, tokenAddress });

      await expect(token.finalizeUnwrap("0xburn" as Address)).rejects.toThrow();

      const txError = events.find((e) => e.type === ZamaSDKEvents.TransactionError);
      expect(txError).toBeDefined();
      expect("operation" in txError! && txError.operation).toBe("finalizeUnwrap");
    });
  });
});
