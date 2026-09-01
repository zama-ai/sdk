import { describe, expect, test, vi } from "vitest";

vi.mock("comlink", () => import("./__mocks__/comlink"));

import {
  ENCRYPT_VALUE_ARGS,
  INLINE_RESULT,
  PREFETCHED_KEY,
  WORKER_RESULT,
  deferEncrypt,
  installWorkerHarness,
  makeClient,
  queueEncrypts,
  spawnReady,
} from "./encrypt-worker-client.fixtures";

const harness = installWorkerHarness();

describe("EncryptWorkerClient dispose", () => {
  test("dispose terminates the worker", async () => {
    const { client } = makeClient();
    await client.init();

    client.dispose();

    expect(harness.workers[0]!.terminated).toBe(true);
  });

  test("dispose lets an in-flight call finish over the worker, then terminates it", async () => {
    const { client, api, inline, warn } = makeClient();
    const settle = deferEncrypt(api);
    await client.init();

    const pending = client.encryptValue(ENCRYPT_VALUE_ARGS);
    client.dispose();
    expect(harness.workers[0]!.terminated).toBe(false);

    settle();

    await expect(pending).resolves.toEqual(WORKER_RESULT);
    expect(harness.workers[0]!.terminated).toBe(true);
    expect(inline.encryptValue).not.toHaveBeenCalled();
    expect(inline.init).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(harness.consoleWarn).not.toHaveBeenCalled();
  });

  test("dispose while init is still pending lets it finish, then terminates the worker", async () => {
    const { client, api, inline, warn, prefetchKey } = makeClient();
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
    expect(api.init).toHaveBeenCalledOnce();
    expect(harness.workers[0]!.terminated).toBe(true);
    expect(harness.consoleWarn).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(inline.init).not.toHaveBeenCalled();
  });

  test("two dispose calls in a row terminate the worker once and stay quiet", async () => {
    const { client, warn } = makeClient();
    await client.init();

    client.dispose();
    client.dispose();

    expect(harness.workers).toHaveLength(1);
    expect(harness.workers[0]!.terminated).toBe(true);
    expect(warn).not.toHaveBeenCalled();
    expect(harness.consoleWarn).not.toHaveBeenCalled();
  });

  test("a call made after dispose spawns a fresh worker and succeeds", async () => {
    const { client, api, inline, warn, prefetchKey } = makeClient();
    await client.init();
    client.dispose();

    const result = await client.encryptValue(ENCRYPT_VALUE_ARGS);

    expect(result).toEqual(WORKER_RESULT);
    expect(harness.workers).toHaveLength(2);
    expect(harness.workers[1]!.terminated).toBe(false);
    expect(prefetchKey).toHaveBeenCalledTimes(2);
    expect(api.init).toHaveBeenCalledTimes(2);
    expect(inline.encryptValue).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(harness.consoleWarn).not.toHaveBeenCalled();
  });

  test("dispose, call, dispose releases the respawned worker once the call settles", async () => {
    const { client, api } = makeClient();
    await client.init();
    client.dispose();

    const settle = deferEncrypt(api);
    const pending = client.encryptValue(ENCRYPT_VALUE_ARGS);
    await vi.waitFor(() => expect(api.encryptValue).toHaveBeenCalledOnce());
    client.dispose();
    expect(harness.workers[1]!.terminated).toBe(false);

    settle();
    await pending;

    expect(harness.workers[1]!.terminated).toBe(true);
  });

  test("a call landing mid-drain rides the released worker without cancelling the release", async () => {
    const { client, api } = makeClient();
    const queue = queueEncrypts(api);
    await client.init();

    const first = client.encryptValue(ENCRYPT_VALUE_ARGS);
    await queue.waitForCalls(1);
    client.dispose();
    const second = client.encryptValue(ENCRYPT_VALUE_ARGS);
    await queue.waitForCalls(2);

    queue.settle();
    await Promise.all([first, second]);

    expect(harness.workers).toHaveLength(1);
    expect(harness.workers[0]!.terminated).toBe(true);
  });

  test("dispose with two in-flight operations drains both before terminating the worker", async () => {
    const { client, api } = makeClient();
    const queue = queueEncrypts(api);
    await client.init();

    const pending = [
      client.encryptValue(ENCRYPT_VALUE_ARGS),
      client.encryptValue(ENCRYPT_VALUE_ARGS),
    ];
    await queue.waitForCalls(2);
    client.dispose();
    expect(harness.workers[0]!.terminated).toBe(false);

    queue.settle(1);
    // Still in flight: one of the two draining operations has not settled yet.
    await Promise.resolve();
    await Promise.resolve();
    expect(harness.workers[0]!.terminated).toBe(false);

    queue.settle(1);
    await Promise.all(pending);

    expect(harness.workers[0]!.terminated).toBe(true);
  });

  test("an init landing mid-drain rides the released worker without disarming the release", async () => {
    const { client, api } = makeClient();
    const queue = queueEncrypts(api);
    await client.init();

    const pending = client.encryptValue(ENCRYPT_VALUE_ARGS);
    await queue.waitForCalls(1);
    client.dispose();
    await client.init();
    expect(harness.workers[0]!.terminated).toBe(false);

    queue.settle();
    await pending;

    expect(harness.workers[0]!.terminated).toBe(true);
    api.encryptValue.mockResolvedValue(WORKER_RESULT);
    await expect(client.encryptValue(ENCRYPT_VALUE_ARGS)).resolves.toEqual(WORKER_RESULT);
    expect(harness.workers).toHaveLength(2);
  });

  test("a crash mid-drain degrades the draining operation and terminates the worker once", async () => {
    const { client, api, inline, warn } = makeClient();
    deferEncrypt(api);
    await client.init();

    const pending = client.encryptValue(ENCRYPT_VALUE_ARGS);
    await vi.waitFor(() => expect(api.encryptValue).toHaveBeenCalledOnce());
    client.dispose();
    harness.workers[0]!.crash("boom");

    await expect(pending).resolves.toEqual(INLINE_RESULT);
    expect(inline.encryptValue).toHaveBeenCalledOnce();
    expect(harness.workers[0]!.terminations).toBe(1);
    expect(warn).toHaveBeenCalledOnce();

    api.encryptValue.mockResolvedValue(WORKER_RESULT);
    await expect(client.encryptValue(ENCRYPT_VALUE_ARGS)).resolves.toEqual(WORKER_RESULT);
    expect(harness.workers).toHaveLength(2);
  });

  test("dispose resets a client that had degraded to inline", async () => {
    harness.spawnBehavior = (worker) => queueMicrotask(() => worker.crash("boom"));
    const { client, inline, api } = makeClient();
    await client.encryptValue(ENCRYPT_VALUE_ARGS);
    const spawned = harness.workers.length;

    client.dispose();
    harness.spawnBehavior = spawnReady;
    const result = await client.encryptValue(ENCRYPT_VALUE_ARGS);

    expect(result).toEqual(WORKER_RESULT);
    expect(harness.workers).toHaveLength(spawned + 1);
    expect(api.init).toHaveBeenCalledOnce();
    expect(inline.encryptValue).toHaveBeenCalledOnce();
  });
});
