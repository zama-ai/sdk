import { beforeEach, describe, expect, it, vi } from "vitest";
import { Topics } from "../../events";
import type { RelayerSDK } from "../../relayer/relayer-sdk";
import type { Address } from "../../relayer/relayer-sdk.types";
import { Token } from "../token";
import { ReadonlyToken } from "../readonly-token";
import { MemoryStorage } from "../memory-storage";
import { ZamaSDKEvents } from "../../events/sdk-events";
import type { ZamaSDKEvent, ZamaSDKEventListener } from "../../events/sdk-events";
import { CredentialsManager } from "../credential-manager";
import type { GenericSigner } from "../token.types";

const TOKEN = "0x1111111111111111111111111111111111111111" as Address;
const USER = "0x2222222222222222222222222222222222222222" as Address;
const ZERO_HANDLE = "0x" + "0".repeat(64);
const VALID_HANDLE = ("0x" + "ab".repeat(32)) as Address;

function createMockSdk() {
  return {
    generateKeypair: vi.fn().mockResolvedValue({
      publicKey: "0xpub",
      privateKey: "0xpriv",
    }),
    createEIP712: vi.fn().mockResolvedValue({
      domain: {
        name: "test",
        version: "1",
        chainId: 1,
        verifyingContract: "0xkms",
      },
      types: { UserDecryptRequestVerification: [] },
      message: {
        publicKey: "0xpub",
        contractAddresses: [TOKEN],
        startTimestamp: 1000n,
        durationDays: 1n,
        extraData: "0x",
      },
    }),
    encrypt: vi.fn().mockResolvedValue({
      handles: [new Uint8Array([1, 2, 3])],
      inputProof: new Uint8Array([4, 5, 6]),
    }),
    userDecrypt: vi.fn().mockResolvedValue({
      [VALID_HANDLE]: 1000n,
    }),
    publicDecrypt: vi.fn().mockResolvedValue({
      clearValues: { "0xburn": 500n },
      abiEncodedClearValues: "0x1f4",
      decryptionProof: "0xproof",
    }),
  } as unknown as RelayerSDK;
}

function createMockSigner(): GenericSigner {
  return {
    getAddress: vi.fn().mockResolvedValue(USER),
    signTypedData: vi.fn().mockResolvedValue("0xsig"),
    writeContract: vi.fn().mockResolvedValue("0xtxhash"),
    readContract: vi.fn().mockResolvedValue(ZERO_HANDLE),
    waitForTransactionReceipt: vi.fn().mockResolvedValue({ logs: [] }),
    getChainId: vi.fn().mockResolvedValue(31337),
  };
}

