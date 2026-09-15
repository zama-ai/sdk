/// <reference lib="dom" />
import type * as Sdk from "@zama-fhe/sdk";
import { expect, test, vi } from "vitest";
import { anvil, createConfig } from "@zama-fhe/sdk";
import { node } from "@zama-fhe/sdk/node";
import { createMockRelayer } from "../../sdk/src/test-fixtures/relayer.js";
import { createMockProvider } from "../../sdk/src/test-fixtures/provider.js";
import { getAppliedWireRuntime } from "../../sdk/src/relayer/applied-runtime.js";
import { createContextFactory } from "../src/sdk.js";
import { StorageManager } from "../src/storage-manager.js";
import { RemoteStorage } from "../src/remote-storage.js";
import {
  ContextConfig,
  CreateContextRequest,
  ProcessRuntimeConfig,
} from "../src/generated/zama/sdk/v1alpha1/sidecar.js";

vi.mock("@zama-fhe/sdk/node", () => ({
  node: () => ({ type: "test", createRelayer: () => createMockRelayer() }),
}));

function wireConfig(options: Partial<ContextConfig> = {}): ContextConfig {
  return ContextConfig.fromPartial({
    chains: [{ id: BigInt(anvil.id), network: anvil.network }],
    chainId: BigInt(anvil.id),
    ...options,
  });
}

function result(error: unknown): unknown {
  return error instanceof Error
    ? { message: error.message, code: "code" in error ? error.code : undefined }
    : error;
}

async function compare(config: Partial<ContextConfig>, direct: () => unknown) {
  let expected: unknown;
  try {
    direct();
  } catch (error) {
    expected = result(error);
  }
  const manager = new StorageManager();
  let actual: unknown;
  try {
    const context = await createContextFactory(manager)(
      CreateContextRequest.fromPartial({ config: wireConfig(config) }),
      undefined,
      new RemoteStorage(),
    );
    context.sdk.dispose();
  } catch (error) {
    actual = result(error);
  } finally {
    await manager.close();
  }
  expect(actual).toEqual(expected);
}

const fullRuntime = ProcessRuntimeConfig.fromPartial({
  singleThread: false,
  numberOfThreads: 0,
  wasmAssetLoadMode: "auto",
  moduleVersions: {
    selection: { $case: "pinned", pinned: { kms: "0.13.0", checkCompatibility: "off" } },
  },
  auth: { credential: { $case: "bearerToken", bearerToken: "synthetic-token" } },
});

test("typed runtime reaches the canonical SDK lock and the first configuration wins", async () => {
  const manager = new StorageManager();
  try {
    const context = await createContextFactory(manager)(
      CreateContextRequest.fromPartial({ config: wireConfig({ processRuntime: fullRuntime }) }),
      undefined,
      new RemoteStorage(),
    );
    context.sdk.dispose();
    const applied = getAppliedWireRuntime();
    expect(applied).toEqual({
      singleThread: false,
      numberOfThreads: 0,
      wasmAssetLoadMode: "auto",
      moduleVersions: { kms: "0.13.0", checkCompatibility: "off" },
      auth: { type: "BearerToken", token: "synthetic-token" },
    });

    createConfig({
      chains: [anvil],
      provider: createMockProvider(),
      relayers: { [anvil.id]: node() },
      runtime: { singleThread: true },
    });
    expect(getAppliedWireRuntime()).toBe(applied);
  } finally {
    await manager.close();
  }
});

test.each([
  { name: "permit TTL", wire: { permitTtl: 0 }, direct: { permitTTL: 0 } },
  {
    name: "transport key TTL",
    wire: { transportKeyPairTtl: 0 },
    direct: { transportKeyPairTTL: 0 },
  },
  {
    name: "empty scope",
    wire: { transportKeyPairScope: "" },
    direct: { transportKeyPairScope: "" },
  },
])("invalid semantic $name preserves SDK validation", async ({ wire, direct }) => {
  expect.hasAssertions();
  await compare(wire, () =>
    createConfig({
      chains: [anvil],
      provider: createMockProvider(),
      relayers: { [anvil.id]: node() },
      ...direct,
    }),
  );
});

test.each([{ permitTtl: -1 }, { transportKeyPairTtl: -1 }, { registryTtl: -1 }])(
  "rejects malformed negative unsigned wire values: %j",
  async (wire) => {
    const manager = new StorageManager();
    try {
      await expect(
        createContextFactory(manager)(
          CreateContextRequest.fromPartial({ config: wireConfig(wire) }),
          undefined,
          new RemoteStorage(),
        ),
      ).rejects.toThrow("unsigned 32-bit integer");
    } finally {
      await manager.close();
    }
  },
);

test("explicit zero registry TTL reaches the SDK unchanged", async () => {
  expect.hasAssertions();
  await compare({ registryTtl: 0 }, () =>
    createConfig({
      chains: [anvil],
      provider: createMockProvider(),
      relayers: { [anvil.id]: node() },
      registryTTL: 0,
    }),
  );
});

test("explicit empty relayer map retains SDK missing-chain validation", async () => {
  expect.hasAssertions();
  await compare({ relayers: { entries: new Map() } }, () =>
    createConfig({
      chains: [anvil],
      provider: createMockProvider(),
      relayers: {} as { [anvil.id]: Sdk.RelayerConfig },
    }),
  );
});
