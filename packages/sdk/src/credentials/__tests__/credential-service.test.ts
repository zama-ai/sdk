import { createMockRouter, describe, expect, test, vi } from "../../test-fixtures";
import type { Address } from "viem";
import type { SerializeTransportKeyPairReturnType } from "@fhevm/sdk/actions/chain";
import { createMockChain } from "../../test-fixtures/chain";
import { createMockRelayer } from "../../test-fixtures/relayer";
import { TEST_TKMS_VERSION } from "../../test-fixtures/constants";
import { SigningRejectedError, SigningFailedError } from "../../errors/signing";
import { InvalidTransportKeyPairError } from "../../errors/credential";
import { ConfigurationError } from "../../errors/relayer";

const USER = "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B" as Address;
const DELEGATOR = "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC" as Address;
const DELEGATOR_B = "0xDdDDddddDDDDdDDDDDDdDdDddDdDDDdDddddddDd" as Address;

const ADDRS = Array.from({ length: 23 }, (_, i) => {
  const hex = i.toString(16).padStart(40, "0");
  return `0x${hex}` as const;
});
const A = ADDRS[0]!;
const B = ADDRS[1]!;
const C = ADDRS[2]!;

describe("CredentialService.allow", () => {
  test("creates a permit and stores it on the first call", async ({
    credentialService,
    signer,
  }) => {
    expect(await credentialService.hasPermit([A])).toBe(false);
    await credentialService.grantPermit([A]);
    expect(await credentialService.hasPermit([A])).toBe(true);
    expect(signer.signTypedData).toHaveBeenCalled();
  });

  test("does not re-prompt when an existing permit covers the requested set", async ({
    credentialService,
    signer,
  }) => {
    await credentialService.grantPermit([A]);
    vi.mocked(signer.signTypedData).mockClear();
    const second = await credentialService.grantPermit([A]);
    expect(signer.signTypedData).not.toHaveBeenCalled();
    expect(second.permissions).toHaveLength(1);
  });

  test("only prompts for uncovered contracts on partial coverage", async ({
    credentialService,
    signer,
  }) => {
    await credentialService.grantPermit([A]);
    vi.mocked(signer.signTypedData).mockClear();
    await credentialService.grantPermit([A, B]);
    // Only B uncovered → exactly one signing prompt
    expect(signer.signTypedData).toHaveBeenCalledOnce();
    expect(await credentialService.hasPermit([A, B])).toBe(true);
  });

  test("chunks 23 addresses into 3 wallet prompts", async ({ credentialService, signer }) => {
    await credentialService.grantPermit(ADDRS);
    // Boundary mock: chunk size 10 means ceil(23/10) = 3 user-visible signing prompts.
    expect(signer.signTypedData).toHaveBeenCalledTimes(3);
    expect(await credentialService.hasPermit(ADDRS)).toBe(true);
  });

  test("delegated allow does not satisfy direct-decrypt isAllowed", async ({
    credentialService,
    signer,
  }) => {
    await credentialService.grantPermit([A], DELEGATOR);
    expect(signer.signTypedData).toHaveBeenCalledOnce();
    // Direct scope still not covered.
    expect(await credentialService.hasPermit([A])).toBe(false);
    // Delegated scope is covered.
    expect(await credentialService.hasPermit([A], DELEGATOR)).toBe(true);
  });

  test("warms a keypair without prompting for permits when contracts is empty", async ({
    credentialService,
    signer,
  }) => {
    const result = await credentialService.grantPermit([]);
    expect(result.keypair.publicKey).toBeDefined();
    expect(result.permissions).toEqual([]);
    expect(signer.signTypedData).not.toHaveBeenCalled();
  });
});

