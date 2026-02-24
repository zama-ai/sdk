import { beforeEach, describe, expect, it, vi } from "vitest";
import { Topics } from "../../events";
import type { RelayerSDK } from "../../relayer/relayer-sdk";
import type { Address, Hex } from "../../relayer/relayer-sdk.types";
import { Token } from "../token";
import { ReadonlyToken } from "../readonly-token";
import { MemoryStorage } from "../memory-storage";
import { TokenSDKEvents } from "../token-sdk-events";
import type { TokenSDKEvent, TokenSDKEventListener } from "../token-sdk-events";
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

describe("TokenSDKEvents constants", () => {
  it("has all expected event keys", () => {
    expect(TokenSDKEvents.CredentialsLoading).toBe("credentials:loading");
    expect(TokenSDKEvents.CredentialsCached).toBe("credentials:cached");
    expect(TokenSDKEvents.CredentialsExpired).toBe("credentials:expired");
    expect(TokenSDKEvents.CredentialsCreating).toBe("credentials:creating");
    expect(TokenSDKEvents.CredentialsCreated).toBe("credentials:created");
    expect(TokenSDKEvents.EncryptStart).toBe("encrypt:start");
    expect(TokenSDKEvents.EncryptEnd).toBe("encrypt:end");
    expect(TokenSDKEvents.DecryptStart).toBe("decrypt:start");
    expect(TokenSDKEvents.DecryptEnd).toBe("decrypt:end");
    expect(TokenSDKEvents.WrapSubmitted).toBe("wrap:submitted");
    expect(TokenSDKEvents.TransferSubmitted).toBe("transfer:submitted");
    expect(TokenSDKEvents.TransferFromSubmitted).toBe("transferFrom:submitted");
    expect(TokenSDKEvents.ApproveSubmitted).toBe("approve:submitted");
    expect(TokenSDKEvents.ApproveUnderlyingSubmitted).toBe("approveUnderlying:submitted");
    expect(TokenSDKEvents.UnwrapSubmitted).toBe("unwrap:submitted");
    expect(TokenSDKEvents.FinalizeUnwrapSubmitted).toBe("finalizeUnwrap:submitted");
    expect(TokenSDKEvents.UnshieldPhase1Submitted).toBe("unshield:phase1_submitted");
    expect(TokenSDKEvents.UnshieldPhase2Started).toBe("unshield:phase2_started");
    expect(TokenSDKEvents.UnshieldPhase2Submitted).toBe("unshield:phase2_submitted");
  });

  it("has exactly 19 event types", () => {
    expect(Object.keys(TokenSDKEvents)).toHaveLength(19);
  });

  it("has unique event values", () => {
    const values = Object.values(TokenSDKEvents);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe("ReadonlyToken event emissions", () => {
  let sdk: ReturnType<typeof createMockSdk>;
  let signer: GenericSigner;
  let events: TokenSDKEvent[];
  let onEvent: TokenSDKEventListener;

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
    expect(types).toContain(TokenSDKEvents.DecryptStart);
    expect(types).toContain(TokenSDKEvents.DecryptEnd);
    expect(types.indexOf(TokenSDKEvents.DecryptStart)).toBeLessThan(
      types.indexOf(TokenSDKEvents.DecryptEnd),
    );
  });

  it("does not emit decrypt events for zero balance handle", async () => {
    vi.mocked(signer.readContract).mockResolvedValue(ZERO_HANDLE);
    const token = createReadonlyToken();

    await token.balanceOf();

    const types = events.map((e) => e.type);
    expect(types).not.toContain(TokenSDKEvents.DecryptStart);
    expect(types).not.toContain(TokenSDKEvents.DecryptEnd);
  });

  it("emits DecryptStart and DecryptEnd during decryptBalance", async () => {
    const token = createReadonlyToken();

    await token.decryptBalance(VALID_HANDLE);

    const types = events.map((e) => e.type);
    expect(types).toContain(TokenSDKEvents.DecryptStart);
    expect(types).toContain(TokenSDKEvents.DecryptEnd);
  });

  it("emits DecryptStart and DecryptEnd during decryptHandles", async () => {
    const token = createReadonlyToken();

    await token.decryptHandles([VALID_HANDLE]);

    const types = events.map((e) => e.type);
    expect(types).toContain(TokenSDKEvents.DecryptStart);
    expect(types).toContain(TokenSDKEvents.DecryptEnd);
  });

  it("populates tokenAddress and timestamp on decrypt events", async () => {
    vi.mocked(signer.readContract).mockResolvedValue(VALID_HANDLE);
    const token = createReadonlyToken();

    await token.balanceOf();

    // Filter to only decrypt events (emitted by ReadonlyToken.emit, which adds tokenAddress)
    const decryptEvents = events.filter(
      (e) => e.type === TokenSDKEvents.DecryptStart || e.type === TokenSDKEvents.DecryptEnd,
    );
    expect(decryptEvents.length).toBeGreaterThan(0);
    for (const event of decryptEvents) {
      expect(event.tokenAddress).toBe(TOKEN);
      expect(event.timestamp).toBeGreaterThan(0);
      expect(typeof event.timestamp).toBe("number");
    }
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
  let events: TokenSDKEvent[];
  let onEvent: TokenSDKEventListener;

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
          TokenSDKEvents.EncryptStart,
          TokenSDKEvents.EncryptEnd,
          TokenSDKEvents.TransferSubmitted,
        ]),
      );
    });

    it("includes txHash on TransferSubmitted event", async () => {
      const token = createToken();
      await token.confidentialTransfer(
        "0x8888888888888888888888888888888888888888" as Address,
        100n,
      );

      const submitted = events.find((e) => e.type === TokenSDKEvents.TransferSubmitted);
      expect(submitted).toBeDefined();
      expect("txHash" in submitted! && submitted.txHash).toBe("0xtxhash");
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
      expect(types).toContain(TokenSDKEvents.EncryptStart);
      expect(types).toContain(TokenSDKEvents.EncryptEnd);
      expect(types).toContain(TokenSDKEvents.TransferFromSubmitted);
    });
  });

  describe("approve events", () => {
    it("emits ApproveSubmitted", async () => {
      const token = createToken();
      await token.approve("0x3333333333333333333333333333333333333333" as Address);

      const types = events.map((e) => e.type);
      expect(types).toContain(TokenSDKEvents.ApproveSubmitted);
    });

    it("includes txHash on ApproveSubmitted event", async () => {
      const token = createToken();
      await token.approve("0x3333333333333333333333333333333333333333" as Address);

      const submitted = events.find((e) => e.type === TokenSDKEvents.ApproveSubmitted);
      expect(submitted).toBeDefined();
      expect("txHash" in submitted! && submitted.txHash).toBe("0xtxhash");
    });
  });

  describe("wrap events", () => {
    it("emits WrapSubmitted for ERC-20 wrap", async () => {
      const token = createToken();
      vi.mocked(signer.readContract).mockResolvedValueOnce(
        "0x9999999999999999999999999999999999999999",
      ); // underlying

      await token.wrap(100n, { approvalStrategy: "skip" });

      const types = events.map((e) => e.type);
      expect(types).toContain(TokenSDKEvents.WrapSubmitted);
    });

    it("emits WrapSubmitted for wrapETH", async () => {
      const token = createToken();
      await token.wrapETH(1000n);

      const types = events.map((e) => e.type);
      expect(types).toContain(TokenSDKEvents.WrapSubmitted);
    });
  });

  describe("unwrap events", () => {
    it("emits EncryptStart, EncryptEnd, UnwrapSubmitted", async () => {
      const token = createToken();
      await token.unwrap(50n);

      const types = events.map((e) => e.type);
      expect(types).toContain(TokenSDKEvents.EncryptStart);
      expect(types).toContain(TokenSDKEvents.EncryptEnd);
      expect(types).toContain(TokenSDKEvents.UnwrapSubmitted);
    });
  });

  describe("unwrapAll events", () => {
    it("emits UnwrapSubmitted", async () => {
      const token = createToken();
      vi.mocked(signer.readContract).mockResolvedValue(VALID_HANDLE);
      await token.unwrapAll();

      const types = events.map((e) => e.type);
      expect(types).toContain(TokenSDKEvents.UnwrapSubmitted);
    });
  });

  describe("finalizeUnwrap events", () => {
    it("emits DecryptStart, DecryptEnd, FinalizeUnwrapSubmitted", async () => {
      const token = createToken();
      await token.finalizeUnwrap("0xburn" as Address);

      const types = events.map((e) => e.type);
      expect(types).toContain(TokenSDKEvents.DecryptStart);
      expect(types).toContain(TokenSDKEvents.DecryptEnd);
      expect(types).toContain(TokenSDKEvents.FinalizeUnwrapSubmitted);
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
      expect(types).toContain(TokenSDKEvents.ApproveUnderlyingSubmitted);
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
      expect(types).toContain(TokenSDKEvents.EncryptStart);
      expect(types).toContain(TokenSDKEvents.EncryptEnd);
      expect(types).toContain(TokenSDKEvents.UnwrapSubmitted);
      expect(types).toContain(TokenSDKEvents.UnshieldPhase1Submitted);

      // Phase 2: finalize
      expect(types).toContain(TokenSDKEvents.UnshieldPhase2Started);
      expect(types).toContain(TokenSDKEvents.DecryptStart);
      expect(types).toContain(TokenSDKEvents.DecryptEnd);
      expect(types).toContain(TokenSDKEvents.FinalizeUnwrapSubmitted);
      expect(types).toContain(TokenSDKEvents.UnshieldPhase2Submitted);

      // Phase ordering
      const phase1Idx = types.indexOf(TokenSDKEvents.UnshieldPhase1Submitted);
      const phase2StartIdx = types.indexOf(TokenSDKEvents.UnshieldPhase2Started);
      const phase2SubmitIdx = types.indexOf(TokenSDKEvents.UnshieldPhase2Submitted);
      expect(phase1Idx).toBeLessThan(phase2StartIdx);
      expect(phase2StartIdx).toBeLessThan(phase2SubmitIdx);
    });

    it("includes txHash on phase events", async () => {
      const token = createToken();
      mockReceiptWithUnwrapRequested();

      await token.unshield(50n);

      const phase1 = events.find((e) => e.type === TokenSDKEvents.UnshieldPhase1Submitted);
      expect(phase1).toBeDefined();
      expect("txHash" in phase1! && phase1.txHash).toBeTruthy();

      const phase2 = events.find((e) => e.type === TokenSDKEvents.UnshieldPhase2Submitted);
      expect(phase2).toBeDefined();
      expect("txHash" in phase2! && phase2.txHash).toBeTruthy();
    });
  });
});

describe("CredentialsManager event emissions", () => {
  let sdk: ReturnType<typeof createMockSdk>;
  let signer: GenericSigner;
  let events: TokenSDKEvent[];
  let onEvent: TokenSDKEventListener;

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
    expect(types).toContain(TokenSDKEvents.CredentialsLoading);
    expect(types).toContain(TokenSDKEvents.CredentialsCreating);
    expect(types).toContain(TokenSDKEvents.CredentialsCreated);
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
    expect(types).toContain(TokenSDKEvents.CredentialsLoading);
    expect(types).toContain(TokenSDKEvents.CredentialsCached);
    expect(types).not.toContain(TokenSDKEvents.CredentialsCreating);
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
    expect(types).toContain(TokenSDKEvents.CredentialsExpired);
    expect(types).toContain(TokenSDKEvents.CredentialsCreating);
    expect(types).toContain(TokenSDKEvents.CredentialsCreated);
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
