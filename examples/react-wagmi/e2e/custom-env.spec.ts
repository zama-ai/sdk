import { test, expect } from "@playwright/test";

// The custom environment is read once, when the network table loads, and the server under
// test runs with the stock preset, so these tests load the module in this process instead.
const saved: Record<string, string | undefined> = {};

const validEnv = {
  NEXT_PUBLIC_ZAMA_ENV: "custom",
  NEXT_PUBLIC_ZAMA_GATEWAY_CHAIN_ID: "10901",
  NEXT_PUBLIC_ZAMA_ACL_ADDRESS: "0x1111111111111111111111111111111111111111",
  NEXT_PUBLIC_ZAMA_KMS_VERIFIER_ADDRESS: "0x2222222222222222222222222222222222222222",
  NEXT_PUBLIC_ZAMA_INPUT_VERIFIER_ADDRESS: "0x3333333333333333333333333333333333333333",
  NEXT_PUBLIC_ZAMA_DECRYPTION_ADDRESS: "0x4444444444444444444444444444444444444444",
  NEXT_PUBLIC_ZAMA_INPUT_VERIFICATION_ADDRESS: "0x5555555555555555555555555555555555555555",
  NEXT_PUBLIC_REGISTRY_ADDRESS: "",
};

function loadNetworks(overrides: Record<string, string> = {}) {
  const env = { ...validEnv, ...overrides };
  for (const key of Object.keys(env)) {
    if (!(key in saved)) saved[key] = process.env[key];
  }
  Object.assign(process.env, env);
  const modulePath = require.resolve("../src/lib/networks");
  delete require.cache[modulePath];
  return require(modulePath) as typeof import("../src/lib/networks");
}

function loadRelayers(overrides: Record<string, string> = {}) {
  loadNetworks(overrides);
  const modulePath = require.resolve("../src/lib/relayers");
  delete require.cache[modulePath];
  return require(modulePath) as typeof import("../src/lib/relayers");
}

test.afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
    delete saved[key];
  }
  // Other specs load these modules too; don't leave the custom table cached.
  delete require.cache[require.resolve("../src/lib/networks")];
  delete require.cache[require.resolve("../src/lib/relayers")];
});

