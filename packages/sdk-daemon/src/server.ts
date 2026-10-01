import { chmod, unlink } from "node:fs/promises";
import { Server, ServerCredentials } from "@grpc/grpc-js";
import { DaemonServiceService } from "./generated/zama/sdk/v1beta1/daemon.js";
import { prepareSocket } from "./socket.js";
import type { DaemonRuntime } from "./runtime.js";
import { createHandlers } from "./handlers.js";

export async function startServer(
  runtime: DaemonRuntime,
  socketPath: string,
  sdkVersion: string,
  options: { maxMessageBytes?: number; maxConcurrentStreams?: number } = {},
): Promise<(deadline?: AbortSignal) => Promise<void>> {
  await prepareSocket(socketPath);
  const server = new Server({
    "grpc.max_receive_message_length": options.maxMessageBytes ?? 4 * 1024 * 1024,
    "grpc.max_send_message_length": options.maxMessageBytes ?? 4 * 1024 * 1024,
    ...(options.maxConcurrentStreams === undefined
      ? {}
      : { "grpc.max_concurrent_streams": options.maxConcurrentStreams }),
  });
  server.addService(DaemonServiceService, createHandlers(runtime, sdkVersion));
  let bound = false;
  try {
    await new Promise<void>((resolve, reject) =>
      server.bindAsync(`unix:${socketPath}`, ServerCredentials.createInsecure(), (error) =>
        error ? reject(error) : resolve(),
      ),
    );
    bound = true;
    await chmod(socketPath, 0o600);
  } catch (error) {
    server.forceShutdown();
    if (bound) {
      await unlink(socketPath).catch(() => {});
    }
    throw error;
  }
  return async (deadline?: AbortSignal) => {
    await new Promise<void>((resolve) => {
      const force = () => {
        server.forceShutdown();
        resolve();
      };
      server.tryShutdown(() => {
        deadline?.removeEventListener("abort", force);
        resolve();
      });
      if (deadline?.aborted) {
        force();
      } else {
        deadline?.addEventListener("abort", force, { once: true });
      }
    });
    await unlink(socketPath).catch((error: unknown) => {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
        throw error;
      }
    });
  };
}
