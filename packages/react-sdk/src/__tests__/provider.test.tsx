import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, renderHook, waitFor } from "@testing-library/react";
import type {
  Address,
  FhevmInstanceConfig,
  ZamaSDKConfig,
  ZamaSDKEventListener,
} from "@zama-fhe/sdk";
import { zamaQueryKeys } from "@zama-fhe/sdk/query";
import { createFhevmConfig } from "../config";
import { decryptionKeys } from "../relayer/decryption-cache";
import { useAllow } from "../token/use-allow";
import { wagmiAdapter } from "../wagmi/adapter";
import { fhevmHardhat, fhevmSepolia } from "@zama-fhe/sdk/chains";
import { FhevmProvider, useFhevmClient } from "../provider";
import { HardhatCleartextConfig, hoodiCleartextConfig } from "@zama-fhe/sdk/cleartext";
import { describe, expect, it } from "../test-fixtures";
import { beforeEach, vi } from "vitest";

const {
  tokenSDKConstructorArgs,
  relayerWebCtor,
  cleartextCtor,
  wagmiSignerCtor,
  wagmiUseConfigMock,
} = vi.hoisted(() => ({
  tokenSDKConstructorArgs: [] as ZamaSDKConfig[],
  relayerWebCtor: vi.fn(),
  cleartextCtor: vi.fn(),
  wagmiSignerCtor: vi.fn(),
  wagmiUseConfigMock: vi.fn(),
}));

vi.mock("@zama-fhe/sdk", async () => {
  const actual = await vi.importActual<typeof import("@zama-fhe/sdk")>("@zama-fhe/sdk");

  class MockRelayerWeb {
    terminate = vi.fn();

    constructor(config: unknown) {
      relayerWebCtor(config);
    }
  }

  class MockZamaSDK extends actual.ZamaSDK {
    constructor(config: ZamaSDKConfig) {
      super(config);
      tokenSDKConstructorArgs.push(config);
    }
  }

  return {
    ...actual,
    RelayerWeb: MockRelayerWeb,
    ZamaSDK: MockZamaSDK,
  };
});

vi.mock("@zama-fhe/sdk/cleartext", async () => {
  const actual =
    await vi.importActual<typeof import("@zama-fhe/sdk/cleartext")>("@zama-fhe/sdk/cleartext");

  class MockCleartextFhevmInstance {
    terminate = vi.fn();

    constructor(config: unknown) {
      cleartextCtor(config);
    }
  }

  return {
    ...actual,
    CleartextFhevmInstance: MockCleartextFhevmInstance,
  };
});

vi.mock("../wagmi/wagmi-signer", () => {
  class MockWagmiSigner {
    constructor(config: unknown) {
      wagmiSignerCtor(config);
    }

    async getAddress() {
      return "0x2222222222222222222222222222222222222222" as Address;
    }

    async getChainId() {
      return 11155111;
    }

    async signTypedData() {
      return "0xsig" as Address;
    }

    async writeContract() {
      return "0xtxhash" as Address;
    }

    async readContract() {
      return 0n;
    }

    async waitForTransactionReceipt() {
      return { logs: [] };
    }

    subscribe() {
      return () => {};
    }
  }

  return { WagmiSigner: MockWagmiSigner };
});

vi.mock("wagmi", async () => {
  const actual = await vi.importActual<typeof import("wagmi")>("wagmi");

  return {
    ...actual,
    useConfig: wagmiUseConfigMock,
  };
});

