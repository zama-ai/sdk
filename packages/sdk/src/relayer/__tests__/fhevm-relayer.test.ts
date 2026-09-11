import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type * as EncryptWorkerClientModule from "../../worker/encrypt-worker-client";

const clients = vi.hoisted(() => {
  const makeBaseClient = () => ({
    init: vi.fn(async () => {}),
    decryptPublicValue: vi.fn(async () => ({ type: "uint64", value: 0n })),
    decryptPublicValues: vi.fn(async () => []),
    decryptPublicValuesWithSignatures: vi.fn(async () => ({
      clearValues: [],
      checkSignaturesArgs: { handlesList: [], abiEncodedCleartexts: "0x", decryptionProof: "0x" },
    })),
    fetchFheEncryptionKeyBytes: vi.fn(async () => new Uint8Array()),
    signDecryptionPermit: vi.fn(async () => ({ signature: "0x" })),
    serializeTransportKeyPair: vi.fn(async () => "serialized-keypair"),
    serializeSignedDecryptionPermit: vi.fn(async () => "serialized-permit"),
    parseTransportKeyPair: vi.fn(async () => ({ publicKey: "0x" })),
    parseSignedDecryptionPermit: vi.fn(async () => ({ signature: "0x" })),
  });

  const baseClient = makeBaseClient();
  const decryptClient = {
    ...makeBaseClient(),
    decryptValue: vi.fn(async () => ({ type: "uint64", value: 0n })),
    decryptValues: vi.fn(async () => []),
    decryptValuesFromPairs: vi.fn(async () => []),
    generateTransportKeyPair: vi.fn(async () => ({ publicKey: "0x" })),
  };
  const encryptClient = {
    ...makeBaseClient(),
    encryptValue: vi.fn(async () => ({ encryptedValue: "0x", inputProof: "0x" })),
    encryptValues: vi.fn(async () => ({ encryptedValues: [], inputProof: "0x" })),
  };

  return {
    baseClient,
    decryptClient,
    encryptClient,
    createFhevmBaseClient: vi.fn(() => baseClient),
    createFhevmDecryptClient: vi.fn(() => decryptClient),
    createFhevmEncryptClient: vi.fn(() => encryptClient),
    createFhevmCleartextBaseClient: vi.fn(() => baseClient),
    createFhevmCleartextDecryptClient: vi.fn(() => decryptClient),
    createFhevmCleartextEncryptClient: vi.fn(() => encryptClient),
  };
});

/** Whether a runtime config was set outside `createConfig`; false unless a test says otherwise. */
const fhevmRuntime = vi.hoisted(() => ({ hasFhevmRuntimeConfig: vi.fn(() => false) }));

vi.mock("@fhevm/sdk/viem", () => ({
  createFhevmBaseClient: clients.createFhevmBaseClient,
  createFhevmDecryptClient: clients.createFhevmDecryptClient,
  createFhevmEncryptClient: clients.createFhevmEncryptClient,
  hasFhevmRuntimeConfig: fhevmRuntime.hasFhevmRuntimeConfig,
}));

/** Stands in for the real worker client so the offload arm is observable without a Worker realm. */
const worker = vi.hoisted(() => {
  const instance = {
    init: vi.fn(async () => {}),
    encryptValue: vi.fn(async () => ({ encryptedValue: "0xworker", inputProof: "0xworker" })),
    encryptValues: vi.fn(async () => ({ encryptedValues: [], inputProof: "0xworker" })),
    dispose: vi.fn(),
  };
  return {
    instance,
    EncryptWorkerClient: vi.fn(function EncryptWorkerClientMock(_config: unknown) {
      return instance;
    }),
  };
});

vi.mock("../../worker/encrypt-worker-client", async (importOriginal) => ({
  ...(await importOriginal<typeof EncryptWorkerClientModule>()),
  EncryptWorkerClient: worker.EncryptWorkerClient,
}));

