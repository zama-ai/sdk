import { describe, expect, vi, afterEach } from "vitest";
import type { createMockRelayer } from "../../test-fixtures";
import { test, createMockSigner, createMockStorage } from "../../test-fixtures";
import { DelegatedCredentialsManager } from "../delegated-credentials-manager";
import type { Address } from "viem";

const DELEGATOR = "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC" as Address;
const DELEGATE = "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" as Address;
const TOKEN_A = "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a" as Address;
const TOKEN_B = "0x7A7a7A7a7a7a7a7A7a7a7a7A7a7A7A7A7A7A7a7A" as Address;

function mockDelegatedEIP712(relayer: ReturnType<typeof createMockRelayer>) {
  vi.mocked(relayer.createDelegatedUserDecryptEIP712).mockResolvedValue({
    domain: { name: "test", version: "1", chainId: 31337n, verifyingContract: "0xkms" },
    types: { DelegatedUserDecryptRequestVerification: [] },
    message: {
      publicKey: "0xpub",
      contractAddresses: [TOKEN_A],
      delegatorAddress: DELEGATOR,
      startTimestamp: "1000",
      durationDays: "1",
      extraData: "0x",
    },
  } as never);
}

function createManager(
  relayer: ReturnType<typeof createMockRelayer>,
  overrides: { sessionTTL?: number | "infinite"; keypairTTL?: number } = {},
) {
  const signer = createMockSigner(DELEGATE);
  const storage = createMockStorage();
  const sessionStorage = createMockStorage();
  mockDelegatedEIP712(relayer);

  return {
    manager: new DelegatedCredentialsManager({
      relayer,
      signer,
      storage,
      sessionStorage,
      keypairTTL: overrides.keypairTTL ?? 86400,
      sessionTTL: overrides.sessionTTL ?? 2592000,
    }),
    signer,
    storage,
    sessionStorage,
  };
}

describe("DelegatedCredentialsManager", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  // Core allow() tests
  test("allow() generates fresh credentials for a delegator", async ({ relayer }) => {
    const { manager, signer } = createManager(relayer);

    const creds = await manager.allow(DELEGATOR, TOKEN_A);

    expect(creds.delegatorAddress).toBe(DELEGATOR);
    expect(creds.delegateAddress).toBe(DELEGATE);
    expect(creds.publicKey).toBe("0xpub");
    expect(creds.contractAddresses).toContain(TOKEN_A);
    expect(relayer.generateKeypair).toHaveBeenCalledOnce();
    expect(relayer.createDelegatedUserDecryptEIP712).toHaveBeenCalledOnce();
    expect(signer.signTypedData).toHaveBeenCalledOnce();
  });

  test("allow() returns cached credentials on second call", async ({ relayer }) => {
    const { manager } = createManager(relayer);

    const creds1 = await manager.allow(DELEGATOR, TOKEN_A);
    const creds2 = await manager.allow(DELEGATOR, TOKEN_A);

    expect(creds1.publicKey).toBe(creds2.publicKey);
    expect(relayer.generateKeypair).toHaveBeenCalledOnce();
  });

  test("allow() extends contract set for new tokens", async ({ relayer }) => {
    const { manager, signer } = createManager(relayer);

    await manager.allow(DELEGATOR, TOKEN_A);
    const creds = await manager.allow(DELEGATOR, TOKEN_A, TOKEN_B);

    expect(creds.contractAddresses).toContain(TOKEN_A);
    expect(creds.contractAddresses).toContain(TOKEN_B);
    expect(relayer.generateKeypair).toHaveBeenCalledOnce();
    expect(signer.signTypedData).toHaveBeenCalledTimes(2);
  });

  test("different delegators get separate credentials", async ({ relayer }) => {
    const OTHER_DELEGATOR = "0xdDdDddDdDdddDDddDDddDDDDdDdDDdDDdDDDDDDd" as Address;
    const { manager } = createManager(relayer);

    await manager.allow(DELEGATOR, TOKEN_A);
    await manager.allow(OTHER_DELEGATOR, TOKEN_A);

    expect(relayer.generateKeypair).toHaveBeenCalledTimes(2);
  });

  // Lifecycle tests
  test("revoke() clears session, next allow() re-signs", async ({ relayer }) => {
    const { manager, signer } = createManager(relayer);

    await manager.allow(DELEGATOR, TOKEN_A);
    await manager.revoke(DELEGATOR);
    await manager.allow(DELEGATOR, TOKEN_A);

    expect(relayer.generateKeypair).toHaveBeenCalledOnce();
    expect(signer.signTypedData).toHaveBeenCalledTimes(2);
  });

  test("isAllowed() returns true when session covers the given contract", async ({ relayer }) => {
    const { manager } = createManager(relayer);

    expect(await manager.isAllowed(DELEGATOR, [TOKEN_A])).toBe(false);
    await manager.allow(DELEGATOR, TOKEN_A);
    expect(await manager.isAllowed(DELEGATOR, [TOKEN_A])).toBe(true);
    await manager.revoke(DELEGATOR);
    expect(await manager.isAllowed(DELEGATOR, [TOKEN_A])).toBe(false);
  });

  test("clear() removes all stored credentials", async ({ relayer }) => {
    const { manager } = createManager(relayer);

    await manager.allow(DELEGATOR, TOKEN_A);
    await manager.clear(DELEGATOR);
    await manager.allow(DELEGATOR, TOKEN_A);

    expect(relayer.generateKeypair).toHaveBeenCalledTimes(2);
  });

  test("sessionTTL: 'infinite' means never expire", async ({ relayer }) => {
    vi.useFakeTimers();
    const { manager } = createManager(relayer, {
      sessionTTL: "infinite",
      keypairTTL: 10 * 365 * 86400 + 1,
    });

    await manager.allow(DELEGATOR, TOKEN_A);

    // Advance time by 10 years
    vi.advanceTimersByTime(10 * 365 * 86400 * 1000);

    // Session should still be valid for the allowed contract
    expect(await manager.isAllowed(DELEGATOR, [TOKEN_A])).toBe(true);
  });

  test("sessionTTL: 0 means every operation triggers signing", async ({ relayer }) => {
    const { manager, signer } = createManager(relayer, { sessionTTL: 0 });

    await manager.allow(DELEGATOR, TOKEN_A);
    expect(signer.signTypedData).toHaveBeenCalledOnce();

    await manager.allow(DELEGATOR, TOKEN_A);
    expect(signer.signTypedData).toHaveBeenCalledTimes(2);

    await manager.allow(DELEGATOR, TOKEN_A);
    expect(signer.signTypedData).toHaveBeenCalledTimes(3);
  });
});
