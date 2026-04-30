import { describe, expect, it, vi } from "../../test-fixtures";
import { MemoryStorage } from "../../storage/memory-storage";
import { ZamaSDKEvents } from "../../events/sdk-events";
import type { Address } from "viem";
import { CredentialService } from "../credential-service";
import type { KeypairGenerator, PermitFactory, PermitSigner } from "../types";
import { SigningRejectedError, SigningFailedError } from "../../errors/signing";

const USER = "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B" as Address;
const OTHER_USER = "0x3c3C3c3C3c3C3c3C3c3C3c3C3c3C3c3C3c3C3c3C" as Address;
const DELEGATOR = "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC" as Address;
const DELEGATOR_B = "0xDdDDddddDDDDdDDDDDDdDdDddDdDDDdDddddddDd" as Address;
const PUBLIC_KEY = `0x${"11".repeat(32)}` as const;
const PRIVATE_KEY = `0x${"22".repeat(32)}` as const;
const SIGNATURE = `0x${"33".repeat(65)}` as const;

const ADDRS = Array.from({ length: 23 }, (_, i) => {
  const hex = i.toString(16).padStart(40, "0");
  return `0x${hex}` as Address;
});
const TOKEN_A = ADDRS[0]!;
const TOKEN_B = ADDRS[1]!;

function setup(overrides: { signerAddress?: Address } = {}) {
  const generator: KeypairGenerator = {
    generateKeypair: vi.fn().mockResolvedValue({ publicKey: PUBLIC_KEY, privateKey: PRIVATE_KEY }),
  };
  const factory: PermitFactory = {
    createEIP712: vi.fn().mockResolvedValue({} as never),
    createDelegatedUserDecryptEIP712: vi.fn().mockResolvedValue({} as never),
  };
  const signer: PermitSigner = {
    signTypedData: vi.fn().mockResolvedValue(SIGNATURE),
    getAddress: vi.fn().mockResolvedValue(overrides.signerAddress ?? USER),
    getChainId: vi.fn().mockResolvedValue(31337),
  };
  const events: { type: string }[] = [];
  const service = new CredentialService({
    keypairGenerator: generator,
    permitFactory: factory,
    permitSigner: signer,
    keypairTTL: 86400,
    storage: new MemoryStorage(),
    onEvent: (e) => events.push(e),
  });
  return { service, generator, factory, signer, events };
}

describe("CredentialService.allow", () => {
  it("creates a single permit when no coverage exists", async () => {
    const { service, factory, signer } = setup();
    await service.allow([TOKEN_A]);
    expect(factory.createEIP712).toHaveBeenCalledOnce();
    expect(signer.signTypedData).toHaveBeenCalledOnce();
  });

  it("does not prompt when existing permit covers the requested set", async () => {
    const { service, signer } = setup();
    await service.allow([TOKEN_A]);
    vi.mocked(signer.signTypedData).mockClear();
    await service.allow([TOKEN_A]);
    expect(signer.signTypedData).not.toHaveBeenCalled();
  });

  it("only prompts for uncovered contracts on partial coverage", async () => {
    const { service, signer } = setup();
    await service.allow([TOKEN_A]);
    vi.mocked(signer.signTypedData).mockClear();
    await service.allow([TOKEN_A, TOKEN_B]);
    expect(signer.signTypedData).toHaveBeenCalledOnce();
  });

  it("chunks 23 addresses into 3 wallet prompts", async () => {
    const { service, signer } = setup();
    await service.allow(ADDRS);
    expect(signer.signTypedData).toHaveBeenCalledTimes(3);
  });

  it("delegated allow routes to createDelegatedUserDecryptEIP712", async () => {
    const { service, factory } = setup();
    await service.allow([TOKEN_A], DELEGATOR);
    expect(factory.createDelegatedUserDecryptEIP712).toHaveBeenCalledOnce();
    expect(factory.createEIP712).not.toHaveBeenCalled();
  });

  it("dedupes concurrent identical allow() calls", async () => {
    const { service, signer } = setup();
    await Promise.all([
      service.allow([TOKEN_A]),
      service.allow([TOKEN_A]),
      service.allow([TOKEN_A]),
    ]);
    expect(signer.signTypedData).toHaveBeenCalledOnce();
  });

  it("does not dedupe delegated allow() calls across signer identities", async () => {
    let currentSigner = USER;
    const { service, signer } = setup({ signerAddress: currentSigner });
    vi.mocked(signer.getAddress).mockImplementation(async () => currentSigner);

    const first = service.allow([TOKEN_A], DELEGATOR);
    currentSigner = OTHER_USER;
    const second = service.allow([TOKEN_A], DELEGATOR);

    await Promise.all([first, second]);

    expect(signer.signTypedData).toHaveBeenCalledTimes(2);
  });

  it("warms a keypair without prompting for permits", async () => {
    const { service, generator } = setup();

    const result = await service.allow([]);

    expect(result.keypair.publicKey).toBe(PUBLIC_KEY);
    expect(result.permits).toEqual([]);
    expect(generator.generateKeypair).toHaveBeenCalledOnce();
  });

  it("emits CredentialsCreated and CredentialsAllowed", async () => {
    const { service, events } = setup();
    await service.allow([TOKEN_A]);
    const types = events.map((e) => e.type);
    expect(types).toContain(ZamaSDKEvents.CredentialsLoading);
    expect(types).toContain(ZamaSDKEvents.CredentialsCreating);
    expect(types).toContain(ZamaSDKEvents.CredentialsCreated);
    expect(types).toContain(ZamaSDKEvents.CredentialsAllowed);
  });
});