vi.mock("@fhevm/sdk/viem/cleartext", () => ({
  createFhevmCleartextBaseClient: clients.createFhevmCleartextBaseClient,
  createFhevmCleartextDecryptClient: clients.createFhevmCleartextDecryptClient,
  createFhevmCleartextEncryptClient: clients.createFhevmCleartextEncryptClient,
}));

import { anvil } from "../../chains";
import type { FheChain } from "../../chains/types";
import {
  DEFAULT_ENCRYPT_WORKER_TIMEOUTS,
  type EncryptWorkerTimeouts,
} from "../../worker/encrypt-worker-client";
import { web } from "../../config/web";
import { LoggerService } from "../../services/logger-service";
import { recordAppliedRuntimeConfig, resetAppliedRuntimeConfig } from "../applied-runtime";
import { FhevmRelayer, type FhevmRelayerConfig } from "../fhevm-relayer";
import type { FhevmRuntimeConfig } from "../types";

/** {@link FhevmRelayer} with the required logger filled in; tests that assert on it pass their own. */
function makeRelayer(config: Omit<FhevmRelayerConfig, "logger"> & { logger?: LoggerService }) {
  return new FhevmRelayer({ logger: new LoggerService(), ...config });
}

/** A `Worker` global the offload capability check accepts; every test unstubs in `afterEach`. */
function stubWorkerGlobal(): void {
  vi.stubGlobal(
    "Worker",
    class {
      addEventListener(): void {}
      postMessage(): void {}
      terminate(): void {}
    },
  );
}

/** The config the relayer handed the worker client on its first construction. */
function workerClientConfig() {
  return worker.EncryptWorkerClient.mock.calls[0]![0] as {
    strict: boolean;
    workerSource: unknown;
    blockedReason: string | undefined;
    timeouts: EncryptWorkerTimeouts;
    prefetchKey: () => Promise<unknown>;
    initPayload: { clientOptions: unknown };
  };
}

const CONTRACT = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa";
const USER = "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB";
const encryptArgs = { contractAddress: CONTRACT, userAddress: USER, values: [] };

