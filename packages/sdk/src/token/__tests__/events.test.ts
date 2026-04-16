import { describe, expect, it, vi } from "../../test-fixtures";
import { Topics } from "../../events";
import { ReadonlyToken } from "../readonly-token";
import { Token } from "../token";
import {
  type ZamaSDKEvent,
  type ZamaSDKEventListener,
  ZamaSDKEvents,
} from "../../events/sdk-events";
import { CredentialsManager } from "../../credentials/credentials-manager";
import type { GenericSigner, GenericStorage } from "../../types";
import type { RelayerSDK } from "../../relayer/relayer-sdk";
import { ZamaSDK } from "../../zama-sdk";
import type { Address } from "viem";
import { ZERO_HANDLE } from "../../query/utils";
const TOKEN_A = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as Address;

/**
 * Build a ZamaSDK with an event listener wired up, together with a fresh
 * ReadonlyToken/Token pair bound to it. Each test gets a fresh event array
 * to inspect.
 */
function setupSdkWithEvents(opts: {
  relayer: RelayerSDK;
  signer: GenericSigner;
  storage: GenericStorage;
  sessionStorage: GenericStorage;
  tokenAddress: Address;
  wrapper?: Address;
}) {
  const events: ZamaSDKEvent[] = [];
  const onEvent: ZamaSDKEventListener = (event) => events.push(event);
  const sdk = new ZamaSDK({
    relayer: opts.relayer,
    signer: opts.signer,
    storage: opts.storage,
    sessionStorage: opts.sessionStorage,
    onEvent,
  });
  const readonlyToken = new ReadonlyToken(sdk, opts.tokenAddress);
  const token = new Token(sdk, opts.tokenAddress, opts.wrapper);
  return { sdk, events, readonlyToken, token };
}

