/**
 * Tests for SDK-43: transparent internal batching of credential requests.
 *
 * The fhevm ACL contract enforces a hard limit of 10 contract addresses per
 * EIP-712 credential. The SDK splits larger address sets into batches of ≤ 10
 * internally; callers interact only with the returned `CredentialSet`.
 */
import { describe, expect, vi } from "vitest";
import { test, createMockSigner, createMockStorage } from "../../test-fixtures";
import { CredentialsManager } from "../credentials-manager";
import { DelegatedCredentialsManager } from "../delegated-credentials-manager";
import { ZamaErrorCode } from "../../errors";
import { getAddress, type Address } from "viem";
import type { createMockRelayer as CreateMockRelayer } from "../../test-fixtures";

// ── Helpers ────────────────────────────────────────────────────────────────

/** Generate `n` unique deterministic contract addresses. */
function makeAddresses(n: number): Address[] {
  return Array.from({ length: n }, (_, i) => {
    const hex = i.toString(16).padStart(40, "0");
    return `0x${hex}` as Address;
  });
}

function createManager(relayer: ReturnType<typeof CreateMockRelayer>) {
  const signer = createMockSigner();
  const storage = createMockStorage();
  const sessionStorage = createMockStorage();
  vi.mocked(relayer.generateKeypair).mockResolvedValue({
    publicKey: "0xpub",
    privateKey: "0xpriv",
  });
  vi.mocked(signer.signTypedData).mockResolvedValue("0xsig");
  return new CredentialsManager({ relayer, signer, storage, sessionStorage, keypairTTL: 86400 });
}

function mockDelegatedEIP712(relayer: ReturnType<typeof CreateMockRelayer>) {
  vi.mocked(relayer.createDelegatedUserDecryptEIP712).mockResolvedValue({
    domain: { name: "test", version: "1", chainId: 31337n, verifyingContract: "0xkms" },
    types: { DelegatedUserDecryptRequestVerification: [] },
    message: {
      publicKey: "0xpub",
      contractAddresses: [],
      delegatorAddress: "0x" + "cc".repeat(20),
      startTimestamp: "1000",
      durationDays: "1",
      extraData: "0x",
    },
  } as never);
}

function createDelegatedManager(relayer: ReturnType<typeof CreateMockRelayer>) {
  const signer = createMockSigner();
  const storage = createMockStorage();
  const sessionStorage = createMockStorage();
  vi.mocked(relayer.generateKeypair).mockResolvedValue({
    publicKey: "0xpub",
    privateKey: "0xpriv",
  });
  vi.mocked(signer.signTypedData).mockResolvedValue("0xsig");
  mockDelegatedEIP712(relayer);
  return new DelegatedCredentialsManager({
    relayer,
    signer,
    storage,
    sessionStorage,
    keypairTTL: 86400,
  });
}

const DELEGATOR = "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC" as Address;

// ── Batching ────────────────────────────────────────────────────────────────

