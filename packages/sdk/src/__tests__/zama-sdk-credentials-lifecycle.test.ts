import type { Address } from "viem";
import { test as baseTest, describe, expect, vi } from "../test-fixtures";
import { MemoryStorage } from "../storage/memory-storage";

const CONTRACT_A = "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a" as Address;
const CONTRACT_B = "0x3C3c3C3c3C3C3c3c3c3C3c3C3C3c3c3C3c3c3C3C" as Address;

const PERMIT_DURATION_DAYS = 1;
const PERMIT_DURATION_MS = PERMIT_DURATION_DAYS * 86400 * 1000;

/**
 * Opt-in fake-timers fixture: only the tests that need to advance time pay the
 * cost. Real timers stay live for everything else (e.g. `dispose` cleanup,
 * concurrency tests).
 */
const test = baseTest.extend<{ fakeTime: void }>({
  fakeTime: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
      await use(undefined);
      vi.useRealTimers();
    },
    { auto: false },
  ],
});

/**
 * SDK-level credential lifecycle integration tests against the
 * `KeypairVault` + `PermissionStore` split:
 *
 *  1. Permit expiry triggers a fresh signature, but the FHE keypair is reused.
 *  2. Permits are chain-scoped — switching chains forces a fresh signature on
 *     the new chain without invalidating the original chain's permit.
 *  3. Reload round-trip: a new SDK reading the same storage finds the existing
 *     permit and does not prompt for re-signature.
 */
