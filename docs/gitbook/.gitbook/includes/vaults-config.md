{% code title="vaults.ts" %}

```ts
import { defineVault, defineVaultGroup } from "@zama-fhe/sdk/vaults";

export const ALPHA = defineVault({
  id: "alpha",
  chainId: 1,
  batchers: { deposit: "0xAlphaDeposit", redeem: "0xAlphaRedeem" },
});

export const BETA = defineVault({
  id: "beta",
  chainId: 1,
  batchers: { deposit: "0xBetaDeposit", redeem: "0xBetaRedeem" },
});

export const STABLE = defineVaultGroup({ id: "stable", vaults: [ALPHA, BETA] });
```

{% endcode %}