describe("CredentialService transport-key-pair self-heal", () => {
  test("evicts the stale key pair and throws a typed error when the relayer rejects it", async ({
    credentialService,
    relayer,
  }) => {
    await credentialService.grantPermit([]); // warm: generate + store one key pair
    // The relayer can't re-derive the stored key pair (e.g. post KMS/TKMS rotation).
    vi.mocked(relayer.parseTransportKeyPair).mockRejectedValueOnce(
      new Error("invalid TransportKeyPairKeyPair"),
    );

    await expect(credentialService.grantPermit([A])).rejects.toBeInstanceOf(
      InvalidTransportKeyPairError,
    );
    // Eviction cleared the cache but did not itself regenerate.
    expect(relayer.generateTransportKeyPair).toHaveBeenCalledOnce();

    // Self-heal: the next resolution regenerates a fresh key pair and succeeds.
    await credentialService.grantPermit([B]);
    expect(relayer.generateTransportKeyPair).toHaveBeenCalledTimes(2);
  });

  test("does not evict on an unrelated signing failure", async ({ credentialService, relayer }) => {
    await credentialService.grantPermit([]);
    vi.mocked(relayer.parseTransportKeyPair).mockRejectedValueOnce(new Error("network glitch"));

    await expect(credentialService.grantPermit([A])).rejects.toBeInstanceOf(SigningFailedError);
    // Key pair left intact → the next grant reuses it, no regeneration.
    await credentialService.grantPermit([B]);
    expect(relayer.generateTransportKeyPair).toHaveBeenCalledOnce();
  });

  test("forwards the stored tkmsVersion when re-deriving the key pair to sign", async ({
    credentialService,
    relayer,
  }) => {
    // The generated key pair carries a TKMS version that the vault persists; the
    // sign path must pass it back so the relayer deserializes the private key
    // under the version it was generated with.
    await credentialService.grantPermit([A]);
    expect(relayer.parseTransportKeyPair).toHaveBeenCalledWith(
      expect.objectContaining({ tkmsVersion: TEST_TKMS_VERSION }),
    );
  });
});

describe("CredentialService chain switching", () => {
  test("signs permits against the active chain's relayer after switchChain", async ({
    createCredentialService,
  }) => {
    // A `CredentialService` outlives chain-only switches (LifecycleService keeps
    // credentials across them). Permits are EIP-712-signed against the *active*
    // chain's decryption domain, so post-switch grants must route through the new
    // chain's backend — not the one active at construction (SDK-458 regression).
    const relayerA = createMockRelayer();
    const relayerB = createMockRelayer();
    const router = createMockRouter({
      chains: [createMockChain({ id: 1 }), createMockChain({ id: 2 })],
      relayers: { 1: relayerA, 2: relayerB },
      activeChainId: 1,
    });
    const credentialService = createCredentialService({ router });

    await credentialService.grantPermit([A]);
    expect(relayerA.signDecryptionPermit).toHaveBeenCalledOnce();
    expect(relayerB.signDecryptionPermit).not.toHaveBeenCalled();

    router.switchChain(2);
    await credentialService.grantPermit([B]);
    expect(relayerB.signDecryptionPermit).toHaveBeenCalledOnce();
  });

  test("permits are keyed by the router chain, not the wallet account", async ({
    createCredentialService,
  }) => {
    // The permit storage key follows the router's active chain — the same chain
    // its EIP-712 domain is signed against — so a permit granted on one chain is
    // invisible on another and reappears on switch-back. The mock signer's fixed
    // account.chainId (31337) is deliberately unrelated to the router chains
    // here, proving the key no longer derives from the wallet account.
    const router = createMockRouter({
      chains: [createMockChain({ id: 1 }), createMockChain({ id: 2 })],
      activeChainId: 1,
    });
    const credentialService = createCredentialService({ router });

    await credentialService.grantPermit([A]);
    expect(await credentialService.hasPermit([A])).toBe(true);

    router.switchChain(2);
    expect(await credentialService.hasPermit([A])).toBe(false);

    router.switchChain(1);
    expect(await credentialService.hasPermit([A])).toBe(true);
  });
});

