import { describe, expect, it } from "vitest";
import { buildNetworkConfig, parseNetworkProfile } from "../../config/network.js";

describe("config.network.parseNetworkProfile", () => {
  it("defaults to sepolia", () => {
    expect(parseNetworkProfile(undefined)).toBe("sepolia");
    expect(parseNetworkProfile("")).toBe("sepolia");
  });

  it("accepts known profiles", () => {
    expect(parseNetworkProfile("sepolia")).toBe("sepolia");
    expect(parseNetworkProfile("mainnet")).toBe("mainnet");
  });

  it("rejects unsupported profiles", () => {
    expect(() => parseNetworkProfile("hoodi")).toThrow(
      'Invalid NETWORK_PROFILE="hoodi". Expected one of: sepolia, mainnet.',
    );
  });
});

describe("config.network.buildNetworkConfig", () => {
  it("builds sepolia defaults", () => {
    const config = buildNetworkConfig({});
    expect(config.profile).toBe("sepolia");
    expect(config.chainId).toBe(11155111);
    expect(config.relayerUrl).toBe("https://relayer.testnet.zama.org/v2");
    expect(config.zamaSupport).toBe("SUPPORTED");
  });

  it("requires relayer URL on mainnet profile", () => {
    expect(() => buildNetworkConfig({ NETWORK_PROFILE: "mainnet" })).toThrow(
      "RELAYER_URL is required for NETWORK_PROFILE=mainnet. Provide your relayer endpoint in .env.",
    );
  });

  it("builds mainnet profile when explicit relayer is provided", () => {
    const config = buildNetworkConfig({
      NETWORK_PROFILE: "mainnet",
      RELAYER_URL: "https://example-relayer.mainnet/v2",
    });
    expect(config.profile).toBe("mainnet");
    expect(config.chainId).toBe(1);
    expect(config.relayerUrl).toBe("https://example-relayer.mainnet/v2");
    expect(config.zamaSupport).toBe("EXPERIMENTAL");
  });
});
