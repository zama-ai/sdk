import { expect, test } from "vitest";
import { createCoordinator } from "../src/coordination.js";

test("queues a shared credential identity without blocking another signer", async () => {
  const coordinate = createCoordinator();
  const release = Promise.withResolvers<void>();
  const started = Promise.withResolvers<void>();
  const signal = new AbortController().signal;
  const first = coordinate(["signer:A"], signal, async () => {
    started.resolve();
    await release.promise;
  });
  await started.promise;
  let sharedStarted = false;
  const shared = coordinate(["signer:A"], signal, async () => {
    sharedStarted = true;
  });
  await expect(coordinate(["signer:B"], signal, async () => 2)).resolves.toBe(2);
  expect(sharedStarted).toBe(false);
  release.resolve();
  await Promise.all([first, shared]);
  expect(sharedStarted).toBe(true);
});

test("cancelled queued work never runs or releases the preceding mutation lock", async () => {
  const coordinate = createCoordinator();
  const release = Promise.withResolvers<void>();
  const started = Promise.withResolvers<void>();
  const signal = new AbortController().signal;
  const first = coordinate(["scope:shared", "signer:A"], signal, async () => {
    started.resolve();
    await release.promise;
  });
  await started.promise;
  const abort = new AbortController();
  const cancelled = coordinate(["signer:B", "scope:shared"], abort.signal, async () => {
    throw new Error("Cancelled operation must not run");
  });
  abort.abort(new Error("cancelled"));
  await expect(cancelled).rejects.toThrow("cancelled");
  let nextStarted = false;
  const next = coordinate(["scope:shared"], signal, async () => {
    nextStarted = true;
  });
  await coordinate(["independent"], signal, async () => {});
  expect(nextStarted).toBe(false);
  release.resolve();
  await Promise.all([first, next]);
  expect(nextStarted).toBe(true);
});
