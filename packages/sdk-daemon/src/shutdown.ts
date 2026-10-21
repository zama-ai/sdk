import { once } from "node:events";
import { reportCode } from "./diagnostics.js";
import type { DaemonRuntime } from "./runtime.js";

export async function shutdownDaemon(
  runtime: Pick<DaemonRuntime, "close">,
  stopServer: (deadline: AbortSignal) => Promise<void>,
  storage: { close(): Promise<void> },
  timeoutMs: number,
): Promise<void> {
  const deadline = AbortSignal.timeout(timeoutMs);
  try {
    await Promise.race([runtime.close(), once(deadline, "abort")]);
    await stopServer(deadline);
  } finally {
    await storage.close();
  }
  if (deadline.aborted) {
    reportCode("SHUTDOWN_DEADLINE_EXCEEDED");
    // Unsettled SDK work can keep the event loop alive indefinitely.
    process.exit(1);
  }
}