beforeEach(() => {
  vi.clearAllMocks();
  resetAppliedRuntimeConfig();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Records the runtime config the relayer reads; reset before every test. */
function applyRuntime(runtime: Partial<FhevmRuntimeConfig>): void {
  recordAppliedRuntimeConfig(runtime as FhevmRuntimeConfig);
}

describe("FhevmRelayer encrypt offload selection", () => {
  test("offloadEncrypt 'auto' falls back inline when the realm has no Worker", async () => {
    const relayer = makeRelayer({ chain: anvil, offloadEncrypt: "auto" });
    await relayer.encryptValues(encryptArgs);

    expect(clients.createFhevmEncryptClient).toHaveBeenCalledOnce();
    expect(clients.encryptClient.encryptValues).toHaveBeenCalledOnce();
  });

  test("a Worker-capable realm with offloadEncrypt 'auto' defers the inline client", () => {
    stubWorkerGlobal();

    void makeRelayer({ chain: anvil, offloadEncrypt: "auto" });
    expect(clients.createFhevmEncryptClient).not.toHaveBeenCalled();
    expect(workerClientConfig().strict).toBe(false);

    void makeRelayer({ chain: anvil, offloadEncrypt: false });
    expect(clients.createFhevmEncryptClient).toHaveBeenCalledOnce();
  });

  test("offloadEncrypt true builds the worker client even with no Worker global", () => {
    void makeRelayer({ chain: anvil, offloadEncrypt: true });

    expect(worker.EncryptWorkerClient).toHaveBeenCalledOnce();
    expect(workerClientConfig().strict).toBe(true);
    expect(clients.createFhevmEncryptClient).not.toHaveBeenCalled();
  });

  test("web({ offloadEncrypt: true }) plumbs strict into the worker client", () => {
    void web({ offloadEncrypt: true }).createRelayer(anvil, new LoggerService());

    expect(workerClientConfig().strict).toBe(true);
  });

  test("web() defaults to the non-strict offload", () => {
    stubWorkerGlobal();

    void web().createRelayer(anvil, new LoggerService());

    expect(worker.EncryptWorkerClient).toHaveBeenCalledOnce();
    expect(workerClientConfig().strict).toBe(false);
  });

  test("web({ offloadWorker }) plumbs the custom source into the worker client", () => {
    const factory = () => ({}) as Worker;
    void web({ offloadEncrypt: true, offloadWorker: factory }).createRelayer(
      anvil,
      new LoggerService(),
    );

    expect(workerClientConfig().workerSource).toBe(factory);
  });

  test("web() defaults the worker timeouts and merges a partial override over them", () => {
    void web({ offloadEncrypt: true }).createRelayer(anvil, new LoggerService());
    expect(workerClientConfig().timeouts).toEqual(DEFAULT_ENCRYPT_WORKER_TIMEOUTS);

    worker.EncryptWorkerClient.mockClear();
    void web({ offloadEncrypt: true, offloadTimeouts: { spawn: 25 } }).createRelayer(
      anvil,
      new LoggerService(),
    );

    expect(workerClientConfig().timeouts).toEqual({
      spawn: 25,
      init: DEFAULT_ENCRYPT_WORKER_TIMEOUTS.init,
    });
  });

  test("an explicitly undefined offloadTimeouts field keeps its default", () => {
    void web({ offloadEncrypt: true, offloadTimeouts: { spawn: undefined } }).createRelayer(
      anvil,
      new LoggerService(),
    );

    expect(workerClientConfig().timeouts).toEqual(DEFAULT_ENCRYPT_WORKER_TIMEOUTS);
  });

  test("offloadWorker plumbs a custom source through the built-in support check", () => {
    stubWorkerGlobal();

    void makeRelayer({ chain: anvil, offloadEncrypt: "auto", offloadWorker: "/encrypt.worker.js" });

    expect(worker.EncryptWorkerClient).toHaveBeenCalledOnce();
    expect(workerClientConfig().workerSource).toBe("/encrypt.worker.js");
  });

  test("'auto' inlines with a warning when a runtime config was set outside createConfig", async () => {
    stubWorkerGlobal();
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const warn = vi.fn();
    fhevmRuntime.hasFhevmRuntimeConfig.mockReturnValue(true);
    try {
      const relayer = makeRelayer({
        chain: anvil,
        offloadEncrypt: "auto",
        logger: new LoggerService({ debug: vi.fn(), info: vi.fn(), warn, error: vi.fn() }),
      });
      await relayer.encryptValues(encryptArgs);

      // Offloading anyway is strictly worse than inline: the runtime's auth
      // would 401 inside the worker as an application error.
      expect(worker.EncryptWorkerClient).not.toHaveBeenCalled();
      expect(clients.encryptClient.encryptValues).toHaveBeenCalledOnce();
      expect(consoleWarn).toHaveBeenCalledOnce();
      expect(String(consoleWarn.mock.calls[0]![0])).toContain(
        "runtime config set outside createConfig",
      );
      expect(warn).toHaveBeenCalledOnce();
    } finally {
      fhevmRuntime.hasFhevmRuntimeConfig.mockReturnValue(false);
      consoleWarn.mockRestore();
    }
  });

  test("strict blocks the offload at call time when a runtime config was set outside createConfig", () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    fhevmRuntime.hasFhevmRuntimeConfig.mockReturnValue(true);
    try {
      void makeRelayer({ chain: anvil, offloadEncrypt: true });

      expect(workerClientConfig().blockedReason).toContain(
        "runtime config set outside createConfig",
      );
      expect(consoleWarn).not.toHaveBeenCalled();
    } finally {
      fhevmRuntime.hasFhevmRuntimeConfig.mockReturnValue(false);
      consoleWarn.mockRestore();
    }
  });

  test("stays quiet when no runtime config was set outside createConfig", () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      void makeRelayer({ chain: anvil, offloadEncrypt: true });
      expect(consoleWarn).not.toHaveBeenCalled();
    } finally {
      consoleWarn.mockRestore();
    }
  });

  test("cleartext mode never offloads", () => {
    stubWorkerGlobal();

    void makeRelayer({ chain: anvil, cleartext: true, offloadEncrypt: "auto" });

    expect(clients.createFhevmCleartextEncryptClient).toHaveBeenCalledOnce();
  });
});

