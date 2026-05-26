import { describe, expect, test, vi } from "../../test-fixtures";
import type { Address } from "viem";
import { WorkerUnavailableError } from "../../errors";
import { SigningRejectedError, SigningFailedError } from "../../errors/signing";

const USER = "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B" as Address;
const DELEGATOR = "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC" as Address;
const DELEGATOR_B = "0xDdDDddddDDDDdDDDDDDdDdDddDdDDDdDddddddDd" as Address;

const ADDRS = Array.from({ length: 23 }, (_, i) => {
  const hex = i.toString(16).padStart(40, "0");
  return `0x${hex}` as const;
});
const [A, B, C] = ADDRS;

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
    expect(second.permits).toHaveLength(1);
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
    expect(result.permits).toEqual([]);
    expect(signer.signTypedData).not.toHaveBeenCalled();
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

    await credentialService.handleWalletAccountChange(
      { address: USER, chainId: 31337 },
      { address: DELEGATOR, chainId: 31337 },
    );

    expect(await credentialService.hasPermit([A])).toBe(false);
  });

  test("warmup routes keypair generation through next.chainId, not the dispatcher's active chain", async ({
    createCredentialService,
    relayer,
  }) => {
    // The dispatcher mock used by the fixture has #chainId === chains[0] === 31337.
    // We warm up for a wallet connected to chain 1 (mainnet) and assert the
    // generator was invoked with that chainId — proving the warmup is no longer
    // tied to dispatcher state. This is the lock-in for the wrong-chain bug.
    const credentialService = createCredentialService();
    await credentialService.handleWalletAccountChange(undefined, {
      address: DELEGATOR,
      chainId: 1,
    });
    expect(relayer.generateKeypair).toHaveBeenCalledWith({ chainId: 1 });
  });

  test("WorkerUnavailableError from warmup is swallowed without warning (SSR-safe)", async ({
    createCredentialService,
    relayer,
  }) => {
    vi.mocked(relayer.generateKeypair).mockRejectedValueOnce(
      new WorkerUnavailableError("Web Worker is not available in this environment."),
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const credentialService = createCredentialService();
      await credentialService.handleWalletAccountChange(undefined, {
        address: DELEGATOR,
        chainId: 1,
      });
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  test("non-WorkerUnavailableError from warmup is logged as a warning", async ({
    createCredentialService,
    relayer,
  }) => {
    vi.mocked(relayer.generateKeypair).mockRejectedValueOnce(new Error("network down"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const credentialService = createCredentialService();
      await credentialService.handleWalletAccountChange(undefined, {
        address: DELEGATOR,
        chainId: 1,
      });
      expect(warn).toHaveBeenCalledOnce();
      expect(warn.mock.calls[0]?.[0]).toContain("warm keypair failed");
    } finally {
      warn.mockRestore();
    }
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
    {
      label: "non-Error throw",
      reject: () => "boom",
      expected: SigningFailedError,
    },
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
    // permitTTL=1 day, keypairTTL=30 days so the keypair outlives the test window.
    // Re-sign at t≈23h; if the widened permit still carried the original startTimestamp
    // it would expire at t=24h. Anchoring to the re-sign keeps it usable until t≈47h.
    const credentialService = createCredentialService({
      permitTTL: 1,
      keypairTTL: 30 * 86400,
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
