import { DaemonError } from "./errors.js";
import { createRequire } from "node:module";
import { readConfig } from "./config.js";
import { StorageManager } from "./storage-manager.js";
import { createContextFactory } from "./sdk.js";
import { createCoordinator } from "./coordination.js";
import { DaemonRuntime } from "./runtime.js";
import { startServer } from "./server.js";

async function main(): Promise<void> {
  process.umask(0o077);
  const config = readConfig(process.env);
  const storage = new StorageManager(config.storageDirectory);
  const runtime = new DaemonRuntime(
    createContextFactory(storage),
    createCoordinator(),
    config.runtimeLimits,
  );
  try {
    const sdkPackage: { version: string } = createRequire(import.meta.url)(
      "@zama-fhe/sdk/package.json",
    );
    const stop = await startServer(runtime, config.socketPath, sdkPackage.version, config.grpc);
    let stopping = false;
    const shutdown = (): void => {
      if (stopping) {
        return;
      }
      stopping = true;
      void runtime
        .close()
        .then(stop)
        .then(() => storage.close())
        .catch(() => {
          process.exitCode = 1;
        });
    };
    process.once("SIGTERM", shutdown);
    process.once("SIGINT", shutdown);
    process.stdout.write("Daemon ready.\n");
  } catch (error) {
    await runtime.close();
    await storage.close();
    throw error;
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(
    error instanceof DaemonError
      ? `Daemon startup failed: ${error.message}\n`
      : "Daemon startup failed. Check configuration and private storage/socket paths.\n",
  );
  process.exitCode = 1;
});
