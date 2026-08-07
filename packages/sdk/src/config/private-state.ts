import type { ZamaConfig } from "./types";

// Keyed off the resolved config instance instead of stored on it: any property, enumerable
// or not, would travel into React provider props, devtools panes, and JSON.stringify, and
// would give every holder of a config a readback path to the secret.
const derivationSecrets = new WeakMap<ZamaConfig, string | Uint8Array>();

/** @internal Attach the validated derivation secret to a resolved config, off the object itself. */
export function setResolvedDerivationSecret(config: ZamaConfig, secret: string | Uint8Array): void {
  derivationSecrets.set(config, secret);
}

/** @internal Read the derivation secret attached to a resolved config, if any. */
export function resolvedDerivationSecret(config: ZamaConfig): string | Uint8Array | undefined {
  return derivationSecrets.get(config);
}
