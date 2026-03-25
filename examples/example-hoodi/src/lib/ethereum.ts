/**
 * Returns the Ethereum EIP-1193 provider.
 *
 * Prefers window.phantom.ethereum when Phantom is detected — this scopes the
 * connection request to Ethereum only and avoids Phantom's multi-chain account
 * picker (which would otherwise include Bitcoin, Solana, etc.).
 *
 * Falls back to window.ethereum for MetaMask and other standard EIP-1193 wallets.
 */
export function getEthereumProvider() {
  if (typeof window === "undefined") return undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).phantom?.ethereum ?? window.ethereum;
}