describe("FhevmRelayer encrypt offload wiring", () => {
  beforeEach(stubWorkerGlobal);

  function offloaded(chain: FheChain = anvil) {
    const relayer = makeRelayer({ chain, offloadEncrypt: "auto" });
    return { relayer, config: workerClientConfig() };
  }

  test("prefetches the FHE key on the calling thread with the chain's default options", async () => {
    const { config } = offloaded({ ...anvil, auth: { __type: "BearerToken", token: "secret" } });

    await config.prefetchKey();

    expect(clients.baseClient.fetchFheEncryptionKeyBytes).toHaveBeenCalledWith({
      options: { auth: { type: "BearerToken", token: "secret" } },
    });
  });

  test("encrypts through the worker, never through an inline client", async () => {
    const { relayer } = offloaded();

    await relayer.encryptValues(encryptArgs);

    expect(worker.instance.init).toHaveBeenCalledOnce();
    expect(worker.instance.encryptValues).toHaveBeenCalledOnce();
    expect(clients.createFhevmEncryptClient).not.toHaveBeenCalled();
    expect(clients.encryptClient.encryptValues).not.toHaveBeenCalled();
  });

  test("serves key bytes from the calling thread instead of cloning them out of the worker", async () => {
    const { relayer } = offloaded();

    await relayer.fetchFheEncryptionKeyBytes({ ignoreCache: true });

    expect(clients.baseClient.fetchFheEncryptionKeyBytes).toHaveBeenCalledWith({
      ignoreCache: true,
      options: {},
    });
    // Never worth a worker spawn and its init wait for a key this thread fetches.
    expect(worker.instance.init).not.toHaveBeenCalled();
  });

  test("dispose terminates the worker client", () => {
    const { relayer } = offloaded();

    relayer.dispose();

    expect(worker.instance.dispose).toHaveBeenCalledOnce();
  });

  test("the worker init payload is structured-cloneable", () => {
    applyRuntime({
      wasmAssetLoadMode: "auto",
      moduleVersions: "auto",
      auth: { type: "BearerToken", token: "secret" },
    });
    makeRelayer({ chain: anvil, offloadEncrypt: "auto" });

    expect(() => structuredClone(workerClientConfig().initPayload)).not.toThrow();
  });

  test("per-call encrypt parameters are structured-cloneable", async () => {
    const { relayer } = offloaded({ ...anvil, auth: { __type: "BearerToken", token: "secret" } });

    await relayer.encryptValues({ ...encryptArgs, options: { timeout: 10 } });

    const params = (worker.instance.encryptValues.mock.calls[0] as unknown as unknown[])[0];
    expect(() => structuredClone(params)).not.toThrow();
  });
});

describe("FhevmRelayer encrypt init memoization", () => {
  test("retries the encrypt init after a failed one instead of memoizing the rejection", async () => {
    const relayer = makeRelayer({ chain: anvil });
    clients.encryptClient.init.mockRejectedValueOnce(new Error("key fetch failed"));

    await expect(relayer.encryptValues(encryptArgs)).rejects.toThrow("key fetch failed");
    await relayer.encryptValues(encryptArgs);

    expect(clients.encryptClient.init).toHaveBeenCalledTimes(2);
  });

  test("dispose drops the memoized encrypt init", async () => {
    const relayer = makeRelayer({ chain: anvil });

    await relayer.encryptValues(encryptArgs);
    relayer.dispose();
    await relayer.encryptValues(encryptArgs);

    expect(clients.encryptClient.init).toHaveBeenCalledTimes(2);
  });
});

