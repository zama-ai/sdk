import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { createCoordinator } from "../src/coordination.js";
import { DaemonRuntime, type ContextSdk } from "../src/runtime.js";
import { startServer } from "../src/server.js";
import { shutdownDaemon } from "../src/shutdown.js";

const contextRequest = {
  config: undefined,
  signerEnabled: false,
  account: undefined,
  storage: undefined,
  permitStorage: undefined,
  transportKeyPairDerivationSecret: undefined,
};
const directories: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function setup() {
  const directory = await mkdtemp(join(tmpdir(), "daemon-shutdown-"));
  directories.push(directory);
  const socket = join(directory, "sdk.sock");
  const runtime = new DaemonRuntime(
    async () => ({ sdk: { dispose: () => {} } as unknown as ContextSdk, storageIdentities: [] }),
    createCoordinator(),
  );
  const stop = await startServer(runtime, socket, "test");
  const storage = { close: vi.fn(async () => {}) };
  const exit = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
  const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  return { runtime, stop, storage, exit, stderr, socket };
}

test("forces exit with a failure status when SDK work outlives the deadline", async () => {
  const h = await setup();
  const contextId = await h.runtime.createContext(contextRequest);
  const started = Promise.withResolvers<void>();
  void h.runtime
    .execute({ contextId, operationId: "stuck" }, new AbortController().signal, () => {
      started.resolve();
      return new Promise(() => {});
    })
    .catch(() => {});
  await started.promise;

  await shutdownDaemon(h.runtime, h.stop, h.storage, 50);

  expect(h.exit).toHaveBeenCalledExactlyOnceWith(1);
  expect(h.stderr).toHaveBeenCalledWith(
    "[zama-daemon] SHUTDOWN_DEADLINE_EXCEEDED (details omitted)\n",
  );
  expect(h.storage.close).toHaveBeenCalledOnce();
  await expect(stat(h.socket)).rejects.toMatchObject({ code: "ENOENT" });
});

test("drains within the deadline and leaves the exit status clean", async () => {
  const h = await setup();
  await h.runtime.createContext(contextRequest);

  await shutdownDaemon(h.runtime, h.stop, h.storage, 5_000);

  expect(h.exit).not.toHaveBeenCalled();
  expect(h.stderr).not.toHaveBeenCalled();
  expect(h.storage.close).toHaveBeenCalledOnce();
  await expect(stat(h.socket)).rejects.toMatchObject({ code: "ENOENT" });
});