describe("credential batching", () => {
  describe("CredentialsManager", () => {
    test("10 addresses → 1 batch, 1 EIP-712 signature", async ({ relayer }) => {
      const manager = createManager(relayer);
      const addrs = makeAddresses(10);

      const credSet = await manager.allow(...addrs);

      expect(relayer.generateKeypair).toHaveBeenCalledOnce();
      expect(vi.mocked(createMockSigner().signTypedData)).not.toHaveBeenCalled(); // different instance
      // One batch → one signTypedData call on the manager's signer
      // We can verify by checking how many batches are in the credSet
      expect(credSet.batches).toHaveLength(1);
      expect(credSet.failures.size).toBe(0);
      // credentialFor works for every address
      for (const addr of addrs) {
        const creds = credSet.credentialFor(addr);
        expect(creds.contractAddresses).toContain(getAddress(addr));
      }
    });

    test("11 addresses → 2 batches (10 + 1), 2 sequential signatures", async ({ relayer }) => {
      const signer = createMockSigner();
      const storage = createMockStorage();
      const sessionStorage = createMockStorage();
      vi.mocked(relayer.generateKeypair).mockResolvedValue({
        publicKey: "0xpub",
        privateKey: "0xpriv",
      });
      vi.mocked(signer.signTypedData).mockResolvedValue("0xsig");
      const manager = new CredentialsManager({
        relayer,
        signer,
        storage,
        sessionStorage,
        keypairTTL: 86400,
      });
      const addrs = makeAddresses(11);

      const credSet = await manager.allow(...addrs);

      expect(relayer.generateKeypair).toHaveBeenCalledOnce();
      expect(signer.signTypedData).toHaveBeenCalledTimes(2);
      expect(credSet.batches).toHaveLength(2);
      expect(credSet.failures.size).toBe(0);
      expect(credSet.batches[0]!.contractAddresses).toHaveLength(10);
      expect(credSet.batches[1]!.contractAddresses).toHaveLength(1);

      // credentialFor routes each address to the correct batch
      for (const addr of addrs) {
        expect(() => credSet.credentialFor(addr)).not.toThrow();
      }
    });

    test("20 addresses → 2 batches of 10, 2 signatures", async ({ relayer }) => {
      const signer = createMockSigner();
      const storage = createMockStorage();
      const sessionStorage = createMockStorage();
      vi.mocked(relayer.generateKeypair).mockResolvedValue({
        publicKey: "0xpub",
        privateKey: "0xpriv",
      });
      vi.mocked(signer.signTypedData).mockResolvedValue("0xsig");
      const manager = new CredentialsManager({
        relayer,
        signer,
        storage,
        sessionStorage,
        keypairTTL: 86400,
      });
      const addrs = makeAddresses(20);

      const credSet = await manager.allow(...addrs);

      expect(relayer.generateKeypair).toHaveBeenCalledOnce();
      expect(signer.signTypedData).toHaveBeenCalledTimes(2);
      expect(credSet.batches).toHaveLength(2);
      expect(credSet.batches[0]!.contractAddresses).toHaveLength(10);
      expect(credSet.batches[1]!.contractAddresses).toHaveLength(10);
    });

    test("shared keypair across batches — generateKeypair called once even for 20 addresses", async ({
      relayer,
    }) => {
      const signer = createMockSigner();
      const storage = createMockStorage();
      const sessionStorage = createMockStorage();
      vi.mocked(relayer.generateKeypair).mockResolvedValue({
        publicKey: "0xpub_shared",
        privateKey: "0xpriv_shared",
      });
      vi.mocked(signer.signTypedData).mockResolvedValue("0xsig");
      const manager = new CredentialsManager({
        relayer,
        signer,
        storage,
        sessionStorage,
        keypairTTL: 86400,
      });

      const credSet = await manager.allow(...makeAddresses(20));

      expect(relayer.generateKeypair).toHaveBeenCalledOnce();
      // All batches share the same keypair
      for (const batch of credSet.batches) {
        expect(batch.publicKey).toBe("0xpub_shared");
        expect(batch.privateKey).toBe("0xpriv_shared");
      }
    });

    test("cache hit: calling allow() again with the same addresses issues no new signatures", async ({
      relayer,
    }) => {
      const signer = createMockSigner();
      const storage = createMockStorage();
      const sessionStorage = createMockStorage();
      vi.mocked(relayer.generateKeypair).mockResolvedValue({
        publicKey: "0xpub",
        privateKey: "0xpriv",
      });
      vi.mocked(signer.signTypedData).mockResolvedValue("0xsig");
      const manager = new CredentialsManager({
        relayer,
        signer,
        storage,
        sessionStorage,
        keypairTTL: 86400,
      });
      const addrs = makeAddresses(11);

      await manager.allow(...addrs);
      const signCallsAfterFirst = vi.mocked(signer.signTypedData).mock.calls.length;

      await manager.allow(...addrs);

      // No new signatures — all batches were cached
      expect(signer.signTypedData).toHaveBeenCalledTimes(signCallsAfterFirst);
    });
  });

  // ── Bin-packing ──────────────────────────────────────────────────────────

  describe("bin-packing", () => {
    test("extending from 10 → 11: existing batch is full, new batch created for the extra address", async ({
      relayer,
    }) => {
      const signer = createMockSigner();
      const storage = createMockStorage();
      const sessionStorage = createMockStorage();
      vi.mocked(relayer.generateKeypair).mockResolvedValue({
        publicKey: "0xpub",
        privateKey: "0xpriv",
      });
      vi.mocked(signer.signTypedData).mockResolvedValue("0xsig");
      const manager = new CredentialsManager({
        relayer,
        signer,
        storage,
        sessionStorage,
        keypairTTL: 86400,
      });
      const first10 = makeAddresses(10);
      const eleventh = makeAddresses(11)[10]!;

      await manager.allow(...first10);
      const signCallsAfterFirst = vi.mocked(signer.signTypedData).mock.calls.length;

      const credSet = await manager.allow(...first10, eleventh);

      // One new signature for the new batch (the eleventh address)
      expect(signer.signTypedData).toHaveBeenCalledTimes(signCallsAfterFirst + 1);
      expect(credSet.batches).toHaveLength(2);

      // All 11 addresses are accessible
      for (const addr of [...first10, eleventh]) {
        expect(() => credSet.credentialFor(addr)).not.toThrow();
      }
    });

    test("extending from 9 → 11: one address packed into the existing batch, one new batch", async ({
      relayer,
    }) => {
      const signer = createMockSigner();
      const storage = createMockStorage();
      const sessionStorage = createMockStorage();
      vi.mocked(relayer.generateKeypair).mockResolvedValue({
        publicKey: "0xpub",
        privateKey: "0xpriv",
      });
      vi.mocked(signer.signTypedData).mockResolvedValue("0xsig");
      const manager = new CredentialsManager({
        relayer,
        signer,
        storage,
        sessionStorage,
        keypairTTL: 86400,
      });
      const first9 = makeAddresses(9);
      const all11 = makeAddresses(11);
      const [tenth, eleventh] = [all11[9]!, all11[10]!];

      await manager.allow(...first9);
      const signCallsAfterFirst = vi.mocked(signer.signTypedData).mock.calls.length;

      const credSet = await manager.allow(...all11);

      // Batch 0 extended to 10 (re-signed) + new batch 1 created for the 11th
      // That's 2 new signatures (1 extension of batch 0, 1 creation of batch 1)
      expect(signer.signTypedData).toHaveBeenCalledTimes(signCallsAfterFirst + 2);
      expect(credSet.batches).toHaveLength(2);

      // All 11 addresses are accessible
      for (const addr of [...first9, tenth, eleventh]) {
        expect(() => credSet.credentialFor(addr)).not.toThrow();
      }

      // The 10th address was packed into batch 0 (same credential as the first 9)
      expect(credSet.credentialFor(first9[0]!)).toBe(credSet.credentialFor(tenth));
      // The 11th address is in batch 1 (different credential)
      expect(credSet.credentialFor(first9[0]!)).not.toBe(credSet.credentialFor(eleventh));
    });
  });

  // ── Partial failure ──────────────────────────────────────────────────────

  describe("partial failure", () => {
    test("signing rejection for batch 2 is captured in failures; batch 1 still succeeds", async ({
      relayer,
    }) => {
      const signer = createMockSigner();
      const storage = createMockStorage();
      const sessionStorage = createMockStorage();
      vi.mocked(relayer.generateKeypair).mockResolvedValue({
        publicKey: "0xpub",
        privateKey: "0xpriv",
      });
      // Batch 0 (first 10) succeeds; batch 1 (11th address) rejected
      vi.mocked(signer.signTypedData)
        .mockResolvedValueOnce("0xsig_batch0")
        .mockRejectedValueOnce(new Error("User rejected the request"));

      const manager = new CredentialsManager({
        relayer,
        signer,
        storage,
        sessionStorage,
        keypairTTL: 86400,
      });
      const addrs = makeAddresses(11);
      const [batch0Addrs, batch1Addr] = [addrs.slice(0, 10), addrs[10]!];

      // allow() resolves (no throw) even when batch 1 fails
      const credSet = await manager.allow(...addrs);

      // Batch 0 succeeded
      expect(credSet.batches).toHaveLength(1);
      for (const addr of batch0Addrs) {
        expect(() => credSet.credentialFor(addr)).not.toThrow();
        expect(credSet.credentialFor(addr).signature).toBe("0xsig_batch0");
      }

      // Batch 1 failed — credentialFor throws, tryCredentialFor returns null
      expect(() => credSet.credentialFor(batch1Addr)).toThrow(
        expect.objectContaining({ code: ZamaErrorCode.SigningRejected }),
      );
      expect(credSet.tryCredentialFor(batch1Addr)).toBeNull();
      expect(credSet.failures.size).toBe(1);
      expect(credSet.failures.has(getAddress(batch1Addr))).toBe(true);
    });

    test("tryCredentialFor returns null for a failed batch and the credential for a succeeded batch", async ({
      relayer,
    }) => {
      const signer = createMockSigner();
      const storage = createMockStorage();
      const sessionStorage = createMockStorage();
      vi.mocked(relayer.generateKeypair).mockResolvedValue({
        publicKey: "0xpub",
        privateKey: "0xpriv",
      });
      vi.mocked(signer.signTypedData)
        .mockResolvedValueOnce("0xsig_ok")
        .mockRejectedValueOnce(new Error("User rejected the request"));

      const manager = new CredentialsManager({
        relayer,
        signer,
        storage,
        sessionStorage,
        keypairTTL: 86400,
      });
      const addrs = makeAddresses(11);

      const credSet = await manager.allow(...addrs);

      expect(credSet.tryCredentialFor(addrs[0]!)).not.toBeNull();
      expect(credSet.tryCredentialFor(addrs[10]!)).toBeNull();
    });
  });

  // ── DelegatedCredentialsManager ─────────────────────────────────────────

  describe("DelegatedCredentialsManager", () => {
    test("15 addresses → 2 batches (10 + 5), 2 sequential signatures", async ({ relayer }) => {
      const signer = createMockSigner();
      const storage = createMockStorage();
      const sessionStorage = createMockStorage();
      vi.mocked(relayer.generateKeypair).mockResolvedValue({
        publicKey: "0xpub",
        privateKey: "0xpriv",
      });
      vi.mocked(signer.signTypedData).mockResolvedValue("0xsig");
      mockDelegatedEIP712(relayer);
      const manager = new DelegatedCredentialsManager({
        relayer,
        signer,
        storage,
        sessionStorage,
        keypairTTL: 86400,
      });
      const addrs = makeAddresses(15);

      const credSet = await manager.allow(DELEGATOR, ...addrs);

      expect(relayer.generateKeypair).toHaveBeenCalledOnce();
      expect(signer.signTypedData).toHaveBeenCalledTimes(2);
      expect(credSet.batches).toHaveLength(2);
      expect(credSet.failures.size).toBe(0);
      expect(credSet.batches[0]!.contractAddresses).toHaveLength(10);
      expect(credSet.batches[1]!.contractAddresses).toHaveLength(5);

      for (const addr of addrs) {
        const creds = credSet.credentialFor(addr);
        expect(creds.delegatorAddress).toBe(DELEGATOR);
      }
    });

    test("different delegators get separate credential sets", async ({ relayer }) => {
      const OTHER_DELEGATOR = "0xdDdDddDdDdddDDddDDddDDDDdDdDDdDDdDDDDDDd" as Address;
      const manager = createDelegatedManager(relayer);
      const addrs = makeAddresses(11);

      await manager.allow(DELEGATOR, ...addrs);
      await manager.allow(OTHER_DELEGATOR, ...addrs);

      // Two separate keypairs (one per delegator)
      expect(relayer.generateKeypair).toHaveBeenCalledTimes(2);
    });
  });

  // ── CredentialSet semantics ──────────────────────────────────────────────

  describe("CredentialSet semantics", () => {
    test("credentialFor on an address not passed to allow() throws", async ({ relayer }) => {
      const manager = createManager(relayer);
      const addrs = makeAddresses(3);
      const unknown = makeAddresses(4)[3]!;

      const credSet = await manager.allow(...addrs);

      expect(() => credSet.credentialFor(unknown)).toThrow(/No credential found/);
    });

    test("credentialFor is case-insensitive (normalizes checksummed address)", async ({
      relayer,
    }) => {
      const manager = createManager(relayer);
      const addr = makeAddresses(1)[0]!;
      // Lowercase variant of the address
      const addrLower = addr.toLowerCase() as Address;

      const credSet = await manager.allow(addr);

      // credentialFor should work regardless of checksum casing
      expect(() => credSet.credentialFor(addrLower)).not.toThrow();
    });

    test("20 addresses: all are accessible via credentialFor (complete coverage, no gaps)", async ({
      relayer,
    }) => {
      const signer = createMockSigner();
      const storage = createMockStorage();
      const sessionStorage = createMockStorage();
      vi.mocked(relayer.generateKeypair).mockResolvedValue({
        publicKey: "0xpub",
        privateKey: "0xpriv",
      });
      vi.mocked(signer.signTypedData).mockResolvedValue("0xsig");
      const manager = new CredentialsManager({
        relayer,
        signer,
        storage,
        sessionStorage,
        keypairTTL: 86400,
      });
      const addrs = makeAddresses(20);

      const credSet = await manager.allow(...addrs);

      expect(credSet.batches).toHaveLength(2);
      expect(credSet.failures.size).toBe(0);

      // Every address resolves to a credential (no gaps)
      for (const addr of addrs) {
        expect(() => credSet.credentialFor(addr)).not.toThrow();
      }

      // Addresses in different batches return different credential objects
      const batch0Addr = credSet.batches[0]!.contractAddresses[0]!;
      const batch1Addr = credSet.batches[1]!.contractAddresses[0]!;
      expect(credSet.credentialFor(batch0Addr)).not.toBe(credSet.credentialFor(batch1Addr));
    });
  });
});
