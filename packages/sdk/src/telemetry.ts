import { SDK_VERSION } from "./version";

// Usage telemetry: `x-zama-sdk-*` headers on the relayer calls the SDK already
// makes. No header may carry a wallet address, encrypted value, amount or identifier.

export type TelemetryLayer = "core" | "react";

export type TelemetryRuntime = "browser" | "node";

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

/** `options` labelled with `operation`, unless the caller already labelled it. */
export function withOperation<T extends { readonly operation?: TelemetryOperation }>(
  options: T | undefined,
  operation: TelemetryOperation,
): Partial<T> & { readonly operation: TelemetryOperation } {
  return Object.assign({}, options, { operation: options?.operation ?? operation });
}

export function isTelemetryDisabledByEnv(env: Record<string, string | undefined>): boolean {
  const value = env.ZAMA_SDK_TELEMETRY?.trim().toLowerCase();
  return value === "0" || value === "false";
}
