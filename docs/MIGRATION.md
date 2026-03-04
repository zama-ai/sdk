# React SDK Query Refactor Migration Guide

This guide covers the breaking changes introduced by the React hooks refactor that moved query/mutation factories to `@zama-fhe/sdk/query` and standardized query key generation.

## 1. Import Path Changes

Factories now live in `@zama-fhe/sdk/query` (and are also re-exported by `@zama-fhe/react-sdk`).

```ts
// BEFORE
import { shieldMutationOptions } from "@zama-fhe/react-sdk";

// AFTER (canonical source)
import { shieldMutationOptions } from "@zama-fhe/sdk/query";

// AFTER (still valid through react-sdk re-export)
import { shieldMutationOptions } from "@zama-fhe/react-sdk";
```

## 2. Per-Domain Key Factories -> `zamaQueryKeys`

Old domain-specific key helpers were removed. Use `zamaQueryKeys`.

```ts
// BEFORE
import { confidentialBalanceQueryKeys } from "@zama-fhe/react-sdk";

const tokenKey = confidentialBalanceQueryKeys.token(tokenAddress);
const ownerKey = confidentialBalanceQueryKeys.owner(tokenAddress, owner, handle);

// AFTER
import { zamaQueryKeys } from "@zama-fhe/react-sdk";

const tokenKey = zamaQueryKeys.confidentialBalance.token(tokenAddress);
const ownerKey = zamaQueryKeys.confidentialBalance.owner(tokenAddress, owner, handle);
```

## 3. Query Key Shape Changes (Flat -> Namespaced 2-Tuples)

The query key shape changed from flat arrays to namespaced keys with object payloads.

| Domain                 | Before                                                   | After                                                                         |
| ---------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------- |
| confidentialBalance    | `["confidentialBalance", tokenAddress, owner, handle]`   | `["zama.confidentialBalance", { tokenAddress, owner, handle? }]`              |
| confidentialHandle     | `["confidentialHandle", tokenAddress, owner]`            | `["zama.confidentialHandle", { tokenAddress, owner }]`                        |
| confidentialHandles    | `["confidentialHandles", tokenAddresses, owner]`         | `["zama.confidentialHandles", { tokenAddresses, owner }]`                     |
| confidentialBalances   | `["confidentialBalances", tokenAddresses, owner]`        | `["zama.confidentialBalances", { tokenAddresses, owner }]`                    |
| tokenMetadata          | `["tokenMetadata", tokenAddress]`                        | `["zama.tokenMetadata", { tokenAddress }]`                                    |
| isConfidential         | `["isConfidential", tokenAddress]`                       | `["zama.isConfidential", { tokenAddress }]`                                   |
| isWrapper              | `["isWrapper", tokenAddress]`                            | `["zama.isWrapper", { tokenAddress }]`                                        |
| totalSupply            | `["totalSupply", tokenAddress]`                          | `["zama.totalSupply", { tokenAddress }]`                                      |
| wrapperDiscovery       | `["wrapperDiscovery", tokenAddress, coordinatorAddress]` | `["zama.wrapperDiscovery", { tokenAddress }]`                                 |
| underlyingAllowance    | `["underlyingAllowance", tokenAddress, wrapperAddress]`  | `["zama.underlyingAllowance", { tokenAddress }]`                              |
| confidentialIsApproved | `["confidentialIsApproved", tokenAddress, spender]`      | `["zama.confidentialIsApproved", { tokenAddress }]`                           |
| fees (shield)          | `["shieldFee", feeManagerAddress, amount, from, to]`     | `["zama.fees", { type: "shield", feeManagerAddress, amount?, from?, to? }]`   |
| fees (unshield)        | `["unshieldFee", feeManagerAddress, amount, from, to]`   | `["zama.fees", { type: "unshield", feeManagerAddress, amount?, from?, to? }]` |
| fees (batchTransfer)   | `["batchTransferFee", feeManagerAddress]`                | `["zama.fees", { type: "batchTransfer", feeManagerAddress }]`                 |
| fees (feeRecipient)    | `["feeRecipient", feeManagerAddress]`                    | `["zama.fees", { type: "feeRecipient", feeManagerAddress }]`                  |
| publicKey              | `["publicKey"]`                                          | `["zama.publicKey"]`                                                          |
| publicParams           | `["publicParams", bits]`                                 | `["zama.publicParams", { bits }]`                                             |
| activityFeed           | `["activityFeed", tokenAddress, userAddress, logsKey]`   | `["zama.activityFeed", { tokenAddress, userAddress, logsKey, decrypt }]`      |
| signerAddress          | `["zama", "signer-address", tokenAddress]`               | `["zama.signerAddress", { tokenAddress }]`                                    |

Mutation keys remain flat (for example `["shield", tokenAddress]`, `["authorizeAll"]`).

## 4. `authorizeAll` Mutation Variables Shape

`useAuthorizeAll().mutate(...)` now expects an object.

```ts
// BEFORE
const authorizeAll = useAuthorizeAll();
authorizeAll.mutate(["0xToken1", "0xToken2"]);

// AFTER
const authorizeAll = useAuthorizeAll();
authorizeAll.mutate({ tokenAddresses: ["0xToken1", "0xToken2"] });
```

## 5. Removed Exports and Replacements

- `confidentialBalanceQueryKeys` -> `zamaQueryKeys.confidentialBalance`
- `confidentialHandleQueryKeys` -> `zamaQueryKeys.confidentialHandle`
- `confidentialHandlesQueryKeys` -> `zamaQueryKeys.confidentialHandles`
- `confidentialBalancesQueryKeys` -> `zamaQueryKeys.confidentialBalances`
- `feeQueryKeys` -> `zamaQueryKeys.fees`
- `wagmiBalancePredicates` -> `invalidateWagmiBalanceQueries(queryClient)`

## 6. `hashFn` Requirement for `useQuery`

Query keys now include object payloads. Always pass `queryKeyHashFn: hashFn` in query hooks.

```ts
import { useQuery } from "@tanstack/react-query";
import { hashFn, tokenMetadataQueryOptions } from "@zama-fhe/sdk/query";

const query = useQuery({
  ...tokenMetadataQueryOptions(signer, tokenAddress),
  queryKeyHashFn: hashFn,
});
```

## 7. Factory Signature Changes (Decoupled Factories)

Most metadata/state query factories were decoupled from Token instances and now take `signer + tokenAddress`.

```ts
// BEFORE
tokenMetadataQueryOptions(token);

// AFTER
tokenMetadataQueryOptions(signer, tokenAddress, config);
```

This decoupled signature pattern applies to:

- `tokenMetadataQueryOptions`
- `isConfidentialQueryOptions`
- `isWrapperQueryOptions`
- `totalSupplyQueryOptions`
- `wrapperDiscoveryQueryOptions`
- `underlyingAllowanceQueryOptions`
- `confidentialIsApprovedQueryOptions`
- `shieldFeeQueryOptions`
- `unshieldFeeQueryOptions`
- `batchTransferFeeQueryOptions`
- `feeRecipientQueryOptions`

Token-coupled factories (for example `confidentialBalanceQueryOptions`, `activityFeedQueryOptions`, and mutation factories) still accept `token` as the first argument.
