import { invalidArgument } from "./errors.js";
import { isAbsolute } from "node:path";

export interface DaemonConfig {
  readonly storageDirectory?: string;
  readonly socketPath: string;
  readonly grpc: { maxMessageBytes: number; maxConcurrentStreams?: number };
  readonly runtimeLimits: { maxContexts?: number; maxOperationsPerContext?: number };
}

function positiveInteger(env: NodeJS.ProcessEnv, name: string): number | undefined {
  const value = env[name];
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw invalidArgument(`${name} must be a positive integer.`);
  }
  return parsed;
}

export function readConfig(env: NodeJS.ProcessEnv): DaemonConfig {
  const socketPath = env.ZAMA_SDK_DAEMON_SOCKET_PATH;
  const storageDirectory = env.ZAMA_SDK_DAEMON_STORAGE_DIR;
  if (!socketPath || !isAbsolute(socketPath)) {
    throw invalidArgument("Configure an absolute daemon socket path.");
  }
  if (storageDirectory !== undefined && !isAbsolute(storageDirectory)) {
    throw invalidArgument("The daemon storage directory must be an absolute path.");
  }
  return {
    socketPath,
    storageDirectory,
    grpc: {
      maxMessageBytes: positiveInteger(env, "ZAMA_SDK_DAEMON_MAX_MESSAGE_BYTES") ?? 4 * 1024 * 1024,
      maxConcurrentStreams: positiveInteger(env, "ZAMA_SDK_DAEMON_MAX_CONCURRENT_STREAMS"),
    },
    runtimeLimits: {
      maxContexts: positiveInteger(env, "ZAMA_SDK_DAEMON_MAX_CONTEXTS"),
      maxOperationsPerContext: positiveInteger(env, "ZAMA_SDK_DAEMON_MAX_OPERATIONS_PER_CONTEXT"),
    },
  };
}
