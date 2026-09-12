import { expect, test, vi } from "vitest";
import { SidecarRuntime, type ContextSdk } from "../src/runtime.js";
import { createCoordinator } from "../src/coordination.js";

function setup() {
  const dispose = vi.fn();
  const sdk = { dispose } as unknown as ContextSdk;
  const runtime = new SidecarRuntime(
    async () => ({ sdk, storageIdentities: ["shared-fixture"] }),
    createCoordinator(),
  );
  return { runtime, dispose };
}
const request = {
  storage: undefined,
  permitStorage: undefined,
  configJson: "{}",
  signerEnabled: false,
  account: undefined,
};
test("independent operations do not share a process-wide busy gate", async () => {
  const { runtime } = setup();
  const contextId = await runtime.createContext(request);
  const waiting = Promise.withResolvers<void>();
  const first = runtime.execute(
    { contextId, operationId: "first" },
    new AbortController().signal,
    () => waiting.promise,
  );
  await expect(
    runtime.execute(
      { contextId, operationId: "second" },
      new AbortController().signal,
      async () => 2,
    ),
  ).resolves.toBe(2);
  waiting.resolve();
  await first;
  await runtime.close();
});
test("cancellation returns promptly but holds credential coordination until SDK work settles", async () => {
  const { runtime } = setup();
  const contextId = await runtime.createContext(request);
  const controller = new AbortController();
  const started = Promise.withResolvers<void>();
  const waiting = Promise.withResolvers<void>();
  const signer = "0x1111111111111111111111111111111111111111";
  const first = runtime.execute(
    { contextId, operationId: "first" },
    controller.signal,
    async () => {
      started.resolve();
      await waiting.promise;
    },
    { credentialSigner: signer },
  );
  await started.promise;
  controller.abort();
  await expect(first).rejects.toMatchObject({ code: "CANCELLED" });
  const secondWork = vi.fn(async () => 2);
  const second = runtime.execute(
    { contextId, operationId: "second" },
    new AbortController().signal,
    secondWork,
    { credentialSigner: signer },
  );
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(secondWork).not.toHaveBeenCalled();
  waiting.resolve();
  await expect(second).resolves.toBe(2);
  await runtime.close();
});
test("closing a context cancels work and cannot replay it through an old identifier", async () => {
  const { runtime, dispose } = setup();
  const contextId = await runtime.createContext(request);
  const started = Promise.withResolvers<void>();
  const work = runtime.execute(
    { contextId, operationId: "first" },
    new AbortController().signal,
    (_, signal) =>
      new Promise((_, reject) => {
        signal.addEventListener("abort", () => reject(new Error("stopped")), { once: true });
        started.resolve();
      }),
  );
  await started.promise;
  const rejected = work.catch((error: unknown) => error);
  await runtime.closeContext(contextId);
  expect(await rejected).toBeInstanceOf(Error);
  expect(dispose).toHaveBeenCalledOnce();
  await expect(
    runtime.execute(
      { contextId, operationId: "next" },
      new AbortController().signal,
      async () => 2,
    ),
  ).rejects.toMatchObject({ code: "CONTEXT_NOT_FOUND" });
});

test("shutdown waits for context creation and disposes the late SDK before returning", async () => {
  const creating = Promise.withResolvers<void>();
  const dispose = vi.fn();
  const runtime = new SidecarRuntime(async () => {
    await creating.promise;
    return { storageIdentities: ["shared-fixture"], sdk: { dispose } as unknown as ContextSdk };
  }, createCoordinator());
  const context = runtime.createContext(request).catch((error: unknown) => error);
  let stopped = false;
  const closing = runtime.close().then(() => {
    stopped = true;
  });
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(stopped).toBe(false);
  creating.resolve();
  await closing;
  expect(await context).toMatchObject({ code: "CANCELLED" });
  expect(dispose).toHaveBeenCalledOnce();
});

test("repeated wallet snapshots leave current operations running", async () => {
  const { runtime } = setup();
  const account = { address: Buffer.alloc(20, 1), chainId: 11155111n };
  const contextId = await runtime.createContext({ ...request, signerEnabled: true, account });
  const entered = Promise.withResolvers<AbortSignal>();
  const completion = Promise.withResolvers<number>();
  const result = runtime.execute(
    { contextId, operationId: "active" },
    new AbortController().signal,
    async (_, signal) => {
      entered.resolve(signal);
      return completion.promise;
    },
  );
  const signal = await entered.promise;
  await runtime.updateAccount({ contextId, account });
  expect(signal.aborted).toBe(false);
  completion.resolve(42);
  await expect(result).resolves.toBe(42);
  await runtime.close();
});

test("shutdown waits for a context whose close request is already settling SDK work", async () => {
  const { runtime, dispose } = setup();
  const contextId = await runtime.createContext(request);
  const entered = Promise.withResolvers<void>();
  const completion = Promise.withResolvers<void>();
  const work = runtime
    .execute({ contextId, operationId: "active" }, new AbortController().signal, async () => {
      entered.resolve();
      await completion.promise;
    })
    .catch((error: unknown) => error);
  await entered.promise;
  const closingContext = runtime.closeContext(contextId);
  let stopped = false;
  const closing = runtime.close().then(() => {
    stopped = true;
  });
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(stopped).toBe(false);
  expect(dispose).not.toHaveBeenCalled();
  completion.resolve();
  await Promise.all([work, closingContext, closing]);
  expect(dispose).toHaveBeenCalledOnce();
});

test("an explicit disconnected snapshot resolves signer account readiness", async () => {
  let ready = () => false;
  const runtime = new SidecarRuntime(async (_, signer) => {
    if (!signer) {
      throw new Error("Expected signer adapter");
    }
    ready = () => signer.walletAccount.isReady();
    return {
      storageIdentities: ["shared-fixture"],
      sdk: { dispose: () => {} } as unknown as ContextSdk,
    };
  }, createCoordinator());
  const contextId = await runtime.createContext({ ...request, signerEnabled: true });
  expect(ready()).toBe(false);
  await runtime.updateAccount({ contextId, account: undefined });
  expect(ready()).toBe(true);
  await runtime.close();
});

test("a cancelled wallet update cannot apply later after previous SDK work settles", async () => {
  let walletAddress = () => "";
  const runtime = new SidecarRuntime(async (_, signer) => {
    if (!signer) {
      throw new Error("Expected signer adapter");
    }
    walletAddress = () => signer.walletAccount.getSnapshot()?.address ?? "";
    return {
      storageIdentities: ["shared-fixture"],
      sdk: { dispose: () => {} } as unknown as ContextSdk,
    };
  }, createCoordinator());
  const account = { address: Buffer.alloc(20, 1), chainId: 11155111n };
  const contextId = await runtime.createContext({ ...request, signerEnabled: true, account });
  const started = Promise.withResolvers<void>();
  const completion = Promise.withResolvers<void>();
  const work = runtime
    .execute({ contextId, operationId: "active" }, new AbortController().signal, async () => {
      started.resolve();
      await completion.promise;
    })
    .catch((error: unknown) => error);
  await started.promise;
  const controller = new AbortController();
  const updating = runtime
    .updateAccount(
      { contextId, account: { ...account, address: Buffer.alloc(20, 2) } },
      controller.signal,
    )
    .catch((error: unknown) => error);
  controller.abort();
  completion.resolve();
  expect(await updating).toMatchObject({ code: "CANCELLED" });
  await work;
  expect(walletAddress().toLowerCase()).toBe(`0x${"01".repeat(20)}`);
  await runtime.close();
});
