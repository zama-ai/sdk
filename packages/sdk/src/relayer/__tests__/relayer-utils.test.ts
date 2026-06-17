import { describe, expect, test } from "../../test-fixtures";
import { mainnet, sepolia, hardhat, hoodi, ingenTestnet, bscTestnet, chains } from "../../chains";

describe("Chain presets", () => {
  test("mainnet has id 1", () => {
    expect(mainnet.id).toBe(1);
  });

  test("sepolia has id 11155111", () => {
    expect(sepolia.id).toBe(11155111);
  });

  test("hardhat has id 31337", () => {
    expect(hardhat.id).toBe(31337);
  });

  test("hoodi has id 560048", () => {
    expect(hoodi.id).toBe(560048);
  });

  test("ingenTestnet has id 364301", () => {
    expect(ingenTestnet.id).toBe(364301);
  });

  test("bscTestnet has id 97", () => {
    expect(bscTestnet.id).toBe(97);
  });

  test("cleartext testnets have executorAddress", () => {
    expect(hardhat.executorAddress).toBe("0xe3a9105a3a932253A70F126eb1E3b589C643dD24");
    expect(hoodi.executorAddress).toBe("0xC316692627de536368d82e9121F1D44a550894E6");
    expect(ingenTestnet.executorAddress).toBe("0x1B05DE5b67b8f8363DC04E3a5996a616f11f8C7B");
    expect(bscTestnet.executorAddress).toBe("0x5985e48689550c1b2893ABfBbe4cc0eE3A22cc54");
  });

  test("mainnet and sepolia have no executorAddress", () => {
    expect(mainnet.executorAddress).toBeUndefined();
    expect(sepolia.executorAddress).toBeUndefined();
  });

  test("chains maps all chain ids", () => {
    expect(chains[1]).toBe(mainnet);
    expect(chains[11155111]).toBe(sepolia);
    expect(chains[31337]).toBe(hardhat);
    expect(chains[560048]).toBe(hoodi);
    expect(chains[364301]).toBe(ingenTestnet);
    expect(chains[97]).toBe(bscTestnet);
  });
});