function withQueryClient(children: React.ReactNode, queryClient?: QueryClient) {
  const client = queryClient ?? new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("FhevmProvider & useFhevmClient", () => {
  beforeEach(() => {
    tokenSDKConstructorArgs.length = 0;
    relayerWebCtor.mockReset();
    cleartextCtor.mockReset();
    wagmiSignerCtor.mockReset();
    wagmiUseConfigMock.mockReset();
    wagmiUseConfigMock.mockReturnValue({ chains: [] });
  });

  it("renders children without errors with wagmi adapter", () => {
    const queryClient = new QueryClient();

    const config = createFhevmConfig({
      chains: [fhevmSepolia],
      wallet: wagmiAdapter(),
    });

    const view = render(
      withQueryClient(
        <FhevmProvider config={config}>
          <div data-testid="child" />
        </FhevmProvider>,
        queryClient,
      ),
    );

    expect(view.getByTestId("child")).toBeDefined();
    expect(wagmiSignerCtor).toHaveBeenCalledTimes(1);
  });

  it("returns a ZamaSDK instance inside provider", ({ createMockSigner }) => {
    const signer = createMockSigner();
    const config = createFhevmConfig({ chains: [fhevmSepolia], wallet: signer });

    const { result } = renderHook(() => useFhevmClient(), {
      wrapper: ({ children }) =>
        withQueryClient(<FhevmProvider config={config}>{children}</FhevmProvider>),
    });

    expect(result.current).toBeDefined();
    expect(result.current.signer).toBe(signer);
    expect(result.current.relayer).toBeDefined();
  });

  it("throws outside provider", () => {
    expect(() => renderHook(() => useFhevmClient())).toThrow(
      "useFhevmClient must be used within a <FhevmProvider>",
    );
  });

  it("omitting wallet creates read-only context where write hooks throw No wallet connected", async ({
    tokenAddress,
  }) => {
    const config = createFhevmConfig({ chains: [fhevmSepolia] });

    const { result } = renderHook(() => useAllow(), {
      wrapper: ({ children }) =>
        withQueryClient(<FhevmProvider config={config}>{children}</FhevmProvider>),
    });

    await expect(result.current.mutateAsync([tokenAddress])).rejects.toThrow("No wallet connected");
  });

  it("chain 11155111 resolves through RelayerWeb", ({ createMockSigner }) => {
    const config = createFhevmConfig({ chains: [fhevmSepolia], wallet: createMockSigner() });

    renderHook(() => useFhevmClient(), {
      wrapper: ({ children }) =>
        withQueryClient(<FhevmProvider config={config}>{children}</FhevmProvider>),
    });

    expect(relayerWebCtor).toHaveBeenCalledTimes(1);
    expect(cleartextCtor).not.toHaveBeenCalled();
  });

  it("chain 31337 resolves through CleartextFhevmInstance with hardhat config", ({
    createMockSigner,
  }) => {
    const config = createFhevmConfig({ chains: [fhevmHardhat], wallet: createMockSigner() });

    renderHook(() => useFhevmClient(), {
      wrapper: ({ children }) =>
        withQueryClient(<FhevmProvider config={config}>{children}</FhevmProvider>),
    });

    expect(cleartextCtor).toHaveBeenCalledWith(HardhatCleartextConfig);
    expect(relayerWebCtor).not.toHaveBeenCalled();
  });

  it("chain 560048 resolves through CleartextFhevmInstance with hoodi config", ({
    createMockSigner,
  }) => {
    const config = createFhevmConfig({
      chains: [{ id: 560048, name: "Hoodi" }],
      wallet: createMockSigner(),
    });

    renderHook(() => useFhevmClient(), {
      wrapper: ({ children }) =>
        withQueryClient(<FhevmProvider config={config}>{children}</FhevmProvider>),
    });

    expect(cleartextCtor).toHaveBeenCalledWith(hoodiCleartextConfig);
    expect(relayerWebCtor).not.toHaveBeenCalled();
  });

  it("merges relayer transport overrides over auto-resolved transport", ({ createMockSigner }) => {
    const overrideUrl = "https://example.test/relayer";
    const config = createFhevmConfig({
      chains: [fhevmSepolia],
      wallet: createMockSigner(),
      relayer: {
        transports: {
          11155111: {
            relayerUrl: overrideUrl,
          },
        },
      },
    });

    renderHook(() => useFhevmClient(), {
      wrapper: ({ children }) =>
        withQueryClient(<FhevmProvider config={config}>{children}</FhevmProvider>),
    });

    const relayerConfig = relayerWebCtor.mock.calls[0]?.[0] as {
      transports: Record<number, FhevmInstanceConfig>;
    };

    expect(relayerConfig.transports[11155111]?.relayerUrl).toBe(overrideUrl);
  });

  it("terminates sdk on unmount", ({ createMockSigner }) => {
    const config = createFhevmConfig({ chains: [fhevmSepolia], wallet: createMockSigner() });

    const { result, unmount } = renderHook(() => useFhevmClient(), {
      wrapper: ({ children }) =>
        withQueryClient(<FhevmProvider config={config}>{children}</FhevmProvider>),
    });

    const terminateSpy = vi.spyOn(result.current.relayer, "terminate");
    unmount();

    expect(terminateSpy).toHaveBeenCalledTimes(1);
  });

  it("forwards onEvent callback to ZamaSDK", ({ createMockSigner }) => {
    const onEvent: ZamaSDKEventListener = vi.fn();

    const config = createFhevmConfig({
      chains: [fhevmSepolia],
      wallet: createMockSigner(),
      advanced: { onEvent },
    });

    renderHook(() => useFhevmClient(), {
      wrapper: ({ children }) =>
        withQueryClient(<FhevmProvider config={config}>{children}</FhevmProvider>),
    });

    const wrappedOnEvent = tokenSDKConstructorArgs[0]?.onEvent;
    wrappedOnEvent?.({ type: "credentials:loading", timestamp: 1, contractAddresses: [] } as never);

    expect(onEvent).toHaveBeenCalledTimes(1);
  });

  it("forwards keypairTTL and sessionTTL to ZamaSDK", ({ createMockSigner }) => {
    const config = createFhevmConfig({
      chains: [fhevmSepolia],
      wallet: createMockSigner(),
      advanced: {
        keypairTTL: 604800,
        sessionTTL: 3600,
      },
    });

    renderHook(() => useFhevmClient(), {
      wrapper: ({ children }) =>
        withQueryClient(<FhevmProvider config={config}>{children}</FhevmProvider>),
    });

    expect(tokenSDKConstructorArgs[0]).toEqual(
      expect.objectContaining({
        keypairTTL: 604800,
        sessionTTL: 3600,
      }),
    );
  });

  it("invalidates wallet-scoped queries when signer lifecycle changes", ({
    createMockSigner,
    tokenAddress,
  }) => {
    const signer = createMockSigner();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    const config = createFhevmConfig({ chains: [fhevmSepolia], wallet: signer });

    renderHook(() => useFhevmClient(), {
      wrapper: ({ children }) =>
        withQueryClient(<FhevmProvider config={config}>{children}</FhevmProvider>, queryClient),
    });

    const lifecycle = vi.mocked(signer.subscribe!).mock.calls.at(-1)?.[0];

    const signerKey = zamaQueryKeys.signerAddress.all;
    const balanceKey = zamaQueryKeys.confidentialBalance.token(tokenAddress);
    const decryptionKey = decryptionKeys.value(
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    );
    const wagmiBalanceKey = ["readContract", { functionName: "balanceOf" }] as const;

    queryClient.setQueryData(signerKey, "0xuser");
    queryClient.setQueryData(balanceKey, 1n);
    queryClient.setQueryData(decryptionKey, 2n);
    queryClient.setQueryData(wagmiBalanceKey, 2n);

    lifecycle?.onChainChange?.(1);

    return waitFor(() => {
      expect(queryClient.getQueryData(signerKey)).toBeUndefined();
      expect(queryClient.getQueryData(decryptionKey)).toBeUndefined();
      expect(queryClient.getQueryState(balanceKey)?.isInvalidated).toBe(true);
      expect(queryClient.getQueryState(wagmiBalanceKey)?.isInvalidated).toBe(true);
    });
  });
});
