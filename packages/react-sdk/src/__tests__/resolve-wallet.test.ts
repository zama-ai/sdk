import type { GenericSigner } from "@zama-fhe/sdk";
import { SepoliaConfig } from "@zama-fhe/sdk";
import { fhevmSepolia } from "@zama-fhe/sdk/chains";
import { createFhevmConfig, EMPTY_CHAINS_ERROR, WAGMI_PROVIDER_REQUIRED_ERROR } from "../config";
import { wagmiAdapter } from "../wagmi/adapter";
import { resolveWallet } from "../resolve-wallet";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { wagmiSignerCtor, viemSignerCtor, createPublicClientMock, httpMock } = vi.hoisted(() => ({
  wagmiSignerCtor: vi.fn(),
  viemSignerCtor: vi.fn(),
  createPublicClientMock: vi.fn(),
  httpMock: vi.fn(),
}));

vi.mock("../wagmi/wagmi-signer", () => {
  class MockWagmiSigner {
    constructor(config: unknown) {
      wagmiSignerCtor(config);
    }
  }
  return { WagmiSigner: MockWagmiSigner };
});

vi.mock("@zama-fhe/sdk/viem", () => {
  class MockViemSigner {
    constructor(config: unknown) {
      viemSignerCtor(config);
    }

    async getAddress() {
      return "0x1111111111111111111111111111111111111111";
    }

    async signTypedData() {
      return "0xsig";
    }

    async writeContract() {
      return "0xtx";
    }

    async waitForTransactionReceipt() {
      return { transactionHash: "0xtx" };
    }
  }
  return { ViemSigner: MockViemSigner };
});

vi.mock("viem", async () => {
  const actual = await vi.importActual<typeof import("viem")>("viem");

  return {
    ...actual,
    createPublicClient: createPublicClientMock,
    http: httpMock,
  };
});

describe("resolveWallet", () => {
  beforeEach(() => {
    wagmiSignerCtor.mockReset();
    viemSignerCtor.mockReset();
    createPublicClientMock.mockReset();
    httpMock.mockReset();

    createPublicClientMock.mockReturnValue("public-client");
    httpMock.mockImplementation((url: unknown) => ({ type: "http", url }));
  });

  it("returns GenericSigner directly when provided", () => {
    const genericSigner = {
      getChainId: vi.fn(async () => 11155111),
      getAddress: vi.fn(),
      signTypedData: vi.fn(),
      writeContract: vi.fn(),
      readContract: vi.fn(),
      waitForTransactionReceipt: vi.fn(),
    } as unknown as GenericSigner;

    const resolved = resolveWallet(
      createFhevmConfig({ chains: [fhevmSepolia], wallet: genericSigner }),
      null,
    );

    expect(resolved).toBe(genericSigner);
    expect(wagmiSignerCtor).not.toHaveBeenCalled();
    expect(viemSignerCtor).not.toHaveBeenCalled();
  });

  it("constructs WagmiSigner for a wagmi adapter when wagmi config is provided", () => {
    const wagmiConfig = { chains: [] };

    resolveWallet(
      createFhevmConfig({ chains: [fhevmSepolia], wallet: wagmiAdapter() }),
      wagmiConfig as never,
    );

    expect(wagmiSignerCtor).toHaveBeenCalledTimes(1);
    expect(wagmiSignerCtor).toHaveBeenCalledWith({ config: wagmiConfig });
    expect(viemSignerCtor).not.toHaveBeenCalled();
  });

  it("throws a provider-specific error when wagmi adapter is used without wagmi config", () => {
    expect(() =>
      resolveWallet(createFhevmConfig({ chains: [fhevmSepolia], wallet: wagmiAdapter() }), null),
    ).toThrow(WAGMI_PROVIDER_REQUIRED_ERROR);
  });

  it("constructs a read-only ViemSigner when wallet is omitted", () => {
    resolveWallet(createFhevmConfig({ chains: [fhevmSepolia] }), null);

    expect(httpMock).toHaveBeenCalledWith(SepoliaConfig.network);
    expect(createPublicClientMock).toHaveBeenCalledWith({
      transport: { type: "http", url: SepoliaConfig.network },
    });
    expect(viemSignerCtor).toHaveBeenCalledWith({
      publicClient: "public-client",
    });
    expect(wagmiSignerCtor).not.toHaveBeenCalled();
  });

  it("does not pass walletClient to read-only ViemSigner", () => {
    resolveWallet(createFhevmConfig({ chains: [fhevmSepolia] }), null);

    const args = viemSignerCtor.mock.calls[0]?.[0] as Record<string, unknown>;

    expect(args).toBeDefined();
    expect(Object.hasOwn(args, "walletClient")).toBe(false);
  });

  it("read-only signer write methods throw a consistent no-wallet error", async () => {
    const signer = resolveWallet(createFhevmConfig({ chains: [fhevmSepolia] }), null);

    await expect(signer.getAddress()).rejects.toThrow("No wallet connected");
    await expect(signer.signTypedData({} as never)).rejects.toThrow("No wallet connected");
    await expect(signer.writeContract({} as never)).rejects.toThrow("No wallet connected");
    await expect(signer.waitForTransactionReceipt("0xtx" as never)).rejects.toThrow(
      "No wallet connected",
    );
  });

  it("throws a clear error when chains is empty", () => {
    expect(() => resolveWallet({ chains: [], storage: () => null } as never, null)).toThrow(
      EMPTY_CHAINS_ERROR,
    );
  });
});
