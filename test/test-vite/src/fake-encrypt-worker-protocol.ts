/**
 * Constants shared by the fake encrypt worker and the page that spawns it.
 * They live apart from the worker module so importing them on the main thread
 * does not pull the worker's `expose()` side effects into the page bundle.
 */

/** Mirrors `WORKER_READY_MESSAGE` in packages/sdk/src/worker/protocol.ts. */
export const FAKE_WORKER_READY_MESSAGE = "zama-encrypt-worker-ready";

/** Posted right before the burn, so the spec can start its probe window there. */
export const FAKE_WORKER_BUSY_MESSAGE = "fake-encrypt-worker-busy";

/** Window flag the page raises on that message, polled by the Playwright spec. */
export const FAKE_WORKER_BUSY_FLAG = "__fakeEncryptWorkerBusy";

/** How long each fake encrypt blocks the worker realm; dwarfs the tolerated main-thread gap. */
export const FAKE_WORKER_BUSY_MS = 2000;
