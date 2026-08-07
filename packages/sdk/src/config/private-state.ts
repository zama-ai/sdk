import type { DerivationSecretHolder } from "../credentials/keypair-wrapping";
import type { ZamaConfig } from "./types";

// Keyed off the resolved config instance instead of stored on it: any property, enumerable
// or not, would travel into React provider props, devtools panes, and JSON.stringify, and
// would give every holder of a config a readback path to the secret.
const derivationSecretHolders = new WeakMap<ZamaConfig, DerivationSecretHolder>();

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
