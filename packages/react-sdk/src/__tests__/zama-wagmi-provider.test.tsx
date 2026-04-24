import { render } from "@testing-library/react";
import type { Address } from "@zama-fhe/sdk";
import type { Config } from "wagmi";
import { vi } from "vitest";
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

describe("ZamaWagmiProvider", () => {
  it("passes a signer while wagmi reconnects with persisted identity", ({ relayer, storage }) => {
    const wagmiConfig = {} as Config;
    mockUseConfig.mockReturnValue(wagmiConfig);
    mockUseConnection.mockReturnValue({
      status: "reconnecting",
      address: ADDRESS,
      chainId: 31337,
    });

    render(
      <ZamaWagmiProvider relayer={relayer} storage={storage}>
        child
      </ZamaWagmiProvider>,
    );

    const props = capturedProviderProps.at(-1) as ZamaProviderProps;
    expect(props.signer).toBeInstanceOf(WagmiSigner);
  });

  it("omits signer when wagmi is disconnected", ({ relayer, storage }) => {
    const wagmiConfig = {} as Config;
    mockUseConfig.mockReturnValue(wagmiConfig);
    mockUseConnection.mockReturnValue({ status: "disconnected" });

    render(
      <ZamaWagmiProvider relayer={relayer} storage={storage}>
        child
      </ZamaWagmiProvider>,
    );

    const props = capturedProviderProps.at(-1) as ZamaProviderProps;
    expect(props.signer).toBeUndefined();
  });

  it("omits signer until wagmi exposes both address and chain id", ({ relayer, storage }) => {
    const wagmiConfig = {} as Config;
    mockUseConfig.mockReturnValue(wagmiConfig);
    mockUseConnection.mockReturnValue({
      status: "reconnecting",
      address: ADDRESS,
    });

    render(
      <ZamaWagmiProvider relayer={relayer} storage={storage}>
        child
      </ZamaWagmiProvider>,
    );

    const props = capturedProviderProps.at(-1) as ZamaProviderProps;
    expect(props.signer).toBeUndefined();
  });
});
