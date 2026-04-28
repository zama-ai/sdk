import { render } from "@testing-library/react";
import type { Address, ZamaConfig } from "@zama-fhe/sdk";
import { cleartext } from "@zama-fhe/sdk";
import { hardhat } from "@zama-fhe/sdk/chains";
import type { Config } from "wagmi";
import { describe, expect, it } from "../test-fixtures";
import type { ZamaProviderProps } from "../provider";
import { ZamaWagmiProvider } from "../wagmi/zama-wagmi-provider";
import { WagmiSigner } from "../wagmi/wagmi-signer";

const { mockUseConfig, mockUseConnection, capturedProviderProps } = vi.hoisted(() => ({
  mockUseConfig: vi.fn(),
  mockUseConnection: vi.fn(),
  capturedProviderProps: [] as unknown[],
}));

vi.mock("wagmi", () => ({
  useConfig: mockUseConfig,
}));

vi.mock("../wagmi/compat", () => ({
  useConnection: mockUseConnection,
}));

vi.mock("../provider", () => ({
  ZamaProvider: (props: ZamaProviderProps) => {
    capturedProviderProps.push(props);
    return <>{props.children}</>;
  },
}));

const ADDRESS = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as Address;

const baseProps = {
  chains: [hardhat] as const,
  relayers: { [hardhat.id]: cleartext() },
} as const;

function lastConfig(): ZamaConfig {
  const props = capturedProviderProps.at(-1) as ZamaProviderProps;
  return props.config;
}

describe("ZamaWagmiProvider", () => {
  it("keeps the SDK config stable across parent re-renders with stable props", () => {
    const wagmiConfig = {} as Config;
    mockUseConfig.mockReturnValue(wagmiConfig);
    mockUseConnection.mockReturnValue({
      status: "connected",
      address: ADDRESS,
      chainId: 31337,
    });

    const view = render(<ZamaWagmiProvider {...baseProps}>child</ZamaWagmiProvider>);
    const initialConfig = lastConfig();

    view.rerender(<ZamaWagmiProvider {...baseProps}>child</ZamaWagmiProvider>);

    expect(lastConfig()).toBe(initialConfig);
  });

  it("passes a signer while wagmi reconnects with persisted identity", () => {
    const wagmiConfig = {} as Config;
    mockUseConfig.mockReturnValue(wagmiConfig);
    mockUseConnection.mockReturnValue({
      status: "reconnecting",
      address: ADDRESS,
      chainId: 31337,
    });

    render(<ZamaWagmiProvider {...baseProps}>child</ZamaWagmiProvider>);

    expect(lastConfig().signer).toBeInstanceOf(WagmiSigner);
  });

  it("omits signer when wagmi is disconnected", () => {
    const wagmiConfig = {} as Config;
    mockUseConfig.mockReturnValue(wagmiConfig);
    mockUseConnection.mockReturnValue({ status: "disconnected" });

    render(<ZamaWagmiProvider {...baseProps}>child</ZamaWagmiProvider>);

    expect(lastConfig().signer).toBeUndefined();
  });

  it("omits signer until wagmi exposes both address and chain id", () => {
    const wagmiConfig = {} as Config;
    mockUseConfig.mockReturnValue(wagmiConfig);
    mockUseConnection.mockReturnValue({
      status: "reconnecting",
      address: ADDRESS,
    });

    render(<ZamaWagmiProvider {...baseProps}>child</ZamaWagmiProvider>);

    expect(lastConfig().signer).toBeUndefined();
  });
});
