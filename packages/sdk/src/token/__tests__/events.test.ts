import { describe, expect, it, vi } from "../../test-fixtures";
import { Topics } from "../../events";
import type { RelayerSDK } from "../../relayer/relayer-sdk";
import type { Address } from "../../relayer/relayer-sdk.types";
import { ReadonlyToken } from "../readonly-token";
import { ZamaSDKEvents } from "../../events/sdk-events";
import type { ZamaSDKEvent, ZamaSDKEventListener } from "../../events/sdk-events";
import { computeStoreKey, CredentialsManager } from "../credentials-manager";
import type { GenericSigner, GenericStorage } from "../token.types";

const ZERO_HANDLE = "0x" + "0".repeat(64);

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
  });

  it("has exactly 25 event types", () => {
    expect(Object.keys(ZamaSDKEvents)).toHaveLength(25);
  });

  it("has unique event values", () => {
    const values = Object.values(ZamaSDKEvents);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe("ReadonlyToken event emissions", () => {
  function createReadonlyToken(
    relayer: RelayerSDK,
    signer: GenericSigner,
    onEvent: ZamaSDKEventListener,
    tokenAddress: Address,
    storage: GenericStorage,
    sessionStorage: GenericStorage,
  ) {
    return new ReadonlyToken({
      relayer,
      signer,
      storage,
      sessionStorage,
      address: tokenAddress,
      onEvent,
    });
  }

  it("emits DecryptStart and DecryptEnd during balanceOf", async ({
    relayer,
    signer,
    tokenAddress,
    handle,
    storage,
    sessionStorage,
  }) => {
    const events: ZamaSDKEvent[] = [];
    const onEvent: ZamaSDKEventListener = (event) => events.push(event);
    vi.mocked(signer.readContract).mockResolvedValue(handle);
    const token = createReadonlyToken(
      relayer,
      signer,
      onEvent,
      tokenAddress,
      storage,
      sessionStorage,
    );

    await token.balanceOf();

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
    const events: ZamaSDKEvent[] = [];
    const onEvent: ZamaSDKEventListener = (event) => events.push(event);
    vi.mocked(signer.readContract).mockResolvedValue(ZERO_HANDLE);
    const token = createReadonlyToken(
      relayer,
      signer,
      onEvent,
      tokenAddress,
      storage,
      sessionStorage,
    );

    await token.balanceOf();

    const types = events.map((e) => e.type);
    expect(types).not.toContain(ZamaSDKEvents.DecryptStart);
    expect(types).not.toContain(ZamaSDKEvents.DecryptEnd);
  });

  it("emits DecryptStart and DecryptEnd during decryptBalance", async ({
    relayer,
    signer,
    tokenAddress,
    handle,
    storage,
    sessionStorage,
  }) => {
    const events: ZamaSDKEvent[] = [];
    const onEvent: ZamaSDKEventListener = (event) => events.push(event);
    const token = createReadonlyToken(
      relayer,
      signer,
      onEvent,
      tokenAddress,
      storage,
      sessionStorage,
    );

    await token.decryptBalance(handle);

    const types = events.map((e) => e.type);
    expect(types).toContain(ZamaSDKEvents.DecryptStart);
    expect(types).toContain(ZamaSDKEvents.DecryptEnd);
  });

  it("emits DecryptStart and DecryptEnd during decryptHandles", async ({
    relayer,
    signer,
    tokenAddress,
    handle,
    storage,
    sessionStorage,
  }) => {
    const events: ZamaSDKEvent[] = [];
    const onEvent: ZamaSDKEventListener = (event) => events.push(event);
    const token = createReadonlyToken(
      relayer,
      signer,
      onEvent,
      tokenAddress,
      storage,
      sessionStorage,
    );

    await token.decryptHandles([handle]);

    const types = events.map((e) => e.type);
    expect(types).toContain(ZamaSDKEvents.DecryptStart);
    expect(types).toContain(ZamaSDKEvents.DecryptEnd);
  });

  it("populates tokenAddress and timestamp on decrypt events", async ({
    relayer,
    signer,
    tokenAddress,
    handle,
    storage,
    sessionStorage,
  }) => {
    const events: ZamaSDKEvent[] = [];
    const onEvent: ZamaSDKEventListener = (event) => events.push(event);
    vi.mocked(signer.readContract).mockResolvedValue(handle);
    const token = createReadonlyToken(
      relayer,
      signer,
      onEvent,
      tokenAddress,
      storage,
      sessionStorage,
    );

    await token.balanceOf();

    // Filter to only decrypt events (emitted by ReadonlyToken.emit, which adds tokenAddress)
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

  it("includes durationMs on DecryptEnd events", async ({
    relayer,
    signer,
    tokenAddress,
    handle,
    storage,
    sessionStorage,
  }) => {
    const events: ZamaSDKEvent[] = [];
    const onEvent: ZamaSDKEventListener = (event) => events.push(event);
    vi.mocked(signer.readContract).mockResolvedValue(handle);
    const token = createReadonlyToken(
      relayer,
      signer,
      onEvent,
      tokenAddress,
      storage,
      sessionStorage,
    );

    await token.balanceOf();

    const endEvent = events.find((e) => e.type === ZamaSDKEvents.DecryptEnd);
    expect(endEvent).toBeDefined();
    expect("durationMs" in endEvent! && typeof endEvent.durationMs).toBe("number");
    expect("durationMs" in endEvent! && endEvent.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("emits DecryptError when userDecrypt fails", async ({
    relayer,
    signer,
    tokenAddress,
    handle,
    storage,
    sessionStorage,
  }) => {
    const events: ZamaSDKEvent[] = [];
    const onEvent: ZamaSDKEventListener = (event) => events.push(event);
    vi.mocked(signer.readContract).mockResolvedValue(handle);
    relayer.userDecrypt = vi.fn().mockRejectedValue(new Error("decrypt boom"));
    const token = createReadonlyToken(
      relayer,
      signer,
      onEvent,
      tokenAddress,
      storage,
      sessionStorage,
    );

    await expect(token.balanceOf()).rejects.toThrow();

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
    const token = new ReadonlyToken({
      relayer,
      signer,
      storage,
      sessionStorage,
      address: tokenAddress,
    });

    vi.mocked(signer.readContract).mockResolvedValue(handle);
    await expect(token.balanceOf()).resolves.toBe(1000n);
  });
});

describe("Token event emissions", () => {
  function createTokenWithEvent(
    relayer: RelayerSDK,
    signer: GenericSigner,
    onEvent: ZamaSDKEventListener,
    tokenAddress: Address,
    storage: GenericStorage,
    sessionStorage: GenericStorage,
    createToken: (config: {
      relayer: RelayerSDK;
      signer: GenericSigner;
      storage: GenericStorage;
      sessionStorage: GenericStorage;
      address: Address;
      onEvent: ZamaSDKEventListener;
    }) => import("../token").Token,
  ) {
    return createToken({
      relayer,
      signer,
      storage,
      sessionStorage,
      address: tokenAddress,
      onEvent,
    });
  }

  describe("confidentialTransfer events", () => {
    it("emits EncryptStart, EncryptEnd, TransferSubmitted", async ({
      relayer,
      signer,
      tokenAddress,
      storage,
      sessionStorage,
      createToken,
    }) => {
      const events: ZamaSDKEvent[] = [];
      const onEvent: ZamaSDKEventListener = (event) => events.push(event);
      const token = createTokenWithEvent(
        relayer,
        signer,
        onEvent,
        tokenAddress,
        storage,
        sessionStorage,
        createToken,
      );
      await token.confidentialTransfer(
        "0x8888888888888888888888888888888888888888" as Address,
        100n,
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
      createToken,
    }) => {
      const events: ZamaSDKEvent[] = [];
      const onEvent: ZamaSDKEventListener = (event) => events.push(event);
      const token = createTokenWithEvent(
        relayer,
        signer,
        onEvent,
        tokenAddress,
        storage,
        sessionStorage,
        createToken,
      );
      await token.confidentialTransfer(
        "0x8888888888888888888888888888888888888888" as Address,
        100n,
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
      createToken,
    }) => {
      const events: ZamaSDKEvent[] = [];
      const onEvent: ZamaSDKEventListener = (event) => events.push(event);
      const token = createTokenWithEvent(
        relayer,
        signer,
        onEvent,
        tokenAddress,
        storage,
        sessionStorage,
        createToken,
      );
      await token.confidentialTransfer(
        "0x8888888888888888888888888888888888888888" as Address,
        100n,
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
      createToken,
    }) => {
      const events: ZamaSDKEvent[] = [];
      const onEvent: ZamaSDKEventListener = (event) => events.push(event);
      relayer.encrypt = vi.fn().mockRejectedValue(new Error("encrypt boom"));
      const token = createTokenWithEvent(
        relayer,
        signer,
        onEvent,
        tokenAddress,
        storage,
        sessionStorage,
        createToken,
      );

      await expect(
        token.confidentialTransfer("0x8888888888888888888888888888888888888888" as Address, 100n),
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
      createToken,
    }) => {
      const events: ZamaSDKEvent[] = [];
      const onEvent: ZamaSDKEventListener = (event) => events.push(event);
      vi.mocked(signer.writeContract).mockRejectedValue(new Error("tx reverted"));
      const token = createTokenWithEvent(
        relayer,
        signer,
        onEvent,
        tokenAddress,
        storage,
        sessionStorage,
        createToken,
      );

      await expect(
        token.confidentialTransfer("0x8888888888888888888888888888888888888888" as Address, 100n),
      ).rejects.toThrow();

      const types = events.map((e) => e.type);
      // Encryption succeeded, so EncryptEnd should be present, not EncryptError
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
      createToken,
    }) => {
      const events: ZamaSDKEvent[] = [];
      const onEvent: ZamaSDKEventListener = (event) => events.push(event);
      const token = createTokenWithEvent(
        relayer,
        signer,
        onEvent,
        tokenAddress,
        storage,
        sessionStorage,
        createToken,
      );
      await token.confidentialTransferFrom(
        "0xcccccccccccccccccccccccccccccccccccccccc" as Address,
        "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address,
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
      createToken,
    }) => {
      const events: ZamaSDKEvent[] = [];
      const onEvent: ZamaSDKEventListener = (event) => events.push(event);
      const token = createTokenWithEvent(
        relayer,
        signer,
        onEvent,
        tokenAddress,
        storage,
        sessionStorage,
        createToken,
      );
      await token.approve("0x3333333333333333333333333333333333333333" as Address);

      const types = events.map((e) => e.type);
      expect(types).toContain(ZamaSDKEvents.ApproveSubmitted);
    });

    it("includes txHash on ApproveSubmitted event", async ({
      relayer,
      signer,
      tokenAddress,
      storage,
      sessionStorage,
      createToken,
    }) => {
      const events: ZamaSDKEvent[] = [];
      const onEvent: ZamaSDKEventListener = (event) => events.push(event);
      const token = createTokenWithEvent(
        relayer,
        signer,
        onEvent,
        tokenAddress,
        storage,
        sessionStorage,
        createToken,
      );
      await token.approve("0x3333333333333333333333333333333333333333" as Address);

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
      createToken,
    }) => {
      const events: ZamaSDKEvent[] = [];
      const onEvent: ZamaSDKEventListener = (event) => events.push(event);
      const token = createTokenWithEvent(
        relayer,
        signer,
        onEvent,
        tokenAddress,
        storage,
        sessionStorage,
        createToken,
      );
      vi.mocked(signer.readContract).mockResolvedValueOnce(
        "0x9999999999999999999999999999999999999999",
      ); // underlying

      await token.shield(100n, { approvalStrategy: "skip" });

      const types = events.map((e) => e.type);
      expect(types).toContain(ZamaSDKEvents.ShieldSubmitted);
    });

    it("emits ShieldSubmitted for shieldETH", async ({
      relayer,
      signer,
      tokenAddress,
      storage,
      sessionStorage,
      createToken,
    }) => {
      const events: ZamaSDKEvent[] = [];
      const onEvent: ZamaSDKEventListener = (event) => events.push(event);
      const token = createTokenWithEvent(
        relayer,
        signer,
        onEvent,
        tokenAddress,
        storage,
        sessionStorage,
        createToken,
      );
      await token.shieldETH(1000n);

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
      createToken,
    }) => {
      const events: ZamaSDKEvent[] = [];
      const onEvent: ZamaSDKEventListener = (event) => events.push(event);
      const token = createTokenWithEvent(
        relayer,
        signer,
        onEvent,
        tokenAddress,
        storage,
        sessionStorage,
        createToken,
      );
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
      handle,
      storage,
      sessionStorage,
      createToken,
    }) => {
      const events: ZamaSDKEvent[] = [];
      const onEvent: ZamaSDKEventListener = (event) => events.push(event);
      const token = createTokenWithEvent(
        relayer,
        signer,
        onEvent,
        tokenAddress,
        storage,
        sessionStorage,
        createToken,
      );
      vi.mocked(signer.readContract).mockResolvedValue(handle);
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
      createToken,
    }) => {
      const events: ZamaSDKEvent[] = [];
      const onEvent: ZamaSDKEventListener = (event) => events.push(event);
      const token = createTokenWithEvent(
        relayer,
        signer,
        onEvent,
        tokenAddress,
        storage,
        sessionStorage,
        createToken,
      );
      await token.finalizeUnwrap("0xburn" as Address);

      const types = events.map((e) => e.type);
      expect(types).toContain(ZamaSDKEvents.DecryptStart);
      expect(types).toContain(ZamaSDKEvents.DecryptEnd);
      expect(types).toContain(ZamaSDKEvents.FinalizeUnwrapSubmitted);
    });

    it("emits DecryptError when publicDecrypt fails", async ({
      relayer,
      signer,
      tokenAddress,
      storage,
      sessionStorage,
      createToken,
    }) => {
      const events: ZamaSDKEvent[] = [];
      const onEvent: ZamaSDKEventListener = (event) => events.push(event);
      relayer.publicDecrypt = vi.fn().mockRejectedValue(new Error("finalize boom"));
      const token = createTokenWithEvent(
        relayer,
        signer,
        onEvent,
        tokenAddress,
        storage,
        sessionStorage,
        createToken,
      );

      await expect(token.finalizeUnwrap("0xburn" as Address)).rejects.toThrow();

      const errorEvent = events.find((e) => e.type === ZamaSDKEvents.DecryptError);
      expect(errorEvent).toBeDefined();
      expect("error" in errorEvent! && errorEvent.error).toBeInstanceOf(Error);
      expect("error" in errorEvent! && errorEvent.error.message).toBe("finalize boom");
    });
  });

  describe("approveUnderlying events", () => {
    it("emits ApproveUnderlyingSubmitted", async ({
      relayer,
      signer,
      tokenAddress,
      storage,
      sessionStorage,
      createToken,
    }) => {
      const events: ZamaSDKEvent[] = [];
      const onEvent: ZamaSDKEventListener = (event) => events.push(event);
      const token = createTokenWithEvent(
        relayer,
        signer,
        onEvent,
        tokenAddress,
        storage,
        sessionStorage,
        createToken,
      );
      vi.mocked(signer.readContract)
        .mockResolvedValueOnce("0x9999999999999999999999999999999999999999") // underlying
        .mockResolvedValueOnce(0n); // currentAllowance

      await token.approveUnderlying();

      const types = events.map((e) => e.type);
      expect(types).toContain(ZamaSDKEvents.ApproveUnderlyingSubmitted);
    });
  });

  describe("unshield event sequence", () => {
    function mockReceiptWithUnwrapRequested(signer: GenericSigner, userAddress: Address) {
      vi.mocked(signer.waitForTransactionReceipt).mockResolvedValue({
        logs: [
          {
            topics: [Topics.UnwrapRequested, "0x000000000000000000000000" + userAddress.slice(2)],
            data: "0x" + "ff".repeat(32),
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
      createToken,
    }) => {
      const events: ZamaSDKEvent[] = [];
      const onEvent: ZamaSDKEventListener = (event) => events.push(event);
      const token = createTokenWithEvent(
        relayer,
        signer,
        onEvent,
        tokenAddress,
        storage,
        sessionStorage,
        createToken,
      );
      mockReceiptWithUnwrapRequested(signer, userAddress);

      await token.unshield(50n);

      const types = events.map((e) => e.type);

      // Phase 1: encrypt + unwrap
      expect(types).toContain(ZamaSDKEvents.EncryptStart);
      expect(types).toContain(ZamaSDKEvents.EncryptEnd);
      expect(types).toContain(ZamaSDKEvents.UnwrapSubmitted);
      expect(types).toContain(ZamaSDKEvents.UnshieldPhase1Submitted);

      // Phase 2: finalize
      expect(types).toContain(ZamaSDKEvents.UnshieldPhase2Started);
      expect(types).toContain(ZamaSDKEvents.DecryptStart);
      expect(types).toContain(ZamaSDKEvents.DecryptEnd);
      expect(types).toContain(ZamaSDKEvents.FinalizeUnwrapSubmitted);
      expect(types).toContain(ZamaSDKEvents.UnshieldPhase2Submitted);

      // Phase ordering
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
      createToken,
    }) => {
      const events: ZamaSDKEvent[] = [];
      const onEvent: ZamaSDKEventListener = (event) => events.push(event);
      const token = createTokenWithEvent(
        relayer,
        signer,
        onEvent,
        tokenAddress,
        storage,
        sessionStorage,
        createToken,
      );
      mockReceiptWithUnwrapRequested(signer, userAddress);

      await token.unshield(50n);

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
      createToken,
    }) => {
      const events: ZamaSDKEvent[] = [];
      const onEvent: ZamaSDKEventListener = (event) => events.push(event);
      const token = createTokenWithEvent(
        relayer,
        signer,
        onEvent,
        tokenAddress,
        storage,
        sessionStorage,
        createToken,
      );
      mockReceiptWithUnwrapRequested(signer, userAddress);

      await token.unshield(50n);

      const phaseEvents = events.filter(
        (e) =>
          e.type === ZamaSDKEvents.UnshieldPhase1Submitted ||
          e.type === ZamaSDKEvents.UnshieldPhase2Started ||
          e.type === ZamaSDKEvents.UnshieldPhase2Submitted,
      );
      expect(phaseEvents).toHaveLength(3);

      const ids = phaseEvents.map((e) => e.operationId);
      // All three should have the same non-empty operationId
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
      createToken,
    }) => {
      const events: ZamaSDKEvent[] = [];
      const onEvent: ZamaSDKEventListener = (event) => events.push(event);
      vi.mocked(signer.readContract).mockResolvedValueOnce(
        "0x9999999999999999999999999999999999999999",
      );
      vi.mocked(signer.writeContract).mockRejectedValue(new Error("shield failed"));
      const token = createTokenWithEvent(
        relayer,
        signer,
        onEvent,
        tokenAddress,
        storage,
        sessionStorage,
        createToken,
      );

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
      createToken,
    }) => {
      const events: ZamaSDKEvent[] = [];
      const onEvent: ZamaSDKEventListener = (event) => events.push(event);
      vi.mocked(signer.writeContract).mockRejectedValue(new Error("approve failed"));
      const token = createTokenWithEvent(
        relayer,
        signer,
        onEvent,
        tokenAddress,
        storage,
        sessionStorage,
        createToken,
      );

      await expect(
        token.approve("0x3333333333333333333333333333333333333333" as Address),
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
      createToken,
    }) => {
      const events: ZamaSDKEvent[] = [];
      const onEvent: ZamaSDKEventListener = (event) => events.push(event);
      vi.mocked(signer.writeContract).mockRejectedValue(new Error("unwrap failed"));
      const token = createTokenWithEvent(
        relayer,
        signer,
        onEvent,
        tokenAddress,
        storage,
        sessionStorage,
        createToken,
      );

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
      createToken,
    }) => {
      const events: ZamaSDKEvent[] = [];
      const onEvent: ZamaSDKEventListener = (event) => events.push(event);
      // publicDecrypt succeeds, writeContract fails
      vi.mocked(signer.writeContract).mockRejectedValue(new Error("finalize tx failed"));
      const token = createTokenWithEvent(
        relayer,
        signer,
        onEvent,
        tokenAddress,
        storage,
        sessionStorage,
        createToken,
      );

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
      durationDays: 1,
      onEvent,
    });

    await manager.allow("0xtoken" as Address);

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
      durationDays: 1,
      onEvent,
    });

    await manager.allow("0xtoken" as Address);
    events.length = 0; // reset

    // Second call should hit cache
    await manager.allow("0xtoken" as Address);

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
      durationDays: 1,
      onEvent,
    });

    await manager.allow("0xtoken" as Address);

    // Tamper stored data to simulate expiration
    const storeKey = await computeStoreKey(
      (await signer.getAddress()).toLowerCase(),
      await signer.getChainId(),
    );
    const stored = await store.get(storeKey);
    const parsed = { ...(stored as Record<string, unknown>) };
    parsed.startTimestamp = Math.floor(Date.now() / 1000) - 8 * 86400;
    await store.set(storeKey, parsed);

    events.length = 0; // reset

    // New manager reads expired data
    const manager2 = new CredentialsManager({
      relayer,
      signer,
      storage: store,
      sessionStorage: createMockStorage(),
      durationDays: 1,
      onEvent,
    });
    await manager2.allow("0xtoken" as Address);

    const types = events.map((e) => e.type);
    expect(types).toContain(ZamaSDKEvents.CredentialsExpired);
    expect(types).toContain(ZamaSDKEvents.CredentialsCreating);
    expect(types).toContain(ZamaSDKEvents.CredentialsCreated);
  });

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
      durationDays: 1,
      onEvent,
    });

    await manager.allow("0xtoken" as Address);

    const credEvents = events.filter(
      (e) =>
        e.type === ZamaSDKEvents.CredentialsLoading ||
        e.type === ZamaSDKEvents.CredentialsCreating ||
        e.type === ZamaSDKEvents.CredentialsCreated,
    );
    expect(credEvents.length).toBe(3);
    for (const event of credEvents) {
      expect("contractAddresses" in event && event.contractAddresses).toEqual(["0xtoken"]);
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
      durationDays: 1,
      onEvent,
    });

    await manager.allow("0xtoken" as Address);

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
      durationDays: 1,
    });

    const creds = await manager.allow("0xtoken" as Address);
    expect(creds.publicKey).toBe("0xpub");
  });
});
