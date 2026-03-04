/**
 * Canonical query-key namespace for `@zama-fhe/sdk/query`.
 *
 * @example
 * ```ts
 * queryClient.invalidateQueries({
 *   queryKey: zamaQueryKeys.confidentialBalance.token("0xToken"),
 * });
 * ```
 */
export const zamaQueryKeys = {
  signerAddress: {
    all: ["zama.signerAddress"] as const,
    token: (tokenAddress: string) => ["zama.signerAddress", { tokenAddress }] as const,
  },

  confidentialHandle: {
    all: ["zama.confidentialHandle"] as const,
    token: (tokenAddress: string) => ["zama.confidentialHandle", { tokenAddress }] as const,
    owner: (tokenAddress: string, owner: string) =>
      ["zama.confidentialHandle", { tokenAddress, owner }] as const,
  },

  confidentialBalance: {
    all: ["zama.confidentialBalance"] as const,
    token: (tokenAddress: string) => ["zama.confidentialBalance", { tokenAddress }] as const,
    owner: (tokenAddress: string, owner: string, handle?: string) =>
      [
        "zama.confidentialBalance",
        {
          tokenAddress,
          owner,
          ...(handle === undefined ? {} : { handle }),
        },
      ] as const,
  },

  confidentialHandles: {
    all: ["zama.confidentialHandles"] as const,
    tokens: (tokenAddresses: string[], owner: string) =>
      ["zama.confidentialHandles", { tokenAddresses, owner }] as const,
  },

  confidentialBalances: {
    all: ["zama.confidentialBalances"] as const,
    tokens: (tokenAddresses: string[], owner: string, handles?: string[]) =>
      [
        "zama.confidentialBalances",
        {
          tokenAddresses,
          owner,
          ...(handles === undefined ? {} : { handles }),
        },
      ] as const,
  },

  tokenMetadata: {
    all: ["zama.tokenMetadata"] as const,
    token: (tokenAddress: string) => ["zama.tokenMetadata", { tokenAddress }] as const,
  },

  isConfidential: {
    all: ["zama.isConfidential"] as const,
    token: (tokenAddress: string) => ["zama.isConfidential", { tokenAddress }] as const,
  },

  isWrapper: {
    all: ["zama.isWrapper"] as const,
    token: (tokenAddress: string) => ["zama.isWrapper", { tokenAddress }] as const,
  },

  wrapperDiscovery: {
    all: ["zama.wrapperDiscovery"] as const,
    token: (tokenAddress: string) => ["zama.wrapperDiscovery", { tokenAddress }] as const,
  },

  underlyingAllowance: {
    all: ["zama.underlyingAllowance"] as const,
    token: (tokenAddress: string) => ["zama.underlyingAllowance", { tokenAddress }] as const,
    scope: (tokenAddress: string, owner: string, wrapperAddress: string) =>
      ["zama.underlyingAllowance", { tokenAddress, owner, wrapperAddress }] as const,
  },

  confidentialIsApproved: {
    all: ["zama.confidentialIsApproved"] as const,
    token: (tokenAddress: string) => ["zama.confidentialIsApproved", { tokenAddress }] as const,
    scope: (tokenAddress: string, owner: string, spender: string) =>
      ["zama.confidentialIsApproved", { tokenAddress, owner, spender }] as const,
  },

  totalSupply: {
    all: ["zama.totalSupply"] as const,
    token: (tokenAddress: string) => ["zama.totalSupply", { tokenAddress }] as const,
  },

  activityFeed: {
    all: ["zama.activityFeed"] as const,
    token: (tokenAddress: string) => ["zama.activityFeed", { tokenAddress }] as const,
    scope: (tokenAddress: string, userAddress: string, logsKey: string, decrypt: boolean) =>
      ["zama.activityFeed", { tokenAddress, userAddress, logsKey, decrypt }] as const,
  },

  fees: {
    all: ["zama.fees"] as const,
    shieldFee: (feeManagerAddress: string, amount?: string, from?: string, to?: string) =>
      [
        "zama.fees",
        {
          type: "shield",
          feeManagerAddress,
          ...(amount === undefined ? {} : { amount, from, to }),
        },
      ] as const,
    unshieldFee: (feeManagerAddress: string, amount?: string, from?: string, to?: string) =>
      [
        "zama.fees",
        {
          type: "unshield",
          feeManagerAddress,
          ...(amount === undefined ? {} : { amount, from, to }),
        },
      ] as const,
    batchTransferFee: (feeManagerAddress: string) =>
      ["zama.fees", { type: "batchTransfer", feeManagerAddress }] as const,
    feeRecipient: (feeManagerAddress: string) =>
      ["zama.fees", { type: "feeRecipient", feeManagerAddress }] as const,
  },

  publicKey: {
    all: ["zama.publicKey"] as const,
  },

  publicParams: {
    all: ["zama.publicParams"] as const,
    bits: (bits: number) => ["zama.publicParams", { bits }] as const,
  },

  decryption: {
    all: ["zama.decryption"] as const,
    handle: (handle: string, contractAddress?: string) =>
      [
        "zama.decryption",
        {
          handle,
          ...(contractAddress === undefined ? {} : { contractAddress }),
        },
      ] as const,
  },
} as const;
