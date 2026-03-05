import { getAddress } from "viem";

const normalizeAddressIfPresent = (address: string): string =>
  address === "" ? address : getAddress(address);
const normalizeAddresses = (addresses: string[]): string[] =>
  addresses.map((address) => normalizeAddressIfPresent(address));
const normalizeOptionalAddress = (address?: string): string | undefined =>
  address === undefined || address === "" ? address : getAddress(address);

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
    token: (tokenAddress: string) =>
      ["zama.signerAddress", { tokenAddress: getAddress(tokenAddress) }] as const,
  },

  confidentialHandle: {
    all: ["zama.confidentialHandle"] as const,
    token: (tokenAddress: string) =>
      ["zama.confidentialHandle", { tokenAddress: getAddress(tokenAddress) }] as const,
    owner: (tokenAddress: string, owner: string) =>
      [
        "zama.confidentialHandle",
        { tokenAddress: getAddress(tokenAddress), owner: normalizeAddressIfPresent(owner) },
      ] as const,
  },

  confidentialBalance: {
    all: ["zama.confidentialBalance"] as const,
    token: (tokenAddress: string) =>
      ["zama.confidentialBalance", { tokenAddress: getAddress(tokenAddress) }] as const,
    owner: (tokenAddress: string, owner: string, handle?: string) =>
      [
        "zama.confidentialBalance",
        {
          tokenAddress: getAddress(tokenAddress),
          owner: normalizeAddressIfPresent(owner),
          ...(handle === undefined ? {} : { handle }),
        },
      ] as const,
  },

  confidentialHandles: {
    all: ["zama.confidentialHandles"] as const,
    tokens: (tokenAddresses: string[], owner: string) =>
      [
        "zama.confidentialHandles",
        {
          tokenAddresses: normalizeAddresses(tokenAddresses),
          owner: normalizeAddressIfPresent(owner),
        },
      ] as const,
  },

  confidentialBalances: {
    all: ["zama.confidentialBalances"] as const,
    tokens: (tokenAddresses: string[], owner: string, handles?: string[]) =>
      [
        "zama.confidentialBalances",
        {
          tokenAddresses: normalizeAddresses(tokenAddresses),
          owner: normalizeAddressIfPresent(owner),
          ...(handles === undefined ? {} : { handles }),
        },
      ] as const,
  },

  tokenMetadata: {
    all: ["zama.tokenMetadata"] as const,
    token: (tokenAddress: string) =>
      ["zama.tokenMetadata", { tokenAddress: getAddress(tokenAddress) }] as const,
  },

  isConfidential: {
    all: ["zama.isConfidential"] as const,
    token: (tokenAddress: string) =>
      ["zama.isConfidential", { tokenAddress: getAddress(tokenAddress) }] as const,
  },

  isWrapper: {
    all: ["zama.isWrapper"] as const,
    token: (tokenAddress: string) =>
      ["zama.isWrapper", { tokenAddress: getAddress(tokenAddress) }] as const,
  },

  wrapperDiscovery: {
    all: ["zama.wrapperDiscovery"] as const,
    token: (tokenAddress: string, coordinatorAddress: string) =>
      [
        "zama.wrapperDiscovery",
        {
          tokenAddress: getAddress(tokenAddress),
          coordinatorAddress: getAddress(coordinatorAddress),
        },
      ] as const,
  },

  underlyingAllowance: {
    all: ["zama.underlyingAllowance"] as const,
    token: (tokenAddress: string) =>
      ["zama.underlyingAllowance", { tokenAddress: getAddress(tokenAddress) }] as const,
    scope: (tokenAddress: string, owner: string, wrapperAddress: string) =>
      [
        "zama.underlyingAllowance",
        {
          tokenAddress: getAddress(tokenAddress),
          owner: normalizeAddressIfPresent(owner),
          wrapperAddress: normalizeAddressIfPresent(wrapperAddress),
        },
      ] as const,
  },

  confidentialIsApproved: {
    all: ["zama.confidentialIsApproved"] as const,
    token: (tokenAddress: string) =>
      ["zama.confidentialIsApproved", { tokenAddress: getAddress(tokenAddress) }] as const,
    scope: (tokenAddress: string, owner: string, spender: string) =>
      [
        "zama.confidentialIsApproved",
        {
          tokenAddress: getAddress(tokenAddress),
          owner: normalizeAddressIfPresent(owner),
          spender: normalizeAddressIfPresent(spender),
        },
      ] as const,
  },

  totalSupply: {
    all: ["zama.totalSupply"] as const,
    token: (tokenAddress: string) =>
      ["zama.totalSupply", { tokenAddress: getAddress(tokenAddress) }] as const,
  },

  activityFeed: {
    all: ["zama.activityFeed"] as const,
    token: (tokenAddress: string) =>
      ["zama.activityFeed", { tokenAddress: getAddress(tokenAddress) }] as const,
    scope: (tokenAddress: string, userAddress: string, logsKey: string, decrypt: boolean) =>
      [
        "zama.activityFeed",
        {
          tokenAddress: getAddress(tokenAddress),
          userAddress: normalizeAddressIfPresent(userAddress),
          logsKey,
          decrypt,
        },
      ] as const,
  },

  fees: {
    all: ["zama.fees"] as const,
    shieldFee: (feeManagerAddress: string, amount?: string, from?: string, to?: string) =>
      [
        "zama.fees",
        {
          type: "shield",
          feeManagerAddress: normalizeOptionalAddress(feeManagerAddress),
          ...(amount === undefined
            ? {}
            : {
                amount,
                from: normalizeOptionalAddress(from),
                to: normalizeOptionalAddress(to),
              }),
        },
      ] as const,
    unshieldFee: (feeManagerAddress: string, amount?: string, from?: string, to?: string) =>
      [
        "zama.fees",
        {
          type: "unshield",
          feeManagerAddress: normalizeOptionalAddress(feeManagerAddress),
          ...(amount === undefined
            ? {}
            : {
                amount,
                from: normalizeOptionalAddress(from),
                to: normalizeOptionalAddress(to),
              }),
        },
      ] as const,
    batchTransferFee: (feeManagerAddress: string) =>
      [
        "zama.fees",
        { type: "batchTransfer", feeManagerAddress: normalizeOptionalAddress(feeManagerAddress) },
      ] as const,
    feeRecipient: (feeManagerAddress: string) =>
      [
        "zama.fees",
        { type: "feeRecipient", feeManagerAddress: normalizeOptionalAddress(feeManagerAddress) },
      ] as const,
  },

  isAllowed: {
    all: ["zama.isAllowed"] as const,
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
          ...(contractAddress === undefined
            ? {}
            : { contractAddress: getAddress(contractAddress) }),
        },
      ] as const,
  },
} as const;