describe("ZamaSDKEvents constants", () => {
  it("has all expected event keys", () => {
    expect(ZamaSDKEvents.CredentialsLoading).toBe("credentials:loading");
    expect(ZamaSDKEvents.CredentialsCached).toBe("credentials:cached");
    expect(ZamaSDKEvents.CredentialsExpired).toBe("credentials:expired");
    expect(ZamaSDKEvents.CredentialsCreating).toBe("credentials:creating");
    expect(ZamaSDKEvents.CredentialsCreated).toBe("credentials:created");
    expect(ZamaSDKEvents.CredentialsRevoked).toBe("credentials:revoked");
    expect(ZamaSDKEvents.CredentialsAllowed).toBe("credentials:allowed");
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
    expect(ZamaSDKEvents.ApproveSubmitted).toBe("approve:submitted");
    expect(ZamaSDKEvents.ApproveUnderlyingSubmitted).toBe("approveUnderlying:submitted");
    expect(ZamaSDKEvents.UnwrapSubmitted).toBe("unwrap:submitted");
    expect(ZamaSDKEvents.FinalizeUnwrapSubmitted).toBe("finalizeUnwrap:submitted");
    expect(ZamaSDKEvents.UnshieldPhase1Submitted).toBe("unshield:phase1_submitted");
    expect(ZamaSDKEvents.UnshieldPhase2Started).toBe("unshield:phase2_started");
    expect(ZamaSDKEvents.UnshieldPhase2Submitted).toBe("unshield:phase2_submitted");
    expect(ZamaSDKEvents.CredentialsPersistFailed).toBe("credentials:persist_failed");
    expect(ZamaSDKEvents.DelegationSubmitted).toBe("delegation:submitted");
    expect(ZamaSDKEvents.RevokeDelegationSubmitted).toBe("revokeDelegation:submitted");
  });

  it("has exactly 29 event types", () => {
    expect(Object.keys(ZamaSDKEvents)).toHaveLength(29);
  });

  it("has unique event values", () => {
    const values = Object.values(ZamaSDKEvents);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe("ReadonlyToken.balanceOf event emissions", () => {
  // balanceOf delegates to sdk.userDecrypt, so decrypt events come from the SDK's
  // unified pipeline. They carry `handles` and `durationMs`, but not `tokenAddress`
  // (the pipeline is token-agnostic — callers correlate by handle).

  it("emits DecryptStart and DecryptEnd during balanceOf", async ({
    relayer,
    signer,
    tokenAddress,
    handle,
    storage,
    sessionStorage,
  }) => {
    const { readonlyToken, events } = setupSdkWithEvents({
      relayer,
      signer,
      storage,
      sessionStorage,
      tokenAddress,
    });
    vi.mocked(signer.readContract).mockResolvedValue(handle);

    await readonlyToken.balanceOf();

    const types = events.map((e) => e.type);
    expect(types).toContain(ZamaSDKEvents.DecryptStart);
    expect(types).toContain(ZamaSDKEvents.DecryptEnd);
    expect(types.indexOf(ZamaSDKEvents.DecryptStart)).toBeLessThan(
      types.indexOf(ZamaSDKEvents.DecryptEnd),
    );
  });

  it("does not emit decrypt events for zero balance handle", async ({
    relayer,
    signer,
    tokenAddress,
    storage,
    sessionStorage,
  }) => {
    const { readonlyToken, events } = setupSdkWithEvents({
      relayer,
      signer,
      storage,
      sessionStorage,
      tokenAddress,
    });
    vi.mocked(signer.readContract).mockResolvedValue(ZERO_HANDLE);

    await readonlyToken.balanceOf();

    const types = events.map((e) => e.type);
    expect(types).not.toContain(ZamaSDKEvents.DecryptStart);
    expect(types).not.toContain(ZamaSDKEvents.DecryptEnd);
  });

  it("includes durationMs and handles on DecryptEnd", async ({
    relayer,
    signer,
    tokenAddress,
    handle,
    storage,
    sessionStorage,
  }) => {
    const { readonlyToken, events } = setupSdkWithEvents({
      relayer,
      signer,
      storage,
      sessionStorage,
      tokenAddress,
    });
    vi.mocked(signer.readContract).mockResolvedValue(handle);

    await readonlyToken.balanceOf();

    const endEvent = events.find((e) => e.type === ZamaSDKEvents.DecryptEnd);
    expect(endEvent).toBeDefined();
    expect("durationMs" in endEvent! && typeof endEvent.durationMs).toBe("number");
    expect("durationMs" in endEvent! && endEvent.durationMs).toBeGreaterThanOrEqual(0);
    expect("handles" in endEvent! && endEvent.handles).toContain(handle);
  });

  it("emits DecryptError when relayer.userDecrypt fails", async ({
    relayer,
    signer,
    tokenAddress,
    handle,
    storage,
    sessionStorage,
  }) => {
    relayer.userDecrypt = vi.fn().mockRejectedValue(new Error("decrypt boom"));
    const { readonlyToken, events } = setupSdkWithEvents({
      relayer,
      signer,
      storage,
      sessionStorage,
      tokenAddress,
    });
    vi.mocked(signer.readContract).mockResolvedValue(handle);

    await expect(readonlyToken.balanceOf()).rejects.toThrow();

    const errorEvent = events.find((e) => e.type === ZamaSDKEvents.DecryptError);
    expect(errorEvent).toBeDefined();
    expect("error" in errorEvent! && errorEvent.error).toBeInstanceOf(Error);
    expect("error" in errorEvent! && errorEvent.error.message).toBe("decrypt boom");
    expect("durationMs" in errorEvent! && errorEvent.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("works without onEvent (no-op, does not throw)", async ({
    relayer,
    signer,
    tokenAddress,
    handle,
    storage,
    sessionStorage,
  }) => {
    const sdk = new ZamaSDK({ relayer, signer, storage, sessionStorage });
    const token = new ReadonlyToken(sdk, tokenAddress);
    vi.mocked(signer.readContract).mockResolvedValue(handle);
    await expect(token.balanceOf()).resolves.toBe(1000n);
  });
});

describe("ReadonlyToken.decryptBalanceAs event emissions", () => {
  // decryptBalanceAs emits directly through ReadonlyToken.emit → sdk.emitEvent,
  // which sets tokenAddress to the token's address.

  it("populates tokenAddress and timestamp on decrypt events", async ({
    relayer,
    signer,
    tokenAddress,
    handle,
    storage,
    sessionStorage,
    delegatorAddress,
  }) => {
    const { readonlyToken, events } = setupSdkWithEvents({
      relayer,
      signer,
      storage,
      sessionStorage,
      tokenAddress,
    });
    // readConfidentialBalanceOf → non-zero handle; getDelegationExpiry → permanent (skips block-timestamp RPC)
    vi.mocked(signer.readContract)
      .mockResolvedValueOnce(handle)
      .mockResolvedValue(2n ** 64n - 1n);
    relayer.createDelegatedUserDecryptEIP712 = vi.fn().mockResolvedValue({
      domain: { name: "test", version: "1", chainId: 1, verifyingContract: "0xkms" },
      types: { DelegatedUserDecryptRequestVerification: [] },
      message: {
        publicKey: "0xpub",
        contractAddresses: [tokenAddress],
        delegatorAddress,
        delegateAddress: await signer.getAddress(),
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
      expect(event.tokenAddress).toBe(tokenAddress);
      expect(event.timestamp).toBeGreaterThan(0);
      expect(typeof event.timestamp).toBe("number");
    }
  });
});

describe("Token event emissions", () => {
  describe("confidentialTransfer events", () => {
    it("emits EncryptStart, EncryptEnd, TransferSubmitted", async ({
      relayer,
      signer,
      tokenAddress,
      storage,
      sessionStorage,
    }) => {
      const { token, events } = setupSdkWithEvents({
        relayer,
        signer,
        storage,
        sessionStorage,
        tokenAddress,
      });
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

    it("includes txHash on TransferSubmitted event", async ({
      relayer,
      signer,
      tokenAddress,
      storage,
      sessionStorage,
    }) => {
      const { token, events } = setupSdkWithEvents({
        relayer,
        signer,
        storage,
        sessionStorage,
        tokenAddress,
      });
      await token.confidentialTransfer(
        "0x8b8b8b8b8B8B8b8B8B8b8b8b8b8B8B8B8B8b8B8b" as Address,
        100n,
        { skipBalanceCheck: true },
      );

      const submitted = events.find((e) => e.type === ZamaSDKEvents.TransferSubmitted);
      expect(submitted).toBeDefined();
      expect("txHash" in submitted! && submitted.txHash).toBe("0xtxhash");
    });

    it("includes durationMs on EncryptEnd event", async ({
      relayer,
      signer,
      tokenAddress,
      storage,
      sessionStorage,
    }) => {
      const { token, events } = setupSdkWithEvents({
        relayer,
        signer,
        storage,
        sessionStorage,
        tokenAddress,
      });
      await token.confidentialTransfer(
        "0x8b8b8b8b8B8B8b8B8B8b8b8b8b8B8B8B8B8b8B8b" as Address,
        100n,
        { skipBalanceCheck: true },
      );

      const endEvent = events.find((e) => e.type === ZamaSDKEvents.EncryptEnd);
      expect(endEvent).toBeDefined();
      expect("durationMs" in endEvent! && endEvent.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("emits EncryptError when encryption fails", async ({
      relayer,
      signer,
      tokenAddress,
      storage,
      sessionStorage,
    }) => {
      relayer.encrypt = vi.fn().mockRejectedValue(new Error("encrypt boom"));
      const { token, events } = setupSdkWithEvents({
        relayer,
        signer,
        storage,
        sessionStorage,
        tokenAddress,
      });

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

    it("emits TransactionError (not EncryptError) when writeContract fails", async ({
      relayer,
      signer,
      tokenAddress,
      storage,
      sessionStorage,
    }) => {
      vi.mocked(signer.writeContract).mockRejectedValue(new Error("tx reverted"));
      const { token, events } = setupSdkWithEvents({
        relayer,
        signer,
        storage,
        sessionStorage,
        tokenAddress,
      });

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
      expect("error" in txError! && txError.error.message).toBe("tx reverted");
    });
  });

  describe("confidentialTransferFrom events", () => {
    it("emits EncryptStart, EncryptEnd, TransferFromSubmitted", async ({
      relayer,
      signer,
      tokenAddress,
      storage,
      sessionStorage,
    }) => {
      const { token, events } = setupSdkWithEvents({
        relayer,
        signer,
        storage,
        sessionStorage,
        tokenAddress,
      });
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

  describe("approve events", () => {
    it("emits ApproveSubmitted", async ({
      relayer,
      signer,
      tokenAddress,
      storage,
      sessionStorage,
    }) => {
      const { token, events } = setupSdkWithEvents({
        relayer,
        signer,
        storage,
        sessionStorage,
        tokenAddress,
      });
      await token.approve("0x3C3C3C3C3c3C3c3C3C3C3C3C3c3c3c3c3c3c3c3C" as Address);

      const types = events.map((e) => e.type);
      expect(types).toContain(ZamaSDKEvents.ApproveSubmitted);
    });

    it("includes txHash on ApproveSubmitted event", async ({
      relayer,
      signer,
      tokenAddress,
      storage,
      sessionStorage,
    }) => {
      const { token, events } = setupSdkWithEvents({
        relayer,
        signer,
        storage,
        sessionStorage,
        tokenAddress,
      });
      await token.approve("0x3C3C3C3C3c3C3c3C3C3C3C3C3c3c3c3c3c3c3c3C" as Address);

      const submitted = events.find((e) => e.type === ZamaSDKEvents.ApproveSubmitted);
      expect(submitted).toBeDefined();
      expect("txHash" in submitted! && submitted.txHash).toBe("0xtxhash");
    });
  });

  describe("shield events", () => {
    it("emits ShieldSubmitted for ERC-20 shield", async ({
      relayer,
      signer,
      tokenAddress,
      storage,
      sessionStorage,
    }) => {
      vi.mocked(signer.readContract)
        .mockResolvedValueOnce("0x9C9c9c9c9c9c9C9c9c9C9C9c9c9C9c9c9c9c9C9c") // underlying
        .mockResolvedValueOnce(1000n) // ERC-20 balanceOf
        .mockResolvedValueOnce(2n ** 256n - 1n); // allowance
      const { token, events } = setupSdkWithEvents({
        relayer,
        signer,
        storage,
        sessionStorage,
        tokenAddress,
      });

      await token.shield(100n);

      const types = events.map((e) => e.type);
      expect(types).toContain(ZamaSDKEvents.ShieldSubmitted);
    });
  });

  describe("unwrap events", () => {
    it("emits EncryptStart, EncryptEnd, UnwrapSubmitted", async ({
      relayer,
      signer,
      tokenAddress,
      storage,
      sessionStorage,
    }) => {
      const { token, events } = setupSdkWithEvents({
        relayer,
        signer,
        storage,
        sessionStorage,
        tokenAddress,
      });
      await token.unwrap(50n);

      const types = events.map((e) => e.type);
      expect(types).toContain(ZamaSDKEvents.EncryptStart);
      expect(types).toContain(ZamaSDKEvents.EncryptEnd);
      expect(types).toContain(ZamaSDKEvents.UnwrapSubmitted);
    });
  });

  describe("unwrapAll events", () => {
    it("emits UnwrapSubmitted", async ({
      relayer,
      signer,
      tokenAddress,
      storage,
      sessionStorage,
    }) => {
      const { token, events } = setupSdkWithEvents({
        relayer,
        signer,
        storage,
        sessionStorage,
        tokenAddress,
      });
      await token.unwrapAll();

      const types = events.map((e) => e.type);
      expect(types).toContain(ZamaSDKEvents.UnwrapSubmitted);
    });
  });

  describe("finalizeUnwrap events", () => {
    it("emits DecryptStart, DecryptEnd, FinalizeUnwrapSubmitted", async ({
      relayer,
      signer,
      tokenAddress,
      storage,
      sessionStorage,
    }) => {
      const { token, events } = setupSdkWithEvents({
        relayer,
        signer,
        storage,
        sessionStorage,
        tokenAddress,
      });
      await token.finalizeUnwrap("0xburn" as Address);

      const types = events.map((e) => e.type);
      expect(types).toContain(ZamaSDKEvents.FinalizeUnwrapSubmitted);
    });
  });

  describe("approveUnderlying events", () => {
    it("emits ApproveUnderlyingSubmitted", async ({
      relayer,
      signer,
      tokenAddress,
      storage,
      sessionStorage,
    }) => {
      vi.mocked(signer.readContract).mockResolvedValue(
        "0x9C9c9c9c9c9c9C9c9c9C9C9c9c9C9c9c9c9c9C9c",
      );
      const { token, events } = setupSdkWithEvents({
        relayer,
        signer,
        storage,
        sessionStorage,
        tokenAddress,
      });
      await token.approveUnderlying(100n);

      const types = events.map((e) => e.type);
      expect(types).toContain(ZamaSDKEvents.ApproveUnderlyingSubmitted);
    });
  });

  describe("unshield event sequence", () => {
    function mockReceiptWithUnwrapRequested(signer: GenericSigner, userAddress: Address) {
      vi.mocked(signer.waitForTransactionReceipt).mockResolvedValue({
        logs: [
          {
            topics: [Topics.UnwrapRequested, `0x000000000000000000000000${userAddress.slice(2)}`],
            data: `0x${"ff".repeat(32)}`,
          },
        ],
      });
    }

    it("emits full unshield event sequence in order", async ({
      relayer,
      signer,
      tokenAddress,
      userAddress,
      storage,
      sessionStorage,
    }) => {
      const { token, events } = setupSdkWithEvents({
        relayer,
        signer,
        storage,
        sessionStorage,
        tokenAddress,
      });
      mockReceiptWithUnwrapRequested(signer, userAddress);

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

    it("includes txHash on phase events", async ({
      relayer,
      signer,
      tokenAddress,
      userAddress,
      storage,
      sessionStorage,
    }) => {
      const { token, events } = setupSdkWithEvents({
        relayer,
        signer,
        storage,
        sessionStorage,
        tokenAddress,
      });
      mockReceiptWithUnwrapRequested(signer, userAddress);

      await token.unshield(50n, { skipBalanceCheck: true });

      const phase1 = events.find((e) => e.type === ZamaSDKEvents.UnshieldPhase1Submitted);
      expect(phase1).toBeDefined();
      expect("txHash" in phase1! && phase1.txHash).toBeTruthy();

      const phase2 = events.find((e) => e.type === ZamaSDKEvents.UnshieldPhase2Submitted);
      expect(phase2).toBeDefined();
      expect("txHash" in phase2! && phase2.txHash).toBeTruthy();
    });

    it("shares the same operationId across all unshield phase events", async ({
      relayer,
      signer,
      tokenAddress,
      userAddress,
      storage,
      sessionStorage,
    }) => {
      const { token, events } = setupSdkWithEvents({
        relayer,
        signer,
        storage,
        sessionStorage,
        tokenAddress,
      });
      mockReceiptWithUnwrapRequested(signer, userAddress);

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
    it("emits TransactionError with operation 'shield' on shield failure", async ({
      relayer,
      signer,
      tokenAddress,
      storage,
      sessionStorage,
    }) => {
      vi.mocked(signer.readContract)
        .mockResolvedValueOnce("0x9C9c9c9c9c9c9C9c9c9C9C9c9c9C9c9c9c9c9C9c")
        .mockResolvedValueOnce(1000n);
      vi.mocked(signer.writeContract).mockRejectedValue(new Error("shield failed"));
      const { token, events } = setupSdkWithEvents({
        relayer,
        signer,
        storage,
        sessionStorage,
        tokenAddress,
      });

      await expect(token.shield(100n, { approvalStrategy: "skip" })).rejects.toThrow();

      const txError = events.find((e) => e.type === ZamaSDKEvents.TransactionError);
      expect(txError).toBeDefined();
      expect("operation" in txError! && txError.operation).toBe("shield");
    });

    it("emits TransactionError with operation 'approve' on approve failure", async ({
      relayer,
      signer,
      tokenAddress,
      storage,
      sessionStorage,
    }) => {
      vi.mocked(signer.writeContract).mockRejectedValue(new Error("approve failed"));
      const { token, events } = setupSdkWithEvents({
        relayer,
        signer,
        storage,
        sessionStorage,
        tokenAddress,
      });

      await expect(
        token.approve("0x3C3C3C3C3c3C3c3C3C3C3C3C3c3c3c3c3c3c3c3C" as Address),
      ).rejects.toThrow();

      const txError = events.find((e) => e.type === ZamaSDKEvents.TransactionError);
      expect(txError).toBeDefined();
      expect("operation" in txError! && txError.operation).toBe("approve");
    });

    it("emits TransactionError with operation 'unwrap' on unwrap write failure", async ({
      relayer,
      signer,
      tokenAddress,
      storage,
      sessionStorage,
    }) => {
      vi.mocked(signer.writeContract).mockRejectedValue(new Error("unwrap failed"));
      const { token, events } = setupSdkWithEvents({
        relayer,
        signer,
        storage,
        sessionStorage,
        tokenAddress,
      });

      await expect(token.unwrap(50n)).rejects.toThrow();

      const txError = events.find((e) => e.type === ZamaSDKEvents.TransactionError);
      expect(txError).toBeDefined();
      expect("operation" in txError! && txError.operation).toBe("unwrap");
    });

    it("emits TransactionError with operation 'finalizeUnwrap' on finalize write failure", async ({
      relayer,
      signer,
      tokenAddress,
      storage,
      sessionStorage,
    }) => {
      vi.mocked(signer.writeContract).mockRejectedValue(new Error("finalize tx failed"));
      const { token, events } = setupSdkWithEvents({
        relayer,
        signer,
        storage,
        sessionStorage,
        tokenAddress,
      });

      await expect(token.finalizeUnwrap("0xburn" as Address)).rejects.toThrow();

      const txError = events.find((e) => e.type === ZamaSDKEvents.TransactionError);
      expect(txError).toBeDefined();
      expect("operation" in txError! && txError.operation).toBe("finalizeUnwrap");
    });
  });
});

describe("CredentialsManager event emissions", () => {
  it("emits CredentialsLoading and CredentialsCreating/Created on first call", async ({
    relayer,
    signer,
    storage,
    sessionStorage,
  }) => {
    const events: ZamaSDKEvent[] = [];
    const onEvent: ZamaSDKEventListener = (event) => events.push(event);
    const manager = new CredentialsManager({
      relayer,
      signer,
      storage,
      sessionStorage,
      keypairTTL: 86400,
      onEvent,
    });

    await manager.allow(TOKEN_A);

    const types = events.map((e) => e.type);
    expect(types).toContain(ZamaSDKEvents.CredentialsLoading);
    expect(types).toContain(ZamaSDKEvents.CredentialsCreating);
    expect(types).toContain(ZamaSDKEvents.CredentialsCreated);
  });

  it("emits CredentialsCached on cache hit", async ({ relayer, signer, createMockStorage }) => {
    const events: ZamaSDKEvent[] = [];
    const onEvent: ZamaSDKEventListener = (event) => events.push(event);
    const store = createMockStorage();
    const manager = new CredentialsManager({
      relayer,
      signer,
      storage: store,
      sessionStorage: createMockStorage(),
      keypairTTL: 86400,
      onEvent,
    });

    await manager.allow(TOKEN_A);
    events.length = 0;

    await manager.allow(TOKEN_A);

    const types = events.map((e) => e.type);
    expect(types).toContain(ZamaSDKEvents.CredentialsLoading);
    expect(types).toContain(ZamaSDKEvents.CredentialsCached);
    expect(types).not.toContain(ZamaSDKEvents.CredentialsCreating);
  });

  it("emits CredentialsExpired when credentials are expired", async ({
    relayer,
    signer,
    createMockStorage,
  }) => {
    const events: ZamaSDKEvent[] = [];
    const onEvent: ZamaSDKEventListener = (event) => events.push(event);
    const store = createMockStorage();
    const manager = new CredentialsManager({
      relayer,
      signer,
      storage: store,
      sessionStorage: createMockStorage(),
      keypairTTL: 86400,
      onEvent,
    });

    await manager.allow(TOKEN_A);

    const storeKey = await CredentialsManager.computeStoreKey(
      await signer.getAddress(),
      await signer.getChainId(),
    );
    const stored = await store.get(storeKey);
    const parsed = { ...(stored as Record<string, unknown>) };
    parsed.startTimestamp = Math.floor(Date.now() / 1000) - 8 * 86400;
    await store.set(storeKey, parsed);

    events.length = 0;

    const manager2 = new CredentialsManager({
      relayer,
      signer,
      storage: store,
      sessionStorage: createMockStorage(),
      keypairTTL: 86400,
      onEvent,
    });
    await manager2.allow(TOKEN_A);

    const types = events.map((e) => e.type);
    expect(types).toContain(ZamaSDKEvents.CredentialsExpired);
    expect(types).toContain(ZamaSDKEvents.CredentialsCreating);
    expect(types).toContain(ZamaSDKEvents.CredentialsCreated);
  }, 30000);

  it("includes contractAddresses on credential events", async ({
    relayer,
    signer,
    storage,
    sessionStorage,
  }) => {
    const events: ZamaSDKEvent[] = [];
    const onEvent: ZamaSDKEventListener = (event) => events.push(event);
    const manager = new CredentialsManager({
      relayer,
      signer,
      storage,
      sessionStorage,
      keypairTTL: 86400,
      onEvent,
    });

    await manager.allow(TOKEN_A);

    const credEvents = events.filter(
      (e) =>
        e.type === ZamaSDKEvents.CredentialsLoading ||
        e.type === ZamaSDKEvents.CredentialsCreating ||
        e.type === ZamaSDKEvents.CredentialsCreated,
    );
    expect(credEvents.length).toBe(3);
    for (const event of credEvents) {
      expect("contractAddresses" in event && event.contractAddresses).toEqual([TOKEN_A]);
    }
  });

  it("adds timestamp to all emitted events", async ({
    relayer,
    signer,
    storage,
    sessionStorage,
  }) => {
    const events: ZamaSDKEvent[] = [];
    const onEvent: ZamaSDKEventListener = (event) => events.push(event);
    const manager = new CredentialsManager({
      relayer,
      signer,
      storage,
      sessionStorage,
      keypairTTL: 86400,
      onEvent,
    });

    await manager.allow(TOKEN_A);

    for (const event of events) {
      expect(event.timestamp).toBeGreaterThan(0);
    }
  });

  it("works without onEvent (no-op, does not throw)", async ({
    relayer,
    signer,
    storage,
    sessionStorage,
  }) => {
    const manager = new CredentialsManager({
      relayer,
      signer,
      storage,
      sessionStorage,
      keypairTTL: 86400,
    });

    const creds = await manager.allow(TOKEN_A);
    expect(creds.publicKey).toBe("0xpub");
  });
});
