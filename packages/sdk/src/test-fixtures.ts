// oxlint-disable jest/expect-expect
// oxlint-disable jest/no-disabled-tests
/* eslint-disable no-empty-pattern */
import { test as base, vi } from "vitest";
import { ZamaSDKEvents } from "./events/sdk-events";
import type { RelayerSDK } from "./relayer/relayer-sdk";
import type { Handle } from "./relayer/relayer-sdk.types";
import type { QueryClient } from "@tanstack/query-core";
import type { Address, Hex } from "viem";
import type { CredentialServiceConfig } from "./credentials/credential-service";
import { CredentialService } from "./credentials/credential-service";
import { MemoryStorage } from "./storage/memory-storage";
import { Token } from "./token/token";
import { WrappedToken } from "./token/wrapped-token";
import type { GenericProvider, GenericSigner, GenericStorage, TransactionResult } from "./types";
import type { ZamaSDKConfig } from "./zama-sdk";
import { ZamaSDK } from "./zama-sdk";
export { afterEach, beforeEach, describe, expect, vi, type Mock } from "vitest";

const TOKEN = "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a" as Address;
const WRAPPER = "0x4D4d4D4d4d4D4D4d4D4D4D4d4d4d4d4D4D4d4d4D" as Address;
const ACL = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as Address;
const DELEGATOR = "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC" as Address;
const DELEGATE = "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" as Address;
const USER = "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B" as Address;
const VALID_HANDLE = ("0x" + "ab".repeat(32)) as Address;
export const TEST_PUBLIC_KEY = `0x${"11".repeat(32)}` as Hex;
export const TEST_PRIVATE_KEY = `0x${"22".repeat(32)}` as Hex;
export const TEST_SIGNATURE = `0x${"33".repeat(65)}` as Hex;

export const TEST_ADDR_A = ACL;
export const TEST_ADDR_B = DELEGATE;