test.describe("NEXT_PUBLIC_ZAMA_ENV=custom", () => {
  test("adds a row with the configured contracts and gateway, and keeps Sepolia", () => {
    const { networks } = loadNetworks();
    const custom = networks["sepolia-custom"];
    expect(custom.label).toBe("Sepolia · Custom environment");
    expect(custom.chain.id).toBe(networks.sepolia.chain.id);
    expect(custom.fhe.gatewayChainId).toBe(10901);
    expect(custom.fhe.aclContractAddress).toBe(validEnv.NEXT_PUBLIC_ZAMA_ACL_ADDRESS);
    expect(custom.fhe.registryAddress).toBeUndefined();
    expect(networks.sepolia.label).toBe("Sepolia");
    expect(networks.sepolia.fhe.aclContractAddress).not.toBe(validEnv.NEXT_PUBLIC_ZAMA_ACL_ADDRESS);
  });

  test("resolves the Sepolia chain to the custom row unless Sepolia is chosen", () => {
    const { networkForChain, networks, CHAINS } = loadNetworks();
    const sepoliaId = networks.sepolia.chain.id;
    expect(networkForChain(sepoliaId)).toBe("sepolia-custom");
    expect(networkForChain(sepoliaId, "sepolia")).toBe("sepolia");
    expect(networkForChain(sepoliaId, "hoodi")).toBe("sepolia-custom");
    expect(networkForChain(sepoliaId, undefined, ["sepolia", "hoodi"])).toBe("sepolia");
    expect(networkForChain(sepoliaId, "sepolia-custom", ["sepolia"])).toBe("sepolia-custom");
    expect(CHAINS.filter((chain) => chain.id === sepoliaId)).toHaveLength(1);
  });

  test("proxies the custom row to its own relayer and Sepolia to the testnet relayer", () => {
    const { enabledNetworks, upstreamFor } = loadRelayers({
      SEPOLIA_RELAYER_URL: "",
      SEPOLIA_CUSTOM_RELAYER_URL: "http://127.0.0.1:9",
    });
    expect(upstreamFor("sepolia-custom")?.url).toBe("http://127.0.0.1:9");
    expect(upstreamFor("sepolia")?.url).toBe("https://relayer.testnet.zama.org");
    expect(enabledNetworks()).toEqual(expect.arrayContaining(["sepolia-custom", "sepolia"]));
  });

  test("has no custom row, and proxies none, while the environment is not custom", () => {
    const { NETWORK_KEYS, networkForChain, networks } = loadNetworks({ NEXT_PUBLIC_ZAMA_ENV: "" });
    expect(NETWORK_KEYS).not.toContain("sepolia-custom");
    expect(networkForChain(networks.sepolia.chain.id, "sepolia-custom")).toBe("sepolia");
    const { upstreamFor } = loadRelayers({
      NEXT_PUBLIC_ZAMA_ENV: "",
      SEPOLIA_CUSTOM_RELAYER_URL: "http://127.0.0.1:9",
    });
    expect(upstreamFor("sepolia-custom")).toBeUndefined();
  });

  test("hides the custom row without its relayer", () => {
    const { enabledNetworks } = loadRelayers({ SEPOLIA_CUSTOM_RELAYER_URL: "" });
    expect(enabledNetworks()).not.toContain("sepolia-custom");
    expect(enabledNetworks()).toContain("sepolia");
  });

  test("accepts the optional registry address", () => {
    const { networks } = loadNetworks({
      NEXT_PUBLIC_REGISTRY_ADDRESS: "0x7777777777777777777777777777777777777777",
    });
    expect(networks["sepolia-custom"].fhe.registryAddress).toBe(
      "0x7777777777777777777777777777777777777777",
    );
  });

  test("requires every protocol address", () => {
    expect(() => loadNetworks({ NEXT_PUBLIC_ZAMA_ACL_ADDRESS: "" })).toThrow(
      /requires NEXT_PUBLIC_ZAMA_ACL_ADDRESS to be set/,
    );
  });

  test("rejects a value that is not an address", () => {
    expect(() => loadNetworks({ NEXT_PUBLIC_ZAMA_KMS_VERIFIER_ADDRESS: "0x1234" })).toThrow(
      /NEXT_PUBLIC_ZAMA_KMS_VERIFIER_ADDRESS is not a valid address: 0x1234/,
    );
  });

  test("rejects a mixed-case address with a wrong checksum", () => {
    // The valid checksum is 0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed; one letter's case is flipped.
    expect(() =>
      loadNetworks({
        NEXT_PUBLIC_ZAMA_DECRYPTION_ADDRESS: "0x5aaeb6053F3E94C9b9A09f33669435E7Ef1BeAed",
      }),
    ).toThrow(/NEXT_PUBLIC_ZAMA_DECRYPTION_ADDRESS is not a valid address/);
  });

  test("rejects an optional address that is set but invalid", () => {
    expect(() => loadNetworks({ NEXT_PUBLIC_REGISTRY_ADDRESS: "not-an-address" })).toThrow(
      /NEXT_PUBLIC_REGISTRY_ADDRESS is not a valid address/,
    );
  });

  for (const chainId of ["abc", "0", "-1", "1.5", "1e3x"]) {
    test(`rejects ${chainId} as the gateway chain ID`, () => {
      expect(() => loadNetworks({ NEXT_PUBLIC_ZAMA_GATEWAY_CHAIN_ID: chainId })).toThrow(
        /NEXT_PUBLIC_ZAMA_GATEWAY_CHAIN_ID must be a positive integer/,
      );
    });
  }
});
