import { vi } from "vitest";
import { Topics } from "../../events";
import type { GenericSigner } from "../token.types";
import type { RelayerSDK } from "../../relayer/relayer-sdk";
import type { Address } from "../../relayer/relayer-sdk.types";

// ── Shared test constants ───────────────────────────────────────────────
export const TOKEN = "0x1111111111111111111111111111111111111111" as Address;
export const USER = "0x2222222222222222222222222222222222222222" as Address;
export const ZERO_HANDLE = "0x" + "0".repeat(64);
export const VALID_HANDLE = ("0x" + "ab".repeat(32)) as Address;

/**
 * Create a mock RelayerSDK with sensible defaults.
 * Override individual methods as needed in each test.
 */
export function createMockRelayer(overrides: Partial<RelayerSDK> = {}): RelayerSDK {
  return {
    generateKeypair: vi.fn().mockResolvedValue({
      publicKey: "0xpub",
      privateKey: "0xpriv",
    }),
    createEIP712: vi.fn().mockResolvedValue({
      domain: {
        name: "test",
        version: "1",
        chainId: 1,
        verifyingContract: "0xkms",
      },
      types: { UserDecryptRequestVerification: [] },
      message: {
        publicKey: "0xpub",
        contractAddresses: ["0xtoken"],
        startTimestamp: 1000n,
        durationDays: 1n,
        extraData: "0x",
      },
    }),
    encrypt: vi.fn().mockResolvedValue({
      handles: [new Uint8Array([1, 2, 3])],
      inputProof: new Uint8Array([4, 5, 6]),
    }),
    userDecrypt: vi.fn().mockResolvedValue({}),
    publicDecrypt: vi.fn().mockResolvedValue({
      clearValues: {},
      abiEncodedClearValues: "0x",
      decryptionProof: "0xproof",
    }),
    createDelegatedUserDecryptEIP712: vi.fn(),
    delegatedUserDecrypt: vi.fn(),
    requestZKProofVerification: vi.fn(),
    getPublicKey: vi.fn(),
    getPublicParams: vi.fn(),
    terminate: vi.fn(),
    ...overrides,
  } as unknown as RelayerSDK;
}

/**
 * Create a mock GenericSigner with sensible defaults.
 * Pass `address` to set the wallet address.
 */
export function createMockSigner(
  address: Address = "0xuser" as Address,
  overrides: Partial<GenericSigner> = {},
): GenericSigner {
  return {
    getAddress: vi.fn().mockResolvedValue(address),
    signTypedData: vi.fn().mockResolvedValue("0xsig"),
    writeContract: vi.fn().mockResolvedValue("0xtxhash"),
    readContract: vi.fn(),
    waitForTransactionReceipt: vi.fn().mockResolvedValue({ logs: [] }),
    getChainId: vi.fn().mockResolvedValue(31337),
    subscribe: vi.fn().mockReturnValue(() => {}),
    ...overrides,
  };
}

/**
 * Mock a transaction receipt containing an UnwrapRequested event.
 * Reusable across unshield / unshieldAll / resumeUnshield tests.
 */
export function mockReceiptWithUnwrapRequested(
  signer: ReturnType<typeof createMockSigner>,
  user: Address = USER,
) {
  vi.mocked(signer.waitForTransactionReceipt).mockResolvedValue({
    logs: [
      {
        topics: [Topics.UnwrapRequested, "0x000000000000000000000000" + user.slice(2)],
        data: "0x" + "ff".repeat(32),
      },
    ],
  });
}
