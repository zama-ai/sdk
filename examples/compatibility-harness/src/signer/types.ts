/**
 * The only interface you need to implement.
 *
 * Replace the default implementation in `src/signer/index.ts` with your own.
 * All four tests will use this signer — no other file needs to change.
 */
export interface Signer {
  /** The Ethereum address controlled by this signer. */
  address: string;

  /**
   * Sign EIP-712 typed data and return the hex signature.
   *
   * @param data - The full EIP-712 payload: { domain, types, primaryType, message }
   * @returns Hex-encoded signature (0x-prefixed, 65 bytes)
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  signTypedData: (data: any) => Promise<string>;

  /**
   * Sign a transaction and return the raw signed transaction hex.
   *
   * @param tx - EIP-1559 transaction object: { to, value, data, gas, maxFeePerGas, maxPriorityFeePerGas, nonce, chainId }
   * @returns Hex-encoded signed transaction (0x-prefixed)
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  signTransaction: (tx: any) => Promise<string>;
}