describe("ZamaSDKEvents constants", () => {
  it("has all expected event keys", () => {
    expect(ZamaSDKEvents.CredentialsLoading).toBe("credentials:loading");
    expect(ZamaSDKEvents.CredentialsCached).toBe("credentials:cached");
    expect(ZamaSDKEvents.CredentialsExpired).toBe("credentials:expired");
    expect(ZamaSDKEvents.CredentialsCreating).toBe("credentials:creating");
    expect(ZamaSDKEvents.CredentialsCreated).toBe("credentials:created");
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

  it("has exactly 22 event types", () => {
    expect(Object.keys(ZamaSDKEvents)).toHaveLength(22);
  });

  it("has unique event values", () => {
    const values = Object.values(ZamaSDKEvents);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe("ReadonlyToken event emissions", () => {
  let sdk: ReturnType<typeof createMockSdk>;
  let signer: GenericSigner;
  let events: ZamaSDKEvent[];
  let onEvent: ZamaSDKEventListener;

  beforeEach(() => {
    sdk = createMockSdk();
    signer = createMockSigner();
    events = [];
    onEvent = (event) => events.push(event);
  });

  function createReadonlyToken() {
    return new ReadonlyToken({
      sdk: sdk as unknown as RelayerSDK,
      signer,
      storage: new MemoryStorage(),
      address: TOKEN,
      onEvent,
    });
  }

  it("emits DecryptStart and DecryptEnd during balanceOf", async () => {
    vi.mocked(signer.readContract).mockResolvedValue(VALID_HANDLE);
    const token = createReadonlyToken();

    await token.balanceOf();

    const types = events.map((e) => e.type);
    expect(types).toContain(ZamaSDKEvents.DecryptStart);
    expect(types).toContain(ZamaSDKEvents.DecryptEnd);
    expect(types.indexOf(ZamaSDKEvents.DecryptStart)).toBeLessThan(
      types.indexOf(ZamaSDKEvents.DecryptEnd),
    );
  });

  it("does not emit decrypt events for zero balance handle", async () => {
    vi.mocked(signer.readContract).mockResolvedValue(ZERO_HANDLE);
    const token = createReadonlyToken();

    await token.balanceOf();

    const types = events.map((e) => e.type);
    expect(types).not.toContain(ZamaSDKEvents.DecryptStart);
    expect(types).not.toContain(ZamaSDKEvents.DecryptEnd);
  });

  it("emits DecryptStart and DecryptEnd during decryptBalance", async () => {
    const token = createReadonlyToken();

    await token.decryptBalance(VALID_HANDLE);

    const types = events.map((e) => e.type);
    expect(types).toContain(ZamaSDKEvents.DecryptStart);
    expect(types).toContain(ZamaSDKEvents.DecryptEnd);
  });

  it("emits DecryptStart and DecryptEnd during decryptHandles", async () => {
    const token = createReadonlyToken();

    await token.decryptHandles([VALID_HANDLE]);

    const types = events.map((e) => e.type);
    expect(types).toContain(ZamaSDKEvents.DecryptStart);
    expect(types).toContain(ZamaSDKEvents.DecryptEnd);
  });

  it("populates tokenAddress and timestamp on decrypt events", async () => {
    vi.mocked(signer.readContract).mockResolvedValue(VALID_HANDLE);
    const token = createReadonlyToken();

    await token.balanceOf();

    // Filter to only decrypt events (emitted by ReadonlyToken.emit, which adds tokenAddress)
    const decryptEvents = events.filter(
      (e) => e.type === ZamaSDKEvents.DecryptStart || e.type === ZamaSDKEvents.DecryptEnd,
    );
    expect(decryptEvents.length).toBeGreaterThan(0);
    for (const event of decryptEvents) {
      expect(event.tokenAddress).toBe(TOKEN);
      expect(event.timestamp).toBeGreaterThan(0);
      expect(typeof event.timestamp).toBe("number");
    }
  });

  it("includes durationMs on DecryptEnd events", async () => {
    vi.mocked(signer.readContract).mockResolvedValue(VALID_HANDLE);
    const token = createReadonlyToken();

    await token.balanceOf();

    const endEvent = events.find((e) => e.type === ZamaSDKEvents.DecryptEnd);
    expect(endEvent).toBeDefined();
    expect("durationMs" in endEvent! && typeof endEvent.durationMs).toBe("number");
    expect("durationMs" in endEvent! && endEvent.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("emits DecryptError when userDecrypt fails", async () => {
    vi.mocked(signer.readContract).mockResolvedValue(VALID_HANDLE);
    sdk.userDecrypt = vi.fn().mockRejectedValue(new Error("decrypt boom"));
    const token = createReadonlyToken();

    await expect(token.balanceOf()).rejects.toThrow();

    const errorEvent = events.find((e) => e.type === ZamaSDKEvents.DecryptError);
    expect(errorEvent).toBeDefined();
    expect("error" in errorEvent! && errorEvent.error).toBeInstanceOf(Error);
    expect("error" in errorEvent! && errorEvent.error.message).toBe("decrypt boom");
    expect("durationMs" in errorEvent! && errorEvent.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("works without onEvent (no-op, does not throw)", async () => {
    const token = new ReadonlyToken({
      sdk: sdk as unknown as RelayerSDK,
      signer,
      storage: new MemoryStorage(),
      address: TOKEN,
    });

    vi.mocked(signer.readContract).mockResolvedValue(VALID_HANDLE);
    await expect(token.balanceOf()).resolves.toBe(1000n);
  });
});

describe("Token event emissions", () => {
  let sdk: ReturnType<typeof createMockSdk>;
  let signer: GenericSigner;
  let events: ZamaSDKEvent[];
  let onEvent: ZamaSDKEventListener;

  beforeEach(() => {
    sdk = createMockSdk();
    signer = createMockSigner();
    events = [];
    onEvent = (event) => events.push(event);
  });

  function createToken() {
    return new Token({
      sdk: sdk as unknown as RelayerSDK,
      signer,
      storage: new MemoryStorage(),
      address: TOKEN,
      onEvent,
    });
  }

  describe("confidentialTransfer events", () => {
    it("emits EncryptStart, EncryptEnd, TransferSubmitted", async () => {
      const token = createToken();
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

    it("includes txHash on TransferSubmitted event", async () => {
      const token = createToken();
      await token.confidentialTransfer(
        "0x8888888888888888888888888888888888888888" as Address,
        100n,
      );

      const submitted = events.find((e) => e.type === ZamaSDKEvents.TransferSubmitted);
      expect(submitted).toBeDefined();
      expect("txHash" in submitted! && submitted.txHash).toBe("0xtxhash");
    });

    it("includes durationMs on EncryptEnd event", async () => {
      const token = createToken();
      await token.confidentialTransfer(
        "0x8888888888888888888888888888888888888888" as Address,
        100n,
      );

      const endEvent = events.find((e) => e.type === ZamaSDKEvents.EncryptEnd);
      expect(endEvent).toBeDefined();
      expect("durationMs" in endEvent! && endEvent.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("emits EncryptError when encryption fails", async () => {
      sdk.encrypt = vi.fn().mockRejectedValue(new Error("encrypt boom"));
      const token = createToken();

      await expect(
        token.confidentialTransfer("0x8888888888888888888888888888888888888888" as Address, 100n),
      ).rejects.toThrow();

      const errorEvent = events.find((e) => e.type === ZamaSDKEvents.EncryptError);
      expect(errorEvent).toBeDefined();
      expect("error" in errorEvent! && errorEvent.error).toBeInstanceOf(Error);
      expect("error" in errorEvent! && errorEvent.error.message).toBe("encrypt boom");
      expect("durationMs" in errorEvent! && errorEvent.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("emits TransactionError (not EncryptError) when writeContract fails", async () => {
      vi.mocked(signer.writeContract).mockRejectedValue(new Error("tx reverted"));
      const token = createToken();

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
    it("emits EncryptStart, EncryptEnd, TransferFromSubmitted", async () => {
      const token = createToken();
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
    it("emits ApproveSubmitted", async () => {
      const token = createToken();
      await token.approve("0x3333333333333333333333333333333333333333" as Address);

      const types = events.map((e) => e.type);
      expect(types).toContain(ZamaSDKEvents.ApproveSubmitted);
    });

    it("includes txHash on ApproveSubmitted event", async () => {
      const token = createToken();
      await token.approve("0x3333333333333333333333333333333333333333" as Address);

      const submitted = events.find((e) => e.type === ZamaSDKEvents.ApproveSubmitted);
      expect(submitted).toBeDefined();
      expect("txHash" in submitted! && submitted.txHash).toBe("0xtxhash");
    });
  });

  describe("shield events", () => {
    it("emits ShieldSubmitted for ERC-20 shield", async () => {
      const token = createToken();
      vi.mocked(signer.readContract).mockResolvedValueOnce(
        "0x9999999999999999999999999999999999999999",
      ); // underlying

      await token.shield(100n, { approvalStrategy: "skip" });

      const types = events.map((e) => e.type);
      expect(types).toContain(ZamaSDKEvents.ShieldSubmitted);
    });

    it("emits ShieldSubmitted for shieldETH", async () => {
      const token = createToken();
      await token.shieldETH(1000n);

      const types = events.map((e) => e.type);
      expect(types).toContain(ZamaSDKEvents.ShieldSubmitted);
    });
  });

  describe("unwrap events", () => {
    it("emits EncryptStart, EncryptEnd, UnwrapSubmitted", async () => {
      const token = createToken();
      await token.unwrap(50n);

      const types = events.map((e) => e.type);
      expect(types).toContain(ZamaSDKEvents.EncryptStart);
      expect(types).toContain(ZamaSDKEvents.EncryptEnd);
      expect(types).toContain(ZamaSDKEvents.UnwrapSubmitted);
    });
  });

  describe("unwrapAll events", () => {
    it("emits UnwrapSubmitted", async () => {
      const token = createToken();
      vi.mocked(signer.readContract).mockResolvedValue(VALID_HANDLE);
      await token.unwrapAll();

      const types = events.map((e) => e.type);
      expect(types).toContain(ZamaSDKEvents.UnwrapSubmitted);
    });
  });

  describe("finalizeUnwrap events", () => {
    it("emits DecryptStart, DecryptEnd, FinalizeUnwrapSubmitted", async () => {
      const token = createToken();
      await token.finalizeUnwrap("0xburn" as Address);

      const types = events.map((e) => e.type);
      expect(types).toContain(ZamaSDKEvents.DecryptStart);
      expect(types).toContain(ZamaSDKEvents.DecryptEnd);
      expect(types).toContain(ZamaSDKEvents.FinalizeUnwrapSubmitted);
    });

    it("emits DecryptError when publicDecrypt fails", async () => {
      sdk.publicDecrypt = vi.fn().mockRejectedValue(new Error("finalize boom"));
      const token = createToken();

      await expect(token.finalizeUnwrap("0xburn" as Address)).rejects.toThrow();

      const errorEvent = events.find((e) => e.type === ZamaSDKEvents.DecryptError);
      expect(errorEvent).toBeDefined();
      expect("error" in errorEvent! && errorEvent.error).toBeInstanceOf(Error);
      expect("error" in errorEvent! && errorEvent.error.message).toBe("finalize boom");
    });
  });

  describe("approveUnderlying events", () => {
    it("emits ApproveUnderlyingSubmitted", async () => {
      const token = createToken();
      vi.mocked(signer.readContract)
        .mockResolvedValueOnce("0x9999999999999999999999999999999999999999") // underlying
        .mockResolvedValueOnce(0n); // currentAllowance

      await token.approveUnderlying();

      const types = events.map((e) => e.type);
      expect(types).toContain(ZamaSDKEvents.ApproveUnderlyingSubmitted);
    });
  });

  describe("unshield event sequence", () => {
    function mockReceiptWithUnwrapRequested() {
      vi.mocked(signer.waitForTransactionReceipt).mockResolvedValue({
        logs: [
          {
            topics: [Topics.UnwrapRequested, "0x000000000000000000000000" + USER.slice(2)],
            data: "0x" + "ff".repeat(32),
          },
        ],
      });
    }

    it("emits full unshield event sequence in order", async () => {
      const token = createToken();
      mockReceiptWithUnwrapRequested();

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

    it("includes txHash on phase events", async () => {
      const token = createToken();
      mockReceiptWithUnwrapRequested();

      await token.unshield(50n);

      const phase1 = events.find((e) => e.type === ZamaSDKEvents.UnshieldPhase1Submitted);
      expect(phase1).toBeDefined();
      expect("txHash" in phase1! && phase1.txHash).toBeTruthy();

      const phase2 = events.find((e) => e.type === ZamaSDKEvents.UnshieldPhase2Submitted);
      expect(phase2).toBeDefined();
      expect("txHash" in phase2! && phase2.txHash).toBeTruthy();
    });

    it("shares the same operationId across all unshield phase events", async () => {
      const token = createToken();
      mockReceiptWithUnwrapRequested();

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
    it("emits TransactionError with operation 'shield' on shield failure", async () => {
      vi.mocked(signer.readContract).mockResolvedValueOnce(
        "0x9999999999999999999999999999999999999999",
      );
      vi.mocked(signer.writeContract).mockRejectedValue(new Error("shield failed"));
      const token = createToken();

      await expect(token.shield(100n, { approvalStrategy: "skip" })).rejects.toThrow();

      const txError = events.find((e) => e.type === ZamaSDKEvents.TransactionError);
      expect(txError).toBeDefined();
      expect("operation" in txError! && txError.operation).toBe("shield");
    });

    it("emits TransactionError with operation 'approve' on approve failure", async () => {
      vi.mocked(signer.writeContract).mockRejectedValue(new Error("approve failed"));
      const token = createToken();

      await expect(
        token.approve("0x3333333333333333333333333333333333333333" as Address),
      ).rejects.toThrow();

      const txError = events.find((e) => e.type === ZamaSDKEvents.TransactionError);
      expect(txError).toBeDefined();
      expect("operation" in txError! && txError.operation).toBe("approve");
    });

    it("emits TransactionError with operation 'unwrap' on unwrap write failure", async () => {
      vi.mocked(signer.writeContract).mockRejectedValue(new Error("unwrap failed"));
      const token = createToken();

      await expect(token.unwrap(50n)).rejects.toThrow();

      const txError = events.find((e) => e.type === ZamaSDKEvents.TransactionError);
      expect(txError).toBeDefined();
      expect("operation" in txError! && txError.operation).toBe("unwrap");
    });

    it("emits TransactionError with operation 'finalizeUnwrap' on finalize write failure", async () => {
      // publicDecrypt succeeds, writeContract fails
      vi.mocked(signer.writeContract).mockRejectedValue(new Error("finalize tx failed"));
      const token = createToken();

      await expect(token.finalizeUnwrap("0xburn" as Address)).rejects.toThrow();

      const txError = events.find((e) => e.type === ZamaSDKEvents.TransactionError);
      expect(txError).toBeDefined();
      expect("operation" in txError! && txError.operation).toBe("finalizeUnwrap");
    });
  });
});

describe("CredentialsManager event emissions", () => {
  let sdk: ReturnType<typeof createMockSdk>;
  let signer: GenericSigner;
  let events: ZamaSDKEvent[];
  let onEvent: ZamaSDKEventListener;

  beforeEach(() => {
    sdk = createMockSdk();
    signer = createMockSigner();
    events = [];
    onEvent = (event) => events.push(event);
  });

  it("emits CredentialsLoading and CredentialsCreating/Created on first call", async () => {
    const manager = new CredentialsManager({
      sdk: sdk as unknown as RelayerSDK,
      signer,
      storage: new MemoryStorage(),
      durationDays: 1,
      onEvent,
    });

    await manager.get("0xtoken" as Address);

    const types = events.map((e) => e.type);
    expect(types).toContain(ZamaSDKEvents.CredentialsLoading);
    expect(types).toContain(ZamaSDKEvents.CredentialsCreating);
    expect(types).toContain(ZamaSDKEvents.CredentialsCreated);
  });

  it("emits CredentialsCached on cache hit", async () => {
    const store = new MemoryStorage();
    const manager = new CredentialsManager({
      sdk: sdk as unknown as RelayerSDK,
      signer,
      storage: store,
      durationDays: 1,
      onEvent,
    });

    await manager.get("0xtoken" as Address);
    events.length = 0; // reset

    // Second call should hit cache
    await manager.get("0xtoken" as Address);

    const types = events.map((e) => e.type);
    expect(types).toContain(ZamaSDKEvents.CredentialsLoading);
    expect(types).toContain(ZamaSDKEvents.CredentialsCached);
    expect(types).not.toContain(ZamaSDKEvents.CredentialsCreating);
  });

  it("emits CredentialsExpired when credentials are expired", async () => {
    const store = new MemoryStorage();
    const manager = new CredentialsManager({
      sdk: sdk as unknown as RelayerSDK,
      signer,
      storage: store,
      durationDays: 1,
      onEvent,
    });

    await manager.get("0xtoken" as Address);

    // Tamper stored data to simulate expiration
    const address = (await signer.getAddress()).toLowerCase();
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(address));
    const hex = Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const storeKey = hex.slice(0, 32);
    const stored = await store.getItem(storeKey);
    const parsed = JSON.parse(stored!);
    parsed.startTimestamp = Math.floor(Date.now() / 1000) - 8 * 86400;
    await store.setItem(storeKey, JSON.stringify(parsed));

    events.length = 0; // reset

    // New manager reads expired data
    const manager2 = new CredentialsManager({
      sdk: sdk as unknown as RelayerSDK,
      signer,
      storage: store,
      durationDays: 1,
      onEvent,
    });
    await manager2.get("0xtoken" as Address);

    const types = events.map((e) => e.type);
    expect(types).toContain(ZamaSDKEvents.CredentialsExpired);
    expect(types).toContain(ZamaSDKEvents.CredentialsCreating);
    expect(types).toContain(ZamaSDKEvents.CredentialsCreated);
  });

  it("includes contractAddresses on credential events", async () => {
    const manager = new CredentialsManager({
      sdk: sdk as unknown as RelayerSDK,
      signer,
      storage: new MemoryStorage(),
      durationDays: 1,
      onEvent,
    });

    await manager.get("0xtoken" as Address);

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

  it("adds timestamp to all emitted events", async () => {
    const manager = new CredentialsManager({
      sdk: sdk as unknown as RelayerSDK,
      signer,
      storage: new MemoryStorage(),
      durationDays: 1,
      onEvent,
    });

    await manager.get("0xtoken" as Address);

    for (const event of events) {
      expect(event.timestamp).toBeGreaterThan(0);
    }
  });

  it("works without onEvent (no-op, does not throw)", async () => {
    const manager = new CredentialsManager({
      sdk: sdk as unknown as RelayerSDK,
      signer,
      storage: new MemoryStorage(),
      durationDays: 1,
    });

    const creds = await manager.get("0xtoken" as Address);
    expect(creds.publicKey).toBe("0xpub");
  });
});