describe("CredentialService.isAllowed", () => {
  test("returns false when no keypair exists, true vacuously for empty contracts", async ({
    credentialService,
    signer,
  }) => {
    expect(await credentialService.hasPermit([A])).toBe(false);
    expect(await credentialService.hasPermit([])).toBe(true);
    expect(signer.signTypedData).not.toHaveBeenCalled();
  });

  test("returns false for contracts not covered by any signed permit", async ({
    credentialService,
  }) => {
    await credentialService.grantPermit([A]);
    expect(await credentialService.hasPermit([A])).toBe(true);
    expect(await credentialService.hasPermit([B])).toBe(false);
  });
});

describe("CredentialService.revokePermits", () => {
  test("clears all direct-scope permits when called with no args", async ({
    credentialService,
  }) => {
    await credentialService.grantPermit([A, B]);
    await credentialService.revokePermits();
    expect(await credentialService.hasPermit([A])).toBe(false);
  });

  test("removes permits that touch the specified contracts", async ({ credentialService }) => {
    await credentialService.grantPermit([A, B]);
    await credentialService.revokePermits([A]);
    expect(await credentialService.hasPermit([A])).toBe(false);
    expect(await credentialService.hasPermit([B])).toBe(false);
  });
});

describe("CredentialService.clearCredentials", () => {
  test("wipes both keypair and permits", async ({ credentialService }) => {
    await credentialService.grantPermit([A]);
    await credentialService.clearCredentials();
    expect(await credentialService.hasPermit([A])).toBe(false);
  });
});

describe("CredentialService.handleWalletAccountChange", () => {
  test("address change cascade-clears previous signer credentials", async ({
    credentialService,
  }) => {
    await credentialService.grantPermit([A]);
    expect(await credentialService.hasPermit([A])).toBe(true);

    await credentialService.handleWalletAccountChange({ address: USER }, { address: DELEGATOR });

    expect(await credentialService.hasPermit([A])).toBe(false);
  });

  test("does not warm keypairs during wallet lifecycle cleanup", async ({
    createCredentialService,
    relayer,
  }) => {
    const credentialService = createCredentialService();
    vi.mocked(relayer.generateTransportKeyPair).mockClear();

    await credentialService.handleWalletAccountChange(undefined, { address: USER });

    expect(relayer.generateTransportKeyPair).not.toHaveBeenCalled();
  });
});

describe("CredentialService.warmTransportKeyPair", () => {
  test("populates the vault for the requested address", async ({ credentialService, relayer }) => {
    await credentialService.warmTransportKeyPair(USER);

    expect(relayer.generateTransportKeyPair).toHaveBeenCalled();
  });
});

describe("CredentialService.allow signing-error wrapping", () => {
  // `test.for` forwards the fixture context as the second arg; `test.each` only splats the row.
  test.for([
    {
      label: "EIP-1193 code 4001",
      reject: () => Object.assign(new Error("rejected"), { code: 4001 }),
      expected: SigningRejectedError,
    },
    {
      label: "message contains 'user rejected'",
      reject: () => new Error("MetaMask Tx Signature: User rejected the transaction."),
      expected: SigningRejectedError,
    },
    {
      label: "message contains 'user denied'",
      reject: () => new Error("user denied message signature"),
      expected: SigningRejectedError,
    },
    {
      label: "generic Error",
      reject: () => new Error("network unreachable"),
      expected: SigningFailedError,
    },
    { label: "non-Error throw", reject: () => "boom", expected: SigningFailedError },
  ])(
    "$label is wrapped via SigningError taxonomy",
    async ({ reject, expected }, { credentialService, signer }) => {
      vi.mocked(signer.signTypedData).mockRejectedValueOnce(reject());
      await expect(credentialService.grantPermit([A])).rejects.toThrow(expected);
    },
  );
});

