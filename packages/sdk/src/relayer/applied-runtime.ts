import type { FhevmRuntimeConfig, WireRuntimeConfig } from "./types";

/**
 * Mirror of the runtime config this package applied via the upstream
 * `setFhevmRuntimeConfig`, which is itself a process-wide one-shot. An encrypt
 * worker realm replicates it, since the upstream lock offers no getter.
 */
let appliedWireRuntime: WireRuntimeConfig | undefined;

/** `locateFile` is a function, so it stays off the wire and is only flagged here. */
let appliedLocateFile = false;

/** Projects the applied runtime onto the fields a worker realm replicates. */
export function recordAppliedRuntimeConfig(runtime: FhevmRuntimeConfig): void {
  appliedWireRuntime = Object.freeze({
    wasmAssetLoadMode: runtime.wasmAssetLoadMode,
    moduleVersions: runtime.moduleVersions,
    singleThread: runtime.singleThread,
    numberOfThreads: runtime.numberOfThreads,
    auth: runtime.auth,
  });
  appliedLocateFile = runtime.locateFile !== undefined;
}

/** `undefined` when the upstream lock was set outside this package. */
export function getAppliedWireRuntime(): WireRuntimeConfig | undefined {
  return appliedWireRuntime;
}

export function hasAppliedLocateFile(): boolean {
  return appliedLocateFile;
}

/** @internal */
export function resetAppliedRuntimeConfig(): void {
  appliedWireRuntime = undefined;
  appliedLocateFile = false;
}
