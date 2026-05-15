import { describe, expect, it, vi } from "../../test-fixtures";
import type { Address } from "viem";
import { SigningRejectedError, SigningFailedError } from "../../errors/signing";

const USER = "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B" as Address;
const DELEGATOR = "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC" as Address;
const DELEGATOR_B = "0xDdDDddddDDDDdDDDDDDdDdDddDdDDDdDddddddDd" as Address;

const ADDRS = Array.from({ length: 23 }, (_, i) => {
  const hex = i.toString(16).padStart(40, "0");
  return `0x${hex}` as Address;
});
const TOKEN_A = ADDRS[0]!;
const TOKEN_B = ADDRS[1]!;

describe("CredentialService.allow", () => {
  it("creates a permit and stores it on the first call", async ({ credentialService, signer }) => {
    expect(await credentialService.hasPermit([TOKEN_A])).toBe(false);
    await credentialService.grantPermit([TOKEN_A]);
    expect(await credentialService.hasPermit([TOKEN_A])).toBe(true);
    expect(signer.signTypedData).toHaveBeenCalled();
  });

  it("does not re-prompt when an existing permit covers the requested set", async ({
    credentialService,
    signer,
  }) => {
    await credentialService.grantPermit([TOKEN_A]);
    vi.mocked(signer.signTypedData).mockClear();
    const second = await credentialService.grantPermit([TOKEN_A]);
    expect(signer.signTypedData).not.toHaveBeenCalled();
    expect(second.permits).toHaveLength(1);
  });

  it("only prompts for uncovered contracts on partial coverage", async ({
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

  it("chunks 23 addresses into 3 wallet prompts", async ({ credentialService, signer }) => {
    await credentialService.grantPermit(ADDRS);
    // Boundary mock: chunk size 10 means ceil(23/10) = 3 user-visible signing prompts.
    expect(signer.signTypedData).toHaveBeenCalledTimes(3);
    expect(await credentialService.hasPermit(ADDRS)).toBe(true);
  });

  it("delegated allow does not satisfy direct-decrypt isAllowed", async ({
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

  it("warms a keypair without prompting for permits when contracts is empty", async ({
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
  it("returns false when no keypair exists, true vacuously for empty contracts", async ({
    credentialService,
    signer,
  }) => {
    expect(await credentialService.hasPermit([TOKEN_A])).toBe(false);
    expect(await credentialService.hasPermit([])).toBe(true);
    expect(signer.signTypedData).not.toHaveBeenCalled();
  });

  it("returns false for contracts not covered by any signed permit", async ({
    credentialService,
  }) => {
    await credentialService.grantPermit([TOKEN_A]);
    expect(await credentialService.hasPermit([TOKEN_A])).toBe(true);
    expect(await credentialService.hasPermit([TOKEN_B])).toBe(false);
  });
});

describe("CredentialService.revokePermits", () => {
  it("clears all direct-scope permits when called with no args", async ({ credentialService }) => {
    await credentialService.grantPermit([TOKEN_A, TOKEN_B]);
    await credentialService.revokePermits();
    expect(await credentialService.hasPermit([TOKEN_A])).toBe(false);
  });

  it("removes permits that touch the specified contracts", async ({ credentialService }) => {
    await credentialService.grantPermit([TOKEN_A, TOKEN_B]);
    await credentialService.revokePermits([TOKEN_A]);
    expect(await credentialService.hasPermit([TOKEN_A])).toBe(false);
    expect(await credentialService.hasPermit([TOKEN_B])).toBe(false);
  });
});

describe("CredentialService.clearCredentials", () => {
  it("wipes both keypair and permits", async ({ credentialService }) => {
    await credentialService.grantPermit([TOKEN_A]);
    await credentialService.clearCredentials();
    expect(await credentialService.hasPermit([TOKEN_A])).toBe(false);
  });
});

describe("CredentialService.handleWalletAccountChange", () => {
  it("address change cascade-clears previous signer credentials", async ({ credentialService }) => {
    await credentialService.grantPermit([TOKEN_A]);
    expect(await credentialService.hasPermit([TOKEN_A])).toBe(true);

    await credentialService.handleWalletAccountChange(
      { address: USER, chainId: 31337 },
      { address: DELEGATOR, chainId: 31337 },
    );

    expect(await credentialService.hasPermit([TOKEN_A])).toBe(false);
  });
});

describe("CredentialService.allow signing-error wrapping", () => {
  // `it.for` forwards the fixture context as the second arg; `it.each` only splats the row.
  it.for([
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
  it("different delegators get independently addressable scopes", async ({ credentialService }) => {
    // Direct scope (delegator implicitly = signer = USER) and delegated scope to DELEGATOR_B
    // are distinct scopes that must remain independently addressable.
    await credentialService.grantPermit([TOKEN_A]);
    await credentialService.grantPermit([TOKEN_A], DELEGATOR_B);

    expect(await credentialService.hasPermit([TOKEN_A])).toBe(true);
    expect(await credentialService.hasPermit([TOKEN_A], DELEGATOR_B)).toBe(true);
  });

  it("revokePermits() with no args wipes both direct and delegated scopes", async ({
    credentialService,
  }) => {
    await credentialService.grantPermit([TOKEN_A]);
    await credentialService.grantPermit([TOKEN_A], DELEGATOR_B);

    await credentialService.revokePermits();

    expect(await credentialService.hasPermit([TOKEN_A])).toBe(false);
    expect(await credentialService.hasPermit([TOKEN_A], DELEGATOR_B)).toBe(false);
  });

  it("revokePermits([contracts]) only touches the direct-decrypt scope", async ({
    credentialService,
  }) => {
    await credentialService.grantPermit([TOKEN_A]);
    await credentialService.grantPermit([TOKEN_A], DELEGATOR_B);

    await credentialService.revokePermits([TOKEN_A]);

    expect(await credentialService.hasPermit([TOKEN_A])).toBe(false);
    expect(await credentialService.hasPermit([TOKEN_A], DELEGATOR_B)).toBe(true);
  });
});
