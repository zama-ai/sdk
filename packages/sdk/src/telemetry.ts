import { SDK_VERSION } from "./version";

// No telemetry field may carry a wallet address, encrypted value, amount or identifier.

export type TelemetryLayer = "core" | "react";

/** Values are frozen once shipped, so that dashboards keyed on them survive renames. */
export type TelemetryRuntime = "web" | "node" | "daemon";

/** Values are frozen once shipped, so that dashboards keyed on them survive renames. */
export type TelemetryClient = "go" | "rust" | "unknown";

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
  | "vault-finalize"
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
 * Shared by every relayer of a config; `layer` and `daemonClient` are set on it
 * after the relayers exist.
 *
 * @internal
 */
export interface TelemetryState {
  layer: TelemetryLayer;
  /** Set only by the daemon; overrides the reported runtime with `daemon`. */
  daemonClient?: TelemetryClient;
  readonly mode: Exclude<TelemetryMode, "off">;
}

export interface RelayerTelemetry {
  readonly state: TelemetryState;
  readonly runtime: Exclude<TelemetryRuntime, "daemon">;
  /** The config's `mode`, unless `ZAMA_SDK_TELEMETRY` overrode it on Node. */
  readonly mode: Exclude<TelemetryMode, "off">;
}

export function telemetryRequestOptions(
  telemetry: RelayerTelemetry,
  operation: TelemetryOperation | undefined,
): { headers?: Record<string, string>; query?: Record<string, string> } {
  const { layer, daemonClient } = telemetry.state;
  const fields = Object.entries({
    version: SDK_VERSION,
    layer,
    ...(daemonClient === undefined
      ? { runtime: telemetry.runtime }
      : { runtime: "daemon" satisfies TelemetryRuntime, client: daemonClient }),
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

export function parseTelemetryMode(value: string | boolean | undefined): TelemetryMode | undefined {
  if (typeof value === "boolean") {
    return value ? "header" : "off";
  }
  // JavaScript callers can pass anything; only a string can name a mode.
  const mode = typeof value === "string" ? value.trim().toLowerCase() : undefined;
  // `0` and `false` predate the named modes and still mean off.
  if (mode === "0" || mode === "false") {
    return "off";
  }
  return mode === "header" || mode === "query" || mode === "off" ? mode : undefined;
}
