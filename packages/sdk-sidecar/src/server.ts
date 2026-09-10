import { chmod, unlink } from "node:fs/promises";
import { Server, ServerCredentials } from "@grpc/grpc-js";
import { SidecarServiceService } from "./generated/zama/sdk/v1alpha1/sidecar.js";
import { prepareSocket } from "./socket.js";
import type { SidecarRuntime } from "./runtime.js";
import { createHandlers } from "./handlers.js";

export async function startServer(
  runtime: SidecarRuntime,
  socketPath: string,
  sdkVersion: string,
  options: { maxMessageBytes?: number; maxConcurrentStreams?: number } = {},
): Promise<() => Promise<void>> {
  await prepareSocket(socketPath);
  const server = new Server({
    "grpc.max_receive_message_length": options.maxMessageBytes ?? 4 * 1024 * 1024,
    "grpc.max_send_message_length": options.maxMessageBytes ?? 4 * 1024 * 1024,
    ...(options.maxConcurrentStreams === undefined
      ? {}
      : { "grpc.max_concurrent_streams": options.maxConcurrentStreams }),
  });
  server.addService(SidecarServiceService, createHandlers(runtime, sdkVersion));
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
  return async () => {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        server.forceShutdown();
        resolve();
      }, 65_000);
      timer.unref();
      server.tryShutdown(() => {
        clearTimeout(timer);
        resolve();
      });
    });
    await unlink(socketPath).catch((error: unknown) => {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
        throw error;
      }
    });
  };
}
