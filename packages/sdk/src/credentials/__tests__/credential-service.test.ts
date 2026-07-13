import { createMockRouter, describe, expect, test, vi } from "../../test-fixtures";
import type { Address } from "viem";
import { createMockChain } from "../../test-fixtures/chain";
import { createMockRelayer } from "../../test-fixtures/relayer";
import { SigningRejectedError, SigningFailedError } from "../../errors/signing";
import { WalletNotConnectedError } from "../../errors/signer";

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

describe("CredentialService.invalidatePermit (SDK-137)", () => {
  test("removes the permit covering the given contract, leaving the keypair intact", async ({
    credentialService,
  }) => {
    await credentialService.grantPermit([A, B]);

    await credentialService.invalidatePermit(A);

    expect(await credentialService.hasPermit([A])).toBe(false);
    // Same widening semantics as revokePermits: A and B shared one signed
    // payload, so invalidating A cascades to B too — expected, not a leak.
    expect(await credentialService.hasPermit([B])).toBe(false);
    // The keypair itself is untouched — no extra prompt on the next grantPermit
    // beyond the one signature for the re-covered contracts.
    await credentialService.grantPermit([A, B]);
    expect(await credentialService.hasPermit([A, B])).toBe(true);
  });

  test("leaves an unrelated, separately-chunked permit untouched", async ({
    credentialService,
  }) => {
    const ten = ADDRS.slice(0, 10);
    const K = ADDRS[10]!;
    await credentialService.grantPermit(ten);
    await credentialService.grantPermit([K]);

    await credentialService.invalidatePermit(A);

    expect(await credentialService.hasPermit([K])).toBe(true);
  });

  test("only touches the (possibly delegated) scope it targets", async ({ credentialService }) => {
    await credentialService.grantPermit([A]);
    await credentialService.grantPermit([A], DELEGATOR_B);

    await credentialService.invalidatePermit(A);

    expect(await credentialService.hasPermit([A])).toBe(false);
    expect(await credentialService.hasPermit([A], DELEGATOR_B)).toBe(true);
  });

  test("invalidating the delegated scope leaves the direct scope untouched", async ({
    credentialService,
  }) => {
    await credentialService.grantPermit([A]);
    await credentialService.grantPermit([A], DELEGATOR_B);

    await credentialService.invalidatePermit(A, DELEGATOR_B);

    expect(await credentialService.hasPermit([A])).toBe(true);
    expect(await credentialService.hasPermit([A], DELEGATOR_B)).toBe(false);
  });

  test("throws when no wallet account is connected", async ({ credentialService, signer }) => {
    vi.mocked(signer.requireWalletAccount).mockImplementation(() => {
      throw new WalletNotConnectedError("no wallet connected");
    });
    await expect(credentialService.invalidatePermit(A)).rejects.toThrow(WalletNotConnectedError);
  });
});
