---
title: useIsConfidentialTokenValid
description: Check whether a confidential token is registered and valid in the on-chain registry.
---

# useIsConfidentialTokenValid

Checks whether a confidential token address is registered and valid in the on-chain `ConfidentialTokenWrappersRegistry`. Use this to verify a token before performing operations like shielding or transfers.

## Import

```ts
import { useIsConfidentialTokenValid } from "@zama-fhe/react-sdk";
```

## Usage

{% tabs %}
{% tab title="ValidityCheck.tsx" %}

```tsx
import { useIsConfidentialTokenValid } from "@zama-fhe/react-sdk";

function ValidityCheck({ confidentialTokenAddress }: { confidentialTokenAddress: `0x${string}` }) {
  const {
    data: isValid,
    isLoading,
    error,
  } = useIsConfidentialTokenValid({
    confidentialTokenAddress,
  });

  if (isLoading) return <p>Checking...</p>;
  if (error) return <p>Error: {error.message}</p>;

  return (
    <p>
      {confidentialTokenAddress} is {isValid ? "a valid registered wrapper" : "not a valid wrapper"}
    </p>
  );
}
```

{% endtab %}
{% endtabs %}

## Parameters

### confidentialTokenAddress

`Address | undefined`

The confidential token address to validate. Pass `undefined` to disable the query.

```ts
useIsConfidentialTokenValid({ confidentialTokenAddress: "0xcUSDC" });
```

## Return Type

The `data` field resolves to `boolean`:

- `true` -- the token is a known, valid wrapper in the registry
- `false` -- the token is not registered or not valid

{% include "../../.gitbook/includes/query-result.md" %}

## Related

- [useConfidentialTokenAddress](/reference/react/useConfidentialTokenAddress) -- look up the wrapper for an ERC-20
- [useTokenAddress](/reference/react/useTokenAddress) -- reverse lookup (confidential &rarr; plain)
- [WrappersRegistry](/reference/sdk/WrappersRegistry) -- SDK-level `isConfidentialTokenValid()` method