describe("FhevmRelayer runtime locateFile", () => {
  beforeEach(stubWorkerGlobal);

  test("'auto' encrypts on the calling thread and warns", async () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    applyRuntime({ locateFile: (file: string) => new URL(`https://cdn.example/${file}`) });
    try {
      const relayer = makeRelayer({ chain: anvil, offloadEncrypt: "auto" });
      await relayer.encryptValues(encryptArgs);

      expect(worker.EncryptWorkerClient).not.toHaveBeenCalled();
      expect(clients.encryptClient.encryptValues).toHaveBeenCalledOnce();
      expect(String(consoleWarn.mock.calls[0]![0])).toContain("locateFile");
    } finally {
      consoleWarn.mockRestore();
    }
  });

  test("strict mode blocks the worker client so it rejects at call time", () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    applyRuntime({ locateFile: (file: string) => new URL(`https://cdn.example/${file}`) });
    try {
      void makeRelayer({ chain: anvil, offloadEncrypt: true });

      expect(workerClientConfig().blockedReason).toContain("locateFile");
      expect(workerClientConfig().strict).toBe(true);
      expect(clients.createFhevmEncryptClient).not.toHaveBeenCalled();
      expect(consoleWarn).not.toHaveBeenCalled();
    } finally {
      consoleWarn.mockRestore();
    }
  });
});

