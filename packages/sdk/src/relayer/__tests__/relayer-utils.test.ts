import { describe, it, expect } from "vitest";
import {
  convertToBigIntRecord,
  MainnetConfig,
  SepoliaConfig,
  HardhatConfig,
  DefaultConfigs,
  mergeFhevmConfig,
} from "../relayer-utils";

describe("convertToBigIntRecord", () => {
  it("passes through bigint values unchanged", () => {
    const result = convertToBigIntRecord({ a: 42n, b: 0n });
    expect(result).toEqual({ a: 42n, b: 0n });
  });

  it("converts boolean true to 1n and false to 0n", () => {
    const result = convertToBigIntRecord({ t: true, f: false });
    expect(result).toEqual({ t: 1n, f: 0n });
  });

  it("converts string numbers to bigint", () => {
    const result = convertToBigIntRecord({ a: "123", b: "0" });
    expect(result).toEqual({ a: 123n, b: 0n });
  });

  it("converts number values to bigint", () => {
    const result = convertToBigIntRecord({ a: 99, b: 0 });
    expect(result).toEqual({ a: 99n, b: 0n });
  });

  it("handles mixed types in the same record", () => {
    const result = convertToBigIntRecord({
      big: 10n,
      bool: true,
      str: "42",
      num: 7,
    });
    expect(result).toEqual({ big: 10n, bool: 1n, str: 42n, num: 7n });
  });

  it("handles empty record", () => {
    const result = convertToBigIntRecord({});
    expect(result).toEqual({});
  });
});

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
