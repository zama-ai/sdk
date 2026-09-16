import { invalidArgument } from "./errors.js";
import { isAbsolute } from "node:path";

export interface SidecarConfig {
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

export function readConfig(env: NodeJS.ProcessEnv): SidecarConfig {
  const socketPath = env.SIDECAR_SOCKET_PATH;
  const storageDirectory = env.SIDECAR_STORAGE_DIR;
  if (!socketPath || !isAbsolute(socketPath)) {
    throw invalidArgument("Configure an absolute sidecar socket path.");
  }
  if (storageDirectory !== undefined && !isAbsolute(storageDirectory)) {
    throw invalidArgument("The sidecar storage directory must be an absolute path.");
  }
  return {
    socketPath,
    storageDirectory,
    grpc: {
      maxMessageBytes: positiveInteger(env, "SIDECAR_MAX_MESSAGE_BYTES") ?? 4 * 1024 * 1024,
      maxConcurrentStreams: positiveInteger(env, "SIDECAR_MAX_CONCURRENT_STREAMS"),
    },
    runtimeLimits: {
      maxContexts: positiveInteger(env, "SIDECAR_MAX_CONTEXTS"),
      maxOperationsPerContext: positiveInteger(env, "SIDECAR_MAX_OPERATIONS_PER_CONTEXT"),
    },
  };
}