describe("CredentialService delegator-scope isolation", () => {
  test("different delegators get independently addressable scopes", async ({
    credentialService,
  }) => {
    // Direct scope (delegator implicitly = signer = USER) and delegated scope to DELEGATOR_B
    // are distinct scopes that must remain independently addressable.
    await credentialService.grantPermit([A]);
    await credentialService.grantPermit([A], DELEGATOR_B);

    expect(await credentialService.hasPermit([A])).toBe(true);
    expect(await credentialService.hasPermit([A], DELEGATOR_B)).toBe(true);
  });

  test("revokePermits() with no args wipes both direct and delegated scopes", async ({
    credentialService,
  }) => {
    await credentialService.grantPermit([A]);
    await credentialService.grantPermit([A], DELEGATOR_B);

    await credentialService.revokePermits();

    expect(await credentialService.hasPermit([A])).toBe(false);
    expect(await credentialService.hasPermit([A], DELEGATOR_B)).toBe(false);
  });

  test("revokePermits([contracts]) only touches the direct-decrypt scope", async ({
    credentialService,
  }) => {
    await credentialService.grantPermit([A]);
    await credentialService.grantPermit([A], DELEGATOR_B);

    await credentialService.revokePermits([A]);

    expect(await credentialService.hasPermit([A])).toBe(false);
    expect(await credentialService.hasPermit([A], DELEGATOR_B)).toBe(true);
  });
});

