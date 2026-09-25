import { RemoteEvents } from "../src/remote-events.js";
import type * as Sdk from "@zama-fhe/sdk";
import type * as NodeSdk from "@zama-fhe/sdk/node";
import type * as ViemSdk from "@zama-fhe/sdk/viem";
import type * as Viem from "viem";
import { beforeEach, expect, test, vi } from "vitest";
import { chains, ConfigurationError, cleartext } from "@zama-fhe/sdk";
import { node } from "@zama-fhe/sdk/node";
import {
  ContextConfig,
  ModuleVersions,
  ProviderBatch,
  RelayerConfig,
  RelayerTransport,
} from "../src/generated/zama/sdk/v1beta1/daemon.js";
import { processRuntimeConfig, relayerConfig } from "../src/config-options.js";
import { parseContextConfig } from "../src/sdk-config.js";

vi.mock("@zama-fhe/sdk/node", async (original) => {
  const actual = await original<typeof NodeSdk>();
  return { ...actual, node: vi.fn(actual.node) };
});
vi.mock("@zama-fhe/sdk", async (original) => {
  const actual = await original<typeof Sdk>();
  return { ...actual, cleartext: vi.fn(actual.cleartext) };
});

const viemCalls = vi.hoisted(() => ({ http: [] as unknown[][], clients: [] as unknown[] }));

vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof Viem>();
  return {
    ...actual,
    http: (...args: unknown[]) => {
      viemCalls.http.push(args);
      return { type: "test-http", args };
    },
    createPublicClient: (options: unknown) => {
      viemCalls.clients.push(options);
      return {};
    },
  };
});

vi.mock("@zama-fhe/sdk/viem", async (importOriginal) => {
  const actual = await importOriginal<typeof ViemSdk>();
  return {
    ...actual,
    ViemProvider: class {
      getChainId = vi.fn().mockResolvedValue(11155111);
      readContract = vi.fn();
      waitForTransactionReceipt = vi.fn();
      getBlockTimestamp = vi.fn();
      prepareTransaction = vi.fn();
      constructor(options: unknown) {
        viemCalls.clients.push(options);
      }
    },
  };
});

beforeEach(() => {
  viemCalls.http.length = 0;
  viemCalls.clients.length = 0;
  vi.mocked(node).mockClear();
  vi.mocked(cleartext).mockClear();
});

const chainId = 11155111n;
const preset = { id: chainId, network: "https://rpc.invalid" };

test("forwards every supported typed provider option to viem", async () => {
  const { createContextFactory } = await import("../src/sdk.js");
  const { StorageManager } = await import("../src/storage-manager.js");
  const { RemoteStorage } = await import("../src/remote-storage.js");
  const manager = new StorageManager();
  try {
    const context = await createContextFactory(manager)(
      {
        config: ContextConfig.fromPartial({
          chainId,
          chains: [
            {
              ...preset,
              provider: {
                timeout: 1234,
                retryCount: 2,
                retryDelay: 55,
                batch: ProviderBatch.fromPartial({
                  selection: { $case: "options", options: { batchSize: 9, wait: 10 } },
                }),
                headers: { entries: { "x-test": "yes" } },
                pollingInterval: 777,
              },
            },
          ],
        }),
        signerEnabled: false,
        account: undefined,
        storage: undefined,
        permitStorage: undefined,
        transportKeyPairDerivationSecret: undefined,
      },
      undefined,
      new RemoteStorage(),
      new RemoteEvents("fixture"),
    );
    context.sdk.dispose();
    expect(viemCalls.http).toContainEqual([
      preset.network,
      expect.objectContaining({
        timeout: 1234,
        retryCount: 2,
        retryDelay: 55,
        batch: { batchSize: 9, wait: 10 },
        fetchOptions: { headers: { "x-test": "yes" } },
      }),
    ]);
    expect(viemCalls.clients).toContainEqual(expect.objectContaining({ pollingInterval: 777 }));
  } finally {
    await manager.close();
  }
});