export function createMockRelayer(overrides: Partial<RelayerSDK> = {}): RelayerSDK {
  return {
    chains: [{ id: 31337 }],
    activeChain: { id: 31337 },
    switchChain: vi.fn(),
    generateKeypair: vi.fn().mockResolvedValue({
      publicKey: TEST_PUBLIC_KEY,
      privateKey: TEST_PRIVATE_KEY,
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
        publicKey: TEST_PUBLIC_KEY,
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
    publicDecrypt: vi.fn().mockImplementation((handles: string[]) => {
      const clearValues: Record<string, bigint> = {};
      for (const h of handles) {
        clearValues[h] = 500n;
      }
      return Promise.resolve({
        clearValues,
        abiEncodedClearValues: "0x1f4",
        decryptionProof: "0xproof",
      });
    }),
    createDelegatedUserDecryptEIP712: vi.fn().mockResolvedValue({
      domain: {
        name: "test",
        version: "1",
        chainId: 1,
        verifyingContract: "0xkms",
      },
      types: { DelegatedUserDecryptRequestVerification: [] },
      message: {},
    }),
    delegatedUserDecrypt: vi.fn().mockResolvedValue({
      [VALID_HANDLE as string]: 1000n,
    }),
    requestZKProofVerification: vi.fn(),
    getAclAddress: vi.fn().mockResolvedValue(ACL),
    getPublicKey: vi.fn().mockResolvedValue({
      publicKeyId: "pk-1",
      publicKey: new Uint8Array([1]),
    }),
    getPublicParams: vi.fn().mockResolvedValue({
      publicParams: new Uint8Array([2]),
      publicParamsId: "pp-1",
    }),
    terminate: vi.fn(),
    ...overrides,
  } as unknown as RelayerSDK;
}

/**
 * Test-only signer shape — matches the production {@link GenericSigner}. The
 * read methods intentionally live on `createMockProvider` so tests that assert
 * "reads route through the provider" become observable invariants.
 */
export type MockSigner = GenericSigner;

export function createMockSigner(
  address: Address = USER,
  overrides: Partial<GenericSigner> = {},
): GenericSigner {
  const walletAccount = { address, chainId: 31337 };
  const store = {
    getSnapshot: vi.fn().mockReturnValue(walletAccount),
    subscribe: vi.fn((listener) => {
      listener({ previous: undefined, next: walletAccount });
      return () => {};
    }),
    isReady: vi.fn().mockReturnValue(true),
  };
  return {
    walletAccount: store,
    requireWalletAccount: vi.fn().mockReturnValue(walletAccount),
    signTypedData: vi.fn().mockResolvedValue(TEST_SIGNATURE),
    writeContract: vi.fn().mockResolvedValue("0xtxhash"),
    ...overrides,
  };
}

export function createMockProvider(overrides: Partial<GenericProvider> = {}): GenericProvider {
  return {
    getChainId: vi.fn().mockResolvedValue(31337),
    readContract: vi.fn(),
    waitForTransactionReceipt: vi.fn().mockResolvedValue({ logs: [] }),
    getBlockTimestamp: vi.fn().mockResolvedValue(BigInt(Math.floor(Date.now() / 1000))),
    ...overrides,
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

function createMockTokenInternal(address: Address, signer: GenericSigner): Token {
  const mockSdk = {
    signer,
    userDecrypt: vi.fn().mockResolvedValue({}),
    allow: vi.fn().mockResolvedValue(undefined),
    isAllowed: vi.fn().mockResolvedValue(true),
    revokePermits: vi.fn().mockResolvedValue(undefined),
    cache: {
      get: vi.fn(),
      set: vi.fn(),
      clearAll: vi.fn(),
      clearForRequester: vi.fn(),
    },
  };
  return {
    address,
    sdk: mockSdk,
    balanceOf: vi.fn().mockResolvedValue(123n),
    decryptBalanceAs: vi.fn().mockResolvedValue(123n),
    confidentialBalanceOf: vi.fn().mockResolvedValue(("0x" + "aa".repeat(32)) as Handle),
    name: vi.fn().mockResolvedValue("Test"),
    symbol: vi.fn().mockResolvedValue("TST"),
    decimals: vi.fn().mockResolvedValue(18),
    isConfidential: vi.fn().mockResolvedValue(true),
    isWrapper: vi.fn().mockResolvedValue(false),
    isOperator: vi.fn().mockResolvedValue(false),
  } as unknown as Token;
}

interface SdkFixtures {
  userAddress: typeof USER;
  tokenAddress: typeof TOKEN;
  wrapperAddress: typeof WRAPPER;
  aclAddress: typeof ACL;
  delegatorAddress: typeof DELEGATOR;
  delegateAddress: typeof DELEGATE;
  handle: typeof VALID_HANDLE;
  relayer: RelayerSDK;
  signer: GenericSigner;
  provider: GenericProvider;
  token: Token;
  wrappedToken: WrappedToken;
  mockToken: Token;
  mockWrappedToken: WrappedToken;
  credentialService: CredentialService;
  storage: GenericStorage;
  createMockRelayer: typeof createMockRelayer;
  createMockSigner: (addressOrOverrides?: Address | Partial<GenericSigner>) => GenericSigner;
  createMockProvider: typeof createMockProvider;
  createMockStorage: typeof createMockStorage;
  createMockToken: (
    addressOrArgs?:
      | Address
      | {
          address?: Address;
          signer?: GenericSigner;
          txResult?: TransactionResult;
        },
  ) => Token;
  createMockWrappedToken: (
    addressOrArgs?:
      | Address
      | {
          address?: Address;
          signer?: GenericSigner;
          txResult?: TransactionResult;
        },
  ) => WrappedToken;
  createCredentialManager: (config: CredentialsManagerConfig) => CredentialsManager;
  createDelegatedCredentialManager: (
    config: DelegatedCredentialsManagerConfig,
  ) => DelegatedCredentialsManager;
  createToken: (sdk: ZamaSDK, address?: Address) => Token;
  createWrappedToken: (sdk: ZamaSDK, address?: Address) => WrappedToken;
  sdk: ZamaSDK;
  createSDK: (overrides?: Partial<ZamaSDKConfig>) => ZamaSDK;
  events: typeof ZamaSDKEvents;
}

export const test = base.extend<SdkFixtures>({
  userAddress: USER,
  tokenAddress: TOKEN,
  wrapperAddress: WRAPPER,
  aclAddress: ACL,
  delegatorAddress: DELEGATOR,
  delegateAddress: DELEGATE,
  handle: VALID_HANDLE,
  // Per-test instances — fresh mocks for each test
  relayer: async ({}, use) => {
    await use(createMockRelayer());
  },
  signer: async ({ userAddress }, use) => {
    await use(createMockSigner(userAddress));
  },
  provider: async ({}, use) => {
    await use(createMockProvider());
  },
  storage: async ({}, use) => {
    await use(new MemoryStorage());
  },
  token: async ({ sdk, tokenAddress }, use) => {
    await use(new Token(sdk, tokenAddress));
  },
  wrappedToken: async ({ sdk, wrapperAddress }, use) => {
    await use(new WrappedToken(sdk, wrapperAddress));
  },
  mockToken: async ({ createMockToken }, use) => {
    await use(createMockToken());
  },
  mockWrappedToken: async ({ createMockWrappedToken }, use) => {
    await use(createMockWrappedToken());
  },
  createMockRelayer: async ({}, use) => {
    await use(createMockRelayer);
  },
  createMockSigner: async ({ userAddress }, use) => {
    await use((addressOrOverrides?: Address | Partial<GenericSigner>) => {
      const address = typeof addressOrOverrides === "string" ? addressOrOverrides : userAddress;
      const overrides = typeof addressOrOverrides === "object" ? addressOrOverrides : {};
      return createMockSigner(address, overrides);
    });
  },
  createMockProvider: async ({}, use) => {
    await use(createMockProvider);
  },
  createMockStorage: async ({}, use) => {
    await use(createMockStorage);
  },
  createCredentialService: async ({ relayer, signer, storage }, use) => {
    function factory(config: Partial<CredentialServiceConfig> = {}) {
      return new CredentialService({
        relayer: (config.relayer ?? relayer) as CredentialServiceConfig["relayer"],
        signer: config.signer ?? signer,
        keypairTTL: config.keypairTTL ?? 86400,
        permitTTL: config.permitTTL ?? 1,
        storage: config.storage ?? storage,
        permitStorage: config.permitStorage,
      });
    }
    await use(factory);
  },
  credentialService: async ({ createCredentialService }, use) => {
    await use(createCredentialService({}));
  },
  createToken: async ({ tokenAddress }, use) => {
    await use((sdk: ZamaSDK, address?: Address) => new Token(sdk, address ?? tokenAddress));
  },
  createWrappedToken: async ({ wrapperAddress }, use) => {
    await use(
      (sdk: ZamaSDK, address?: Address) => new WrappedToken(sdk, address ?? wrapperAddress),
    );
  },
  createMockToken: async ({ tokenAddress, signer }, use) => {
    const defaultTxResult: TransactionResult = {
      txHash: ("0x" + "11".repeat(32)) as Hex,
      receipt: { logs: [] },
    };
    function factory(
      addressOrArgs?:
        | Address
        | {
            address?: Address;
            signer?: GenericSigner;
            txResult?: TransactionResult;
          },
    ) {
      const addr =
        typeof addressOrArgs === "string"
          ? addressOrArgs
          : (addressOrArgs?.address ?? tokenAddress);
      const sig = typeof addressOrArgs === "object" ? (addressOrArgs?.signer ?? signer) : signer;
      const txResult =
        typeof addressOrArgs === "object"
          ? (addressOrArgs?.txResult ?? defaultTxResult)
          : defaultTxResult;
      const base = createMockTokenInternal(addr, sig);
      return {
        // oxlint-disable-next-line typescript-eslint/no-misused-spread
        ...base,
        confidentialTransfer: vi.fn().mockResolvedValue(txResult),
        confidentialTransferFrom: vi.fn().mockResolvedValue(txResult),
        setOperator: vi.fn().mockResolvedValue(txResult),
      } as unknown as Token;
    }
    await use(factory);
  },
  createMockWrappedToken: async ({ wrapperAddress, signer }, use) => {
    const defaultTxResult: TransactionResult = {
      txHash: ("0x" + "11".repeat(32)) as Hex,
      receipt: { logs: [] },
    };
    function factory(
      addressOrArgs?:
        | Address
        | {
            address?: Address;
            signer?: GenericSigner;
            txResult?: TransactionResult;
          },
    ) {
      const addr =
        typeof addressOrArgs === "string"
          ? addressOrArgs
          : (addressOrArgs?.address ?? wrapperAddress);
      const sig = typeof addressOrArgs === "object" ? (addressOrArgs?.signer ?? signer) : signer;
      const txResult =
        typeof addressOrArgs === "object"
          ? (addressOrArgs?.txResult ?? defaultTxResult)
          : defaultTxResult;
      const base = createMockTokenInternal(addr, sig);
      return {
        // oxlint-disable-next-line typescript-eslint/no-misused-spread
        ...base,
        confidentialTransfer: vi.fn().mockResolvedValue(txResult),
        confidentialTransferFrom: vi.fn().mockResolvedValue(txResult),
        setOperator: vi.fn().mockResolvedValue(txResult),
        underlying: vi.fn().mockResolvedValue(addr),
        allowance: vi.fn().mockResolvedValue(0n),
        approveUnderlying: vi.fn().mockResolvedValue(txResult),
        shield: vi.fn().mockResolvedValue(txResult),
        unwrap: vi.fn().mockResolvedValue(txResult),
        unwrapAll: vi.fn().mockResolvedValue(txResult),
        finalizeUnwrap: vi.fn().mockResolvedValue(txResult),
        unshield: vi.fn().mockResolvedValue(txResult),
        unshieldAll: vi.fn().mockResolvedValue(txResult),
        resumeUnshield: vi.fn().mockResolvedValue(txResult),
      } as unknown as WrappedToken;
    }
    await use(factory);
  },
  sdk: async ({ relayer, provider, signer, storage }, use) => {
    await use(new ZamaSDK({ relayer, provider, signer, storage }));
  },
  createSDK: async ({ provider, signer, relayer, storage }, use) => {
    await use((overrides?: Partial<ZamaSDKConfig>) => {
      return new ZamaSDK({
        relayer,
        provider,
        signer,
        storage,
        ...overrides,
      });
    });
  },
  events: ZamaSDKEvents,
});

export const it = test;

/**
 * Build a minimal TanStack QueryFunctionContext for testing query factories.
 * Includes `client`, `signal`, and `meta` — the real shape TanStack passes
 * at runtime. The `client` is a dummy (none of our factories use it).
 */
export function mockQueryContext<TQueryKey extends readonly unknown[]>(queryKey: TQueryKey) {
  return {
    queryKey,
    // Our factories never access client — they extract params from queryKey.
    // A typed stub satisfies the QueryFunctionContext contract without pulling
    // in a real QueryClient + its transitive deps.
    client: {} as QueryClient,
    signal: AbortSignal.timeout(5000),
    meta: undefined,
  };
}
