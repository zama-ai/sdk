import { describe, expect, it } from "../../test-fixtures";
import { DefaultConfigs, HardhatConfig, MainnetConfig, SepoliaConfig } from "../relayer-utils";

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