test("preserves runtime, relayer, empty maps, zeroes, and explicit false", () => {
  const config = parseContextConfig(
    ContextConfig.fromPartial({
      chainId,
      chains: [
        {
          ...preset,
          provider: {
            headers: { entries: {} },
            timeout: 0,
            retryCount: 0,
            batch: { selection: { $case: "enabled", enabled: false } },
          },
        },
      ],
      processRuntime: {
        singleThread: false,
        numberOfThreads: 0,
        wasmAssetLoadMode: "auto",
        moduleVersions: ModuleVersions.fromPartial({ selection: { $case: "auto", auto: {} } }),
      },
      relayers: {
        entries: new Map([
          [
            chainId,
            RelayerConfig.fromPartial({
              transport: RelayerTransport.RELAYER_TRANSPORT_NODE,
              options: {
                debug: false,
                timeout: 0,
                batchRpcCalls: false,
                moduleVersions: { selection: { $case: "pinned", pinned: {} } },
              },
            }),
          ],
        ]),
      },
    }),
  );

  expect(config.runtime).toEqual({
    singleThread: false,
    numberOfThreads: 0,
    wasmAssetLoadMode: "auto",
    moduleVersions: "auto",
  });
  expect(config.providerConfigs.get(Number(chainId))).toEqual({
    headers: {},
    timeout: 0,
    retryCount: 0,
    batch: false,
  });
  expect(config.relayers[Number(chainId)]?.type).toBe("node");
  expect(node).toHaveBeenLastCalledWith({
    debug: false,
    timeout: 0,
    batchRpcCalls: false,
    moduleVersions: {},
  });
});

test("runtime auth uses the backend discriminator and preserves default or empty names", () => {
  const base = {
    wasmAssetLoadMode: undefined,
    moduleVersions: undefined,
    singleThread: undefined,
    numberOfThreads: undefined,
  };
  expect(
    processRuntimeConfig({
      ...base,
      auth: {
        credential: {
          $case: "apiKeyHeader",
          apiKeyHeader: { name: undefined, value: "synthetic-key" },
        },
      },
    }),
  ).toEqual({ auth: { type: "ApiKeyHeader", value: "synthetic-key" } });
  expect(
    processRuntimeConfig({
      ...base,
      auth: {
        credential: {
          $case: "apiKeyCookie",
          apiKeyCookie: { name: "", value: "synthetic-cookie" },
        },
      },
    }),
  ).toEqual({ auth: { type: "ApiKeyCookie", cookie: "", value: "synthetic-cookie" } });
});

test("preserves chain auth names and preset address omission, clear, and override", () => {
  const inherited = parseContextConfig(
    ContextConfig.fromPartial({
      chains: [
        {
          ...preset,
          auth: { credential: { $case: "apiKeyHeader", apiKeyHeader: { value: "synthetic-key" } } },
        },
      ],
    }),
  ).chains[0];
  expect(inherited.auth).toEqual({ __type: "ApiKeyHeader", value: "synthetic-key" });
  expect(inherited.registryAddress).toBe(chains[Number(chainId)]?.registryAddress);

  const cleared = parseContextConfig(
    ContextConfig.fromPartial({
      chains: [
        {
          ...preset,
          registryAddress: Buffer.alloc(0),
          executorAddress: Buffer.alloc(0),
          auth: {
            credential: {
              $case: "apiKeyCookie",
              apiKeyCookie: { name: "", value: "synthetic-cookie" },
            },
          },
        },
      ],
    }),
  ).chains[0];
  expect(cleared).toMatchObject({
    registryAddress: undefined,
    executorAddress: undefined,
    auth: { __type: "ApiKeyCookie", cookie: "", value: "synthetic-cookie" },
  });
});

test("supports cleartext and rejects incomplete typed selections", () => {
  relayerConfig({
    transport: RelayerTransport.RELAYER_TRANSPORT_CLEARTEXT,
    options: {
      timeout: undefined,
      debug: undefined,
      batchRpcCalls: false,
      moduleVersions: { selection: { $case: "auto", auto: {} } },
      fheEncryptionKey: undefined,
    },
  });
  expect(cleartext).toHaveBeenLastCalledWith({ batchRpcCalls: false, moduleVersions: "auto" });
  expect(() =>
    relayerConfig({ transport: RelayerTransport.UNRECOGNIZED, options: undefined }),
  ).toThrow(new ConfigurationError("Unsupported relayer transport."));
  expect(() =>
    relayerConfig({
      transport: RelayerTransport.RELAYER_TRANSPORT_UNSPECIFIED,
      options: undefined,
    }),
  ).toThrow(new ConfigurationError("Relayer transport is required."));
  expect(() =>
    processRuntimeConfig({
      wasmAssetLoadMode: undefined,
      moduleVersions: ModuleVersions.fromPartial({}),
      singleThread: undefined,
      numberOfThreads: undefined,
      auth: undefined,
    }),
  ).toThrow("Module versions require a selection.");
});

