import type { Address } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "../test-fixtures";
import { KeypairVault } from "../credentials/keypair-vault";
import { MemoryStorage } from "../storage/memory-storage";
import type { StoredKeypair } from "../credentials/types";

const CONTRACT_A = "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a" as Address;
const CONTRACT_B = "0x3C3c3C3c3C3C3c3c3c3C3c3C3C3c3c3C3c3c3C3C" as Address;

/**
 * SDK-level credential lifecycle integration tests.
 *
 * These tests validate the post-refactor invariants that the deleted
 * `session-ttl.test.ts` previously covered for the legacy `CredentialsManager`,
 * now reframed against the `KeypairVault` + `PermissionStore` split:
 *
 *  1. Permit expiry triggers a fresh signature, but the FHE keypair is reused.
 *  2. Permits are chain-scoped — switching chains forces a fresh signature on
 *     the new chain without invalidating the original chain's permit.
 *  3. Reload round-trip: a new SDK reading the same storage finds the existing
 *     permit and does not prompt for re-signature.
 */
describe("ZamaSDK credentials lifecycle", () => {
  describe("permit expiry triggers re-sign", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("re-signs after permitDuration elapses but reuses the FHE keypair", async ({
      createSDK,
      signer,
      relayer,
      storage,
    }) => {
      vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

      const sdk = createSDK({ permitDuration: 1 });

      await sdk.allow([CONTRACT_A]);
      expect(signer.signTypedData).toHaveBeenCalledOnce();
      expect(relayer.generateKeypair).toHaveBeenCalledOnce();

      // Snapshot the keypair after the first allow — it must survive the permit
      // expiry below.
      const userAddress = await signer.getAddress();
      const keypairKey = await KeypairVault.storageKey(userAddress);
      const keypairBefore = (await storage.get(keypairKey)) as StoredKeypair;
      expect(keypairBefore).not.toBeNull();
      const publicKeyBefore = keypairBefore.publicKey;

      // Advance just past 1 day — permit (1d) expired, keypair (default 30d) alive.
      vi.advanceTimersByTime(86400 * 1000 + 1);

      await sdk.allow([CONTRACT_A]);
      expect(signer.signTypedData).toHaveBeenCalledTimes(2);

      // The keypair MUST NOT have been regenerated.
      expect(relayer.generateKeypair).toHaveBeenCalledOnce();
      const keypairAfter = (await storage.get(keypairKey)) as StoredKeypair;
      expect(keypairAfter).not.toBeNull();
      expect(keypairAfter.publicKey).toBe(publicKeyBefore);
    });

    it("does not re-sign within permitDuration", async ({ createSDK, signer }) => {
      vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

      const sdk = createSDK({ permitDuration: 1 });

      await sdk.allow([CONTRACT_A]);
      expect(signer.signTypedData).toHaveBeenCalledOnce();

      // Advance 12 hours — well within the 1-day permit lifetime.
      vi.advanceTimersByTime(12 * 3600 * 1000);

      await sdk.allow([CONTRACT_A]);
      expect(signer.signTypedData).toHaveBeenCalledOnce();
    });
  });

  describe("chain-switch isolation", () => {
    it("isAllowed on a different chain returns false and allow re-signs", async ({
      createMockSigner,
      createMockProvider,
      createSDK,
    }) => {
      const CHAIN_A = 31337;
      const CHAIN_B = 11155111;

      const signerA = createMockSigner({ getChainId: vi.fn().mockResolvedValue(CHAIN_A) });
      const providerA = createMockProvider({ getChainId: vi.fn().mockResolvedValue(CHAIN_A) });

      // Shared storage so reconfigured signer/provider can find the keypair —
      // chain isolation must come from permit scoping, not from storage.
      const storage = new MemoryStorage();

      const sdkA = createSDK({ signer: signerA, provider: providerA, storage });
      await sdkA.allow([CONTRACT_A]);
      expect(signerA.signTypedData).toHaveBeenCalledOnce();
      expect(await sdkA.isAllowed([CONTRACT_A])).toBe(true);

      // Reconstruct on chain B with the same backing storage. Same signer
      // address (default USER), different chain id.
      const signerB = createMockSigner({ getChainId: vi.fn().mockResolvedValue(CHAIN_B) });
      const providerB = createMockProvider({ getChainId: vi.fn().mockResolvedValue(CHAIN_B) });
      const sdkB = createSDK({ signer: signerB, provider: providerB, storage });

      // Permit signed on chain A must NOT be considered valid on chain B.
      expect(await sdkB.isAllowed([CONTRACT_A])).toBe(false);

      await sdkB.allow([CONTRACT_A]);
      expect(signerB.signTypedData).toHaveBeenCalledOnce();

      // Switch back to chain A — the original permit must still be honored.
      const signerA2 = createMockSigner({ getChainId: vi.fn().mockResolvedValue(CHAIN_A) });
      const providerA2 = createMockProvider({ getChainId: vi.fn().mockResolvedValue(CHAIN_A) });
      const sdkA2 = createSDK({ signer: signerA2, provider: providerA2, storage });

      expect(await sdkA2.isAllowed([CONTRACT_A])).toBe(true);
      await sdkA2.allow([CONTRACT_A]);
      // No fresh signature requested — the chain-A permit is still cached.
      expect(signerA2.signTypedData).not.toHaveBeenCalled();
    });
  });

  describe("reload round-trip", () => {
    it("a fresh SDK with the same storage reuses the persisted permit", async ({
      createMockSigner,
      createMockProvider,
      createMockRelayer,
      createSDK,
    }) => {
      const storage = new MemoryStorage();

      const signerA = createMockSigner();
      const providerA = createMockProvider();
      const relayerA = createMockRelayer();
      const sdkA = createSDK({
        signer: signerA,
        provider: providerA,
        relayer: relayerA,
        storage,
      });

      await sdkA.allow([CONTRACT_A, CONTRACT_B]);
      expect(signerA.signTypedData).toHaveBeenCalledOnce();
      expect(await sdkA.isAllowed([CONTRACT_A, CONTRACT_B])).toBe(true);

      // Tear down SDK A — drop references and stop using it. We do NOT call
      // `terminate()` because that would call `relayer.terminate()` on the
      // shared mock relayer (it wouldn't actually do anything destructive,
      // but the contract under test is "build a new SDK and read storage").
      sdkA.dispose();

      // Build SDK B against the SAME storage. Same signer address, same
      // chainId, fresh signer/relayer mocks — so call counts on SDK B's
      // signer start at zero.
      const signerB = createMockSigner();
      const providerB = createMockProvider();
      const relayerB = createMockRelayer();
      const sdkB = createSDK({
        signer: signerB,
        provider: providerB,
        relayer: relayerB,
        storage,
      });

      expect(await sdkB.isAllowed([CONTRACT_A, CONTRACT_B])).toBe(true);

      await sdkB.allow([CONTRACT_A, CONTRACT_B]);

      // SDK B must NOT have prompted for a signature — the persisted permit
      // signed by SDK A is still live.
      expect(signerB.signTypedData).not.toHaveBeenCalled();
      // Likewise the keypair must not have been regenerated; SDK B's relayer
      // mock is independent so a regeneration would appear here.
      expect(relayerB.generateKeypair).not.toHaveBeenCalled();
    });
  });
});
