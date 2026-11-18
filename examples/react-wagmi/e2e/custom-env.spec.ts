import { test, expect } from "@playwright/test";

// The custom environment is read once, when its module loads, and the server under
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
  NEXT_PUBLIC_REGISTRY_ADDRESS: "0x7777777777777777777777777777777777777777",
};

function loadEnvironment(overrides: Record<string, string> = {}) {
  const env = { ...validEnv, ...overrides };
  for (const key of Object.keys(env)) {
    // `in`, not `??=`: an originally unset variable must stay saved as undefined.
    if (!(key in saved)) saved[key] = process.env[key];
  }
  Object.assign(process.env, env);
  const modulePath = require.resolve("../src/lib/environment");
  delete require.cache[modulePath];
  return require(modulePath) as typeof import("../src/lib/environment");
}

function loadRelayers(overrides: Record<string, string> = {}) {
  loadEnvironment(overrides);
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
  // Other specs load these modules too; don't leave the custom environment cached.
  delete require.cache[require.resolve("../src/lib/environment")];
  delete require.cache[require.resolve("../src/lib/relayers")];
});

test.describe("NEXT_PUBLIC_ZAMA_ENV=custom", () => {
  test("swaps Sepolia's contracts and gateway in the custom environment only", () => {
    const { fheFor, labelFor, networkId } = loadEnvironment();
    const custom = fheFor("sepolia", "custom");
    expect(custom.gatewayChainId).toBe(10901);
    expect(custom.aclContractAddress).toBe(validEnv.NEXT_PUBLIC_ZAMA_ACL_ADDRESS);
    expect(custom.registryAddress).toBe(validEnv.NEXT_PUBLIC_REGISTRY_ADDRESS);
    // Every preset field is either set here or deliberately dropped: a field added to the
    // preset fails this until it is one or the other.
    const dropped = ["vaultRouterAddress"];
    expect(Object.keys(custom).sort()).toEqual(
      Object.keys(fheFor("sepolia", "default"))
        .filter((key) => !dropped.includes(key))
        .sort(),
    );
    for (const key of dropped) expect(custom).not.toHaveProperty(key);
    expect(fheFor("sepolia", "default").aclContractAddress).not.toBe(
      validEnv.NEXT_PUBLIC_ZAMA_ACL_ADDRESS,
    );
    expect(labelFor("sepolia", "custom")).toBe("Sepolia · Custom environment");
    expect(labelFor("sepolia", "default")).toBe("Sepolia");
    expect(networkId("sepolia", "custom")).toBe("sepolia-custom");
    // Networks the environment does not change are the same in both.
    expect(fheFor("hoodi", "custom")).toBe(fheFor("hoodi", "default"));
    expect(networkId("hoodi", "custom")).toBe("hoodi");
  });

  test("proxies custom Sepolia to its own relayer and Sepolia to the testnet relayer", () => {
    const { customEnvironmentNetworks, upstreamFor } = loadRelayers({
      SEPOLIA_RELAYER_URL: "",
      SEPOLIA_CUSTOM_RELAYER_URL: "http://127.0.0.1:9",
    });
    expect(upstreamFor("sepolia-custom")?.url).toBe("http://127.0.0.1:9");
    expect(upstreamFor("sepolia")?.url).toBe("https://relayer.testnet.zama.org");
    expect(customEnvironmentNetworks()).toEqual(["sepolia"]);
  });

  test("changes nothing, and proxies nothing extra, while the environment is not custom", () => {
    const { customNetworks, fheFor, networkId } = loadEnvironment({ NEXT_PUBLIC_ZAMA_ENV: "" });
    expect(customNetworks).toEqual({});
    expect(fheFor("sepolia", "custom")).toBe(fheFor("sepolia", "default"));
    expect(networkId("sepolia", "custom")).toBe("sepolia");
    const { customEnvironmentNetworks, upstreamFor } = loadRelayers({
      NEXT_PUBLIC_ZAMA_ENV: "",
      SEPOLIA_CUSTOM_RELAYER_URL: "http://127.0.0.1:9",
    });
    expect(upstreamFor("sepolia-custom")).toBeUndefined();
    expect(customEnvironmentNetworks()).toEqual([]);
  });

  test("hides custom Sepolia without its relayer", () => {
    const { customEnvironmentNetworks, enabledNetworks } = loadRelayers({
      SEPOLIA_CUSTOM_RELAYER_URL: "",
    });
    expect(customEnvironmentNetworks()).toEqual([]);
    expect(enabledNetworks()).toContain("sepolia");
  });

  test("hides custom Sepolia when Sepolia is not allowlisted", () => {
    const { customEnvironmentNetworks } = loadRelayers({
      SEPOLIA_CUSTOM_RELAYER_URL: "http://127.0.0.1:9",
      ENABLED_NETWORKS: "hoodi",
    });
    expect(customEnvironmentNetworks()).toEqual([]);
  });

  test("requires every protocol address", () => {
    expect(() => loadEnvironment({ NEXT_PUBLIC_ZAMA_ACL_ADDRESS: "" })).toThrow(
      /requires NEXT_PUBLIC_ZAMA_ACL_ADDRESS to be set/,
    );
  });

  test("requires the registry address", () => {
    expect(() => loadEnvironment({ NEXT_PUBLIC_REGISTRY_ADDRESS: "" })).toThrow(
      /requires NEXT_PUBLIC_REGISTRY_ADDRESS to be set/,
    );
  });

  test("rejects a value that is not an address", () => {
    expect(() => loadEnvironment({ NEXT_PUBLIC_ZAMA_KMS_VERIFIER_ADDRESS: "0x1234" })).toThrow(
      /NEXT_PUBLIC_ZAMA_KMS_VERIFIER_ADDRESS is not a valid address: 0x1234/,
    );
  });

  test("rejects a mixed-case address with a wrong checksum", () => {
    // The valid checksum is 0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed; one letter's case is flipped.
    expect(() =>
      loadEnvironment({
        NEXT_PUBLIC_ZAMA_DECRYPTION_ADDRESS: "0x5aaeb6053F3E94C9b9A09f33669435E7Ef1BeAed",
      }),
    ).toThrow(/NEXT_PUBLIC_ZAMA_DECRYPTION_ADDRESS is not a valid address/);
  });

  test("rejects a registry value that is not an address", () => {
    expect(() => loadEnvironment({ NEXT_PUBLIC_REGISTRY_ADDRESS: "not-an-address" })).toThrow(
      /NEXT_PUBLIC_REGISTRY_ADDRESS is not a valid address/,
    );
  });

  for (const chainId of ["abc", "0", "-1", "1.5", "1e3x"]) {
    test(`rejects ${chainId} as the gateway chain ID`, () => {
      expect(() => loadEnvironment({ NEXT_PUBLIC_ZAMA_GATEWAY_CHAIN_ID: chainId })).toThrow(
        /NEXT_PUBLIC_ZAMA_GATEWAY_CHAIN_ID must be a positive integer/,
      );
    });
  }
});
