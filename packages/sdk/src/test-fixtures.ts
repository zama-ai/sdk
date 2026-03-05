/* eslint-disable no-empty-pattern */
import { test as base, vi } from "vitest";
import type { RelayerSDK } from "./relayer/relayer-sdk";
import type { Address } from "./relayer/relayer-sdk.types";
import { MemoryStorage } from "./token/memory-storage";
import { Token, TokenConfig } from "./token/token";
import type { GenericSigner, GenericStorage, TransactionResult } from "./token/token.types";
import { CredentialsManager } from "./token/credentials-manager";
import { ZamaSDK, ZamaSDKConfig } from "./token/zama-sdk";
export { afterEach, beforeEach, describe, expect, vi, type Mock } from "vitest";

const TOKEN = "0x1111111111111111111111111111111111111111" as Address;
const WRAPPER = "0x4444444444444444444444444444444444444444" as Address;
const USER = "0x2222222222222222222222222222222222222222" as Address;
const VALID_HANDLE = ("0x" + "ab".repeat(32)) as Address;

function createMockRelayer(): RelayerSDK {
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
        contractAddresses: [TOKEN],
        startTimestamp: 1000n,
        durationDays: 1n,
        extraData: "0x",
      },
    }),
    encrypt: vi.fn().mockResolvedValue({
      handles: [new Uint8Array([1, 2, 3])],
      inputProof: new Uint8Array([4, 5, 6]),
    }),
    userDecrypt: vi.fn().mockResolvedValue({
      [VALID_HANDLE as string]: 1000n,
    }),
    publicDecrypt: vi.fn().mockResolvedValue({
      clearValues: {},
      abiEncodedClearValues: "0x1f4",
      decryptionProof: "0xproof",
    }),
    createDelegatedUserDecryptEIP712: vi.fn(),
    delegatedUserDecrypt: vi.fn(),
    requestZKProofVerification: vi.fn(),
    getPublicKey: vi
      .fn()
      .mockResolvedValue({ publicKeyId: "pk-1", publicKey: new Uint8Array([1]) }),
    getPublicParams: vi
      .fn()
      .mockResolvedValue({ publicParams: new Uint8Array([2]), publicParamsId: "pp-1" }),
    terminate: vi.fn(),
  };
}

function createMockSigner(address: Address = USER): GenericSigner {
  return {
    getAddress: vi.fn().mockResolvedValue(address),
    signTypedData: vi.fn().mockResolvedValue("0xsig"),
    writeContract: vi.fn().mockResolvedValue("0xtxhash"),
    readContract: vi.fn(),
    waitForTransactionReceipt: vi.fn().mockResolvedValue({ logs: [] }),
    getChainId: vi.fn().mockResolvedValue(31337),
    subscribe: vi.fn().mockReturnValue(() => {}),
  };
}

export function createMockStorage(): GenericStorage {
  const store = new Map<string, unknown>();
  return {
    get: vi.fn((key: string) => Promise.resolve(store.get(key) ?? null)) as GenericStorage["get"],
    set: vi.fn((key: string, value: unknown) => {
      store.set(key, value);
      return Promise.resolve();
    }),
    delete: vi.fn((key: string) => {
      store.delete(key);
      return Promise.resolve();
    }),
  };
}

function createToken(config: TokenConfig) {
  return new Token(config);
}

interface SdkFixtures {
  userAddress: typeof USER;
  tokenAddress: typeof TOKEN;
  wrapperAddress: typeof WRAPPER;
  handle: typeof VALID_HANDLE;
  relayer: RelayerSDK;
  signer: GenericSigner;
  token: Token;
  credentialManager: CredentialsManager;
  storage: GenericStorage;
  sessionStorage: GenericStorage;
  createMockRelayer: typeof createMockRelayer;
  createMockSigner: typeof createMockSigner;
  createMockStorage: typeof createMockStorage;
  createMockToken: (args: {
    address?: Address;
    signer?: GenericSigner;
    txResult: TransactionResult;
  }) => Token;
  createToken: typeof createToken;
  sdk: ZamaSDK;
  createSDK: (overrides?: Partial<ZamaSDKConfig>) => ZamaSDK;
}

export const test = base.extend<SdkFixtures>({
  userAddress: USER,
  tokenAddress: TOKEN,
  wrapperAddress: WRAPPER,
  handle: VALID_HANDLE,
  // Per-test instances — fresh mocks for each test
  relayer: async ({}, use) => {
    await use(createMockRelayer());
  },
  signer: async ({}, use) => {
    await use(createMockSigner());
  },
  credentialManager: async ({ relayer, signer, storage, sessionStorage }, use) => {
    await use(
      new CredentialsManager({
        relayer,
        signer,
        storage,
        sessionStorage,
        durationDays: 1,
      }),
    );
  },
  storage: async ({}, use) => {
    await use(new MemoryStorage());
  },
  sessionStorage: async ({}, use) => {
    await use(new MemoryStorage());
  },
  token: async ({ relayer, signer, storage, sessionStorage, tokenAddress }, use) => {
    await use(
      createToken({
        relayer,
        signer,
        storage,
        sessionStorage,
        address: tokenAddress,
      }),
    );
  },
  createMockRelayer: async ({}, use) => {
    await use(createMockRelayer);
  },
  createMockSigner: async ({}, use) => {
    await use(createMockSigner);
  },
  createMockStorage: async ({}, use) => {
    await use(createMockStorage);
  },
  createToken: async ({}, use) => {
    await use(createToken);
  },
  createMockToken: async ({ tokenAddress, signer }, use) => {
    function createMockToken({
      txResult,
      ...overrides
    }: {
      address?: Address;
      signer?: GenericSigner;
      txResult: TransactionResult;
    }) {
      return {
        address: overrides.address ?? tokenAddress,
        signer: overrides.signer ?? signer,
        confidentialTransfer: vi.fn().mockResolvedValue(txResult),
        confidentialTransferFrom: vi.fn().mockResolvedValue(txResult),
        approve: vi.fn().mockResolvedValue(txResult),
        approveUnderlying: vi.fn().mockResolvedValue(txResult),
        shield: vi.fn().mockResolvedValue(txResult),
        shieldETH: vi.fn().mockResolvedValue(txResult),
        unwrap: vi.fn().mockResolvedValue(txResult),
        unwrapAll: vi.fn().mockResolvedValue(txResult),
        finalizeUnwrap: vi.fn().mockResolvedValue(txResult),
        unshield: vi.fn().mockResolvedValue(txResult),
        unshieldAll: vi.fn().mockResolvedValue(txResult),
        resumeUnshield: vi.fn().mockResolvedValue(txResult),
      } as unknown as Token;
    }
    await use(createMockToken);
  },
  sdk: async ({ relayer, signer, storage, sessionStorage }, use) => {
    await use(new ZamaSDK({ relayer, signer, storage, sessionStorage }));
  },
  createSDK: async ({ signer, relayer, storage, sessionStorage }, use) => {
    await use((overrides?: Partial<ZamaSDKConfig>) => {
      return new ZamaSDK({ relayer, signer, storage, sessionStorage, ...overrides });
    });
  },
});

export const it = test;
