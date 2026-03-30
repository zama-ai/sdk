import { getAddress } from "viem";
import type { Address } from "viem";
import type { Handle } from "../relayer/relayer-sdk.types";

const normalizeAddresses = (addresses: Address[]): Address[] =>
  addresses.map((address) => getAddress(address));
const normalizeAddress = (address?: Address): Address | undefined =>
  address === undefined ? undefined : getAddress(address);

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
    owner: (tokenAddress: Address, owner?: Address) =>
      [
        "zama.confidentialHandle",
        {
          tokenAddress: getAddress(tokenAddress),
          ...(owner ? { owner: getAddress(owner) } : {}),
        },
      ] as const,
  },

  confidentialBalance: {
    all: ["zama.confidentialBalance"] as const,
    token: (tokenAddress: Address) =>
      ["zama.confidentialBalance", { tokenAddress: getAddress(tokenAddress) }] as const,
    owner: (tokenAddress: Address, owner?: Address, handle?: Handle) =>
      [
        "zama.confidentialBalance",
        {
          tokenAddress: getAddress(tokenAddress),
          ...(owner ? { owner: getAddress(owner) } : {}),
          ...(handle === undefined ? {} : { handle }),
        },
      ] as const,
  },

  confidentialHandles: {
    all: ["zama.confidentialHandles"] as const,
    tokens: (tokenAddresses: Address[], owner?: Address) =>
      [
        "zama.confidentialHandles",
        {
          tokenAddresses: normalizeAddresses(tokenAddresses),
          ...(owner ? { owner: getAddress(owner) } : {}),
        },
      ] as const,
  },

  confidentialBalances: {
    all: ["zama.confidentialBalances"] as const,
    tokens: (tokenAddresses: Address[], owner?: Address, handles?: Handle[]) =>
      [
        "zama.confidentialBalances",
        {
          tokenAddresses: normalizeAddresses(tokenAddresses),
          ...(owner ? { owner: getAddress(owner) } : {}),
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
    token: (tokenAddress?: Address, erc20Address?: Address, registryAddress?: Address) => {
      const t = normalizeAddress(tokenAddress);
      const e = normalizeAddress(erc20Address);
      const r = normalizeAddress(registryAddress);
      return [
        "zama.wrapperDiscovery",
        {
          ...(t ? { tokenAddress: t } : {}),
          ...(e ? { erc20Address: e } : {}),
          ...(r ? { registryAddress: r } : {}),
        },
      ] as const;
    },
  },

  underlyingAllowance: {
    all: ["zama.underlyingAllowance"] as const,
    token: (tokenAddress: Address) =>
      ["zama.underlyingAllowance", { tokenAddress: getAddress(tokenAddress) }] as const,
    scope: (tokenAddress: Address, owner?: Address, wrapperAddress?: Address) =>
      [
        "zama.underlyingAllowance",
        {
          tokenAddress: getAddress(tokenAddress),
          ...(owner ? { owner: getAddress(owner) } : {}),
          ...(wrapperAddress ? { wrapperAddress: getAddress(wrapperAddress) } : {}),
        },
      ] as const,
  },

  confidentialIsApproved: {
    all: ["zama.confidentialIsApproved"] as const,
    token: (tokenAddress?: Address) => {
      const t = normalizeAddress(tokenAddress);
      return ["zama.confidentialIsApproved", t ? { tokenAddress: t } : {}] as const;
    },
    scope: (tokenAddress?: Address, holder?: Address, spender?: Address) => {
      const t = normalizeAddress(tokenAddress);
      const h = normalizeAddress(holder);
      const s = normalizeAddress(spender);
      return [
        "zama.confidentialIsApproved",
        {
          ...(t ? { tokenAddress: t } : {}),
          ...(h ? { holder: h } : {}),
          ...(s ? { spender: s } : {}),
        },
      ] as const;
    },
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
    scope: (tokenAddress: Address, userAddress?: Address, logsKey?: string, decrypt?: boolean) =>
      [
        "zama.activityFeed",
        {
          tokenAddress: getAddress(tokenAddress),
          ...(userAddress ? { userAddress: getAddress(userAddress) } : {}),
          ...(logsKey ? { logsKey } : {}),
          ...(decrypt === undefined ? {} : { decrypt }),
        },
      ] as const,
  },

  fees: {
    all: ["zama.fees"] as const,
    shieldFee: (feeManagerAddress?: Address, amount?: string, from?: Address, to?: Address) =>
      [
        "zama.fees",
        {
          type: "shield",
          ...(feeManagerAddress ? { feeManagerAddress: getAddress(feeManagerAddress) } : {}),
          ...(amount === undefined ? {} : { amount }),
          ...(from ? { from: getAddress(from) } : {}),
          ...(to ? { to: getAddress(to) } : {}),
        },
      ] as const,
    unshieldFee: (feeManagerAddress?: Address, amount?: string, from?: Address, to?: Address) =>
      [
        "zama.fees",
        {
          type: "unshield",
          ...(feeManagerAddress ? { feeManagerAddress: getAddress(feeManagerAddress) } : {}),
          ...(amount === undefined ? {} : { amount }),
          ...(from ? { from: getAddress(from) } : {}),
          ...(to ? { to: getAddress(to) } : {}),
        },
      ] as const,
    batchTransferFee: (feeManagerAddress?: Address) =>
      [
        "zama.fees",
        {
          type: "batchTransfer",
          ...(feeManagerAddress ? { feeManagerAddress: getAddress(feeManagerAddress) } : {}),
        },
      ] as const,
    feeRecipient: (feeManagerAddress?: Address) =>
      [
        "zama.fees",
        {
          type: "feeRecipient",
          ...(feeManagerAddress ? { feeManagerAddress: getAddress(feeManagerAddress) } : {}),
        },
      ] as const,
  },

  isAllowed: {
    all: ["zama.isAllowed"] as const,
    scope: (account: Address) => ["zama.isAllowed", { account: getAddress(account) }] as const,
  },

  publicKey: {
    all: ["zama.publicKey"] as const,
  },

  publicParams: {
    all: ["zama.publicParams"] as const,
    bits: (bits: number) => ["zama.publicParams", { bits }] as const,
  },

  delegationStatus: {
    all: ["zama.delegationStatus"] as const,
    token: (tokenAddress?: Address) => {
      const t = normalizeAddress(tokenAddress);
      return ["zama.delegationStatus", t ? { tokenAddress: t } : {}] as const;
    },
    scope: (tokenAddress?: Address, delegator?: Address, delegate?: Address) => {
      const t = normalizeAddress(tokenAddress);
      const dr = normalizeAddress(delegator);
      const de = normalizeAddress(delegate);
      return [
        "zama.delegationStatus",
        {
          ...(t ? { tokenAddress: t } : {}),
          ...(dr ? { delegatorAddress: dr } : {}),
          ...(de ? { delegateAddress: de } : {}),
        },
      ] as const;
    },
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

  wrappersRegistry: {
    all: ["zama.wrappersRegistry"] as const,
    chainId: () => ["zama.wrappersRegistry", { type: "chainId" }] as const,
    tokenPairs: (registryAddress: Address) =>
      [
        "zama.wrappersRegistry",
        {
          type: "tokenPairs",
          registryAddress: getAddress(registryAddress),
        },
      ] as const,
    confidentialTokenAddress: (registryAddress: Address, tokenAddress: Address) =>
      [
        "zama.wrappersRegistry",
        {
          type: "confidentialTokenAddress",
          registryAddress: getAddress(registryAddress),
          tokenAddress: getAddress(tokenAddress),
        },
      ] as const,
    tokenAddress: (registryAddress: Address, confidentialTokenAddress: Address) =>
      [
        "zama.wrappersRegistry",
        {
          type: "tokenAddress",
          registryAddress: getAddress(registryAddress),
          confidentialTokenAddress: getAddress(confidentialTokenAddress),
        },
      ] as const,
    tokenPairsLength: (registryAddress: Address) =>
      [
        "zama.wrappersRegistry",
        {
          type: "tokenPairsLength",
          registryAddress: getAddress(registryAddress),
        },
      ] as const,
    tokenPairsSlice: (registryAddress: Address, fromIndex: string, toIndex: string) =>
      [
        "zama.wrappersRegistry",
        {
          type: "tokenPairsSlice",
          registryAddress: getAddress(registryAddress),
          fromIndex,
          toIndex,
        },
      ] as const,
    tokenPair: (registryAddress: Address, index: string) =>
      [
        "zama.wrappersRegistry",
        {
          type: "tokenPair",
          registryAddress: getAddress(registryAddress),
          index,
        },
      ] as const,
    isConfidentialTokenValid: (registryAddress: Address, confidentialTokenAddress: Address) =>
      [
        "zama.wrappersRegistry",
        {
          type: "isConfidentialTokenValid",
          registryAddress: getAddress(registryAddress),
          confidentialTokenAddress: getAddress(confidentialTokenAddress),
        },
      ] as const,
    listPairs: (registryAddress: Address, page: number, pageSize: number, metadata: boolean) =>
      [
        "zama.wrappersRegistry",
        {
          type: "listPairs",
          registryAddress: getAddress(registryAddress),
          page,
          pageSize,
          metadata,
        },
      ] as const,
  },
} as const;
