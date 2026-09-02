import { describe, expect, test, vi } from "vitest";
import { EncryptOffloadUnavailableError } from "../../errors";

vi.mock("comlink", () => import("./__mocks__/comlink"));

import { toWireError } from "../protocol";
import {
  ENCRYPT_VALUE_ARGS,
  INLINE_RESULT,
  MockWorker,
  PREFETCHED_KEY,
  WORKER_RESULT,
  blockWorkerConstruction,
  installWorkerHarness,
  makeClient,
} from "./encrypt-worker-client.fixtures";

const harness = installWorkerHarness();

describe("EncryptWorkerClient custom worker source", () => {
  test("a factory source is called instead of constructing the global Worker", async () => {
    const globalWorkerSpy = vi.fn(() => harness.create());
    vi.stubGlobal("Worker", globalWorkerSpy);
    // Created inside the factory, so its ready microtask (queued by the
    // harness spawn behavior) lines up with the client's listener attach.
    const factory = vi.fn(() => harness.create() as unknown as Worker);
    const { client, api } = makeClient({ workerSource: factory });

    await client.encryptValue(ENCRYPT_VALUE_ARGS);

    expect(factory).toHaveBeenCalledOnce();
    expect(globalWorkerSpy).not.toHaveBeenCalled();
    expect(api.encryptValue).toHaveBeenCalledOnce();
  });

  test("a string source constructs the global Worker with it", async () => {
    const { client, api } = makeClient({ workerSource: "/encrypt.worker.js" });

    await client.encryptValue(ENCRYPT_VALUE_ARGS);

    expect(harness.workers[0]!.source).toBe("/encrypt.worker.js");
    expect(harness.workers[0]!.options).toEqual({ type: "module", name: "zama-fhe-encrypt" });
    expect(api.encryptValue).toHaveBeenCalledOnce();
  });

  test("a factory that hands out the same worker twice is warned about", async () => {
    // Built once and handed back on every call, so its ready message has to be
    // emitted by hand each time the client attaches a listener to it.
    const memoized = new MockWorker();
    const factory = vi.fn(() => memoized as unknown as Worker);
    const { client, warn } = makeClient({ workerSource: factory });

    const first = client.init();
    await vi.waitFor(() => expect(factory).toHaveBeenCalledOnce());
    memoized.emitReady();
    await first;
    client.dispose();

    const second = client.init();
    await vi.waitFor(() => expect(factory).toHaveBeenCalledTimes(2));
    memoized.emitReady();
    await second;

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("returned a worker it already handed out"),
      undefined,
    );
  });

  test("a factory source that throws degrades to inline (auto)", async () => {
    const factory = vi.fn(() => {
      throw new Error("factory blocked by CSP");
    });
    const { client, inline, warn } = makeClient({ workerSource: factory });

    const result = await client.encryptValue(ENCRYPT_VALUE_ARGS);

    expect(inline.encryptValue).toHaveBeenCalledOnce();
    expect(result).toEqual(INLINE_RESULT);
    expect(warn).toHaveBeenCalledOnce();
  });

  test("a factory source that throws rejects under strict offload", async () => {
    const factory = vi.fn(() => {
      throw new Error("factory blocked by CSP");
    });
    const { client, inline } = makeClient({ workerSource: factory, strict: true });

    await expect(client.encryptValue(ENCRYPT_VALUE_ARGS)).rejects.toBeInstanceOf(
      EncryptOffloadUnavailableError,
    );
    expect(inline.init).not.toHaveBeenCalled();
  });
});

