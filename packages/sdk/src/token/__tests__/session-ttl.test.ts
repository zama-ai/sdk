import { afterEach, beforeEach, describe, expect, it, vi } from "../../test-fixtures";
import { CredentialsManager } from "../credentials-manager";
import type { ZamaSDKEvent } from "../../events/sdk-events";
import type { Address } from "viem";

describe("Session TTL", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("default (30 days): no re-sign within TTL", async ({
    relayer,
    signer,
    storage,
    sessionStorage,
    createCredentialManager,
  }) => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const manager = createCredentialManager({
      relayer,
      signer,
      storage,
      sessionStorage,
      keypairTTL: 604800,
    });
    await manager.allow("0xtoken" as Address);
    expect(signer.signTypedData).toHaveBeenCalledOnce();

    // Advance 6 days — within default 30-day TTL and keypairTTL (7 days)
    vi.advanceTimersByTime(6 * 86400 * 1000);
    await manager.allow("0xtoken" as Address);
    expect(signer.signTypedData).toHaveBeenCalledOnce(); // no re-sign
  });

  it("numeric TTL: session valid before expiry", async ({
    relayer,
    signer,
    storage,
    sessionStorage,
    createCredentialManager,
  }) => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const manager = createCredentialManager({
      relayer,
      signer,
      storage,
      sessionStorage,
      keypairTTL: 604800,
      sessionTTL: 3600,
    });
    await manager.allow("0xtoken" as Address);
    expect(signer.signTypedData).toHaveBeenCalledOnce();

    // Advance 30 minutes — still valid
    vi.advanceTimersByTime(30 * 60 * 1000);
    await manager.allow("0xtoken" as Address);
    expect(signer.signTypedData).toHaveBeenCalledOnce(); // no re-sign
  });

  it("numeric TTL: session expired after TTL triggers re-sign and event", async ({
    relayer,
    signer,
    storage,
    sessionStorage,
    events,
    createCredentialManager,
  }) => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const emitted: ZamaSDKEvent[] = [];
    const manager = createCredentialManager({
      relayer,
      signer,
      storage,
      sessionStorage,
      keypairTTL: 604800,
      sessionTTL: 3600,
      onEvent: (e) => emitted.push(e),
    });
    await manager.allow("0xtoken" as Address);
    expect(signer.signTypedData).toHaveBeenCalledOnce();

    // Advance past TTL
    vi.advanceTimersByTime(3601 * 1000);
    await manager.allow("0xtoken" as Address);
    expect(signer.signTypedData).toHaveBeenCalledTimes(2); // re-signed

    // SessionExpired event should have fired
    const expiredEvents = emitted.filter((e) => e.type === events.SessionExpired);
    expect(expiredEvents).toHaveLength(1);
    expect("reason" in expiredEvents[0]! && expiredEvents[0].reason).toBe("ttl");
  });

  it("TTL 0: every operation triggers signing prompt", async ({
    relayer,
    signer,
    storage,
    sessionStorage,
    createCredentialManager,
  }) => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const manager = createCredentialManager({
      relayer,
      signer,
      storage,
      sessionStorage,
      keypairTTL: 604800,
      sessionTTL: 0,
    });
    await manager.allow("0xtoken" as Address);
    expect(signer.signTypedData).toHaveBeenCalledOnce();

    await manager.allow("0xtoken" as Address);
    expect(signer.signTypedData).toHaveBeenCalledTimes(2);

    await manager.allow("0xtoken" as Address);
    expect(signer.signTypedData).toHaveBeenCalledTimes(3);
  });

  it("TTL expiry does not clear FHE keypair in persistent storage", async ({
    relayer,
    signer,
    storage,
    sessionStorage,
    createCredentialManager,
  }) => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const manager = createCredentialManager({
      relayer,
      signer,
      storage,
      sessionStorage,
      keypairTTL: 604800,
      sessionTTL: 3600,
    });
    await manager.allow("0xtoken" as Address);

    const address = await signer.getAddress();
    const chainId = await signer.getChainId();
    const storeKey = await CredentialsManager.computeStoreKey(address, chainId);
    const storedBefore = await storage.get(storeKey);
    expect(storedBefore).not.toBeNull();

    // Expire the session
    vi.advanceTimersByTime(3601 * 1000);
    await manager.allow("0xtoken" as Address);

    // Persistent storage should still have the FHE keypair
    const storedAfter = await storage.get(storeKey);
    expect(storedAfter).not.toBeNull();
    // keypair should NOT have been regenerated
    expect(relayer.generateKeypair).toHaveBeenCalledOnce();
  });

  it("disconnect before TTL expiry revokes session (existing behavior)", async ({
    relayer,
    signer,
    storage,
    sessionStorage,
    createCredentialManager,
  }) => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const manager = createCredentialManager({
      relayer,
      signer,
      storage,
      sessionStorage,
      keypairTTL: 604800,
      sessionTTL: 3600,
    });
    await manager.allow("0xtoken" as Address);

    // Disconnect (revoke) before TTL expires
    vi.advanceTimersByTime(10 * 60 * 1000); // 10 minutes
    await manager.revoke();
    expect(await manager.isAllowed()).toBe(false);

    // Next allow should re-sign (not regenerate)
    await manager.allow("0xtoken" as Address);
    expect(signer.signTypedData).toHaveBeenCalledTimes(2);
    expect(relayer.generateKeypair).toHaveBeenCalledOnce();
  });

  it("isAllowed() returns false when session TTL expired", async ({
    relayer,
    signer,
    storage,
    sessionStorage,
    createCredentialManager,
  }) => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const manager = createCredentialManager({
      relayer,
      signer,
      storage,
      sessionStorage,
      keypairTTL: 604800,
      sessionTTL: 3600,
    });
    await manager.allow("0xtoken" as Address);
    expect(await manager.isAllowed()).toBe(true);

    vi.advanceTimersByTime(3601 * 1000);
    expect(await manager.isAllowed()).toBe(false);
  });

  it("config change: old sessions use their recorded TTL", async ({
    relayer,
    signer,
    storage,
    sessionStorage,
    createCredentialManager,
  }) => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

    // Create session with 1-hour TTL
    const manager1 = createCredentialManager({
      relayer,
      signer,
      storage,
      sessionStorage,
      keypairTTL: 604800,
      sessionTTL: 3600,
    });
    await manager1.allow("0xtoken" as Address);

    // Advance 30 minutes
    vi.advanceTimersByTime(30 * 60 * 1000);

    // Create new manager with 10-second TTL (simulates config change)
    const manager2 = createCredentialManager({
      relayer,
      signer,
      storage,
      sessionStorage,
      keypairTTL: 604800,
      sessionTTL: 10, // shorter TTL
    });

    // Old session should still be valid (uses its recorded 3600s TTL)
    await manager2.allow("0xtoken" as Address);
    expect(signer.signTypedData).toHaveBeenCalledOnce(); // no re-sign
  });

  it("chain switch with active TTL: independent sessions unaffected", async ({
    relayer,
    signer,
    createMockSigner,
    createCredentialManager,
    storage,
    sessionStorage,
  }) => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const manager = createCredentialManager({
      relayer,
      signer,
      storage,
      sessionStorage,
      keypairTTL: 604800,
      sessionTTL: 3600,
    });
    await manager.allow("0xtoken" as Address);

    // Switch chain — new signer returns different chainId
    const signer2 = createMockSigner({
      getChainId: vi.fn().mockResolvedValue(1),
    });

    const manager2 = createCredentialManager({
      relayer,
      signer: signer2,
      storage,
      sessionStorage,
      keypairTTL: 604800,
      sessionTTL: 3600,
    });

    // Different chain — should generate new keypair
    await manager2.allow("0xtoken" as Address);
    expect(relayer.generateKeypair).toHaveBeenCalledTimes(2);

    // Original chain session should still be valid
    vi.advanceTimersByTime(30 * 60 * 1000);
    await manager.allow("0xtoken" as Address);
    expect(signer.signTypedData).toHaveBeenCalledOnce(); // original signer, no re-sign
  });
});
