import { createMockRouter, describe, expect, test, vi } from "../../test-fixtures";
import type { Address, Hex } from "viem";
import { createMockChain } from "../../test-fixtures/chain";
import { createMockRelayer } from "../../test-fixtures/relayer";
import { SigningFailedError } from "../../errors/signing";
import {
  PreparedPermitChainMismatchError,
  PreparedPermitExpiredError,
  PreparedPermitMismatchError,
  TransportKeyPairChangedError,
} from "../../errors/credential";
import { ConfigurationError } from "../../errors/relayer";
import { checksum } from "../../schemas/primitives";
import type { GenericSigner } from "../../types";
import { assertNonNullable } from "../../utils/assertions";
import type { CredentialService } from "../credential-service";
import { MAX_CONTRACTS_PER_PERMIT, SECONDS_PER_DAY } from "../utils";

const USER = "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B" as Address;
const DELEGATOR = "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC" as Address;

const ADDRS = Array.from({ length: 23 }, (_, i) => {
  const hex = i.toString(16).padStart(40, "0");
  return `0x${hex}` as const;
});
const A = ADDRS[0]!;
const B = ADDRS[1]!;

describe("CredentialService.preparePermit", () => {
  test("builds unsigned EIP-712 typed data without prompting the signer", async ({
    credentialService,
    signer,
  }) => {
    const prepared = await credentialService.preparePermit({ signer: USER, contracts: [A] });

    expect(signer.signTypedData).not.toHaveBeenCalled();
    expect(prepared.version).toBe(1);
    expect(prepared.signerAddress).toBe(USER);
    expect(prepared.contracts).toEqual([A]);
    expect(prepared.chainId).toBe(31337);
    expect(prepared.delegatorAddress).toBeUndefined();
    expect(prepared.eip712).toBeDefined();
  });

  test("includes delegatorAddress for a delegated request", async ({ credentialService }) => {
    const prepared = await credentialService.preparePermit({
      signer: USER,
      contracts: [A],
      delegator: DELEGATOR,
    });
    expect(prepared.delegatorAddress).toBe(DELEGATOR);
  });

  test("defaults durationDays to the configured permitTTL", async ({ credentialService }) => {
    const prepared = await credentialService.preparePermit({ signer: USER, contracts: [A] });
    expect(prepared.durationDays).toBe(1); // fixture permitTTL
  });

  test("honors an explicit durationDays override", async ({ credentialService }) => {
    const prepared = await credentialService.preparePermit({
      signer: USER,
      contracts: [A],
      durationDays: 7,
    });
    expect(prepared.durationDays).toBe(7);
  });

  test("rejects an empty contracts list", async ({ credentialService }) => {
    await expect(
      credentialService.preparePermit({ signer: USER, contracts: [] }),
    ).rejects.toBeInstanceOf(ConfigurationError);
  });

  test("rejects more than MAX_CONTRACTS_PER_PERMIT addresses — no chunking", async ({
    credentialService,
  }) => {
    expect(ADDRS.length).toBeGreaterThan(MAX_CONTRACTS_PER_PERMIT);
    await expect(
      credentialService.preparePermit({ signer: USER, contracts: ADDRS }),
    ).rejects.toBeInstanceOf(ConfigurationError);
  });

  test("rejects self-delegation (delegator === signer)", async ({ credentialService }) => {
    await expect(
      credentialService.preparePermit({ signer: USER, contracts: [A], delegator: USER }),
    ).rejects.toBeInstanceOf(ConfigurationError);
  });

  test("rejects a durationDays above the V1 permit maximum of 365", async ({
    credentialService,
  }) => {
    await expect(
      credentialService.preparePermit({ signer: USER, contracts: [A], durationDays: 366 }),
    ).rejects.toBeInstanceOf(ConfigurationError);
  });

  test("returns a JSON-safe payload — round-trips through JSON.stringify/parse", async ({
    credentialService,
  }) => {
    const prepared = await credentialService.preparePermit({ signer: USER, contracts: [A] });

    const roundTripped = JSON.parse(JSON.stringify(prepared));

    expect(roundTripped).toEqual(prepared);
    expect(typeof roundTripped.eip712.domain.chainId).toBe("string");
  });

  test("fails immediately when the transport key pair fails to persist, instead of returning an unpersisted key", async ({
    credentialService,
    storage,
  }) => {
    vi.spyOn(storage, "set").mockRejectedValueOnce(new Error("storage full"));

    await expect(credentialService.preparePermit({ signer: USER, contracts: [A] })).rejects.toThrow(
      "storage full",
    );
  });

  test("rejects instead of returning an unpersisted key when a concurrent revokeTransportKeyPair rotates the scope mid-generation", async ({
    createCredentialService,
    relayer,
  }) => {
    // A scoped key pair is required to reach clearScope()'s epoch bump — the
    // per-signer path has no equivalent rotation primitive.
    const credentialService = createCredentialService({ scope: "tenant-1" });

    // Simulate revokeTransportKeyPair() landing while preparePermit's own
    // getOrCreate() is still generating a fresh key pair for the same scope.
    // Delegates to the default mock implementation for the branded return value —
    // only the timing (the revoke landing mid-generation) is under test here.
    const originalGenerate = vi.mocked(relayer.generateTransportKeyPair).getMockImplementation();
    assertNonNullable(originalGenerate, "relayer.generateTransportKeyPair mock implementation");
    vi.mocked(relayer.generateTransportKeyPair).mockImplementationOnce(async () => {
      await credentialService.revokeTransportKeyPair("tenant-1");
      return originalGenerate();
    });

    await expect(
      credentialService.preparePermit({ signer: USER, contracts: [A] }),
    ).rejects.toBeInstanceOf(TransportKeyPairChangedError);
  });
});

