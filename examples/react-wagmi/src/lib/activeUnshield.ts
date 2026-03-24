import type { Address } from "@zama-fhe/react-sdk";

/**
 * Module-level bridge between UnshieldCard and the ZamaProvider onEvent handler.
 * UnshieldCard sets this before calling mutate(); the onEvent handler reads it to
 * associate the Phase 1 txHash with the correct wrapperAddress for savePendingUnshield.
 * A module-level variable is intentional — only one unshield can be in flight per tab.
 */
let _wrapperAddress: Address | null = null;

export function setActiveUnshieldToken(addr: Address | null): void {
  _wrapperAddress = addr;
}

export function getActiveUnshieldToken(): Address | null {
  return _wrapperAddress;
}
