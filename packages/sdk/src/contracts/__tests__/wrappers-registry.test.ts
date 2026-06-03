import { describe, test, expect } from "../../test-fixtures";
import type { Address } from "viem";

import {
  wrappersRegistryAbi,
  getTokenPairsContract,
  getTokenPairsLengthContract,
  getTokenPairsSliceContract,
  getTokenPairContract,
  getConfidentialTokenAddressContract,
  getTokenAddressContract,
  isConfidentialTokenValidContract,
} from "../wrappers-registry";

const REGISTRY = "0x5e5E5e5e5E5e5E5E5e5E5E5e5e5E5E5E5e5E5E5e" as Address;
const TOKEN = "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a" as Address;
const C_TOKEN = "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B" as Address;

describe("Registry contract builders", () => {
  test("exports wrappersRegistryAbi", () => {
    expect(wrappersRegistryAbi).toBeDefined();
    expect(wrappersRegistryAbi.length).toBeGreaterThan(0);
  });

  test("getTokenPairsContract", () => {
    const config = getTokenPairsContract(REGISTRY);
    expect(config.address).toBe(REGISTRY);
    expect(config.functionName).toBe("getTokenConfidentialTokenPairs");
    expect(config.args).toEqual([]);
  });

  test("getTokenPairsLengthContract", () => {
    const config = getTokenPairsLengthContract(REGISTRY);
    expect(config.address).toBe(REGISTRY);
    expect(config.functionName).toBe("getTokenConfidentialTokenPairsLength");
    expect(config.args).toEqual([]);
  });

  test("getTokenPairsSliceContract", () => {
    const config = getTokenPairsSliceContract(REGISTRY, 0n, 10n);
    expect(config.address).toBe(REGISTRY);
    expect(config.functionName).toBe("getTokenConfidentialTokenPairsSlice");
    expect(config.args).toEqual([0n, 10n]);
  });

  test("getTokenPairContract", () => {
    const config = getTokenPairContract(REGISTRY, 5n);
    expect(config.address).toBe(REGISTRY);
    expect(config.functionName).toBe("getTokenConfidentialTokenPair");
    expect(config.args).toEqual([5n]);
  });

  test("getConfidentialTokenAddressContract", () => {
    const config = getConfidentialTokenAddressContract(REGISTRY, TOKEN);
    expect(config.address).toBe(REGISTRY);
    expect(config.functionName).toBe("getConfidentialTokenAddress");
    expect(config.args).toEqual([TOKEN]);
  });

  test("getTokenAddressContract", () => {
    const config = getTokenAddressContract(REGISTRY, C_TOKEN);
    expect(config.address).toBe(REGISTRY);
    expect(config.functionName).toBe("getTokenAddress");
    expect(config.args).toEqual([C_TOKEN]);
  });

  test("isConfidentialTokenValidContract", () => {
    const config = isConfidentialTokenValidContract(REGISTRY, C_TOKEN);
    expect(config.address).toBe(REGISTRY);
    expect(config.functionName).toBe("isConfidentialTokenValid");
    expect(config.args).toEqual([C_TOKEN]);
  });
});