describe("CredentialService.registerPermit", () => {
  async function prepareAndSign(
    credentialService: CredentialService,
    signer: GenericSigner,
    overrides: { delegator?: Address; contracts?: Address[] } = {},
  ) {
    const prepared = await credentialService.preparePermit({
      signer: USER,
      contracts: overrides.contracts ?? [A],
      delegator: overrides.delegator,
    });
    const signature = (await signer.signTypedData(prepared.eip712)) as Hex;
    return { prepared, signature };
  }

  test("verifies and persists a valid signature", async ({ credentialService, signer }) => {
    const { prepared, signature } = await prepareAndSign(credentialService, signer);

    await credentialService.registerPermit(prepared, signature);

    expect(await credentialService.hasPermit([A])).toBe(true);
  });

  test("registers a delegated permit under the delegator scope only", async ({
    credentialService,
    signer,
  }) => {
    const { prepared, signature } = await prepareAndSign(credentialService, signer, {
      delegator: DELEGATOR,
    });

    await credentialService.registerPermit(prepared, signature);

    expect(await credentialService.hasPermit([A])).toBe(false);
    expect(await credentialService.hasPermit([A], DELEGATOR)).toBe(true);
  });

  test("registers successfully after a JSON.stringify/parse round trip — the exact custody handoff", async ({
    credentialService,
    signer,
  }) => {
    const { prepared, signature } = await prepareAndSign(credentialService, signer);

    const rehydrated = JSON.parse(JSON.stringify(prepared));
    await credentialService.registerPermit(rehydrated, signature);

    expect(await credentialService.hasPermit([A])).toBe(true);
  });

  test("wraps a malformed prepared payload in ConfigurationError, not a raw ZodError", async ({
    credentialService,
    signer,
  }) => {
    const { prepared, signature } = await prepareAndSign(credentialService, signer);
    const malformed = { ...prepared, contracts: "not-an-array" };

    await expect(
      credentialService.registerPermit(malformed as unknown as typeof prepared, signature),
    ).rejects.toBeInstanceOf(ConfigurationError);
  });

  test("rejects prepared.chainId retargeted to the newly active chain while eip712.domain.chainId still reflects the prepare-time chain", async ({
    createCredentialService,
  }) => {
    const relayerA = createMockRelayer({ chain: createMockChain({ id: 1 }) });
    const relayerB = createMockRelayer({ chain: createMockChain({ id: 2 }) });
    const router = createMockRouter({
      chains: [createMockChain({ id: 1 }), createMockChain({ id: 2 })],
      relayers: { 1: relayerA, 2: relayerB },
      activeChainId: 1,
    });
    const credentialService = createCredentialService({ router });

    const prepared = await credentialService.preparePermit({ signer: USER, contracts: [A] });

    // Switch to chain 2, then retarget prepared.chainId to match the new active
    // chain — eip712.domain.chainId, baked in at prepare time, still says chain 1.
    // The active-chain guard alone would let this through; the mismatch check must
    // still catch it.
    router.switchChain(2);
    const tampered = { ...prepared, chainId: 2 };

    await expect(
      credentialService.registerPermit(tampered, "0x1234" as Hex),
    ).rejects.toBeInstanceOf(PreparedPermitMismatchError);
  });

  test("rejects a tampered contracts field even though the signature still verifies", async ({
    credentialService,
    signer,
  }) => {
    const { prepared, signature } = await prepareAndSign(credentialService, signer);
    const tampered = { ...prepared, contracts: [...prepared.contracts, checksum(B)] };

    await expect(credentialService.registerPermit(tampered, signature)).rejects.toBeInstanceOf(
      PreparedPermitMismatchError,
    );
  });

  test("rejects a tampered startTimestamp field even though the signature still verifies", async ({
    credentialService,
    signer,
  }) => {
    const { prepared, signature } = await prepareAndSign(credentialService, signer);
    const tampered = { ...prepared, startTimestamp: prepared.startTimestamp - 100 };

    await expect(credentialService.registerPermit(tampered, signature)).rejects.toBeInstanceOf(
      PreparedPermitMismatchError,
    );
  });

  test("rejects a tampered durationDays field even though the signature still verifies", async ({
    credentialService,
    signer,
  }) => {
    const { prepared, signature } = await prepareAndSign(credentialService, signer);
    const tampered = { ...prepared, durationDays: prepared.durationDays + 5 };

    await expect(credentialService.registerPermit(tampered, signature)).rejects.toBeInstanceOf(
      PreparedPermitMismatchError,
    );
  });

  test("rejects a forged delegatorAddress field even though the signature still verifies", async ({
    credentialService,
    signer,
  }) => {
    // Signed as a self permit (no delegator), then a delegator is spliced in after
    // signing — the signature covers eip712.message, which has no delegatorAddress.
    const { prepared, signature } = await prepareAndSign(credentialService, signer);
    const tampered = { ...prepared, delegatorAddress: checksum(DELEGATOR) };

    await expect(credentialService.registerPermit(tampered, signature)).rejects.toBeInstanceOf(
      PreparedPermitMismatchError,
    );
  });

  test("rejects a stripped delegatorAddress field even though the signature still verifies", async ({
    credentialService,
    signer,
  }) => {
    // Signed as a delegated permit, then delegatorAddress is stripped after signing —
    // this must not silently downgrade to a direct-scope permit.
    const { prepared, signature } = await prepareAndSign(credentialService, signer, {
      delegator: DELEGATOR,
    });
    const { delegatorAddress: _delegatorAddress, ...tampered } = prepared;

    await expect(credentialService.registerPermit(tampered, signature)).rejects.toBeInstanceOf(
      PreparedPermitMismatchError,
    );
  });

  test("keeps the EIP-712 domain and top-level chainId consistent across a chain switch mid-flight", async ({
    createCredentialService,
  }) => {
    const relayerA = createMockRelayer({ chain: createMockChain({ id: 1 }) });
    const relayerB = createMockRelayer({ chain: createMockChain({ id: 2 }) });
    const router = createMockRouter({
      chains: [createMockChain({ id: 1 }), createMockChain({ id: 2 })],
      relayers: { 1: relayerA, 2: relayerB },
      activeChainId: 1,
    });
    const credentialService = createCredentialService({ router });

    // Switch chains between preparePermit's snapshot of the relayer/chainId and its
    // relayer call, simulating a race with a concurrent switchChain().
    vi.mocked(relayerA.createUnsignedLegacyDecryptionPermitEip712).mockImplementationOnce(
      async () => {
        router.switchChain(2);
        return {
          domain: { name: "Decryption", version: "1", chainId: 1n, verifyingContract: A },
          types: { UserDecryptRequestVerification: [] },
          primaryType: "UserDecryptRequestVerification",
          message: {
            publicKey: "0xpubkey",
            contractAddresses: [A],
            startTimestamp: "1000",
            durationDays: "1",
            extraData: "0x",
          },
        };
      },
    );

    const prepared = await credentialService.preparePermit({ signer: USER, contracts: [A] });

    // Both must reflect chain 1 (the chain active when preparePermit started),
    // not chain 2 (active by the time the relayer call returned).
    expect(prepared.chainId).toBe(1);
    expect(relayerA.createUnsignedLegacyDecryptionPermitEip712).toHaveBeenCalledOnce();
    expect(relayerB.createUnsignedLegacyDecryptionPermitEip712).not.toHaveBeenCalled();
  });

  test("registerPermit uses one relayer/chain snapshot across its awaits despite a chain switch mid-flight", async ({
    createCredentialService,
    storage,
  }) => {
    const relayerA = createMockRelayer({ chain: createMockChain({ id: 1 }) });
    const relayerB = createMockRelayer({ chain: createMockChain({ id: 2 }) });
    const router = createMockRouter({
      chains: [createMockChain({ id: 1 }), createMockChain({ id: 2 })],
      relayers: { 1: relayerA, 2: relayerB },
      activeChainId: 1,
    });
    const credentialService = createCredentialService({ router });

    const prepared = await credentialService.preparePermit({ signer: USER, contracts: [A] });
    const signature = "0x1234" as Hex;

    // Switch chains during registerPermit's keypair lookup (its first await),
    // simulating a race with a concurrent switchChain().
    const originalGet = storage.get.bind(storage);
    vi.spyOn(storage, "get").mockImplementationOnce(async (key: string) => {
      router.switchChain(2);
      return originalGet(key);
    });

    await credentialService.registerPermit(prepared, signature);

    expect(relayerA.parseSignedDecryptionPermit).toHaveBeenCalledOnce();
    expect(relayerB.parseSignedDecryptionPermit).not.toHaveBeenCalled();
  });

  test("throws PreparedPermitChainMismatchError when prepared.chainId differs from the active chain", async ({
    credentialService,
    signer,
  }) => {
    const { prepared, signature } = await prepareAndSign(credentialService, signer);
    const mismatched = { ...prepared, chainId: prepared.chainId + 1 };

    await expect(credentialService.registerPermit(mismatched, signature)).rejects.toBeInstanceOf(
      PreparedPermitChainMismatchError,
    );
  });

  test("throws PreparedPermitExpiredError once the permit's validity window has elapsed", async ({
    credentialService,
    signer,
  }) => {
    const { prepared, signature } = await prepareAndSign(credentialService, signer);
    const expired = {
      ...prepared,
      startTimestamp: prepared.startTimestamp - 10 * SECONDS_PER_DAY,
      durationDays: 1,
    };

    await expect(credentialService.registerPermit(expired, signature)).rejects.toBeInstanceOf(
      PreparedPermitExpiredError,
    );
  });

  test("throws TransportKeyPairChangedError when the signed payload's key pair no longer matches the vault", async ({
    credentialService,
    signer,
  }) => {
    const { prepared, signature } = await prepareAndSign(credentialService, signer);
    const staleKeyPair = { ...prepared, transportPublicKey: "0xdead" as Hex };

    await expect(credentialService.registerPermit(staleKeyPair, signature)).rejects.toBeInstanceOf(
      TransportKeyPairChangedError,
    );
  });

  test("wraps signature verification failure as a typed signing error", async ({
    credentialService,
    signer,
    relayer,
  }) => {
    const { prepared } = await prepareAndSign(credentialService, signer);
    vi.mocked(relayer.parseSignedDecryptionPermit).mockRejectedValueOnce(
      new Error("bad signature"),
    );

    await expect(credentialService.registerPermit(prepared, "0xbad" as Hex)).rejects.toBeInstanceOf(
      SigningFailedError,
    );
  });
});
