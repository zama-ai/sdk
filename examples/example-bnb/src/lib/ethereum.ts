/**
 * Returns the injected EIP-1193 provider (e.g. Trust Wallet).
 * Uses window.ethereum directly — the standard injection point for EVM wallets.
 */
export function getEthereumProvider() {
  if (typeof window === "undefined") return undefined;
  return window.ethereum;
}
