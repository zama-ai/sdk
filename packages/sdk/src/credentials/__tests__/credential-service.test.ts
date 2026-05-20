import { describe, expect, test, vi } from "../../test-fixtures";
import type { Address } from "viem";
import { SigningRejectedError, SigningFailedError } from "../../errors/signing";
import { checksum } from "../utils";
import { permissionScopeKey } from "../storage-keys";
import type { Permission } from "../types";

const USER = "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B" as Address;
const DELEGATOR = "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC" as Address;
const DELEGATOR_B = "0xDdDDddddDDDDdDDDDDDdDdDddDdDDDdDddddddDd" as Address;

const ADDRS = Array.from({ length: 23 }, (_, i) => {
  const hex = i.toString(16).padStart(40, "0");
  return `0x${hex}` as Address;
});
const TOKEN_A = ADDRS[0]!;
const TOKEN_B = ADDRS[1]!;

const DIRECT_SCOPE_KEY = permissionScopeKey({
  signerAddress: checksum(USER),
  chainId: 31337,
  delegatorAddress: checksum(USER),
});

describe("CredentialService.allow", () => {
  test("creates a permit and stores it on the first call", async ({
    credentialService,
    signer,
  }) => {
    expect(await credentialService.hasPermit([TOKEN_A])).toBe(false);
    await credentialService.grantPermit([TOKEN_A]);
    expect(await credentialService.hasPermit([TOKEN_A])).toBe(true);
    expect(signer.signTypedData).toHaveBeenCalled();
  });

  test("does not re-prompt when an existing permit covers the requested set", async ({
    credentialService,
    signer,
  }) => {
    await credentialService.grantPermit([TOKEN_A]);
    vi.mocked(signer.signTypedData).mockClear();
    const second = await credentialService.grantPermit([TOKEN_A]);
    expect(signer.signTypedData).not.toHaveBeenCalled();
    expect(second.permits).toHaveLength(1);
  });

  test("only prompts for uncovered contracts on partial coverage", async ({
    credentialService,
    signer,
  }) => {
    await credentialService.grantPermit([TOKEN_A]);
    vi.mocked(signer.signTypedData).mockClear();
    await credentialService.grantPermit([TOKEN_A, TOKEN_B]);
    // Only TOKEN_B uncovered → exactly one signing prompt
    expect(signer.signTypedData).toHaveBeenCalledOnce();
    expect(await credentialService.hasPermit([TOKEN_A, TOKEN_B])).toBe(true);
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
    await credentialService.grantPermit([TOKEN_A], DELEGATOR);
    expect(signer.signTypedData).toHaveBeenCalledOnce();
    // Direct scope still not covered.
    expect(await credentialService.hasPermit([TOKEN_A])).toBe(false);
    // Delegated scope is covered.
    expect(await credentialService.hasPermit([TOKEN_A], DELEGATOR)).toBe(true);
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
    expect(await credentialService.hasPermit([TOKEN_A])).toBe(false);
    expect(await credentialService.hasPermit([])).toBe(true);
    expect(signer.signTypedData).not.toHaveBeenCalled();
  });

  test("returns false for contracts not covered by any signed permit", async ({
    credentialService,
  }) => {
    await credentialService.grantPermit([TOKEN_A]);
    expect(await credentialService.hasPermit([TOKEN_A])).toBe(true);
    expect(await credentialService.hasPermit([TOKEN_B])).toBe(false);
  });
});

describe("CredentialService.revokePermits", () => {
  test("clears all direct-scope permits when called with no args", async ({
    credentialService,
  }) => {
    await credentialService.grantPermit([TOKEN_A, TOKEN_B]);
    await credentialService.revokePermits();
    expect(await credentialService.hasPermit([TOKEN_A])).toBe(false);
  });

  test("removes permits that touch the specified contracts", async ({ credentialService }) => {
    await credentialService.grantPermit([TOKEN_A, TOKEN_B]);
    await credentialService.revokePermits([TOKEN_A]);
    expect(await credentialService.hasPermit([TOKEN_A])).toBe(false);
    expect(await credentialService.hasPermit([TOKEN_B])).toBe(false);
  });
});

describe("CredentialService.clearCredentials", () => {
  test("wipes both keypair and permits", async ({ credentialService }) => {
    await credentialService.grantPermit([TOKEN_A]);
    await credentialService.clearCredentials();
    expect(await credentialService.hasPermit([TOKEN_A])).toBe(false);
  });
});

describe("CredentialService.handleWalletAccountChange", () => {
  test("address change cascade-clears previous signer credentials", async ({
    credentialService,
  }) => {
    await credentialService.grantPermit([TOKEN_A]);
    expect(await credentialService.hasPermit([TOKEN_A])).toBe(true);

    await credentialService.handleWalletAccountChange({ address: USER }, { address: DELEGATOR });

    expect(await credentialService.hasPermit([TOKEN_A])).toBe(false);
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
      await expect(credentialService.grantPermit([TOKEN_A])).rejects.toThrow(expected);
    },
  );
});

