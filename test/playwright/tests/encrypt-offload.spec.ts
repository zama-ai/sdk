import { expect, test as base, type Page } from "@playwright/test";
import { NEXTJS_ANVIL_PORT } from "../fixtures/constants";
import {
  MAX_MAIN_THREAD_GAP_MS,
  installMainThreadProbe,
  readMainThreadProbe,
  resetMainThreadProbe,
} from "../fixtures/main-thread-probe";

/**
 * Bundler-resolution coverage for the encrypt worker: the app under test is the
 * real Vite/Next build of the real SDK artifact, so a worker chunk the bundler
 * failed to emit, serve or evaluate shows up here as "no worker". No relayer
 * and no valid FHE key are involved: the key fetch is faked just far enough to
 * reach the spawn, which happens before anything validates the key material.
 */
const test = base.extend<Record<string, never>, { anvilPort: number }>({
  anvilPort: [NEXTJS_ANVIL_PORT, { option: true, scope: "worker" }],
});

const KEY_ID = "00".repeat(32);

/** A same-origin worker URL that 404s, standing in for a chunk the bundler failed to serve. */
const BROKEN_WORKER = "&workerSrc=/no-such-encrypt-worker.js";

/** Must match the SDK's exported degrade-warning prefix; match only the prefix, never the words after it. */
const OFFLOAD_WARN_PREFIX = "Encrypt offload unavailable";

/** Swaps in the app's busy-loop worker. */
const FAKE_WORKER = "&fakeWorker=1";

/** How long that worker blocks its own realm, mirroring `FAKE_WORKER_BUSY_MS`. */
const FAKE_WORKER_BUSY_MS = 2000;

/** Window flag the vite app raises when the fake worker starts blocking. */
const FAKE_WORKER_BUSY_FLAG = "__fakeEncryptWorkerBusy";

/** Serves the relayer key endpoints the client hits before spawning the worker. */
async function routeFakeRelayer(page: Page, baseURL: string) {
  await page.route("**/fake-relayer/v2/keyurl", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        response: {
          fheKeyInfo: [{ fhePublicKey: { dataId: KEY_ID, urls: [`${baseURL}/fake-relayer/pk`] } }],
          crs: { 2048: { dataId: KEY_ID, urls: [`${baseURL}/fake-relayer/crs`] } },
        },
      }),
    }),
  );
  // Key bytes are never deserialized before the spawn, so any payload will do.
  await page.route("**/fake-relayer/pk", (route) =>
    route.fulfill({ contentType: "application/octet-stream", body: "not-a-key" }),
  );
  await page.route("**/fake-relayer/crs", (route) =>
    route.fulfill({ contentType: "application/octet-stream", body: "not-a-crs" }),
  );
}

test("spawns the bundled encrypt worker", async ({ page, baseURL, anvilPort }) => {
  // The no-degrade window below outlives the default 30s project timeout.
  test.setTimeout(60000);
  await routeFakeRelayer(page, baseURL!);
  await page.goto(`/offload?rpcPort=${anvilPort}`);

  const worker = page.waitForEvent("worker", { timeout: 30000 });
  // A degrade warning would mean the worker never answered; watched from before
  // the click so nothing is missed.
  const degraded = page
    .waitForEvent("console", {
      predicate: (message) => message.text().includes(OFFLOAD_WARN_PREFIX),
      // Longer than the SDK's spawn watchdog so the degrade warning has time to appear.
      timeout: 15000,
    })
    .then(() => true)
    .catch(() => false);
  await page.getByTestId("offload-auto-button").click();

  const url = (await worker).url();
  expect(url).toContain("worker");
  // Same origin as the app: the bundler emitted and served the chunk itself.
  expect(url.startsWith(baseURL!)).toBe(true);
  expect(await page.request.get(url).then((response) => response.status())).toBe(200);
  expect(await degraded).toBe(false);
});

test("strict offload surfaces EncryptOffloadUnavailableError when the worker cannot load", async ({
  page,
  baseURL,
  anvilPort,
}) => {
  await routeFakeRelayer(page, baseURL!);
  // Spawn from a URL that cannot load, the way a mis-emitted chunk would fail.
  await page.goto(`/offload?rpcPort=${anvilPort}${BROKEN_WORKER}`);

  await page.getByTestId("offload-strict-button").click();
  await expect(page.getByTestId("offload-status")).toContainText("EncryptOffloadUnavailableError", {
    timeout: 30000,
  });
});

test("auto offload warns and falls back when the worker cannot load", async ({
  page,
  baseURL,
  anvilPort,
}) => {
  await routeFakeRelayer(page, baseURL!);
  const warning = page.waitForEvent("console", {
    predicate: (message) =>
      message.type() === "warning" && message.text().includes(OFFLOAD_WARN_PREFIX),
    timeout: 30000,
  });
  await page.goto(`/offload?rpcPort=${anvilPort}${BROKEN_WORKER}`);

  await page.getByTestId("offload-auto-button").click();
  expect((await warning).text()).toContain("falls back to the calling thread");
});

test("keeps the main thread responsive while the worker blocks", async ({
  page,
  baseURL,
  anvilPort,
}, testInfo) => {
  // Only the vite app bundles the busy-loop worker `?fakeWorker=1` spawns.
  test.skip(testInfo.project.name !== "vite", "fake worker is wired in the vite app only");
  await routeFakeRelayer(page, baseURL!);
  await page.goto(`/offload?rpcPort=${anvilPort}${FAKE_WORKER}`);

  await installMainThreadProbe(page);
  await page.getByTestId("offload-auto-button").click();

  // The window opens where the worker starts blocking, so the measurement
  // covers the burn rather than the key fetch and bring-up that precede it.
  await page.waitForFunction(
    (flag) => (window as unknown as Record<string, unknown>)[flag] === true,
    FAKE_WORKER_BUSY_FLAG,
    { timeout: 30000 },
  );
  await resetMainThreadProbe(page);
  const windowStart = Date.now();

  await expect(page.getByTestId("offload-status")).toHaveText("encrypted", { timeout: 30000 });
  const probe = await readMainThreadProbe(page);
  // The burn really ran on the worker's clock, so the gap below is not vacuous.
  expect(Date.now() - windowStart).toBeGreaterThan(FAKE_WORKER_BUSY_MS / 2);
  expect(probe.samples).toBeGreaterThan(10);
  // Two seconds of synchronous work happened somewhere; not here.
  expect(probe.maxGap).toBeLessThan(MAX_MAIN_THREAD_GAP_MS);
});
