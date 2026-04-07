/**
 * The only interface you need to implement.
 *
 * Replace the default implementation in `src/signer/index.ts` with your own.
 * All tests will use this signer — no other file needs to change.
 *
 * ── Which methods do you need to implement? ─────────────────────────────────
 *
 * `signTypedData` is REQUIRED. It is the only method the Zama SDK uses for
 * credential authorization (sdk.allow). Without it, Zama compatibility cannot
 * be established.
 *
 * For on-chain transaction testing, implement ONE of:
 *
 *   • `signTransaction` — EOA path. Signs a raw EIP-1559 transaction and
 *     returns the RLP-encoded signed bytes. Use this for EOA wallets (MetaMask,
 *     Ledger, viem private key, etc.).
 *
 *   • `writeContract` — MPC / smart-account path. Executes a contract call via
 *     your own API (Crossmint /transactions, Turnkey, etc.) and returns the
 *     transaction hash directly. Use this when your system does not expose raw
 *     transaction signing.
 *
 * If neither is provided, the transaction test is skipped. The Zama SDK does
 * not require raw transaction signing for credential flows.
 */
export interface Signer {
  /** The Ethereum address controlled by this signer. */
  address: string;

  /**
   * Sign EIP-712 typed data and return the hex signature.
   *
   * REQUIRED — used by the Zama SDK for credential authorization.
   *
   * @param data - The full EIP-712 payload: { domain, types, primaryType, message }
   * @returns Hex-encoded signature (0x-prefixed, 65 bytes)
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  signTypedData: (data: any) => Promise<string>;

  /**
   * Sign a raw EIP-1559 transaction and return the serialized signed hex.
   *
   * OPTIONAL (EOA path). Implement this for EOA-compatible signers.
   * Leave undefined for MPC wallets or smart accounts — implement
   * `writeContract` instead.
   *
   * @param tx - { to, value, data, gas, maxFeePerGas, maxPriorityFeePerGas, nonce, chainId }
   * @returns RLP-encoded signed transaction (0x-prefixed)
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  signTransaction?: (tx: any) => Promise<string>;

  /**
   * Execute a contract write and return the transaction hash.
   *
   * OPTIONAL (MPC / smart-account path). Implement this if your system
   * submits transactions via a higher-level API rather than raw signing.
   * Leave undefined for EOA signers — implement `signTransaction` instead.
   *
   * @param config - { address, abi, functionName, args?, value? }
   * @returns Transaction hash (0x-prefixed)
   */
  writeContract?: (config: {
    address: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    abi: readonly any[];
    functionName: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    args?: readonly any[];
    value?: bigint;
  }) => Promise<string>;
}
