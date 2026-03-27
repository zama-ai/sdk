import type { Address } from "@zama-fhe/react-sdk";

/**
 * Module-level bridge used to associate an in-flight unwrap transaction hash
 * (received via ZamaSDKEvents.UnshieldPhase1Submitted, which carries no token address)
 * with the correct wrapperAddress so providers.tsx can call savePendingUnshield
 * after Phase 1 is mined but before Phase 2 completes.
 *
 * Set by UnshieldCard just before mutate() is called; read by the onEvent handler
 * in ZamaProvider. A module-level variable is intentional here — only one unshield
 * can be in flight at a time per browser tab.
 */
let _wrapperAddress: Address | null = null;

export function setActiveUnshieldToken(addr: Address | null): void {
  _wrapperAddress = addr;
}

export function getActiveUnshieldToken(): Address | null {
  return _wrapperAddress;
}
