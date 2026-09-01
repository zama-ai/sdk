import { OffloadPanel, isLiveChainName } from "@zama-fhe/test-components";
import { FAKE_WORKER_BUSY_FLAG, FAKE_WORKER_BUSY_MESSAGE } from "../fake-encrypt-worker-protocol";

// Build-time flag: unset (the default) keeps the hermetic stub setup the
// required Playwright lane depends on.
const configured = import.meta.env.VITE_LIVE_CHAIN as string | undefined;
const liveChain = isLiveChainName(configured) ? configured : undefined;

/**
 * Spawns the busy-loop stand-in worker and raises a window flag the moment it
 * starts blocking, which is where the responsiveness spec opens its window.
 * Keep the `new Worker(new URL(...))` expression inline: Vite detects it
 * statically to emit the worker chunk.
 */
function createFakeWorker(): Worker {
  const worker = new Worker(new URL("../fake-encrypt.worker.ts", import.meta.url), {
    type: "module",
  });
  worker.addEventListener("message", (event: MessageEvent) => {
    if (event.data === FAKE_WORKER_BUSY_MESSAGE) {
      (window as unknown as Record<string, unknown>)[FAKE_WORKER_BUSY_FLAG] = true;
    }
  });
  return worker;
}

export default function OffloadPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Encrypt Offload</h1>
      <OffloadPanel liveChain={liveChain} fakeWorker={createFakeWorker} />
    </div>
  );
}
