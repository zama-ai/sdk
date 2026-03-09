import { describe, expect, it } from "../test-fixtures";
import { createFhevmConfig } from "../config";
import { fhevmHardhat, fhevmHoodi, fhevmMainnet, fhevmSepolia } from "@zama-fhe/sdk/chains";
import { resolveRelayer } from "../resolve-relayer";
import type { FhevmInstanceConfig } from "@zama-fhe/sdk";
import { HardhatCleartextConfig, hoodiCleartextConfig } from "@zama-fhe/sdk/cleartext";
import { beforeEach, vi } from "vitest";
import { CHAIN_REQUIRED_ERROR } from "../config";

const relayerWebCtor = vi.fn();
const cleartextCtor = vi.fn();
vi.mock("@zama-fhe/sdk", async () => {
  const actual = await vi.importActual<typeof import("@zama-fhe/sdk")>("@zama-fhe/sdk");

  class MockRelayerWeb {
    constructor(config: unknown) {
      relayerWebCtor(config);
    }
  }

  return {
    ...actual,
    RelayerWeb: MockRelayerWeb,
  };
});

vi.mock("@zama-fhe/sdk/cleartext", async () => {
  const actual =
    await vi.importActual<typeof import("@zama-fhe/sdk/cleartext")>("@zama-fhe/sdk/cleartext");

  class MockCleartextFhevmInstance {
    constructor(config: unknown) {
      cleartextCtor(config);
    }
  }

  return {
    ...actual,
    CleartextFhevmInstance: MockCleartextFhevmInstance,
  };
});

describe("resolveRelayer", () => {
  beforeEach(() => {
    relayerWebCtor.mockReset();
    cleartextCtor.mockReset();
  });

  it("uses RelayerWeb + MainnetConfig for chain 1", () => {
    resolveRelayer(createFhevmConfig({ chain: fhevmMainnet }));

    expect(relayerWebCtor).toHaveBeenCalledTimes(1);
    const args = relayerWebCtor.mock.calls[0]?.[0] as {
      transports: Record<number, FhevmInstanceConfig>;
      getChainId: () => Promise<number>;
    };

    expect(Object.keys(args.transports)).toEqual(["1"]);
    expect(args.transports[1]?.chainId).toBe(1);
    expect(args.transports[1]?.relayerUrl).toContain("mainnet");
    expect(cleartextCtor).not.toHaveBeenCalled();
  });

  it("uses RelayerWeb + SepoliaConfig for chain 11155111", () => {
    resolveRelayer(createFhevmConfig({ chain: fhevmSepolia }));

    expect(relayerWebCtor).toHaveBeenCalledTimes(1);
    const args = relayerWebCtor.mock.calls[0]?.[0] as {
      transports: Record<number, FhevmInstanceConfig>;
      getChainId: () => Promise<number>;
    };

    expect(Object.keys(args.transports)).toEqual(["11155111"]);
    expect(args.transports[11155111]?.chainId).toBe(11155111);
    expect(args.transports[11155111]?.relayerUrl).toContain("testnet");
    expect(cleartextCtor).not.toHaveBeenCalled();
  });

  it("uses cleartext hardhat preset for chain 31337", () => {
    resolveRelayer(createFhevmConfig({ chain: fhevmHardhat }));

    expect(cleartextCtor).toHaveBeenCalledWith(HardhatCleartextConfig);
    expect(relayerWebCtor).not.toHaveBeenCalled();
  });

  it("uses cleartext hoodi preset for chain 560048", () => {
    resolveRelayer(createFhevmConfig({ chain: fhevmHoodi }));

    expect(cleartextCtor).toHaveBeenCalledWith(hoodiCleartextConfig);
    expect(relayerWebCtor).not.toHaveBeenCalled();
  });

  it("throws a clear error when the chain is missing", () => {
    expect(() => resolveRelayer({ storage: () => null } as never)).toThrow(CHAIN_REQUIRED_ERROR);
  });

  it("merges relayer overrides for the resolved chain", () => {
    resolveRelayer(
      createFhevmConfig({
        chain: fhevmSepolia,
        relayer: {
          relayerUrl: "https://example.test/relayer",
        },
      }),
    );

    const args = relayerWebCtor.mock.calls[0]?.[0] as {
      transports: Record<number, FhevmInstanceConfig>;
    };

    expect(args.transports[11155111]?.relayerUrl).toBe("https://example.test/relayer");
    expect(args.transports[11155111]?.chainId).toBe(11155111);
  });

  it("forwards advanced threads to RelayerWeb", () => {
    resolveRelayer(
      createFhevmConfig({
        chain: fhevmSepolia,
        advanced: { threads: 8 },
      }),
    );

    const args = relayerWebCtor.mock.calls[0]?.[0] as { threads?: number };
    expect(args.threads).toBe(8);
  });

  it("forwards advanced integrityCheck to RelayerWeb security", () => {
    resolveRelayer(
      createFhevmConfig({
        chain: fhevmSepolia,
        advanced: { integrityCheck: false },
      }),
    );

    const args = relayerWebCtor.mock.calls[0]?.[0] as {
      security?: { integrityCheck?: boolean };
    };
    expect(args.security).toEqual({ integrityCheck: false });
  });
});
