/* eslint-disable no-empty-pattern */
import { test as base, vi } from "vitest";
import { ZamaSDKEvents } from "./events/sdk-events";
import type { RelayerSDK } from "./relayer/relayer-sdk";
import type { Handle } from "./relayer/relayer-sdk.types";
import type { QueryClient } from "@tanstack/query-core";
import type { Address, Hex } from "viem";
import type { CredentialsManagerConfig } from "./credentials/credentials-manager";
import { CredentialsManager } from "./credentials/credentials-manager";
import type { DelegatedCredentialsManagerConfig } from "./credentials/delegated-credentials-manager";
import { DelegatedCredentialsManager } from "./credentials/delegated-credentials-manager";
import { MemoryStorage } from "./storage/memory-storage";
import { ReadonlyToken } from "./token/readonly-token";
import { Token } from "./token/token";
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
    createDelegatedUserDecryptEIP712: vi.fn(),
    delegatedUserDecrypt: vi.fn(),
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
 * Test-only signer shape: the narrow production {@link GenericSigner} plus the
 * read methods that moved to {@link GenericProvider}. Tests configure a single
 * mock object and the paired `createMockProvider` reuses the read-method
 * `vi.fn()`s so `sdk.provider.readContract(...)` calls route through the same
 * mocks tests assert against as `signer.readContract`.
 */
export type MockSigner = GenericSigner &
  Pick<GenericProvider, "readContract" | "waitForTransactionReceipt" | "getBlockTimestamp">;

export function createMockSigner(
  address: Address = USER,
  overrides: Partial<MockSigner> = {},
): MockSigner {
  return {
    getAddress: vi.fn().mockResolvedValue(address),
    signTypedData: vi.fn().mockResolvedValue("0xsig"),
    writeContract: vi.fn().mockResolvedValue("0xtxhash"),
    readContract: vi.fn(),
    waitForTransactionReceipt: vi.fn().mockResolvedValue({ logs: [] }),
    getChainId: vi.fn().mockResolvedValue(31337),
    getBlockTimestamp: vi.fn().mockResolvedValue(BigInt(Math.floor(Date.now() / 1000))),
    subscribe: vi.fn().mockReturnValue(() => {}),
    ...overrides,
  } as MockSigner;
}

/**
 * Test provider mock that shares the signer's read-method `vi.fn()`s so
 * existing tests can continue asserting via `signer.readContract` etc. while
 * production code routes through `sdk.provider`.
 */
