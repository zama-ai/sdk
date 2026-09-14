import { describe, expect, test, vi } from "vitest";

vi.mock("comlink", () => import("./__mocks__/comlink"));

import {
  ENCRYPT_VALUE_ARGS,
  INLINE_RESULT,
  WORKER_RESULT,
  blockWorkerConstruction,
  installWorkerHarness,
  makeClient,
  progressChannel,
  queueEncrypts,
} from "./encrypt-worker-client.fixtures";

const harness = installWorkerHarness();

describe("EncryptWorkerClient dispatch", () => {
  test("a worker error while an encrypt is in flight rejects it and degrades to inline", async () => {
    const { client, api, inline } = makeClient();
    api.encryptValue.mockReturnValue(new Promise(() => {}));

    await client.init();
    const pending = client.encryptValue(ENCRYPT_VALUE_ARGS);
    harness.workers[0]!.crash("boom");
    const result = await pending;

    expect(inline.encryptValue).toHaveBeenCalledOnce();
    expect(result).toEqual(INLINE_RESULT);
    expect(harness.workers[0]!.terminated).toBe(true);
  });

  test("rethrows application errors without degrading", async () => {
    const { client, api, inline } = makeClient();
    const relayerError = Object.assign(new Error("input proof rejected"), { statusCode: 400 });
    relayerError.name = "RelayerResponseApiError";
    api.encryptValue.mockRejectedValue(relayerError);

    await expect(client.encryptValue(ENCRYPT_VALUE_ARGS)).rejects.toMatchObject({
      name: "RelayerResponseApiError",
      statusCode: 400,
    });

    expect(inline.encryptValue).not.toHaveBeenCalled();
    expect(harness.workers[0]!.terminated).toBe(false);
  });

  test("forwards aborts to the worker by id", async () => {
    const { client, api } = makeClient();
    const controller = new AbortController();
    const aborted = new Error("aborted");
    aborted.name = "RelayerAbortError";
    api.encryptValues.mockImplementation(async () => {
      controller.abort();
      throw aborted;
    });

    await expect(
      client.encryptValues({
        values: [{ type: "euint64", value: 1n }],
        contractAddress: "0xc",
        userAddress: "0xu",
        options: { signal: controller.signal },
      } as never),
    ).rejects.toMatchObject({ name: "RelayerAbortError" });

    expect(api.abort).toHaveBeenCalledWith(0);
  });

  test("routes progress events to the operation they belong to", async () => {
    const { client, api } = makeClient();
    const queue = queueEncrypts(api);
    const first = vi.fn();
    const second = vi.fn();

    const pending = [
      client.encryptValue({
        ...(ENCRYPT_VALUE_ARGS as object),
        options: { onProgress: first },
      } as never),
      client.encryptValue({
        ...(ENCRYPT_VALUE_ARGS as object),
        options: { onProgress: second },
      } as never),
    ];
    await queue.waitForCalls(2);

    const report = progressChannel(api);
    report(0, { type: "queued" });
    report(1, { type: "computing" });

    expect(first).toHaveBeenCalledExactlyOnceWith({ type: "queued" });
    expect(second).toHaveBeenCalledExactlyOnceWith({ type: "computing" });

    queue.settle();
    await Promise.all(pending);
  });

  test("a progress event arriving after its operation settled is dropped", async () => {
    const { client, api } = makeClient();
    const onProgress = vi.fn();

    await client.encryptValue({
      ...(ENCRYPT_VALUE_ARGS as object),
      options: { onProgress },
    } as never);

    const report = progressChannel(api);
    report(0, { type: "queued" });

    expect(onProgress).not.toHaveBeenCalled();
  });

  test("a call with an already-aborted signal rejects without reaching the worker", async () => {
    const { client, api, inline } = makeClient();
    const controller = new AbortController();
    controller.abort();

    await expect(
      client.encryptValue({
        ...(ENCRYPT_VALUE_ARGS as object),
        options: { signal: controller.signal },
      } as never),
    ).rejects.toMatchObject({ name: "AbortError" });

    expect(api.encryptValue).not.toHaveBeenCalled();
    expect(api.abort).not.toHaveBeenCalled();
    expect(inline.encryptValue).not.toHaveBeenCalled();
  });

  test("an abort during init rejects the call without dispatching it", async () => {
    const { client, api } = makeClient();
    const controller = new AbortController();
    let finishInit!: () => void;
    api.init.mockReturnValue(
      new Promise<void>((resolve) => {
        finishInit = resolve;
      }),
    );

    const pending = client.encryptValue({
      ...(ENCRYPT_VALUE_ARGS as object),
      options: { signal: controller.signal },
    } as never);
    await vi.waitFor(() => expect(api.init).toHaveBeenCalledOnce());
    controller.abort();
    finishInit();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(api.encryptValue).not.toHaveBeenCalled();

    // Init still completed, so the next call runs over the same worker.
    await expect(client.encryptValue(ENCRYPT_VALUE_ARGS)).resolves.toEqual(WORKER_RESULT);
    expect(harness.workers).toHaveLength(1);
  });

  test("an already-aborted signal rejects with its own reason", async () => {
    const { client, api } = makeClient();
    const controller = new AbortController();
    const reason = new Error("caller cancelled");
    reason.name = "RelayerAbortError";
    controller.abort(reason);

    await expect(
      client.encryptValue({
        ...(ENCRYPT_VALUE_ARGS as object),
        options: { signal: controller.signal },
      } as never),
    ).rejects.toBe(reason);

    expect(api.encryptValue).not.toHaveBeenCalled();
  });

  test("an already-aborted call spends no key prefetch and no spawn", async () => {
    const { client, api, prefetchKey } = makeClient();
    const controller = new AbortController();
    controller.abort();

    await expect(
      client.encryptValue({
        ...(ENCRYPT_VALUE_ARGS as object),
        options: { signal: controller.signal },
      } as never),
    ).rejects.toMatchObject({ name: "AbortError" });

    expect(prefetchKey).not.toHaveBeenCalled();
    expect(api.init).not.toHaveBeenCalled();
    expect(harness.workers).toHaveLength(0);
  });

  test("an already-aborted call rejects on a client pinned inline", async () => {
    blockWorkerConstruction("CSP: worker-src blocked");
    const { client, inline } = makeClient();
    // The blocked spawn pins the client, so this call would otherwise run inline.
    await client.encryptValue(ENCRYPT_VALUE_ARGS);
    const controller = new AbortController();
    const reason = new Error("caller cancelled");
    controller.abort(reason);

    await expect(
      client.encryptValue({
        ...(ENCRYPT_VALUE_ARGS as object),
        options: { signal: controller.signal },
      } as never),
    ).rejects.toBe(reason);

    expect(inline.encryptValue).toHaveBeenCalledOnce();
  });

  test("a payload Comlink cannot clone degrades to inline", async () => {
    const { client, api, inline } = makeClient();
    api.encryptValue.mockRejectedValue(
      new DOMException("value could not be cloned", "DataCloneError"),
    );

    await expect(client.encryptValue(ENCRYPT_VALUE_ARGS)).resolves.toEqual(INLINE_RESULT);
    expect(inline.encryptValue).toHaveBeenCalledOnce();
  });

  test("an onProgress listener that throws is contained and warned about", async () => {
    const { client, api, warn } = makeClient();
    const onProgress = vi.fn(() => {
      throw new Error("listener blew up");
    });
    const queue = queueEncrypts(api);

    const pending = client.encryptValue({
      ...(ENCRYPT_VALUE_ARGS as object),
      options: { onProgress },
    } as never);
    await queue.waitForCalls(1);

    expect(() => progressChannel(api)(0, { type: "queued" })).not.toThrow();

    queue.settle();
    await expect(pending).resolves.toEqual(WORKER_RESULT);
    expect(onProgress).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("listener blew up"), undefined);
  });

  test("two concurrent in-flight operations reach the worker with distinct sequential ids", async () => {
    const { client, api } = makeClient();
    const queue = queueEncrypts(api);

    const pending = [
      client.encryptValue(ENCRYPT_VALUE_ARGS),
      client.encryptValue(ENCRYPT_VALUE_ARGS),
    ];
    await queue.waitForCalls(2);

    expect(api.encryptValue.mock.calls[0]![0]).toBe(0);
    expect(api.encryptValue.mock.calls[1]![0]).toBe(1);

    queue.settle();
    await Promise.all(pending);
  });

  test("a worker crash mid-flight rejects and retries both in-flight operations inline", async () => {
    const { client, api, inline } = makeClient();
    api.encryptValue.mockReturnValueOnce(new Promise(() => {}));
    api.encryptValue.mockReturnValueOnce(new Promise(() => {}));

    await client.init();
    const pending = [
      client.encryptValue(ENCRYPT_VALUE_ARGS),
      client.encryptValue(ENCRYPT_VALUE_ARGS),
    ];
    await vi.waitFor(() => expect(api.encryptValue).toHaveBeenCalledTimes(2));
    harness.workers[0]!.crash("boom");

    const results = await Promise.all(pending);

    expect(results).toEqual([INLINE_RESULT, INLINE_RESULT]);
    expect(inline.encryptValue).toHaveBeenCalledTimes(2);
    // A single crash is transient: the client is not pinned, so the next call
    // still tries the worker rather than staying on the calling thread.
    expect(await client.encryptValue(ENCRYPT_VALUE_ARGS)).toEqual(WORKER_RESULT);
  });

  test("an abort fired asynchronously after dispatch is forwarded for the right id", async () => {
    const { client, api } = makeClient();
    let rejectWorker: ((error: Error) => void) | undefined;
    api.encryptValue.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectWorker = reject;
        }),
    );
    const controller = new AbortController();

    const pending = client.encryptValue({
      ...(ENCRYPT_VALUE_ARGS as object),
      options: { signal: controller.signal },
    } as never);
    // Let the call dispatch and register its abort listener before aborting,
    // so the abort genuinely crosses a macrotask boundary from outside.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(api.abort).not.toHaveBeenCalled();

    controller.abort();
    expect(api.abort).toHaveBeenCalledWith(0);

    const aborted = new Error("aborted");
    aborted.name = "RelayerAbortError";
    rejectWorker!(aborted);
    await expect(pending).rejects.toMatchObject({ name: "RelayerAbortError" });
  });
});
