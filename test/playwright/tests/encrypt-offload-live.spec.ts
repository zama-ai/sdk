/**
 * Fully-live encrypt offload coverage: this spec hits LIVE INFRASTRUCTURE (an
 * open testnet RPC plus the hosted `relayer.testnet.zama.org`), downloads the
 * real ~50 MB FHE key in the browser and computes a real input proof in the
 * worker. It runs in a NON-REQUIRED CI lane, so relayer or RPC flakiness never
 * blocks a merge. The flow is read-only: no funded wallet, no transaction.
 */
import { expect, test } from "@playwright/test";
import {
  MAX_MAIN_THREAD_GAP_MS,
  installMainThreadProbe,
  readMainThreadProbe,
  resetMainThreadProbe,
} from "../fixtures/main-thread-probe";

/** Ceiling on the key download; the panel reports `encrypting` once the bytes resolved. */
const KEY_DOWNLOAD_TIMEOUT_MS = 480000;

/** How long the liveness window samples the main thread once the proof is under way. */
const LIVENESS_WINDOW_MS = 5000;

/** Ceiling on the proof itself, once the liveness window has been sampled. */
const PROOF_TIMEOUT_MS = 540000;

/** Must match the SDK's exported degrade-warning prefix; match only the prefix, never the words after it. */
const OFFLOAD_WARN_PREFIX = "Encrypt offload unavailable";

test("keeps the main thread responsive while the worker computes a real proof", async ({
  page,
  baseURL,
}) => {
  test.setTimeout(600000);
  await page.goto("/offload");
  await expect(page.getByTestId("offload-mode")).not.toHaveText("stub");

  // The worker spawns only once the encrypt starts, so this wait outlives the
  // key download that precedes it.
  const worker = page.waitForEvent("worker", { timeout: KEY_DOWNLOAD_TIMEOUT_MS });
  const degraded = page
    .waitForEvent("console", {
      predicate: (message) => message.text().includes(OFFLOAD_WARN_PREFIX),
      timeout: 120000,
    })
    .then(() => true)
    .catch(() => false);

  await installMainThreadProbe(page);
  await page.getByTestId("offload-auto-button").click();

  const url = (await worker).url();
  expect(url).toContain("worker");
  // Same origin as the app: the bundler emitted and served the chunk itself.
  expect(url.startsWith(baseURL!)).toBe(true);

  // The panel switches to `encrypting` only once the key bytes have resolved on
  // the calling thread, so the window that follows covers proof work rather
  // than the download. A response event would not: Playwright fires it on
  // headers, long before the ~50 MB body has landed.
  await expect(page.getByTestId("offload-status")).toHaveText("encrypting", {
    timeout: KEY_DOWNLOAD_TIMEOUT_MS,
  });
  await resetMainThreadProbe(page);
  const windowStart = Date.now();
  // The proof must still be running, otherwise the gap assertion below is vacuous.
  expect(await page.getByTestId("offload-status").innerText()).toBe("encrypting");
  // Bounded sample of the proof; the terminal assertion below is what decides
  // whether the encrypt actually succeeded.
  await expect(page.getByTestId("offload-status"))
    .toHaveText("encrypted", { timeout: LIVENESS_WINDOW_MS })
    .catch(() => undefined);

  const probe = await readMainThreadProbe(page);
  // A window this short would make the gap assertion vacuous.
  expect(Date.now() - windowStart).toBeGreaterThan(500);
  expect(probe.samples).toBeGreaterThan(10);
  expect(probe.maxGap).toBeLessThan(MAX_MAIN_THREAD_GAP_MS);
  // Unconditional: an encrypt that errored mid-window leaves the page idle,
  // which would otherwise pass every gap assertion above vacuously.
  await expect(page.getByTestId("offload-status")).toHaveText("encrypted", {
    timeout: PROOF_TIMEOUT_MS,
  });
  expect(await degraded).toBe(false);
});

test("completes a real encryption through the worker and the hosted relayer", async ({ page }) => {
  test.setTimeout(600000);
  await page.goto("/offload");
  await expect(page.getByTestId("offload-mode")).not.toHaveText("stub");

  const degraded = page
    .waitForEvent("console", {
      predicate: (message) => message.text().includes(OFFLOAD_WARN_PREFIX),
      timeout: 120000,
    })
    .then(() => true)
    .catch(() => false);

  await page.getByTestId("offload-strict-button").click();
  await expect(page.getByTestId("offload-status")).toHaveText("encrypted", {
    timeout: PROOF_TIMEOUT_MS,
  });
  expect(await degraded).toBe(false);
});