describe("CredentialService.grantPermit widening", () => {
  test("one signing prompt covers the new contract when the union fits the cap", async ({
    credentialService,
    signer,
  }) => {
    await credentialService.grantPermit([A, B]);
    vi.mocked(signer.signTypedData).mockClear();

    await credentialService.grantPermit([A, B, C]);

    expect(signer.signTypedData).toHaveBeenCalledOnce();
    expect(await credentialService.hasPermit([A, B, C])).toBe(true);

    // Widening replaced the original permit with a unified [A,B,C] payload, so
    // revoking by A cascades to B and C. Chunking would have kept C in a separate
    // permit untouched by the A-revoke.
    await credentialService.revokePermits([A]);
    expect(await credentialService.hasPermit([B])).toBe(false);
    expect(await credentialService.hasPermit([C])).toBe(false);
  });

  test("falls back to chunking when the union exceeds the cap", async ({
    credentialService,
    signer,
  }) => {
    const ten = ADDRS.slice(0, 10);
    const K = ADDRS[10]!;

    await credentialService.grantPermit(ten);
    vi.mocked(signer.signTypedData).mockClear();

    await credentialService.grantPermit([...ten, K]);

    expect(signer.signTypedData).toHaveBeenCalledOnce();
    expect(await credentialService.hasPermit([...ten, K])).toBe(true);

    // Two independent permits: revoking by an address in the first chunk leaves
    // K's permit intact.
    await credentialService.revokePermits([A]);
    expect(await credentialService.hasPermit([A])).toBe(false);
    expect(await credentialService.hasPermit([K])).toBe(true);
  });

  test("wallet rejection during widening leaves the original permit untouched", async ({
    credentialService,
    signer,
  }) => {
    await credentialService.grantPermit([A, B]);
    vi.mocked(signer.signTypedData).mockClear();
    vi.mocked(signer.signTypedData).mockRejectedValueOnce(
      Object.assign(new Error("rejected"), { code: 4001 }),
    );

    await expect(credentialService.grantPermit([A, B, C])).rejects.toThrow(SigningRejectedError);

    expect(await credentialService.hasPermit([A, B])).toBe(true);
    expect(await credentialService.hasPermit([C])).toBe(false);
  });

  test("widened permit's TTL is anchored to the re-sign, not the original prompt", async ({
    createCredentialService,
    signer,
  }) => {
    // permitTTL=1 day, transportKeyPairTTL=30 days so the transport key pair outlives the
    // test window. Re-sign at t≈23h; if the widened permit still carried the original
    // startTimestamp it would expire at t=24h. Anchoring to the re-sign keeps it usable
    // until t≈47h.
    const credentialService = createCredentialService({
      permitTTL: 1,
      transportKeyPairTTL: 30 * 86400,
    });
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
      await credentialService.grantPermit([A, B]);

      vi.setSystemTime(new Date("2026-01-01T23:00:00Z"));
      vi.mocked(signer.signTypedData).mockClear();
      await credentialService.grantPermit([A, B, C]);

      vi.setSystemTime(new Date("2026-01-02T01:00:00Z"));
      expect(await credentialService.hasPermit([A, B, C])).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("CredentialService scope (opt-in shared-tenant)", () => {
  test("two signers in the same scope share one key pair; permits stay per-signer", async ({
    createCredentialService,
    createMockSigner,
    storage,
    relayer,
  }) => {
    const signerB = createMockSigner(DELEGATOR);
    const serviceA = createCredentialService({ scope: "tenant-1", storage });
    const serviceB = createCredentialService({ scope: "tenant-1", storage, signer: signerB });

    const resultA = await serviceA.grantPermit([A]);
    const resultB = await serviceB.grantPermit([A]);

    // Same shared key pair, one generation call...
    expect(resultB.keypair.publicKey).toBe(resultA.keypair.publicKey);
    expect(relayer.generateTransportKeyPair).toHaveBeenCalledOnce();
    // ...but independently addressable permits, each signed by its own signer.
    expect(await serviceA.hasPermit([A])).toBe(true);
    expect(await serviceB.hasPermit([A])).toBe(true);
    await serviceA.revokePermits([A]);
    expect(await serviceA.hasPermit([A])).toBe(false);
    expect(await serviceB.hasPermit([A])).toBe(true);
  });

  test("clearCredentials() (signer-level) never deletes the shared key pair", async ({
    createCredentialService,
    createMockSigner,
    storage,
    relayer,
  }) => {
    const signerB = createMockSigner(DELEGATOR);
    const serviceA = createCredentialService({ scope: "tenant-1", storage });
    const serviceB = createCredentialService({ scope: "tenant-1", storage, signer: signerB });

    const before = await serviceA.grantPermit([A]);
    await serviceB.grantPermit([A]);
    await serviceA.clearCredentials();

    // serviceA's own permit is gone, but serviceB (same scope) is untouched and the
    // shared key pair itself survives — no second generation call.
    expect(await serviceA.hasPermit([A])).toBe(false);
    expect(await serviceB.hasPermit([A])).toBe(true);
    const after = await serviceA.grantPermit([]);
    expect(after.keypair.publicKey).toBe(before.keypair.publicKey);
    expect(relayer.generateTransportKeyPair).toHaveBeenCalledOnce();
  });

  test("revokeTransportKeyPair() invalidates every permit in the scope via the embedded public key, without touching them directly", async ({
    createCredentialService,
    createMockSigner,
    storage,
    relayer,
  }) => {
    const signerB = createMockSigner(DELEGATOR);
    const serviceA = createCredentialService({ scope: "tenant-1", storage });
    const serviceB = createCredentialService({ scope: "tenant-1", storage, signer: signerB });

    await serviceA.grantPermit([A]);
    await serviceB.grantPermit([A]);
    expect(relayer.generateTransportKeyPair).toHaveBeenCalledOnce();

    await serviceA.revokeTransportKeyPair("tenant-1");

    // No keypair exists yet post-rotation → both report false immediately.
    expect(await serviceA.hasPermit([A])).toBe(false);
    expect(await serviceB.hasPermit([A])).toBe(false);

    // Force regeneration with a *distinct* public key (the fixture's default mock
    // always returns the same static key pair, which would mask the mechanism under
    // test) and confirm the old permit is filtered out as stale by its embedded
    // (now-mismatched) public key — not because the permit itself was deleted.
    // `generateTransportKeyPair` returns an opaque, unconstructable key-pair handle
    // post-#458, so the distinct value is injected at `serializeTransportKeyPair` —
    // the step that actually produces the hex the vault stores — instead.
    vi.mocked(relayer.serializeTransportKeyPair).mockResolvedValueOnce({
      publicKey:
        `0x${"33".repeat(32)}` as unknown as SerializeTransportKeyPairReturnType["publicKey"],
      privateKey:
        `0x${"44".repeat(32)}` as unknown as SerializeTransportKeyPairReturnType["privateKey"],
    });
    const regenerated = await serviceB.grantPermit([]);
    expect(relayer.generateTransportKeyPair).toHaveBeenCalledTimes(2);
    expect(regenerated.keypair.publicKey).toBe(`0x${"33".repeat(32)}`);
    expect(await serviceB.hasPermit([A])).toBe(false);
  });

  test("revokeTransportKeyPair() throws when no scope is configured", async ({
    credentialService,
  }) => {
    await expect(credentialService.revokeTransportKeyPair("tenant-1")).rejects.toThrow(
      ConfigurationError,
    );
  });

  test("revokeTransportKeyPair() throws when scopeId doesn't match the configured scope", async ({
    createCredentialService,
  }) => {
    const service = createCredentialService({ scope: "tenant-1" });
    await expect(service.revokeTransportKeyPair("tenant-2")).rejects.toThrow(ConfigurationError);
  });

  test("revokeTransportKeyPair() propagates a storage-delete failure end-to-end, doesn't swallow it", async ({
    createCredentialService,
    storage,
  }) => {
    const service = createCredentialService({ scope: "tenant-1", storage });
    await service.grantPermit([]); // warm the shared key pair so there's something to delete
    vi.spyOn(storage, "delete").mockRejectedValueOnce(new Error("delete boom"));

    await expect(service.revokeTransportKeyPair("tenant-1")).rejects.toThrow("delete boom");
  });

  test("warmTransportKeyPairScope() generates the shared key pair without needing a connected wallet", async ({
    createCredentialService,
    createMockSigner,
    storage,
    relayer,
  }) => {
    const signerB = createMockSigner(DELEGATOR);
    const serviceA = createCredentialService({ scope: "tenant-1", storage });
    const serviceB = createCredentialService({ scope: "tenant-1", storage, signer: signerB });

    await serviceA.warmTransportKeyPairScope("tenant-1");
    expect(relayer.generateTransportKeyPair).toHaveBeenCalledOnce();

    // serviceB never warmed itself — it finds the same pre-warmed key pair.
    const result = await serviceB.grantPermit([]);
    expect(result.keypair.publicKey).toBeDefined();
    expect(relayer.generateTransportKeyPair).toHaveBeenCalledOnce();
  });

  test("warmTransportKeyPairScope() throws when no scope is configured", async ({
    credentialService,
  }) => {
    await expect(credentialService.warmTransportKeyPairScope("tenant-1")).rejects.toThrow(
      ConfigurationError,
    );
  });

  test("warmTransportKeyPairScope() throws when scopeId doesn't match the configured scope", async ({
    createCredentialService,
  }) => {
    const service = createCredentialService({ scope: "tenant-1" });
    await expect(service.warmTransportKeyPairScope("tenant-2")).rejects.toThrow(ConfigurationError);
  });
});

describe("CredentialService derivationSecret (opt-in at-rest wrapping)", () => {
  const SECRET = "correct-horse-battery-staple";

  test("grantPermit and hasPermit work transparently end-to-end when configured", async ({
    createCredentialService,
  }) => {
    const service = createCredentialService({ derivationSecret: SECRET });
    await service.grantPermit([A]);
    expect(await service.hasPermit([A])).toBe(true);
  });

  test("permits are never wrapped — only the private key is", async ({
    createCredentialService,
    storage,
  }) => {
    const setSpy = vi.spyOn(storage, "set");
    const service = createCredentialService({ derivationSecret: SECRET, storage });

    await service.grantPermit([A]);

    // The permit-list write (PermissionStore) is a plain array of Permission objects,
    // completely untouched by the wrapping logic in TransportKeyPairVault.
    const permitWrite = setSpy.mock.calls.find(([, value]) => Array.isArray(value));
    expect(permitWrite).toBeDefined();
    const permits = permitWrite![1] as Array<Record<string, unknown>>;
    expect(
      (permits[0]?.serializedPermit as Record<string, unknown> | undefined)?.signature,
    ).toBeDefined();
    expect(permits[0]?.contractAddresses).toBeDefined();
    expect(permits[0]?.wrappedPrivateKey).toBeUndefined();

    // The keypair write, in contrast, is wrapped.
    const keypairWrite = setSpy.mock.calls.find(([, value]) => !Array.isArray(value));
    expect(keypairWrite).toBeDefined();
    const keypair = keypairWrite![1] as Record<string, unknown>;
    expect(keypair.wrappedPrivateKey).toBeDefined();
    expect(keypair.privateKey).toBeUndefined();
  });

  test("composes with scope end-to-end: two signers share the wrapped key pair, keep independent permits", async ({
    createCredentialService,
    createMockSigner,
    storage,
    relayer,
  }) => {
    const signerB = createMockSigner(DELEGATOR);
    const serviceA = createCredentialService({
      scope: "tenant-1",
      derivationSecret: SECRET,
      storage,
    });
    const serviceB = createCredentialService({
      scope: "tenant-1",
      derivationSecret: SECRET,
      storage,
      signer: signerB,
    });

    const resultA = await serviceA.grantPermit([A]);
    const resultB = await serviceB.grantPermit([A]);

    // The mock relayer returns the same constant key pair on every call, so asserting
    // publicKey equality alone would pass even if serviceB silently regenerated its own
    // key instead of genuinely reading serviceA's wrapped entry. Assert the generator
    // was only invoked once to prove the second call is a real, successfully-decrypted
    // shared read — the same pattern the unwrapped scope-sharing tests above use.
    expect(relayer.generateTransportKeyPair).toHaveBeenCalledOnce();
    expect(resultB.keypair.publicKey).toBe(resultA.keypair.publicKey);
    expect(await serviceA.hasPermit([A])).toBe(true);
    expect(await serviceB.hasPermit([A])).toBe(true);
  });

  test("hasPermit() never throws, even when the scoped keypair fails to unwrap under a mismatched secret", async ({
    createCredentialService,
    createMockSigner,
    storage,
  }) => {
    // hasPermit() is documented as a safe, no-throw status check — grantPermit()'s
    // "fail loudly on scoped mismatch" behavior (see keypair-vault.ts) is right for a
    // mutating operation, but must not leak into this read-only lookup, which every
    // caller (including the React useHasPermit() hook) relies on never rejecting.
    const correctlyConfigured = createCredentialService({
      scope: "tenant-1",
      derivationSecret: "correct-horse-battery-staple",
      storage,
    });
    await correctlyConfigured.grantPermit([A]);

    const signerB = createMockSigner(DELEGATOR);
    const misconfigured = createCredentialService({
      scope: "tenant-1",
      derivationSecret: "a-different-secret",
      storage,
      signer: signerB,
    });

    await expect(misconfigured.hasPermit([A])).resolves.toBe(false);
  });

  test("hasPermit() propagates a storage-layer failure unrelated to derivationSecret, instead of swallowing it as 'no permit'", async ({
    createCredentialService,
    storage,
  }) => {
    // hasPermit()'s no-throw contract only covers KeyWrappingError (a documented,
    // expected failure mode of this feature) — a genuine backing-storage exception
    // (a broken GenericStorage adapter, IndexedDB quota, etc.) is unrelated to
    // derivationSecret entirely and must not be silently downgraded to "no permit".
    const service = createCredentialService({ derivationSecret: "correct-horse-battery-staple" });
    await service.grantPermit([A]);

    const storageError = new Error("storage backend is unavailable");
    vi.spyOn(storage, "get").mockRejectedValueOnce(storageError);

    await expect(service.hasPermit([A])).rejects.toThrow(storageError);
  });
});
