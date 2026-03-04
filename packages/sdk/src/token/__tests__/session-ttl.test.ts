import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CredentialsManager, computeStoreKey } from "../credentials-manager";
import { MemoryStorage } from "../memory-storage";
import type { RelayerSDK } from "../../relayer/relayer-sdk";
import type { Address } from "../../relayer/relayer-sdk.types";
import { ZamaSDKEvents } from "../../events/sdk-events";
import type { ZamaSDKEvent } from "../../events/sdk-events";
import { createMockRelayer, createMockSigner } from "./test-helpers";

describe("Session TTL", () => {
  let sdk: RelayerSDK;
  let signer: ReturnType<typeof createMockSigner>;
  let store: MemoryStorage;
  let sessionStore: MemoryStorage;
  let events: ZamaSDKEvent[];

  beforeEach(() => {
    sdk = createMockRelayer({
      generateKeypair: vi.fn().mockResolvedValue({
        publicKey: "0xpub123",
        privateKey: "0xpriv456",
      }),
    });
    signer = createMockSigner();
    store = new MemoryStorage();
    sessionStore = new MemoryStorage();
    events = [];
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function createManager(sessionTTL: "persistent" | number = "persistent") {
    return new CredentialsManager({
      relayer: sdk,
      signer,
      storage: store,
      sessionStorage: sessionStore,
      durationDays: 7,
      sessionTTL,
      onEvent: (e) => events.push(e),
    });
  }

  it("default (persistent): no time-based expiry", async () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const manager = createManager();
    await manager.allow("0xtoken" as Address);
    expect(signer.signTypedData).toHaveBeenCalledOnce();

    // Advance 6 days — within durationDays (7), session should still be valid
    vi.advanceTimersByTime(6 * 86400 * 1000);
    await manager.allow("0xtoken" as Address);
    expect(signer.signTypedData).toHaveBeenCalledOnce(); // no re-sign
  });

  it("numeric TTL: session valid before expiry", async () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const manager = createManager(3600); // 1 hour
    await manager.allow("0xtoken" as Address);
    expect(signer.signTypedData).toHaveBeenCalledOnce();

    // Advance 30 minutes — still valid
    vi.advanceTimersByTime(30 * 60 * 1000);
    await manager.allow("0xtoken" as Address);
    expect(signer.signTypedData).toHaveBeenCalledOnce(); // no re-sign
  });

  it("numeric TTL: session expired after TTL triggers re-sign and event", async () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const manager = createManager(3600); // 1 hour
    await manager.allow("0xtoken" as Address);
    expect(signer.signTypedData).toHaveBeenCalledOnce();

    // Advance past TTL
    vi.advanceTimersByTime(3601 * 1000);
    await manager.allow("0xtoken" as Address);
    expect(signer.signTypedData).toHaveBeenCalledTimes(2); // re-signed

    // SessionExpired event should have fired
    const expiredEvents = events.filter((e) => e.type === ZamaSDKEvents.SessionExpired);
    expect(expiredEvents).toHaveLength(1);
    expect("reason" in expiredEvents[0]! && expiredEvents[0].reason).toBe("ttl");
  });

  it("TTL 0: every operation triggers signing prompt", async () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const manager = createManager(0);
    await manager.allow("0xtoken" as Address);
    expect(signer.signTypedData).toHaveBeenCalledOnce();

    await manager.allow("0xtoken" as Address);
    expect(signer.signTypedData).toHaveBeenCalledTimes(2);

    await manager.allow("0xtoken" as Address);
    expect(signer.signTypedData).toHaveBeenCalledTimes(3);
  });

  it("TTL expiry does not clear decrypt keys in persistent storage", async () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const manager = createManager(3600);
    await manager.allow("0xtoken" as Address);

    const storeKey = await computeStoreKey("0xuser", 31337);
    const storedBefore = await store.get(storeKey);
    expect(storedBefore).not.toBeNull();

    // Expire the session
    vi.advanceTimersByTime(3601 * 1000);
    await manager.allow("0xtoken" as Address);

    // Persistent storage should still have the decrypt keys
    const storedAfter = await store.get(storeKey);
    expect(storedAfter).not.toBeNull();
    // keypair should NOT have been regenerated
    expect(sdk.generateKeypair).toHaveBeenCalledOnce();
  });

  it("disconnect before TTL expiry revokes session (existing behavior)", async () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const manager = createManager(3600);
    await manager.allow("0xtoken" as Address);

    // Disconnect (revoke) before TTL expires
    vi.advanceTimersByTime(10 * 60 * 1000); // 10 minutes
    await manager.revoke();
    expect(await manager.isAllowed()).toBe(false);

    // Next allow should re-sign (not regenerate)
    await manager.allow("0xtoken" as Address);
    expect(signer.signTypedData).toHaveBeenCalledTimes(2);
    expect(sdk.generateKeypair).toHaveBeenCalledOnce();
  });

  it("isAllowed() returns false when session TTL expired", async () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const manager = createManager(3600);
    await manager.allow("0xtoken" as Address);
    expect(await manager.isAllowed()).toBe(true);

    vi.advanceTimersByTime(3601 * 1000);
    expect(await manager.isAllowed()).toBe(false);
  });

  it("config change: old sessions use their recorded TTL", async () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    // Create session with 1-hour TTL
    const manager1 = createManager(3600);
    await manager1.allow("0xtoken" as Address);

    // Advance 30 minutes
    vi.advanceTimersByTime(30 * 60 * 1000);

    // Create new manager with 10-second TTL (simulates config change)
    const manager2 = new CredentialsManager({
      relayer: sdk,
      signer,
      storage: store,
      sessionStorage: sessionStore, // same session storage
      durationDays: 7,
      sessionTTL: 10, // shorter TTL
      onEvent: (e) => events.push(e),
    });

    // Old session should still be valid (uses its recorded 3600s TTL)
    await manager2.allow("0xtoken" as Address);
    expect(signer.signTypedData).toHaveBeenCalledOnce(); // no re-sign
  });

  it("chain switch with active TTL: independent sessions unaffected", async () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const manager = createManager(3600);
    await manager.allow("0xtoken" as Address);

    // Switch chain — new signer returns different chainId
    const signer2 = createMockSigner();
    vi.mocked(signer2.getChainId).mockResolvedValue(1); // mainnet

    const manager2 = new CredentialsManager({
      relayer: sdk,
      signer: signer2,
      storage: store,
      sessionStorage: sessionStore,
      durationDays: 7,
      sessionTTL: 3600,
      onEvent: (e) => events.push(e),
    });

    // Different chain — should generate new credentials
    await manager2.allow("0xtoken" as Address);
    expect(sdk.generateKeypair).toHaveBeenCalledTimes(2);

    // Original chain session should still be valid
    vi.advanceTimersByTime(30 * 60 * 1000);
    await manager.allow("0xtoken" as Address);
    expect(signer.signTypedData).toHaveBeenCalledOnce(); // original signer, no re-sign
  });
});
