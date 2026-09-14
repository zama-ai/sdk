import type { Page } from "@playwright/test";

/** Main-thread responsiveness probe shared by the encrypt offload specs. */

/** Longest main-thread stall tolerated while the worker computes. */
export const MAX_MAIN_THREAD_GAP_MS = 250;

/** Heartbeat period; a gap much larger than this means something blocked the UI. */
const PROBE_TICK_MS = 20;

declare global {
  interface Window {
    __mainThreadProbe?: { maxGap: number; samples: number; reset: () => void };
  }
}

export async function installMainThreadProbe(page: Page) {
  await page.evaluate((tick) => {
    let last = performance.now();
    const probe = {
      maxGap: 0,
      samples: 0,
      reset() {
        probe.maxGap = 0;
        probe.samples = 0;
        last = performance.now();
      },
    };
    window.setInterval(() => {
      const now = performance.now();
      probe.maxGap = Math.max(probe.maxGap, now - last - tick);
      probe.samples += 1;
      last = now;
    }, tick);
    window.__mainThreadProbe = probe;
  }, PROBE_TICK_MS);
}

export async function resetMainThreadProbe(page: Page) {
  await page.evaluate(() => window.__mainThreadProbe!.reset());
}

export async function readMainThreadProbe(page: Page) {
  return page.evaluate(() => ({
    maxGap: window.__mainThreadProbe!.maxGap,
    samples: window.__mainThreadProbe!.samples,
  }));
}
