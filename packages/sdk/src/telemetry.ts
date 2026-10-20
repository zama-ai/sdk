import { SDK_VERSION } from "./version";

// No telemetry field may carry a wallet address, encrypted value, amount or identifier.

export type TelemetryLayer = "core" | "react";

export type TelemetryRuntime = "web" | "node";

export type TelemetryMode = "header" | "query" | "off";

/** Values are frozen once shipped, so that dashboards keyed on them survive method renames. */
export type TelemetryOperation =
  | "balance-of"
  | "decrypt-balance-as"
  | "batch-balances-of"
  | "batch-decrypt-balances-as"
  | "confidential-transfer"
  | "confidential-transfer-from"
  | "confidential-transfer-and-call"
  | "confidential-transfer-from-and-call"
  | "unshield"
  | "unshield-all"
  | "resume-unshield"
  | "unwrap"
  | "finalize-unwrap"
  | "vault-deposit"
  | "vault-redeem"
  | "vault-join"
  | "vault-deposit-of"
  | "encrypt"
  | "decrypt-values"
  | "delegated-decrypt-values"
  | "delegated-batch-decrypt-values"
  | "decrypt-public-values"
  | "offline-confidential-transfer"
  | "offline-confidential-transfer-from"
  | "offline-unwrap"
  | "offline-finalize-unwrap";

/**
 * Shared by every relayer of a config. `layer` flips to `react` once
 * `ZamaProvider` marks the config, after the relayers exist.
 *
 * @internal
 */
export interface TelemetryState {
  layer: TelemetryLayer;
  readonly mode: Exclude<TelemetryMode, "off">;
}

export interface RelayerTelemetry {
  readonly state: TelemetryState;
  readonly runtime: TelemetryRuntime;
  /** The config's `mode`, unless `ZAMA_SDK_TELEMETRY` overrode it on Node. */
  readonly mode: Exclude<TelemetryMode, "off">;
}

export function telemetryRequestOptions(
  telemetry: RelayerTelemetry,
  operation: TelemetryOperation | undefined,
): { headers?: Record<string, string>; query?: Record<string, string> } {
  const fields = Object.entries({
    version: SDK_VERSION,
    layer: telemetry.state.layer,
    runtime: telemetry.runtime,
    ...(operation !== undefined && { operation }),
  });
  const prefixed = (prefix: string) =>
    Object.fromEntries(fields.map(([name, value]) => [`${prefix}${name}`, value]));
  return telemetry.mode === "query"
    ? { query: prefixed("zama_sdk_") }
    : { headers: prefixed("x-zama-sdk-") };
}

/** `options` labelled with `operation`, unless the caller already labelled it. */
export function withOperation<T extends { readonly operation?: TelemetryOperation }>(
  options: T | undefined,
  operation: TelemetryOperation,
): Partial<T> & { readonly operation: TelemetryOperation } {
  return Object.assign({}, options, { operation: options?.operation ?? operation });
}

export function telemetryModeFromEnv(
  env: Record<string, string | undefined>,
): TelemetryMode | undefined {
  const value = env.ZAMA_SDK_TELEMETRY?.trim().toLowerCase();
  // `0` and `false` predate the named modes and still mean off.
  if (value === "0" || value === "false") {
    return "off";
  }
  return value === "header" || value === "query" || value === "off" ? value : undefined;
}
