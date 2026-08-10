import type { DerivationSecretHolder } from "../credentials/keypair-wrapping";
import type { ZamaConfig } from "./types";

// Keyed off the resolved config instance instead of stored on it: a property, enumerable or
// not, would give every holder of a config a reflection readback path to the secret, and would
// show up in React provider props and devtools panes.
const derivationSecretHolders = new WeakMap<ZamaConfig, DerivationSecretHolder>();

// Identity of the objects the SDK itself resolved: a copy (spread, rest, pick) is a different
// instance and silently loses everything held off the object.
const resolvedConfigs = new WeakSet<ZamaConfig>();

/** @internal Attach the validated derivation secret to a resolved config, off the object itself. */
export function setResolvedDerivationSecretHolder(
  config: ZamaConfig,
  holder: DerivationSecretHolder,
): void {
  derivationSecretHolders.set(config, holder);
}

/** @internal Read the derivation secret holder attached to a resolved config, if any. */
export function resolvedDerivationSecretHolder(
  config: ZamaConfig,
): DerivationSecretHolder | undefined {
  return derivationSecretHolders.get(config);
}

/** @internal Record a config object as one the SDK resolved. */
export function registerResolvedConfig(config: ZamaConfig): void {
  resolvedConfigs.add(config);
}

/** @internal Whether this exact object was produced by the SDK's config resolution. */
export function isResolvedConfig(config: ZamaConfig): boolean {
  return resolvedConfigs.has(config);
}