describe("EncryptWorkerClient strict offload", () => {
  test("rejects instead of degrading when spawning throws", async () => {
    blockWorkerConstruction("CSP: worker-src blocked");
    const { client, inline, warn } = makeClient({ strict: true });

    await expect(client.encryptValue(ENCRYPT_VALUE_ARGS)).rejects.toMatchObject({
      name: "EncryptOffloadUnavailableError",
      code: "ENCRYPT_OFFLOAD_UNAVAILABLE",
    });

    expect(inline.init).not.toHaveBeenCalled();
    expect(inline.encryptValue).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(harness.consoleWarn).not.toHaveBeenCalled();
  });

  test("constructs without a Worker global and rejects at call time", async () => {
    vi.stubGlobal("Worker", undefined);
    const { client, inline } = makeClient({ strict: true });

    await expect(client.encryptValue(ENCRYPT_VALUE_ARGS)).rejects.toBeInstanceOf(
      EncryptOffloadUnavailableError,
    );
    await expect(client.init()).rejects.toBeInstanceOf(EncryptOffloadUnavailableError);
    expect(inline.init).not.toHaveBeenCalled();
  });

  test("rejects an in-flight operation when the worker crashes", async () => {
    const { client, api, inline } = makeClient({ strict: true });
    api.encryptValue.mockReturnValue(new Promise(() => {}));

    await client.init();
    const pending = client.encryptValue(ENCRYPT_VALUE_ARGS);
    harness.workers[0]!.crash("boom");

    await expect(pending).rejects.toBeInstanceOf(EncryptOffloadUnavailableError);
    expect(inline.encryptValue).not.toHaveBeenCalled();
  });

  test("respawns on the next call after a crash instead of staying dead", async () => {
    const { client, api, inline } = makeClient({ strict: true });
    api.encryptValue.mockReturnValueOnce(new Promise(() => {}));

    await client.init();
    const pending = client.encryptValue(ENCRYPT_VALUE_ARGS);
    await vi.waitFor(() => expect(api.encryptValue).toHaveBeenCalledOnce());
    harness.workers[0]!.crash("boom");
    await expect(pending).rejects.toBeInstanceOf(EncryptOffloadUnavailableError);

    await expect(client.encryptValue(ENCRYPT_VALUE_ARGS)).resolves.toEqual(WORKER_RESULT);
    expect(harness.workers).toHaveLength(2);
    expect(api.init).toHaveBeenCalledTimes(2);
    expect(inline.init).not.toHaveBeenCalled();
  });

  test("rejects when init hangs past its deadline", async () => {
    const { client, api, inline } = makeClient({ strict: true, timeouts: { init: 5 } });
    api.init.mockReturnValue(new Promise(() => {}));

    await expect(client.init()).rejects.toBeInstanceOf(EncryptOffloadUnavailableError);

    expect(inline.init).not.toHaveBeenCalled();
    expect(harness.workers[0]!.terminated).toBe(true);
  });

  test("dispose while init is still pending lets it finish and stays quiet", async () => {
    const { client, inline, warn, prefetchKey } = makeClient({ strict: true });
    let releaseKey: (() => void) | undefined;
    prefetchKey.mockImplementation(
      async () =>
        new Promise<never>((resolve) => {
          releaseKey = () => resolve(PREFETCHED_KEY);
        }),
    );

    const pending = client.init();
    await Promise.resolve();
    client.dispose();
    releaseKey!();

    await expect(pending).resolves.toBeUndefined();
    expect(harness.workers[0]!.terminated).toBe(true);
    expect(harness.consoleWarn).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(inline.init).not.toHaveBeenCalled();
  });

  test("a call after dispose respawns the worker instead of rejecting", async () => {
    const { client, api, inline } = makeClient({ strict: true });
    await client.init();
    client.dispose();

    await expect(client.encryptValue(ENCRYPT_VALUE_ARGS)).resolves.toEqual(WORKER_RESULT);
    expect(harness.workers).toHaveLength(2);
    expect(api.init).toHaveBeenCalledTimes(2);
    expect(inline.init).not.toHaveBeenCalled();
  });

  test("a worker-side init failure rejects with the rehydrated error, not the typed offload error", async () => {
    const { client, api, inline } = makeClient({ strict: true });
    const thrown = Object.assign(new Error("chain read failed"), { statusCode: 500 });
    thrown.name = "RelayerResponseApiError";
    api.init.mockRejectedValue(toWireError(thrown));

    await expect(client.init()).rejects.toMatchObject({ name: "RelayerResponseApiError" });
    await expect(client.encryptValue(ENCRYPT_VALUE_ARGS)).rejects.not.toBeInstanceOf(
      EncryptOffloadUnavailableError,
    );
    expect(inline.init).not.toHaveBeenCalled();
  });

  test("a return value Comlink cannot serialize rejects as an offload failure", async () => {
    const { client, api, inline } = makeClient({ strict: true });
    api.encryptValue.mockRejectedValue(
      new TypeError("Unserializable return value: [object Object]"),
    );

    await expect(client.encryptValue(ENCRYPT_VALUE_ARGS)).rejects.toBeInstanceOf(
      EncryptOffloadUnavailableError,
    );
    expect(inline.encryptValue).not.toHaveBeenCalled();
  });

  test("still rethrows application errors as themselves", async () => {
    const { client, api } = makeClient({ strict: true });
    const relayerError = Object.assign(new Error("input proof rejected"), { statusCode: 400 });
    relayerError.name = "RelayerResponseApiError";
    api.encryptValue.mockRejectedValue(relayerError);

    await expect(client.encryptValue(ENCRYPT_VALUE_ARGS)).rejects.toMatchObject({
      name: "RelayerResponseApiError",
    });
  });
});

const BLOCKED_REASON = "a runtime locateFile cannot cross the encrypt worker boundary";

describe("EncryptWorkerClient blocked offload", () => {
  test("degrades inline without spawning a worker or fetching the key", async () => {
    const { client, inline, warn, prefetchKey } = makeClient({ blockedReason: BLOCKED_REASON });

    await expect(client.encryptValue(ENCRYPT_VALUE_ARGS)).resolves.toEqual(INLINE_RESULT);

    expect(harness.workers).toHaveLength(0);
    expect(prefetchKey).not.toHaveBeenCalled();
    expect(inline.encryptValue).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledOnce();
  });

  test("rejects at call time under strict offload", async () => {
    const { client, inline } = makeClient({ blockedReason: BLOCKED_REASON, strict: true });

    await expect(client.encryptValue(ENCRYPT_VALUE_ARGS)).rejects.toMatchObject({
      name: "EncryptOffloadUnavailableError",
      message: expect.stringContaining("locateFile"),
    });

    expect(harness.workers).toHaveLength(0);
    expect(inline.init).not.toHaveBeenCalled();
  });
});
