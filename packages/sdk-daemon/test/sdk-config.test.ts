import { expect, test } from "vitest";
import { chains } from "@zama-fhe/sdk";
import { parseContextConfig } from "../src/sdk-config.js";
import { ContextConfig, type ChainAuth } from "../src/generated/zama/sdk/v1beta1/daemon.js";

const preset = { id: 11155111n, network: "https://rpc.invalid" };
test("typed preset configuration retains SDK protocol fields and optional defaults", () => {
  const config = parseContextConfig(ContextConfig.fromPartial({ chains: [preset] }));
  expect(config.chains[0]).toMatchObject({ id: 11155111, network: preset.network });
  expect(config.chains[0].verifyingContractAddressDecryption).toMatch(/^0x[0-9a-fA-F]{40}$/);
  expect(config.chains[0]).not.toHaveProperty("auth");
  expect(config.chains[0].registryAddress).toBe(chains[11155111]?.registryAddress);
  expect(config).not.toHaveProperty("permitTTL");
  expect(config).not.toHaveProperty("transportKeyPairScope");
});
test("selected chain and explicit zero credential settings survive protobuf encoding", () => {
  const wire = ContextConfig.fromPartial({
    chains: [{ id: 31337n, network: "http://localhost:8545" }, preset],
    chainId: preset.id,
    permitTtl: 2,
    transportKeyPairTtl: 10,
    registryTtl: 0,
    transportKeyPairScope: "partner",
  });
  const config = parseContextConfig(ContextConfig.decode(ContextConfig.encode(wire).finish()));
  expect(config.chains.map((chain) => chain.id)).toEqual([11155111, 31337]);
  expect(config).toMatchObject({
    permitTTL: 2,
    transportKeyPairTTL: 10,
    registryTTL: 0,
    transportKeyPairScope: "partner",
  });
});
test.each<{ auth: ChainAuth; expected: object }>([
  {
    auth: { credential: { $case: "bearerToken", bearerToken: "token" } },
    expected: { __type: "BearerToken", token: "token" },
  },
  {
    auth: {
      credential: { $case: "apiKeyHeader", apiKeyHeader: { name: undefined, value: "key" } },
    },
    expected: { __type: "ApiKeyHeader", value: "key" },
  },
  {
    auth: {
      credential: { $case: "apiKeyCookie", apiKeyCookie: { name: "session", value: "cookie" } },
    },
    expected: { __type: "ApiKeyCookie", cookie: "session", value: "cookie" },
  },
])(
  "authentication preserves credential variant and omitted name: $expected.__type",
  ({ auth, expected }) => {
    const config = parseContextConfig(ContextConfig.fromPartial({ chains: [{ ...preset, auth }] }));
    expect(config.chains[0].auth).toEqual(expected);
  },
);
test("custom chain overrides preserve addresses and can clear optional preset addresses", () => {
  const config = parseContextConfig(
    ContextConfig.fromPartial({
      chains: [
        {
          ...preset,
          gatewayChainId: 5n,
          registryAddress: Buffer.alloc(0),
          executorAddress: Buffer.alloc(0),
          aclContractAddress: Buffer.alloc(20, 1),
        },
      ],
    }),
  );
  expect(config.chains[0]).toMatchObject({
    gatewayChainId: 5,
    registryAddress: undefined,
    executorAddress: undefined,
    aclContractAddress: `0x${"01".repeat(20)}`,
  });
});
test.each([
  ContextConfig.fromPartial({ chains: [preset], chainId: 31337n }),
  ContextConfig.fromPartial({ chains: [{ ...preset, id: 9007199254740992n }] }),
  ContextConfig.fromPartial({ chains: [{ ...preset, aclContractAddress: Buffer.alloc(19) }] }),
  ContextConfig.fromPartial({ chains: [{ ...preset, auth: {} }] }),
  ContextConfig.fromPartial({ chains: [preset], permitTtl: 0.5 }),
  ContextConfig.fromPartial({ chains: [preset], transportKeyPairTtl: -1 }),
  ContextConfig.fromPartial({ chains: [preset], registryTtl: 4294967296 }),
  ContextConfig.fromPartial({ chains: [{ id: 987654n, network: "https://rpc.invalid" }] }),
  undefined,
])("rejects malformed transport configuration %#", (config) => {
  expect(() => parseContextConfig(config)).toThrow(
    /configured|integer|20 bytes|credential|requires|required/,
  );
});