describe("ZamaSDK credentials lifecycle", () => {
  test("constructing the SDK does not warm keypairs", ({ createSDK, relayer }) => {
    createSDK();

    expect(relayer.generateTransportKeyPair).not.toHaveBeenCalled();
  });

  test("re-signs after permitTTL elapses but reuses the FHE keypair", async ({
    fakeTime: _fakeTime,
    createSDK,
    signer,
    relayer,
  }) => {
    const sdk = createSDK({ permitTTL: PERMIT_DURATION_DAYS });

    await sdk.permits.grantPermit([CONTRACT_A]);
    expect(signer.signTypedData).toHaveBeenCalledOnce();
    expect(relayer.generateTransportKeyPair).toHaveBeenCalledOnce();

    // Advance just past the permit lifetime — keypair (default 30d) is still alive.
    vi.advanceTimersByTime(PERMIT_DURATION_MS + 1);

    await sdk.permits.grantPermit([CONTRACT_A]);

    // Permit expired → fresh signature requested.
    expect(signer.signTypedData).toHaveBeenCalledTimes(2);
    // Keypair survived the permit expiry — the relayer was NOT asked to mint a new one.
    expect(relayer.generateTransportKeyPair).toHaveBeenCalledOnce();
  });

  test("does not re-sign within permitTTL", async ({ fakeTime: _fakeTime, createSDK, signer }) => {
    const sdk = createSDK({ permitTTL: PERMIT_DURATION_DAYS });

    await sdk.permits.grantPermit([CONTRACT_A]);
    expect(signer.signTypedData).toHaveBeenCalledOnce();

    vi.advanceTimersByTime(PERMIT_DURATION_MS / 2);

    await sdk.permits.grantPermit([CONTRACT_A]);
    expect(signer.signTypedData).toHaveBeenCalledOnce();
  });

  describe("chain-switch isolation", () => {
    test("isAllowed on a different chain returns false and allow re-signs", async ({
      createMockSigner,
      createMockProvider,
      createSDK,
    }) => {
      const CHAIN_A = 31337;
      const CHAIN_B = 11155111;

      const signerAAccount = {
        address: createMockSigner().walletAccount.getSnapshot()!.address,
        chainId: CHAIN_A,
      };
      const signerA = createMockSigner({
        walletAccount: {
          getSnapshot: vi.fn().mockReturnValue(signerAAccount),
          isReady: vi.fn().mockReturnValue(true),
          subscribe: vi.fn((listener) => {
            listener({ previous: undefined, next: signerAAccount });
            return () => {};
          }),
        },
        requireWalletAccount: vi.fn().mockReturnValue(signerAAccount),
      });
      const providerA = createMockProvider({ getChainId: vi.fn().mockResolvedValue(CHAIN_A) });

      // Shared storage so reconfigured signer/provider can find the keypair —
      // chain isolation must come from permit scoping, not from storage.
      const storage = new MemoryStorage();

      const sdkA = createSDK({ signer: signerA, provider: providerA, storage });
      await sdkA.permits.grantPermit([CONTRACT_A]);
      expect(signerA.signTypedData).toHaveBeenCalledOnce();
      expect(await sdkA.permits.hasPermit([CONTRACT_A])).toBe(true);

      // Reconstruct on chain B with the same backing storage. Same signer
      // address (default USER), different chain id.
      const signerBAccount = { address: signerAAccount.address, chainId: CHAIN_B };
      const signerB = createMockSigner({
        walletAccount: {
          getSnapshot: vi.fn().mockReturnValue(signerBAccount),
          isReady: vi.fn().mockReturnValue(true),
          subscribe: vi.fn((listener) => {
            listener({ previous: undefined, next: signerBAccount });
            return () => {};
          }),
        },
        requireWalletAccount: vi.fn().mockReturnValue(signerBAccount),
      });
      const providerB = createMockProvider({ getChainId: vi.fn().mockResolvedValue(CHAIN_B) });
      const sdkB = createSDK({ signer: signerB, provider: providerB, storage });

      // Permit signed on chain A must NOT be considered valid on chain B.
      expect(await sdkB.permits.hasPermit([CONTRACT_A])).toBe(false);

      await sdkB.permits.grantPermit([CONTRACT_A]);
      expect(signerB.signTypedData).toHaveBeenCalledOnce();

      // Switch back to chain A — the original permit must still be honored.
      const signerA2 = createMockSigner({
        walletAccount: {
          getSnapshot: vi.fn().mockReturnValue(signerAAccount),
          isReady: vi.fn().mockReturnValue(true),
          subscribe: vi.fn((listener) => {
            listener({ previous: undefined, next: signerAAccount });
            return () => {};
          }),
        },
        requireWalletAccount: vi.fn().mockReturnValue(signerAAccount),
      });
      const providerA2 = createMockProvider({ getChainId: vi.fn().mockResolvedValue(CHAIN_A) });
      const sdkA2 = createSDK({ signer: signerA2, provider: providerA2, storage });

      expect(await sdkA2.permits.hasPermit([CONTRACT_A])).toBe(true);
      await sdkA2.permits.grantPermit([CONTRACT_A]);
      // No fresh signature requested — the chain-A permit is still cached.
      expect(signerA2.signTypedData).not.toHaveBeenCalled();
    });
  });

  describe("reload round-trip", () => {
    test("a fresh SDK with the same storage reuses the persisted permit", async ({
      createMockSigner,
      createMockProvider,
      createMockRelayer,
      createSDK,
    }) => {
      const storage = new MemoryStorage();

      const signerA = createMockSigner();
      const providerA = createMockProvider();
      const relayerA = createMockRelayer();
      const sdkA = createSDK({ signer: signerA, provider: providerA, relayer: relayerA, storage });

      await sdkA.permits.grantPermit([CONTRACT_A, CONTRACT_B]);
      expect(signerA.signTypedData).toHaveBeenCalledOnce();
      expect(await sdkA.permits.hasPermit([CONTRACT_A, CONTRACT_B])).toBe(true);

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
      const sdkB = createSDK({ signer: signerB, provider: providerB, relayer: relayerB, storage });

      expect(await sdkB.permits.hasPermit([CONTRACT_A, CONTRACT_B])).toBe(true);

      await sdkB.permits.grantPermit([CONTRACT_A, CONTRACT_B]);

      // SDK B must NOT have prompted for a signature — the persisted permit
      // signed by SDK A is still live.
      expect(signerB.signTypedData).not.toHaveBeenCalled();
      // Likewise the keypair must not have been regenerated; SDK B's relayer
      // mock is independent so a regeneration would appear here.
      expect(relayerB.generateTransportKeyPair).not.toHaveBeenCalled();
    });
  });
});
