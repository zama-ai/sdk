import { SDK_VERSION } from "./version";

// Usage telemetry: `x-zama-sdk-*` headers on the relayer calls the SDK already
// makes. No header may carry a wallet address, encrypted value, amount or identifier.

export type TelemetryLayer = "core" | "react";

export type TelemetryRuntime = "browser" | "node";

/** Decoupled from method names so that dashboards keyed on these values survive renames. */
export type TelemetryOperation =
  | "unshield"
  | "confidential-transfer"
  | "decrypt-balance"
  | "vault-deposit"
  | "vault-redeem"
  | "vault-join"
  | "vault-balance"
  | "encrypt"
  | "user-decrypt"
  | "delegated-user-decrypt"
  | "public-decrypt"
  | "offline-prepare";

/**
 * Shared by every relayer of a config. `layer` flips to `react` once
 * `ZamaProvider` builds an SDK on the config, after the relayers exist.
 *
 * @internal
 */
export interface TelemetryState {
  layer: TelemetryLayer;
}

export interface RelayerTelemetry {
  readonly state: TelemetryState;
  readonly runtime: TelemetryRuntime;
}

export function telemetryHeaders(
  telemetry: RelayerTelemetry,
  operation: TelemetryOperation | undefined,
): Record<string, string> {
  return {
    "x-zama-sdk-version": SDK_VERSION,
    "x-zama-sdk-layer": telemetry.state.layer,
    "x-zama-sdk-runtime": telemetry.runtime,
    ...(operation !== undefined && { "x-zama-sdk-operation": operation }),
  };
}

export function isTelemetryDisabledByEnv(env: Record<string, string | undefined>): boolean {
  const value = env.ZAMA_SDK_TELEMETRY?.trim().toLowerCase();
  return value === "0" || value === "false";
}