describe("CredentialService delegator-scope isolation", () => {
  test("different delegators get independently addressable scopes", async ({
    credentialService,
  }) => {
    // Direct scope (delegator implicitly = signer = USER) and delegated scope to DELEGATOR_B
    // are distinct scopes that must remain independently addressable.
    await credentialService.grantPermit([TOKEN_A]);
    await credentialService.grantPermit([TOKEN_A], DELEGATOR_B);

    expect(await credentialService.hasPermit([TOKEN_A])).toBe(true);
    expect(await credentialService.hasPermit([TOKEN_A], DELEGATOR_B)).toBe(true);
  });

  test("revokePermits() with no args wipes both direct and delegated scopes", async ({
    credentialService,
  }) => {
    await credentialService.grantPermit([TOKEN_A]);
    await credentialService.grantPermit([TOKEN_A], DELEGATOR_B);

    await credentialService.revokePermits();

    expect(await credentialService.hasPermit([TOKEN_A])).toBe(false);
    expect(await credentialService.hasPermit([TOKEN_A], DELEGATOR_B)).toBe(false);
  });

  test("revokePermits([contracts]) only touches the direct-decrypt scope", async ({
    credentialService,
  }) => {
    await credentialService.grantPermit([TOKEN_A]);
    await credentialService.grantPermit([TOKEN_A], DELEGATOR_B);

    await credentialService.revokePermits([TOKEN_A]);

    expect(await credentialService.hasPermit([TOKEN_A])).toBe(false);
    expect(await credentialService.hasPermit([TOKEN_A], DELEGATOR_B)).toBe(true);
  });
});

describe("CredentialService.grantPermit widening", () => {
  test("widens an existing permit when the union fits the cap", async ({
    credentialService,
    signer,
    storage,
  }) => {
    await credentialService.grantPermit([ADDRS[0]!, ADDRS[1]!]);
    expect(signer.signTypedData).toHaveBeenCalledOnce();
    vi.mocked(signer.signTypedData).mockClear();

    await credentialService.grantPermit([ADDRS[0]!, ADDRS[1]!, ADDRS[2]!]);

    expect(signer.signTypedData).toHaveBeenCalledOnce();

    const raw = (await storage.get(DIRECT_SCOPE_KEY)) as Permission[] | null;
    expect(raw).not.toBeNull();
    expect(raw).toHaveLength(1);
    expect(raw![0]!.signedContractAddresses).toEqual([
      checksum(ADDRS[0]!),
      checksum(ADDRS[1]!),
      checksum(ADDRS[2]!),
    ]);
  });

  test("falls back to chunking when the union exceeds the cap", async ({
    credentialService,
    signer,
    storage,
  }) => {
    const ten = ADDRS.slice(0, 10);
    await credentialService.grantPermit(ten);
    expect(signer.signTypedData).toHaveBeenCalledOnce();
    vi.mocked(signer.signTypedData).mockClear();

    await credentialService.grantPermit([...ten, ADDRS[10]!]);

    expect(signer.signTypedData).toHaveBeenCalledOnce();

    const raw = (await storage.get(DIRECT_SCOPE_KEY)) as Permission[] | null;
    expect(raw).not.toBeNull();
    expect(raw).toHaveLength(2);
    const sizes = raw!.map((p) => p.signedContractAddresses.length).toSorted((a, b) => a - b);
    expect(sizes).toEqual([1, 10]);
  });

  test("wallet rejection during widening leaves the original permit untouched", async ({
    credentialService,
    signer,
    storage,
  }) => {
    await credentialService.grantPermit([ADDRS[0]!, ADDRS[1]!]);
    vi.mocked(signer.signTypedData).mockClear();
    vi.mocked(signer.signTypedData).mockRejectedValueOnce(
      Object.assign(new Error("rejected"), { code: 4001 }),
    );

    await expect(credentialService.grantPermit([ADDRS[0]!, ADDRS[1]!, ADDRS[2]!])).rejects.toThrow(
      SigningRejectedError,
    );

    const raw = (await storage.get(DIRECT_SCOPE_KEY)) as Permission[] | null;
    expect(raw).not.toBeNull();
    expect(raw).toHaveLength(1);
    expect(raw![0]!.signedContractAddresses).toEqual([checksum(ADDRS[0]!), checksum(ADDRS[1]!)]);
  });

  test("widened permit gets a fresh startTimestamp", async ({
    credentialService,
    signer,
    storage,
  }) => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
      await credentialService.grantPermit([ADDRS[0]!, ADDRS[1]!]);
      const firstTs = Math.floor(Date.now() / 1000);

      vi.advanceTimersByTime(60_000);
      vi.mocked(signer.signTypedData).mockClear();
      await credentialService.grantPermit([ADDRS[0]!, ADDRS[1]!, ADDRS[2]!]);
      const widenedTs = Math.floor(Date.now() / 1000);

      const raw = (await storage.get(DIRECT_SCOPE_KEY)) as Permission[] | null;
      expect(raw).not.toBeNull();
      expect(raw).toHaveLength(1);
      expect(raw![0]!.startTimestamp).toBe(widenedTs);
      expect(raw![0]!.startTimestamp).toBeGreaterThan(firstTs);
    } finally {
      vi.useRealTimers();
    }
  });
});