test("rejects unsupported runtime values before they reach the SDK", () => {
  const base = {
    wasmAssetLoadMode: undefined,
    moduleVersions: undefined,
    singleThread: undefined,
    numberOfThreads: undefined,
    auth: undefined,
  };
  expect(() => processRuntimeConfig({ ...base, wasmAssetLoadMode: "other" })).toThrow(
    'Unsupported WASM asset load mode "other". Supported values: embedded-base64, verified-blob, precheck-direct-url, trusted-direct-url, auto.',
  );
  for (const pinned of [{ tfhe: "1.6" }, { kms: "0.13.0" }, { checkCompatibility: "ignore" }]) {
    expect(() =>
      processRuntimeConfig({
        ...base,
        moduleVersions: ModuleVersions.fromPartial({ selection: { $case: "pinned", pinned } }),
      }),
    ).toThrow("Unsupported");
  }
});

test("omitted and explicit empty relayer maps stay distinct", () => {
  const omitted = parseContextConfig(ContextConfig.fromPartial({ chains: [preset] }));
  const empty = parseContextConfig(
    ContextConfig.fromPartial({ chains: [preset], relayers: { entries: new Map() } }),
  );
  expect(Object.keys(omitted.relayers)).toEqual([String(chainId)]);
  expect(empty.relayers).toEqual({});
});

test("forwards prefetched encryption key bytes without base64 adaptation", () => {
  relayerConfig({
    transport: RelayerTransport.RELAYER_TRANSPORT_NODE,
    options: {
      timeout: undefined,
      debug: undefined,
      batchRpcCalls: undefined,
      moduleVersions: undefined,
      fheEncryptionKey: {
        publicKeyBytes: { id: "key", bytes: Buffer.from([1, 2, 3]) },
        crsBytes: { id: "crs", capacity: 1, bytes: Buffer.from([4, 5]) },
        metadata: { relayerUrl: "https://relayer.invalid", chainId },
      },
    },
  });
  expect(node).toHaveBeenLastCalledWith({
    fheEncryptionKey: {
      publicKeyBytes: { id: "key", bytes: new Uint8Array([1, 2, 3]) },
      crsBytes: { id: "crs", capacity: 1, bytes: new Uint8Array([4, 5]) },
      metadata: { relayerUrl: "https://relayer.invalid", chainId: Number(chainId) },
    },
  });
});

test("rejects an incomplete prefetched encryption key envelope", () => {
  expect(() =>
    relayerConfig({
      transport: RelayerTransport.RELAYER_TRANSPORT_NODE,
      options: {
        timeout: undefined,
        debug: undefined,
        batchRpcCalls: undefined,
        moduleVersions: undefined,
        fheEncryptionKey: { publicKeyBytes: undefined, crsBytes: undefined, metadata: undefined },
      },
    }),
  ).toThrow("requires public key, CRS and metadata");
});

test("rejects an invalid prefetched CRS capacity", () => {
  expect(() =>
    relayerConfig({
      transport: RelayerTransport.RELAYER_TRANSPORT_NODE,
      options: {
        timeout: undefined,
        debug: undefined,
        batchRpcCalls: undefined,
        moduleVersions: undefined,
        fheEncryptionKey: {
          publicKeyBytes: { id: "key", bytes: Buffer.alloc(0) },
          crsBytes: { id: "crs", capacity: -1, bytes: Buffer.alloc(0) },
          metadata: { relayerUrl: "https://relayer.invalid", chainId },
        },
      },
    }),
  ).toThrow("CRS capacity must be an unsigned 32-bit integer.");
});
