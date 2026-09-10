import { expect, test } from "vitest";
import { ConfigurationError } from "@zama-fhe/sdk";
import { parseContextConfig } from "../src/sdk-config.js";

test("preset shorthand retains SDK protocol configuration and optional credential defaults", () => {
  const config = parseContextConfig(
    JSON.stringify({ chainId: 11155111, rpcUrl: "https://rpc.invalid" }),
  );
  expect(config.chains[0]).toMatchObject({ id: 11155111, network: "https://rpc.invalid" });
  expect(config.chains[0].verifyingContractAddressDecryption).toMatch(/^0x[0-9a-fA-F]{40}$/);
  expect(config).not.toHaveProperty("permitTTL");
  expect(config).not.toHaveProperty("transportKeyPairScope");
});

test("the selected chain is the signerless default without dropping other chains", () => {
  const config = parseContextConfig(
    JSON.stringify({
      chainId: 11155111,
      chains: [
        { id: 31337, network: "http://localhost:8545" },
        { id: 11155111, network: "https://rpc.invalid" },
      ],
      permitTTL: 2,
      transportKeyPairTTL: 10,
      registryTTL: 0,
      transportKeyPairScope: "partner",
    }),
  );
  expect(config.chains.map((chain) => chain.id)).toEqual([11155111, 31337]);
  expect(config).toMatchObject({
    permitTTL: 2,
    transportKeyPairTTL: 10,
    registryTTL: 0,
    transportKeyPairScope: "partner",
  });
});

test.each([
  { __type: "BearerToken", token: "test-token" },
  { __type: "ApiKeyHeader", header: "x-api-key", value: "test-key" },
  { __type: "ApiKeyCookie", cookie: "session", value: "test-cookie" },
])("preserves SDK authentication configuration: $.__type", (auth) => {
  const config = parseContextConfig(
    JSON.stringify({ chainId: 11155111, rpcUrl: "https://rpc.invalid", auth }),
  );
  expect(config.chains[0].auth).toEqual(auth);
});

test.each([
  { chainId: 11155111, rpcUrl: "https://rpc.invalid", signer: {} },
  { chains: [{ id: 11155111, network: { request: "cannot cross JSON" } }] },
  { chains: [{ id: 11155111, network: "https://rpc.invalid" }], chainId: 31337 },
])("rejects configuration that cannot be represented by this transport: %j", (config) => {
  expect(() => parseContextConfig(JSON.stringify(config))).toThrow(ConfigurationError);
});

test("forwards credential options and chain fields without duplicating SDK validation", () => {
  const config = parseContextConfig(
    JSON.stringify({
      chains: [
        {
          id: 11155111,
          network: "https://rpc.invalid",
          registryAddress: "invalid",
          auth: { __type: "BearerToken", token: "test", extra: "future-field" },
        },
      ],
      permitTTL: -1,
      transportKeyPairScope: "",
    }),
  );
  expect(config.permitTTL).toBe(-1);
  expect(config.transportKeyPairScope).toBe("");
  expect(config.chains[0]).toMatchObject({
    registryAddress: "invalid",
    auth: { extra: "future-field" },
  });
});