export function createMockProvider(signer: MockSigner): GenericProvider {
  return {
    getChainId: signer.getChainId,
    readContract: signer.readContract,
    waitForTransactionReceipt: signer.waitForTransactionReceipt,
    getBlockTimestamp: signer.getBlockTimestamp,
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

function createMockReadonlyToken(address: Address, signer: GenericSigner): ReadonlyToken {
  const mockSdk = {
    signer,
    userDecrypt: vi.fn().mockResolvedValue({}),
    allow: vi.fn().mockResolvedValue(undefined),
    cache: { get: vi.fn(), set: vi.fn(), clearAll: vi.fn(), clearForRequester: vi.fn() },
  };
  return {
    address,
    sdk: mockSdk,
    signer,
    balanceOf: vi.fn().mockResolvedValue(123n),
    decryptBalanceAs: vi.fn().mockResolvedValue(123n),
    confidentialBalanceOf: vi.fn().mockResolvedValue(("0x" + "aa".repeat(32)) as Handle),
    isDelegated: vi.fn().mockResolvedValue(false),
    getDelegationExpiry: vi.fn().mockResolvedValue(0n),
    name: vi.fn().mockResolvedValue("Test"),
    symbol: vi.fn().mockResolvedValue("TST"),
    decimals: vi.fn().mockResolvedValue(18),
    isConfidential: vi.fn().mockResolvedValue(true),
    isWrapper: vi.fn().mockResolvedValue(false),
    allowance: vi.fn().mockResolvedValue(0n),
    isApproved: vi.fn().mockResolvedValue(false),
  } as unknown as ReadonlyToken;
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
  signer: MockSigner;
  provider: GenericProvider;
  token: Token;
  readonlyToken: ReadonlyToken;
  mockToken: Token;
  credentialManager: CredentialsManager;
  delegatedCredentialManager: DelegatedCredentialsManager;
  storage: GenericStorage;
  sessionStorage: GenericStorage;
  createMockRelayer: typeof createMockRelayer;
  createMockSigner: (addressOrOverrides?: Address | Partial<MockSigner>) => MockSigner;
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
  createMockReadonlyToken: (address?: Address) => ReadonlyToken;
  createCredentialManager: (config: CredentialsManagerConfig) => CredentialsManager;
  createDelegatedCredentialManager: (
    config: DelegatedCredentialsManagerConfig,
  ) => DelegatedCredentialsManager;
  createToken: (sdk: ZamaSDK, address?: Address, wrapper?: Address) => Token;
  createReadonlyToken: (sdk: ZamaSDK, address?: Address) => ReadonlyToken;
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
  provider: async ({ signer }, use) => {
    await use(createMockProvider(signer));
  },
  credentialManager: async (
    { relayer, signer, storage, sessionStorage, createCredentialManager },
    use,
  ) => {
    await use(
      createCredentialManager({
        relayer,
        signer,
        storage,
        sessionStorage,
        keypairTTL: 86400,
        sessionTTL: 2592000,
      }),
    );
  },
  storage: async ({}, use) => {
    await use(new MemoryStorage());
  },
  sessionStorage: async ({}, use) => {
    await use(new MemoryStorage());
  },
  token: async ({ sdk, tokenAddress }, use) => {
    await use(new Token(sdk, tokenAddress));
  },
  readonlyToken: async ({ sdk, tokenAddress }, use) => {
    await use(new ReadonlyToken(sdk, tokenAddress));
  },
  mockToken: async ({ createMockToken }, use) => {
    await use(createMockToken());
  },
  createMockRelayer: async ({}, use) => {
    await use(createMockRelayer);
  },
  createMockSigner: async ({ userAddress }, use) => {
    await use((addressOrOverrides?: Address | Partial<MockSigner>) => {
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
  createCredentialManager: async ({}, use) => {
    function factory(config: CredentialsManagerConfig) {
      return new CredentialsManager({
        relayer: config.relayer,
        signer: config.signer,
        storage: config.storage,
        sessionStorage: config.sessionStorage,
        keypairTTL: config.keypairTTL ?? 2592000,
        sessionTTL: config.sessionTTL ?? 2592000,
        onEvent: config.onEvent,
      });
    }
    await use(factory);
  },
  createDelegatedCredentialManager: async ({}, use) => {
    function factory(config: DelegatedCredentialsManagerConfig) {
      return new DelegatedCredentialsManager({
        relayer: config.relayer,
        signer: config.signer,
        storage: config.storage,
        sessionStorage: config.sessionStorage,
        keypairTTL: config.keypairTTL ?? 2592000,
        sessionTTL: config.sessionTTL ?? 2592000,
        onEvent: config.onEvent,
      });
    }
    await use(factory);
  },
  delegatedCredentialManager: async (
    { relayer, signer, storage, sessionStorage, createDelegatedCredentialManager },
    use,
  ) => {
    await use(
      createDelegatedCredentialManager({
        relayer,
        signer,
        storage,
        sessionStorage,
        keypairTTL: 86400,
        sessionTTL: 2592000,
      }),
    );
  },
  createToken: async ({ tokenAddress }, use) => {
    await use(
      (sdk: ZamaSDK, address?: Address, wrapper?: Address) =>
        new Token(sdk, address ?? tokenAddress, wrapper),
    );
  },
  createReadonlyToken: async ({ tokenAddress }, use) => {
    await use((sdk: ZamaSDK, address?: Address) => new ReadonlyToken(sdk, address ?? tokenAddress));
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
      return {
        address: addr,
        signer: sig,
        confidentialTransfer: vi.fn().mockResolvedValue(txResult),
        confidentialTransferFrom: vi.fn().mockResolvedValue(txResult),
        approve: vi.fn().mockResolvedValue(txResult),
        approveUnderlying: vi.fn().mockResolvedValue(txResult),
        shield: vi.fn().mockResolvedValue(txResult),
        unwrap: vi.fn().mockResolvedValue(txResult),
        unwrapAll: vi.fn().mockResolvedValue(txResult),
        finalizeUnwrap: vi.fn().mockResolvedValue(txResult),
        unshield: vi.fn().mockResolvedValue(txResult),
        unshieldAll: vi.fn().mockResolvedValue(txResult),
        resumeUnshield: vi.fn().mockResolvedValue(txResult),
        delegateDecryption: vi.fn().mockResolvedValue(txResult),
        revokeDelegation: vi.fn().mockResolvedValue(txResult),
      } as unknown as Token;
    }
    await use(factory);
  },
  createMockReadonlyToken: async ({ tokenAddress, signer }, use) => {
    await use((address?: Address) => createMockReadonlyToken(address ?? tokenAddress, signer));
  },
  sdk: async ({ relayer, provider, signer, storage, sessionStorage }, use) => {
    await use(new ZamaSDK({ relayer, provider, signer, storage, sessionStorage }));
  },
  createSDK: async ({ provider, signer, relayer, storage, sessionStorage }, use) => {
    await use((overrides?: Partial<ZamaSDKConfig>) => {
      return new ZamaSDK({
        relayer,
        provider,
        signer,
        storage,
        sessionStorage,
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