describe("FhevmRelayer capability initialization", () => {
  test("public decrypt initializes only the base client", async () => {
    const relayer = makeRelayer({ chain: anvil });
    await relayer.decryptPublicValues({ encryptedValues: [] });

    expect(clients.baseClient.init).toHaveBeenCalledOnce();
    expect(clients.decryptClient.init).not.toHaveBeenCalled();
    expect(clients.encryptClient.init).not.toHaveBeenCalled();
    expect(clients.baseClient.fetchFheEncryptionKeyBytes).not.toHaveBeenCalled();
  });

  test("private decrypt initializes only the decrypt client", async () => {
    const relayer = makeRelayer({ chain: anvil });
    await relayer.decryptValues({} as never);

    expect(clients.decryptClient.init).toHaveBeenCalledOnce();
    expect(clients.baseClient.init).not.toHaveBeenCalled();
    expect(clients.encryptClient.init).not.toHaveBeenCalled();
    expect(clients.baseClient.fetchFheEncryptionKeyBytes).not.toHaveBeenCalled();
  });

  test("transport key parsing initializes only the decrypt client", async () => {
    const relayer = makeRelayer({ chain: anvil });
    await relayer.parseTransportKeyPair({ publicKey: "0x", privateKey: "0x" });

    expect(clients.decryptClient.init).toHaveBeenCalledOnce();
    expect(clients.decryptClient.parseTransportKeyPair).toHaveBeenCalledOnce();
    expect(clients.baseClient.fetchFheEncryptionKeyBytes).not.toHaveBeenCalled();
  });

  test.each([
    {
      auth: { __type: "ApiKeyHeader", value: "secret", header: "x-custom-key" } as const,
      expected: { type: "ApiKeyHeader", value: "secret", header: "x-custom-key" } as const,
    },
    {
      auth: { __type: "ApiKeyCookie", value: "secret", cookie: "custom-cookie" } as const,
      expected: { type: "ApiKeyCookie", value: "secret", cookie: "custom-cookie" } as const,
    },
    {
      auth: { __type: "BearerToken", token: "secret" } as const,
      expected: { type: "BearerToken", token: "secret" } as const,
    },
  ])(
    "translates $auth.__type chain auth before encryption prefetch",
    async ({ auth, expected }) => {
      const relayer = makeRelayer({ chain: { ...anvil, auth } });
      await relayer.encryptValues(encryptArgs);

      expect(clients.baseClient.fetchFheEncryptionKeyBytes).toHaveBeenCalledWith({
        options: { auth: expected },
      });
      expect(clients.encryptClient.init).toHaveBeenCalledOnce();
      expect(clients.baseClient.init).not.toHaveBeenCalled();
      expect(clients.decryptClient.init).not.toHaveBeenCalled();
    },
  );

  test("prefetches the FHE key before initializing encryption", async () => {
    const relayer = makeRelayer({ chain: anvil });
    await relayer.encryptValues(encryptArgs);

    const [prefetchOrder] = clients.baseClient.fetchFheEncryptionKeyBytes.mock.invocationCallOrder;
    const [initOrder] = clients.encryptClient.init.mock.invocationCallOrder;
    expect(prefetchOrder).toBeLessThan(initOrder as number);
  });

  test("deduplicates the encryption prefetch-and-init across concurrent callers", async () => {
    const relayer = makeRelayer({ chain: anvil });
    await Promise.all([relayer.encryptValues(encryptArgs), relayer.encryptValues(encryptArgs)]);

    // The compound prefetch-then-init is memoized on the relayer, so two
    // concurrent encrypt calls warm the encryption capability exactly once.
    expect(clients.baseClient.fetchFheEncryptionKeyBytes).toHaveBeenCalledOnce();
    expect(clients.encryptClient.init).toHaveBeenCalledOnce();
  });

  test("serialization does not touch the encryption capability", async () => {
    const relayer = makeRelayer({ chain: anvil });

    await expect(relayer.serializeTransportKeyPair({} as never)).resolves.toBe(
      "serialized-keypair",
    );
    await expect(relayer.serializeSignedDecryptionPermit({} as never)).resolves.toBe(
      "serialized-permit",
    );

    expect(clients.encryptClient.init).not.toHaveBeenCalled();
  });

  test.each([
    {
      label: "single public decrypt",
      capability: "base" as const,
      invoke: (relayer: FhevmRelayer) =>
        relayer.decryptPublicValue({ encryptedValue: "0x" } as never),
      delegatedAction: clients.baseClient.decryptPublicValue,
    },
    {
      label: "single private decrypt",
      capability: "decrypt" as const,
      invoke: (relayer: FhevmRelayer) => relayer.decryptValue({} as never),
      delegatedAction: clients.decryptClient.decryptValue,
    },
    {
      label: "cross-contract private decrypt",
      capability: "decrypt" as const,
      invoke: (relayer: FhevmRelayer) => relayer.decryptValuesFromPairs({} as never),
      delegatedAction: clients.decryptClient.decryptValuesFromPairs,
    },
    {
      label: "single encryption",
      capability: "encrypt" as const,
      invoke: (relayer: FhevmRelayer) => relayer.encryptValue({} as never),
      delegatedAction: clients.encryptClient.encryptValue,
    },
    {
      // The key is served from the base client, so the fetch never brings up
      // encryption (nor, under offload, the worker).
      label: "FHE key fetch",
      capability: "base" as const,
      invoke: (relayer: FhevmRelayer) => relayer.fetchFheEncryptionKeyBytes(),
      delegatedAction: clients.baseClient.fetchFheEncryptionKeyBytes,
    },
    {
      label: "signed permit parsing",
      capability: "base" as const,
      invoke: (relayer: FhevmRelayer) => relayer.parseSignedDecryptionPermit({} as never),
      delegatedAction: clients.baseClient.parseSignedDecryptionPermit,
    },
    {
      label: "transport key generation",
      capability: "decrypt" as const,
      invoke: (relayer: FhevmRelayer) => relayer.generateTransportKeyPair(),
      delegatedAction: clients.decryptClient.generateTransportKeyPair,
    },
  ])(
    "routes $label through only the $capability capability",
    async ({ capability, delegatedAction, invoke }) => {
      const relayer = makeRelayer({ chain: anvil });

      await invoke(relayer);

      expect(delegatedAction).toHaveBeenCalled();
      expect(clients.baseClient.init).toHaveBeenCalledTimes(capability === "base" ? 1 : 0);
      expect(clients.decryptClient.init).toHaveBeenCalledTimes(capability === "decrypt" ? 1 : 0);
      expect(clients.encryptClient.init).toHaveBeenCalledTimes(capability === "encrypt" ? 1 : 0);
    },
  );
});

