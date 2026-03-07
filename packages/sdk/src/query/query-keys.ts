import { getAddress } from "viem";
import { type Address } from "viem";
import type { Handle } from "../relayer/relayer-sdk.types";

const normalizeAddressIfPresent = (address: Address | ""): Address | "" =>
  address ? getAddress(address) : "";
const normalizeAddresses = (addresses: Address[]): Address[] =>
  addresses
    .map((address) => normalizeAddressIfPresent(address))
    .filter((a): a is Address => a !== "");
const normalizeOptionalAddress = (address?: Address | ""): Address | undefined =>
  address === undefined || address === "" ? undefined : getAddress(address);

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
    scope: (scope: number) => ["zama.signerAddress", { scope }] as const,
    token: (tokenAddress: Address) =>
      ["zama.signerAddress", { tokenAddress: getAddress(tokenAddress) }] as const,
  },

  confidentialHandle: {
    all: ["zama.confidentialHandle"] as const,
    token: (tokenAddress: Address) =>
      ["zama.confidentialHandle", { tokenAddress: getAddress(tokenAddress) }] as const,
    owner: (tokenAddress: Address, owner: Address | "") =>
      [
        "zama.confidentialHandle",
        { tokenAddress: getAddress(tokenAddress), owner: normalizeAddressIfPresent(owner) },
      ] as const,
  },

  confidentialBalance: {
    all: ["zama.confidentialBalance"] as const,
    token: (tokenAddress: Address) =>
      ["zama.confidentialBalance", { tokenAddress: getAddress(tokenAddress) }] as const,
    owner: (tokenAddress: Address, owner: Address | "", handle?: Handle) =>
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
    tokens: (tokenAddresses: Address[], owner: Address | "") =>
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
    tokens: (tokenAddresses: Address[], owner: Address | "", handles?: Handle[]) =>
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
    token: (tokenAddress: Address) =>
      ["zama.tokenMetadata", { tokenAddress: getAddress(tokenAddress) }] as const,
  },

  isConfidential: {
    all: ["zama.isConfidential"] as const,
    token: (tokenAddress: Address) =>
      ["zama.isConfidential", { tokenAddress: getAddress(tokenAddress) }] as const,
  },

  isWrapper: {
    all: ["zama.isWrapper"] as const,
    token: (tokenAddress: Address) =>
      ["zama.isWrapper", { tokenAddress: getAddress(tokenAddress) }] as const,
  },

  wrapperDiscovery: {
    all: ["zama.wrapperDiscovery"] as const,
    token: (tokenAddress: Address, coordinatorAddress: Address) =>
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
    token: (tokenAddress: Address) =>
      ["zama.underlyingAllowance", { tokenAddress: getAddress(tokenAddress) }] as const,
    scope: (tokenAddress: Address, owner: Address | "", wrapperAddress: Address | "") =>
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
    token: (tokenAddress: Address) =>
      ["zama.confidentialIsApproved", { tokenAddress: getAddress(tokenAddress) }] as const,
    scope: (tokenAddress: Address, holder: Address | "", spender: Address | "") =>
      [
        "zama.confidentialIsApproved",
        {
          tokenAddress: getAddress(tokenAddress),
          holder: normalizeAddressIfPresent(holder),
          spender: normalizeAddressIfPresent(spender),
        },
      ] as const,
  },

  totalSupply: {
    all: ["zama.totalSupply"] as const,
    token: (tokenAddress: Address) =>
      ["zama.totalSupply", { tokenAddress: getAddress(tokenAddress) }] as const,
  },

  activityFeed: {
    all: ["zama.activityFeed"] as const,
    token: (tokenAddress: Address) =>
      ["zama.activityFeed", { tokenAddress: getAddress(tokenAddress) }] as const,
    scope: (tokenAddress: Address, userAddress: Address | "", logsKey: string, decrypt: boolean) =>
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
    shieldFee: (feeManagerAddress: Address, amount?: string, from?: Address, to?: Address) =>
      [
        "zama.fees",
        {
          type: "shield",
          feeManagerAddress: normalizeAddressIfPresent(feeManagerAddress),
          ...(amount === undefined
            ? {}
            : {
                amount,
                from: normalizeOptionalAddress(from),
                to: normalizeOptionalAddress(to),
              }),
        },
      ] as const,
    unshieldFee: (feeManagerAddress: Address, amount?: string, from?: Address, to?: Address) =>
      [
        "zama.fees",
        {
          type: "unshield",
          feeManagerAddress: normalizeAddressIfPresent(feeManagerAddress),
          ...(amount === undefined
            ? {}
            : {
                amount,
                from: normalizeOptionalAddress(from),
                to: normalizeOptionalAddress(to),
              }),
        },
      ] as const,
    batchTransferFee: (feeManagerAddress: Address) =>
      [
        "zama.fees",
        { type: "batchTransfer", feeManagerAddress: normalizeAddressIfPresent(feeManagerAddress) },
      ] as const,
    feeRecipient: (feeManagerAddress: Address) =>
      [
        "zama.fees",
        { type: "feeRecipient", feeManagerAddress: normalizeAddressIfPresent(feeManagerAddress) },
      ] as const,
  },

  isAllowed: {
    all: ["zama.isAllowed"] as const,
    scope: (account: Address) =>
      ["zama.isAllowed", { account: normalizeAddressIfPresent(account) }] as const,
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
    handle: (handle: string, contractAddress?: Address) =>
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
