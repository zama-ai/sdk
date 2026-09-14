import { describe, expect, test, vi } from "vitest";

vi.mock("comlink", () => import("./__mocks__/comlink"));

import {
  DEFAULT_ENCRYPT_WORKER_TIMEOUTS,
  ENCRYPT_OFFLOAD_WARN_PREFIX,
} from "../encrypt-worker-client";
import { isWireError, toWireError } from "../protocol";
import {
  ENCRYPT_VALUE_ARGS,
  INLINE_RESULT,
  PREFETCHED_KEY,
  WORKER_RESULT,
  blockWorkerConstruction,
  deferEncrypt,
  installWorkerHarness,
  makeClient,
} from "./encrypt-worker-client.fixtures";

const harness = installWorkerHarness();

/** The binary shape of the prefetched key, which the fixture erases to `never`. */
type KeyBytes = { publicKeyBytes: { bytes: Uint8Array }; crsBytes: { bytes: Uint8Array } };

describe("EncryptWorkerClient lifecycle", () => {
  describe("init and the wire payload", () => {
    test("initializes over the worker and encrypts through it", async () => {
      const { client, api, inline } = makeClient();

      const result = await client.encryptValue(ENCRYPT_VALUE_ARGS);

      expect(result).toEqual(WORKER_RESULT);
      expect(api.init).toHaveBeenCalledOnce();
      expect(api.encryptValue).toHaveBeenCalledWith(0, {
        value: { type: "euint64", value: 42n },
        contractAddress: "0xc",
        userAddress: "0xu",
        options: {},
      });
      expect(inline.init).not.toHaveBeenCalled();
    });

    test("sends the chain's RPC URL into init and no proxy", async () => {
      const { client, api } = makeClient();
      await client.init();

      const [payload, rpcRequest] = api.init.mock.calls[0]! as unknown as [
        { rpcUrl?: string },
        unknown,
      ];
      expect(payload.rpcUrl).toBe("https://rpc.example");
      expect(rpcRequest).toBeNull();
    });

    test("hands the main-thread-prefetched key to the worker's client options", async () => {
      const { client, api, prefetchKey } = makeClient();
      await client.init();

      const [payload] = api.init.mock.calls[0]! as unknown as [
        { clientOptions: { batchRpcCalls?: boolean; fheEncryptionKey?: typeof PREFETCHED_KEY } },
      ];
      expect(prefetchKey).toHaveBeenCalledOnce();
      // A copy of the key bytes, since the wire copy is transferred.
      expect(payload.clientOptions.fheEncryptionKey).toEqual(PREFETCHED_KEY);
      expect(payload.clientOptions.batchRpcCalls).toBe(true);
    });

    test("keeps the calling thread's key intact for a later degrade", async () => {
      const { client, api } = makeClient();
      await client.init();

      const [payload] = api.init.mock.calls[0]! as unknown as [
        { clientOptions: { fheEncryptionKey: KeyBytes } },
      ];
      const cached = PREFETCHED_KEY as unknown as KeyBytes;
      // A copy crosses, so the transfer never detaches this thread's cached
      // key: a detached buffer would leave the inline fallback with no key.
      expect(payload.clientOptions.fheEncryptionKey.publicKeyBytes.bytes).not.toBe(
        cached.publicKeyBytes.bytes,
      );
      expect(cached.publicKeyBytes.bytes.byteLength).toBe(3);
      expect(cached.crsBytes.bytes.byteLength).toBe(2);
    });

    test("a failed key prefetch rejects without degrading to inline", async () => {
      const { client, inline, warn, prefetchKey } = makeClient();
      prefetchKey.mockRejectedValue(new Error("relayer rejected the key request"));

      await expect(client.init()).rejects.toThrow("relayer rejected the key request");
      await expect(client.encryptValue(ENCRYPT_VALUE_ARGS)).rejects.toThrow(
        "relayer rejected the key request",
      );

      expect(inline.init).not.toHaveBeenCalled();
      expect(inline.encryptValue).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
      expect(harness.workers).toHaveLength(0);
    });

    test("proxies provider RPC requests when the network is not a URL", async () => {
      const request = vi.fn(async () => "0x1");
      const { client, api } = makeClient({ network: { request } });
      await client.init();

      const [payload, rpcRequest] = api.init.mock.calls[0]! as unknown as [
        { rpcUrl?: string },
        (args: { method: string }) => Promise<unknown>,
      ];
      expect(payload.rpcUrl).toBeUndefined();
      await expect(rpcRequest({ method: "eth_chainId" })).resolves.toBe("0x1");
      expect(request).toHaveBeenCalledWith({ method: "eth_chainId" });
    });

    test("flattens a provider rejection into something the wire accepts", async () => {
      const rejection = Object.assign(new Error("request limit reached"), { code: -32005 });
      const request = vi.fn(async () => {
        throw rejection;
      });
      const { client, api } = makeClient({ network: { request } });
      await client.init();

      const rpcRequest = api.init.mock.calls[0]![1] as (args: {
        method: string;
      }) => Promise<unknown>;
      const wire = await rpcRequest({ method: "eth_call" }).then(
        () => undefined,
        (error: unknown) => error,
      );

      expect(isWireError(wire)).toBe(true);
    });

    test("routes worker log lines to the logger", async () => {
      const { client, api, warn } = makeClient();
      await client.init();

      const log = api.init.mock.calls[0]![2] as (level: string, message: string) => void;
      log("warn", "threads unavailable");

      expect(warn).toHaveBeenCalledWith(expect.stringContaining("threads unavailable"), undefined);
    });

    test("a worker-side init failure rejects with the rehydrated error, no degrade", async () => {
      const { client, api, inline, warn } = makeClient();
      const thrown = Object.assign(new Error("chain read failed"), { statusCode: 500 });
      thrown.name = "RelayerResponseApiError";
      api.init.mockRejectedValue(toWireError(thrown));

      await expect(client.init()).rejects.toMatchObject({
        name: "RelayerResponseApiError",
        message: "chain read failed",
        statusCode: 500,
      });
      await expect(client.encryptValue(ENCRYPT_VALUE_ARGS)).rejects.toThrow("chain read failed");

      expect(inline.init).not.toHaveBeenCalled();
      expect(inline.encryptValue).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
      expect(harness.consoleWarn).not.toHaveBeenCalled();
    });

    test("a failed init is retried by the next call instead of being replayed", async () => {
      const { client, api, inline } = makeClient();
      api.init.mockRejectedValueOnce(new Error("worker realm: WASM asset 404"));

      await expect(client.init()).rejects.toThrow("worker realm: WASM asset 404");

      await expect(client.encryptValue(ENCRYPT_VALUE_ARGS)).resolves.toEqual(WORKER_RESULT);
      expect(api.init).toHaveBeenCalledTimes(2);
      expect(harness.workers).toHaveLength(2);
      expect(inline.encryptValue).not.toHaveBeenCalled();
    });
  });

  describe("spawn and init watchdogs", () => {
    test("degrades to the inline client when spawning throws", async () => {
      blockWorkerConstruction("CSP: worker-src blocked");
      const { client, inline, warn } = makeClient();

      const result = await client.encryptValue(ENCRYPT_VALUE_ARGS);

      expect(inline.init).toHaveBeenCalledOnce();
      expect(inline.encryptValue).toHaveBeenCalledOnce();
      expect(result).toEqual(INLINE_RESULT);
      expect(warn).toHaveBeenCalledOnce();
    });

    test("warns on the console with no logger configured", async () => {
      blockWorkerConstruction("CSP: worker-src blocked");
      const { client } = makeClient();

      await client.encryptValue(ENCRYPT_VALUE_ARGS);
      await client.encryptValue(ENCRYPT_VALUE_ARGS);

      expect(harness.consoleWarn).toHaveBeenCalledOnce();
      const message = String(harness.consoleWarn.mock.calls[0]![0]);
      expect(message).toContain(ENCRYPT_OFFLOAD_WARN_PREFIX);
      expect(message).toContain("encryption falls back to the calling thread");
      expect(message).toContain("CSP: worker-src blocked");
    });

    test("degrades when the worker never signals ready", async () => {
      harness.spawnBehavior = undefined;
      const { client, inline } = makeClient({ timeouts: { spawn: 5 } });

      await client.init();

      expect(inline.init).toHaveBeenCalledOnce();
      expect(harness.workers[0]!.terminated).toBe(true);
    });

    test("degrades when the worker crashes before ready", async () => {
      harness.spawnBehavior = (worker) => queueMicrotask(() => worker.crash("boom"));
      const { client, inline } = makeClient();
      await client.init();

      expect(inline.init).toHaveBeenCalledOnce();
    });

    test("degrades when init hangs past its deadline", async () => {
      const { client, api, inline } = makeClient({ timeouts: { init: 5 } });
      api.init.mockReturnValue(new Promise(() => {}));

      await client.init();

      expect(inline.init).toHaveBeenCalledOnce();
      expect(harness.workers[0]!.terminated).toBe(true);
    });

    test("a long-running worker operation is not torn down by a client-side timer", async () => {
      vi.useFakeTimers();
      const { client, api, inline } = makeClient();
      const settle = deferEncrypt(api);

      await client.init();
      const pending = client.encryptValue(ENCRYPT_VALUE_ARGS);
      // A whole day of worker compute is still not a client-side timeout.
      await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
      expect(harness.workers[0]!.terminated).toBe(false);

      settle();
      const result = await pending;

      expect(result).toEqual(WORKER_RESULT);
      expect(inline.encryptValue).not.toHaveBeenCalled();
      expect(harness.workers[0]!.terminated).toBe(false);
    });

    test("a failed inline init leaves the degrade path open for the next call", async () => {
      blockWorkerConstruction("CSP: worker-src blocked");
      const { client, inline } = makeClient();
      inline.init.mockRejectedValueOnce(new Error("relayer refused the key request"));

      await expect(client.encryptValue(ENCRYPT_VALUE_ARGS)).rejects.toThrow(
        "relayer refused the key request",
      );

      await expect(client.encryptValue(ENCRYPT_VALUE_ARGS)).resolves.toEqual(INLINE_RESULT);
      expect(inline.init).toHaveBeenCalledTimes(2);
    });
  });

  describe("crash, respawn, and pinning", () => {
    test("a crashed worker is respawned by the next call, the crashed operation runs inline", async () => {
      const { client, api, inline } = makeClient();
      api.encryptValue.mockReturnValueOnce(new Promise(() => {}));

      await client.init();
      const pending = client.encryptValue(ENCRYPT_VALUE_ARGS);
      await vi.waitFor(() => expect(api.encryptValue).toHaveBeenCalledOnce());
      harness.workers[0]!.crash("boom");

      await expect(pending).resolves.toEqual(INLINE_RESULT);

      await expect(client.encryptValue(ENCRYPT_VALUE_ARGS)).resolves.toEqual(WORKER_RESULT);
      expect(harness.workers).toHaveLength(2);
      expect(api.init).toHaveBeenCalledTimes(2);
      expect(inline.encryptValue).toHaveBeenCalledOnce();
    });

    test("a second crash pins the client to the calling thread", async () => {
      const { client, api, inline, warn } = makeClient();

      for (const _ of [0, 1]) {
        api.encryptValue.mockReturnValueOnce(new Promise(() => {}));
        const pending = client.encryptValue(ENCRYPT_VALUE_ARGS);
        await vi.waitFor(() => expect(api.encryptValue).toHaveBeenCalled());
        harness.workers.at(-1)!.crash("boom");
        await pending;
        api.encryptValue.mockClear();
      }
      const spawned = harness.workers.length;

      await expect(client.encryptValue(ENCRYPT_VALUE_ARGS)).resolves.toEqual(INLINE_RESULT);
      expect(harness.workers).toHaveLength(spawned);
      expect(inline.encryptValue).toHaveBeenCalledTimes(3);
      expect(warn).toHaveBeenCalledTimes(2);
    });

    test("a successful worker operation forgives the earlier crash", async () => {
      const { client, api, inline } = makeClient();

      const crashOnce = async () => {
        api.encryptValue.mockReturnValueOnce(new Promise(() => {}));
        const pending = client.encryptValue(ENCRYPT_VALUE_ARGS);
        await vi.waitFor(() => expect(api.encryptValue).toHaveBeenCalled());
        harness.workers.at(-1)!.crash("boom");
        await expect(pending).resolves.toEqual(INLINE_RESULT);
        api.encryptValue.mockClear();
      };

      await crashOnce();
      // The respawn answers, which clears the crash history.
      await expect(client.encryptValue(ENCRYPT_VALUE_ARGS)).resolves.toEqual(WORKER_RESULT);

      await crashOnce();
      // Still transient, so the client is not pinned and the next call respawns.
      await expect(client.encryptValue(ENCRYPT_VALUE_ARGS)).resolves.toEqual(WORKER_RESULT);
      expect(inline.encryptValue).toHaveBeenCalledTimes(2);
    });

    test("a crash during init disarms its watchdog instead of firing on the respawned worker", async () => {
      // Fake timers: the point is that the deadline passes with the client idle.
      vi.useFakeTimers();
      const { client, api, inline, warn } = makeClient();
      // The first worker never answers init, so its watchdog is still armed when
      // the crash tears it down.
      api.init.mockReturnValueOnce(new Promise(() => {}));

      const first = client.init();
      await vi.waitFor(() => expect(api.init).toHaveBeenCalledOnce());
      harness.workers[0]!.crash("boom");
      await first;

      await expect(client.encryptValue(ENCRYPT_VALUE_ARGS)).resolves.toEqual(WORKER_RESULT);
      // Long past the deadline the dead worker's init was under.
      await vi.advanceTimersByTimeAsync(DEFAULT_ENCRYPT_WORKER_TIMEOUTS.init * 2);

      expect(harness.workers).toHaveLength(2);
      expect(harness.workers[1]!.terminated).toBe(false);
      await expect(client.encryptValue(ENCRYPT_VALUE_ARGS)).resolves.toEqual(WORKER_RESULT);
      expect(inline.encryptValue).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledOnce();
    });

    test("a teardown while the client is idle leaves the next call able to respawn", async () => {
      const { client, api, inline } = makeClient();
      await client.encryptValue(ENCRYPT_VALUE_ARGS);
      // A worker that dies with nothing in flight: no operation carries the
      // failure, so only the dropped memo makes the next call spawn again.
      harness.workers[0]!.crash("boom");

      await expect(client.encryptValue(ENCRYPT_VALUE_ARGS)).resolves.toEqual(WORKER_RESULT);
      expect(harness.workers).toHaveLength(2);
      expect(api.init).toHaveBeenCalledTimes(2);
      expect(inline.encryptValue).not.toHaveBeenCalled();
    });
  });
});
