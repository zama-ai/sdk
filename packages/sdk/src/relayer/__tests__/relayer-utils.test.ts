import { describe, it, expect } from "vitest";
import {
  MainnetConfig,
  SepoliaConfig,
  HardhatConfig,
  DefaultConfigs,
  mergeFhevmConfig,
} from "../relayer-utils";

describe("Config constants", () => {
  it("MainnetConfig has chainId 1", () => {
    expect(MainnetConfig.chainId).toBe(1);
  });

  it("SepoliaConfig has chainId 11155111", () => {
    expect(SepoliaConfig.chainId).toBe(11155111);
  });

  it("HardhatConfig has chainId 31337", () => {
    expect(HardhatConfig.chainId).toBe(31337);
  });

  it("DefaultConfigs maps all three chainIds", () => {
    expect(DefaultConfigs[1]).toBe(MainnetConfig);
    expect(DefaultConfigs[11155111]).toBe(SepoliaConfig);
    expect(DefaultConfigs[31337]).toBe(HardhatConfig);
  });
});

describe("mergeFhevmConfig", () => {
  it("returns base config when no overrides", () => {
    const config = mergeFhevmConfig(1);
    expect(config).toEqual(MainnetConfig);
  });

  it("merges overrides on top of base config", () => {
    const config = mergeFhevmConfig(1, {
      relayerUrl: "https://custom-relayer.example.com",
    });
    expect(config.chainId).toBe(1);
    expect(config.relayerUrl).toBe("https://custom-relayer.example.com");
    expect(config.aclContractAddress).toBe(MainnetConfig.aclContractAddress);
  });

  it("throws for unknown chainId with no overrides", () => {
    expect(() => mergeFhevmConfig(99999)).toThrow("No config for chainId: 99999");
  });

  it("returns overrides-only for unknown chainId when overrides provided", () => {
    const overrides = {
      chainId: 99999,
      relayerUrl: "https://custom.example.com",
    };
    const config = mergeFhevmConfig(99999, overrides);
    expect(config.chainId).toBe(99999);
    expect(config.relayerUrl).toBe("https://custom.example.com");
  });

  it("override takes precedence over base values", () => {
    const config = mergeFhevmConfig(11155111, { chainId: 42 });
    expect(config.chainId).toBe(42);
  });
});
