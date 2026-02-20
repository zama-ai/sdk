/**
 * Query key factories for confidential balance queries.
 * Use with queryClient.invalidateQueries / resetQueries / removeQueries.
 */
export const confidentialBalanceQueryKeys = {
  all: ["confidentialBalance"] as const,
  token: (tokenAddress: string) =>
    ["confidentialBalance", tokenAddress] as const,
  owner: (tokenAddress: string, owner: string) =>
    ["confidentialBalance", tokenAddress, owner] as const,
} as const;

export const confidentialBalancesQueryKeys = {
  all: ["confidentialBalances"] as const,
  tokens: (tokenAddresses: string[], owner: string) =>
    ["confidentialBalances", tokenAddresses, owner] as const,
} as const;

export const confidentialHandleQueryKeys = {
  all: ["confidentialHandle"] as const,
  token: (tokenAddress: string) =>
    ["confidentialHandle", tokenAddress] as const,
  owner: (tokenAddress: string, owner: string) =>
    ["confidentialHandle", tokenAddress, owner] as const,
} as const;

export const confidentialHandlesQueryKeys = {
  all: ["confidentialHandles"] as const,
  tokens: (tokenAddresses: string[], owner: string) =>
    ["confidentialHandles", tokenAddresses, owner] as const,
} as const;