describe("FhevmRelayer request options", () => {
  test("merges defaults into public decrypt requests", async () => {
    const relayer = makeRelayer({ chain: anvil, options: { timeout: 7_000 } });
    await relayer.decryptPublicValuesWithSignatures({ encryptedValues: [] } as never);

    expect(clients.baseClient.decryptPublicValuesWithSignatures).toHaveBeenCalledWith({
      encryptedValues: [],
      options: { timeout: 7_000 },
    });
  });

  test("lets per-call options override decrypt defaults", async () => {
    const relayer = makeRelayer({ chain: anvil, options: { timeout: 5_000 } });
    await relayer.decryptValues({ options: { fetchRetries: 9, timeout: 42 } } as never);

    expect(clients.decryptClient.decryptValues).toHaveBeenCalledWith({
      options: { fetchRetries: 9, timeout: 42 },
    });
  });

  test("lets per-call options override encrypt defaults", async () => {
    const relayer = makeRelayer({ chain: anvil, options: { timeout: 5_000 } });
    await relayer.encryptValues({ ...encryptArgs, options: { timeout: 10 } });

    expect(clients.encryptClient.encryptValues).toHaveBeenCalledWith({
      ...encryptArgs,
      options: { timeout: 10 },
    });
  });

  test("forwards only client-scoped options to every factory", () => {
    makeRelayer({ chain: anvil, options: { timeout: 5_000, batchRpcCalls: true } });

    for (const factory of [
      clients.createFhevmBaseClient,
      clients.createFhevmDecryptClient,
      clients.createFhevmEncryptClient,
    ]) {
      expect(factory).toHaveBeenCalledWith(
        expect.objectContaining({
          options: { batchRpcCalls: true, moduleVersions: undefined, fheEncryptionKey: undefined },
        }),
      );
    }
  });

  test("signDecryptionPermit forwards parameters without request options", async () => {
    const relayer = makeRelayer({ chain: anvil, options: { timeout: 5_000 } });
    const params = { verifyingContract: CONTRACT } as never;
    await relayer.signDecryptionPermit(params);

    expect(clients.baseClient.signDecryptionPermit).toHaveBeenCalledWith(params);
  });
});

describe("FhevmRelayer client construction", () => {
  test("constructs real capability clients by default", () => {
    makeRelayer({ chain: anvil });

    expect(clients.createFhevmBaseClient).toHaveBeenCalledOnce();
    expect(clients.createFhevmDecryptClient).toHaveBeenCalledOnce();
    expect(clients.createFhevmEncryptClient).toHaveBeenCalledOnce();
    expect(clients.createFhevmCleartextBaseClient).not.toHaveBeenCalled();
  });

  test("constructs cleartext capability clients in cleartext mode", () => {
    makeRelayer({ chain: anvil, cleartext: true });

    expect(clients.createFhevmCleartextBaseClient).toHaveBeenCalledOnce();
    expect(clients.createFhevmCleartextDecryptClient).toHaveBeenCalledOnce();
    expect(clients.createFhevmCleartextEncryptClient).toHaveBeenCalledOnce();
    expect(clients.createFhevmBaseClient).not.toHaveBeenCalled();
  });

  test("exposes the configured chain", () => {
    const relayer = makeRelayer({ chain: anvil });
    expect(relayer.chain).toBe(anvil);
  });
});
