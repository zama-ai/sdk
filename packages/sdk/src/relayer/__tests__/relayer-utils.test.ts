import { describe, expect, it } from "../../test-fixtures";
import { mainnet, sepolia, hardhat, hoodi, chains } from "../../chains";

describe("Chain presets", () => {
  it("mainnet has id 1", () => {
    expect(mainnet.id).toBe(1);
  });

  it("sepolia has id 11155111", () => {
    expect(sepolia.id).toBe(11155111);
  });

  it("hardhat has id 31337", () => {
    expect(hardhat.id).toBe(31337);
  });

  it("hoodi has id 560048", () => {
    expect(hoodi.id).toBe(560048);
  });

  it("hardhat and hoodi have executorAddress", () => {
    expect(hardhat.executorAddress).toBe("0xe3a9105a3a932253A70F126eb1E3b589C643dD24");
    expect(hoodi.executorAddress).toBe("0xC316692627de536368d82e9121F1D44a550894E6");
  });

  it("mainnet and sepolia have no executorAddress", () => {
    expect(mainnet.executorAddress).toBeUndefined();
    expect(sepolia.executorAddress).toBeUndefined();
  });

  it("chains maps all chain ids", () => {
    expect(chains[1]).toBe(mainnet);
    expect(chains[11155111]).toBe(sepolia);
    expect(chains[31337]).toBe(hardhat);
    expect(chains[560048]).toBe(hoodi);
  });
});
