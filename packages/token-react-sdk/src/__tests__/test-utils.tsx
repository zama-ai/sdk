import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, type RenderHookOptions } from "@testing-library/react";
import { vi } from "vitest";
import type { GenericSigner, GenericStringStorage, RelayerSDK } from "@zama-fhe/token-sdk";
import { TokenSDKProvider } from "../provider";

const USER = "0x2222222222222222222222222222222222222222" as `0x${string}`;

export function createMockSigner(): GenericSigner {
  return {
    getAddress: vi.fn().mockResolvedValue(USER),
    signTypedData: vi.fn().mockResolvedValue("0xsig"),
    writeContract: vi.fn().mockResolvedValue("0xtxhash"),
    readContract: vi.fn().mockResolvedValue("0x0"),
    waitForTransactionReceipt: vi.fn().mockResolvedValue({ logs: [] }),
    getChainId: vi.fn().mockResolvedValue(31337),
  };
}

export function createMockRelayer(): RelayerSDK {
  return {
    generateKeypair: vi.fn().mockResolvedValue({ publicKey: "0xpub", privateKey: "0xpriv" }),
    createEIP712: vi.fn().mockResolvedValue({
      domain: { name: "test", version: "1", chainId: 1, verifyingContract: "0xkms" },
      types: { UserDecryptRequestVerification: [] },
      message: {
        publicKey: "0xpub",
        contractAddresses: [],
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
    createDelegatedUserDecryptEIP712: vi.fn().mockResolvedValue({}),
    delegatedUserDecrypt: vi.fn().mockResolvedValue({}),
    requestZKProofVerification: vi.fn().mockResolvedValue("0xproof"),
    getPublicKey: vi
      .fn()
      .mockResolvedValue({ publicKeyId: "pk-1", publicKey: new Uint8Array([1]) }),
    getPublicParams: vi
      .fn()
      .mockResolvedValue({ publicParams: new Uint8Array([2]), publicParamsId: "pp-1" }),
    terminate: vi.fn(),
  } as unknown as RelayerSDK;
}

export function createMockStorage(): GenericStringStorage {
  const store = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve();
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
      return Promise.resolve();
    }),
  };
}

interface WrapperOverrides {
  signer?: GenericSigner;
  relayer?: RelayerSDK;
  storage?: GenericStringStorage;
}

export function createWrapper(overrides?: WrapperOverrides) {
  const signer = overrides?.signer ?? createMockSigner();
  const relayer = overrides?.relayer ?? createMockRelayer();
  const storage = overrides?.storage ?? createMockStorage();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <TokenSDKProvider relayer={relayer} signer={signer} storage={storage}>
          {children}
        </TokenSDKProvider>
      </QueryClientProvider>
    );
  }

  return { Wrapper, queryClient, signer, relayer, storage };
}

export function renderWithProviders<TResult>(
  hook: () => TResult,
  overrides?: WrapperOverrides,
  options?: Omit<RenderHookOptions<unknown>, "wrapper">,
) {
  const ctx = createWrapper(overrides);
  const renderResult = renderHook(hook, { wrapper: ctx.Wrapper, ...options });
  return { ...renderResult, ...ctx };
}