describe("CredentialService.isAllowed", () => {
  it("returns false when no keypair exists", async () => {
    const { service, signer } = setup();
    expect(await service.isAllowed([TOKEN_A])).toBe(false);
    expect(signer.signTypedData).not.toHaveBeenCalled();
  });

  it("returns true for empty contracts (vacuous truth)", async () => {
    const { service } = setup();
    expect(await service.isAllowed([])).toBe(true);
  });

  it("returns true after allow() covers the requested contract", async () => {
    const { service, signer } = setup();
    await service.allow([TOKEN_A]);
    vi.mocked(signer.signTypedData).mockClear();
    expect(await service.isAllowed([TOKEN_A])).toBe(true);
    expect(signer.signTypedData).not.toHaveBeenCalled();
  });

  it("returns false for contracts that are not covered", async () => {
    const { service } = setup();
    await service.allow([TOKEN_A]);
    expect(await service.isAllowed([TOKEN_B])).toBe(false);
  });
});

describe("CredentialService.revokePermits", () => {
  it("clears all direct-scope permits when called with no args", async () => {
    const { service } = setup();
    await service.allow([TOKEN_A, TOKEN_B]);
    await service.revokePermits();
    expect(await service.isAllowed([TOKEN_A])).toBe(false);
  });

  it("removes permits that touch the specified contracts", async () => {
    const { service } = setup();
    await service.allow([TOKEN_A, TOKEN_B]);
    await service.revokePermits([TOKEN_A]);
    expect(await service.isAllowed([TOKEN_A])).toBe(false);
    expect(await service.isAllowed([TOKEN_B])).toBe(false);
  });
});

describe("CredentialService.clearCredentials", () => {
  it("wipes both keypair and permits", async () => {
    const { service } = setup();
    await service.allow([TOKEN_A]);
    await service.clearCredentials();
    // After clear, isAllowed returns false (no keypair)
    expect(await service.isAllowed([TOKEN_A])).toBe(false);
  });
});

describe("CredentialService.handleIdentityChange", () => {
  it("address change cascade-clears previous signer credentials", async () => {
    const { service } = setup();
    await service.allow([TOKEN_A]);
    expect(await service.isAllowed([TOKEN_A])).toBe(true);

    await service.handleIdentityChange(
      { address: USER, chainId: 31337 },
      { address: DELEGATOR, chainId: 31337 },
    );

    expect(service.currentIdentity).toEqual({ address: DELEGATOR, chainId: 31337 });
    expect(await service.isAllowed([TOKEN_A])).toBe(false);
  });
});

describe("CredentialService.allow signing-error wrapping", () => {
  it("throws SigningRejectedError on EIP-1193 code 4001", async () => {
    const { service, signer } = setup();
    const err = Object.assign(new Error("rejected"), { code: 4001 });
    vi.mocked(signer.signTypedData).mockRejectedValueOnce(err);
    await expect(service.allow([TOKEN_A])).rejects.toBeInstanceOf(SigningRejectedError);
  });

  it("throws SigningRejectedError when message contains 'user rejected'", async () => {
    const { service, signer } = setup();
    vi.mocked(signer.signTypedData).mockRejectedValueOnce(
      new Error("MetaMask Tx Signature: User rejected the transaction."),
    );
    await expect(service.allow([TOKEN_A])).rejects.toBeInstanceOf(SigningRejectedError);
  });

  it("throws SigningRejectedError when message contains 'user denied'", async () => {
    const { service, signer } = setup();
    vi.mocked(signer.signTypedData).mockRejectedValueOnce(
      new Error("user denied message signature"),
    );
    await expect(service.allow([TOKEN_A])).rejects.toBeInstanceOf(SigningRejectedError);
  });

  it("throws SigningFailedError for generic errors and non-Error throws", async () => {
    const { service, signer } = setup();
    vi.mocked(signer.signTypedData).mockRejectedValueOnce(new Error("network unreachable"));
    await expect(service.allow([TOKEN_A])).rejects.toBeInstanceOf(SigningFailedError);

    vi.mocked(signer.signTypedData).mockRejectedValueOnce("boom");
    await expect(service.allow([TOKEN_B])).rejects.toBeInstanceOf(SigningFailedError);
  });
});

describe("CredentialService delegator-scope isolation", () => {
  it("different delegators get independently addressable scopes", async () => {
    const { service } = setup();

    // Direct scope (delegator implicitly = signer = USER) and delegated scope to DELEGATOR_B
    // are distinct scopes that must remain independently addressable.
    await service.allow([TOKEN_A]);
    await service.allow([TOKEN_A], DELEGATOR_B);

    expect(await service.isAllowed([TOKEN_A])).toBe(true);
    expect(await service.isAllowed([TOKEN_A], DELEGATOR_B)).toBe(true);
  });

  it("revokePermits() with no args wipes both direct and delegated scopes", async () => {
    const { service } = setup();

    await service.allow([TOKEN_A]);
    await service.allow([TOKEN_A], DELEGATOR_B);

    await service.revokePermits();

    expect(await service.isAllowed([TOKEN_A])).toBe(false);
    expect(await service.isAllowed([TOKEN_A], DELEGATOR_B)).toBe(false);
  });

  it("revokePermits([contracts]) only touches the direct-decrypt scope", async () => {
    const { service } = setup();

    await service.allow([TOKEN_A]);
    await service.allow([TOKEN_A], DELEGATOR_B);

    await service.revokePermits([TOKEN_A]);

    expect(await service.isAllowed([TOKEN_A])).toBe(false);
    expect(await service.isAllowed([TOKEN_A], DELEGATOR_B)).toBe(true);
  });
});
