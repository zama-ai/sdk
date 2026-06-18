---
title: Wallet & exchange integration
description: How wallets and exchanges support ERC-7984 confidential tokens with the Zama SDK — display balances, build transfers, manage operators, and wrap/unwrap between ERC-20 and confidential form.
---

# Wallet & exchange integration

This guide is for wallet developers, dApp developers, and exchanges who want to support confidential tokens on the Zama Protocol. It covers ERC-7984 wallet flows (showing decrypted balances, sending transfers with encrypted inputs), the Confidential Token Wrappers Registry, and wrapping/unwrapping between ERC-20 and ERC-7984.

By the end of this guide, you will be able to:

- Initialize the Zama SDK in a wallet, browser app, or backend.
- Display ERC-7984 confidential balances by user-decrypting on the user's behalf.
- Build ERC-7984 transfers using encrypted inputs.
- Discover wrapped token pairs via the Wrappers Registry.
- Implement wrap and unwrap flows between ERC-20 and ERC-7984.

## Core concepts

While building support for [ERC-7984 confidential tokens](https://eips.ethereum.org/EIPS/eip-7984) you will encounter the following terminology. For a deeper architectural overview, see [Architecture](../concepts/architecture.md).

- **FHEVM** — Zama's library for computations on encrypted values. Each **encrypted value** is represented on-chain as a `bytes32` reference (also called a "handle" in Solidity / FHE.sol).
- **Host chain** — the EVM network your users connect to (e.g. Ethereum mainnet, Sepolia).
- **Gateway chain** — Zama's L3 chain that coordinates encryptions and decryptions.
- **Relayer** — off-chain service that registers encrypted inputs, coordinates decryptions, and returns results. Wallets and dApps talk to the Relayer via the Zama SDK.
- **ACL** — access control for encrypted values. Contracts grant per-address permissions so a user can read data they should have access to.
- **Native confidential token** — an ERC-7984 token where balances and transfer amounts are encrypted by default. Not derived from an underlying ERC-20.
- **Wrapped confidential token** — a standard ERC-20 wrapped into ERC-7984 form via a wrapper contract. The underlying ERC-20 is unchanged.
- **Confidential Token Wrappers Registry** — on-chain registry mapping ERC-20s to their ERC-7984 wrappers.

## Integration at a glance

You do **not** need to run FHE infrastructure to integrate. Wallets and exchanges interact with the protocol entirely through the Zama SDK:

1. Install and configure `@zama-fhe/sdk` (or `@zama-fhe/react-sdk` for React apps). See [Quick start](./quick-start.md) for stack-by-stack setup.
2. Initialize a `ZamaSDK` instance with a relayer, signer, and storage. See the [`ZamaSDK` reference](../reference/sdk/ZamaSDK.md).
3. For each confidential token contract, build a `Token` handle via `sdk.createToken(address)`.
4. Read encrypted balances, build transfers, and manage operators using the `Token` API or React hooks.

## What wallets and exchanges should support

- **Transfers**: Support the ERC-7984 transfer variants documented by OpenZeppelin, including forms that use an input proof and optional receiver callbacks. The SDK's [`Token.confidentialTransfer`](../reference/sdk/Token.md) and [`useConfidentialTransfer`](../reference/react/useConfidentialTransfer.md) handle the encrypted input pipeline for you. See [Transfer privately](../guides/transfer-privately.md).
- **Operators**: Operators can move any amount during an active window. UX must capture an expiry, show risk clearly, and make revoke easy. See [Operator approvals](../guides/operator-approvals.md).
- **Events and metadata**: Names and symbols behave like conventional ERC-20s, but on-chain amounts remain encrypted. Render user-specific amounts only after user-decrypting them.

## Display confidential balances

Balances are stored on-chain as encrypted values. To display one, the user authorizes the wallet's session via an EIP-712 signature, after which the SDK performs **user decryption** to obtain the cleartext value. The session signature is cached, so subsequent decryptions for authorized contracts complete without prompting.

{% hint style="warning" %}
**Don't trigger the first signature automatically.** Gate the initial EIP-712 prompt behind an explicit user action — a "View balance" or "Authorize" button — so users opt into the wallet popup instead of being surprised by it. Once the session is cached, balance reads in other components decrypt silently.
{% endhint %}

{% tabs %}
{% tab title="SDK" %}

```ts
import { ZamaSDK } from "@zama-fhe/sdk";

const sdk = new ZamaSDK(config); // config from createConfig()
const token = sdk.createToken("0xConfidentialToken");

// First call prompts the wallet for an EIP-712 session signature;
// invoke it from a user action, not on app start.
const [owner] = await walletClient.getAddresses();
const balance = await token.balanceOf(owner); // connected wallet
const peer = await token.balanceOf("0xUserAddr"); // explicit holder
```

{% endtab %}
{% tab title="React" %}

```tsx
import { useGrantPermit, useHasPermit, useConfidentialBalance } from "@zama-fhe/react-sdk";
import { useAccount } from "wagmi";

const TOKEN = "0xConfidentialToken" as const;

function Balance() {
  const { address } = useAccount();
  const { mutate: grantPermit, isPending: isGranting } = useGrantPermit();
  const { data: hasPermit } = useHasPermit({ contractAddresses: [TOKEN] });

  const { data, isPending, error } = useConfidentialBalance(
    { address: TOKEN, account: address },
    { enabled: !!hasPermit },
  );

  if (!hasPermit) {
    return (
      <button onClick={() => grantPermit([TOKEN])} disabled={isGranting}>
        {isGranting ? "Signing…" : "View balance"}
      </button>
    );
  }
  if (isPending) return <span>Decrypting…</span>;
  if (error) return <span>{error.message}</span>;
  return <span>{data?.toString()}</span>;
}
```

{% endtab %}
{% endtabs %}

A common pattern is to call `useGrantPermit` once when the user first connects (covering every confidential contract you'll touch), then read balances anywhere in the app without further prompts. Credentials persist in IndexedDB and survive page reloads. See [Encrypt & decrypt](../guides/encrypt-decrypt.md) for the full pre-authorization pattern, and [Check balances](../guides/check-balances.md) for batch decryption across multiple tokens.

## Send a confidential transfer

Amounts are encrypted client-side before submission. The SDK builds the input proof, registers it with the relayer, and submits the transaction.

{% tabs %}
{% tab title="SDK" %}

```ts
const { txHash, receipt } = await token.confidentialTransfer("0xRecipient", 500n);
```

{% endtab %}
{% tab title="React" %}

```tsx
import { useConfidentialTransfer } from "@zama-fhe/react-sdk";

const { mutate, isPending } = useConfidentialTransfer({ address: tokenAddress });
mutate({ to: "0xRecipient", amount: 500n });
```

{% endtab %}
{% endtabs %}

For operator transfers (`transferFrom`-style with delegated authority), see [`useConfidentialTransferFrom`](../reference/react/useConfidentialTransferFrom.md) and [Operator approvals](../guides/operator-approvals.md).

## Wrapping and unwrapping

Wrapped confidential tokens let users convert standard ERC-20s into ERC-7984 form. Once wrapped, balances and transfer amounts are encrypted on-chain. The underlying ERC-20 is unchanged and recoverable by unwrapping.

### Fungibility framing for exchanges

A wrapped confidential token should be treated as **fungible with its underlying ERC-20** from the user's perspective. A user who deposits USDT and a user who deposits cUSDT are depositing the same underlying asset; the exchange handles wrap/unwrap internally.

Common flows:

- **User deposits ERC-20** (e.g. USDT): exchange wraps to confidential form (cUSDT) if needed for on-chain operations.
- **User deposits confidential token** (e.g. cUSDT): no wrapping needed; credit the same underlying balance.
- **User withdraws as ERC-20**: exchange unwraps and sends standard ERC-20.
- **User withdraws as confidential token**: exchange sends the confidential token directly.

In all cases, the user sees a single unified balance for the underlying asset.

### Shield (wrap)

`WrappedToken.shield` wraps a standard ERC-20 into its ERC-7984 form. The SDK handles the wrapping flow internally — using `transferAndCall` for ERC-1363 underlyings (one transaction) or `approve` + `wrap` for everything else (two transactions) — plus decimal conversion. The encrypted balance lands in the recipient's address (defaulting to the connected wallet). See [Shielding paths](../guides/shield-tokens.md#shielding-paths) for which currently-wrapped tokens use which path.

{% tabs %}
{% tab title="SDK" %}

```ts
const wrappedToken = sdk.createWrappedToken(confidentialTokenAddress);

// Exact-amount approval (default)
await wrappedToken.shield(1000n);

// Custom recipient (e.g. exchange's hot wallet)
await wrappedToken.shield(1000n, { to: "0xExchangeWallet" });

// Skip approval if you've already approved the wrapper
await wrappedToken.shield(1000n, { approvalStrategy: "skip" });
```

{% endtab %}
{% tab title="React" %}

```tsx
import { useShield } from "@zama-fhe/react-sdk";

const { mutate, isPending } = useShield({ address: confidentialTokenAddress });
mutate({ amount: 1000n });
```

{% endtab %}
{% endtabs %}

See [Shield tokens](../guides/shield-tokens.md) for the full options surface, including custom approval strategies and progress callbacks.

### Unshield (unwrap)

Unwrapping is a **two-step asynchronous process** at the contract level: an unwrap request burns the encrypted amount, then a finalize call sends the cleartext amount of underlying ERC-20 once the gateway has publicly decrypted it. `WrappedToken.unshield` does both steps in one SDK call, including waiting for the decryption proof.

{% tabs %}
{% tab title="SDK" %}

```ts
const wrappedToken = sdk.createWrappedToken(confidentialTokenAddress);

const { txHash, receipt } = await wrappedToken.unshield(500n);

// Track each phase for UI updates
await wrappedToken.unshield(500n, {
  onUnwrapSubmitted: (h) => updateUI("Unwrap submitted…"),
  onFinalizing: () => updateUI("Waiting for decryption proof…"),
  onFinalizeSubmitted: (h) => updateUI("Unshield complete!"),
});

// Drain the entire balance
await wrappedToken.unshieldAll();
```

{% endtab %}
{% tab title="React" %}

```tsx
import { useUnshield, useUnshieldAll } from "@zama-fhe/react-sdk";

const { mutate } = useUnshield(confidentialTokenAddress);
mutate({ amount: 500n });
```

{% endtab %}
{% endtabs %}

If the user closes the page between unwrap and finalize, resume with `WrappedToken.resumeUnshield` / [`useResumeUnshield`](../reference/react/useResumeUnshield.md). See [Unshield tokens](../guides/unshield-tokens.md) for the full flow.

### Decimal conversion in your UI

Wrappers enforce a maximum of **6 decimals** on the confidential side. When wrapping a higher-precision underlying (e.g. 18-decimal tokens), amounts are rounded down and excess underlying is refunded to the caller.

| Underlying decimals | Wrapper decimals | Conversion rate | Effect                                  |
| ------------------- | ---------------- | --------------- | --------------------------------------- |
| 18                  | 6                | 10^12           | 1 wrapper unit = 10^12 underlying units |
| 6                   | 6                | 1               | 1:1                                     |
| 2                   | 2                | 1               | 1:1                                     |

Display balances in the underlying asset's decimals when possible — your users think in USDT, not cUSDT-with-6-decimals. The wrapper's `decimals()` and `rate()` views are exposed via the underlying contract for UI conversions.

## Discover wrapped tokens via the Registry

The Confidential Token Wrappers Registry is an on-chain contract that maps ERC-20s to their ERC-7984 wrappers. It's the canonical directory for wallets and exchanges to discover which underlying tokens have official confidential wrappers.

The SDK exposes it via `sdk.registry`. See the [`WrappersRegistry` reference](../reference/sdk/WrappersRegistry.md) for the full surface.

{% hint style="warning" %}
**Always check validity.** A non-zero wrapper address may have been revoked. Treat `isValid: false` as no wrapper for that token.
{% endhint %}

### Look up a wrapper for an ERC-20

{% tabs %}
{% tab title="SDK" %}

```ts
const result = await sdk.registry.getConfidentialToken("0xUSDC");
if (result?.isValid) {
  const cUsdc = sdk.createWrappedToken(result.confidentialTokenAddress);
}
```

{% endtab %}
{% tab title="React" %}

```tsx
import { useConfidentialTokenAddress } from "@zama-fhe/react-sdk";

const { data } = useConfidentialTokenAddress({ tokenAddress: "0xUSDC" });
// data: readonly [isValid: boolean, confidentialTokenAddress: Address]
```

{% endtab %}
{% endtabs %}

### Reverse lookup (confidential → underlying)

{% tabs %}
{% tab title="SDK" %}

```ts
const result = await sdk.registry.getUnderlyingToken("0xConfidentialToken");
```

{% endtab %}
{% tab title="React" %}

```tsx
import { useTokenAddress } from "@zama-fhe/react-sdk";

const { data } = useTokenAddress({ confidentialTokenAddress });
```

{% endtab %}
{% endtabs %}

### List all registered pairs (paginated)

{% tabs %}
{% tab title="SDK" %}

```ts
const page = await sdk.registry.listPairs({
  page: 1,
  pageSize: 20,
  metadata: true, // include name/symbol/decimals/totalSupply
});
for (const pair of page.items) {
  console.log(pair.underlying.symbol, "→", pair.confidential.symbol);
}
```

{% endtab %}
{% tab title="React" %}

```tsx
import { useListPairs } from "@zama-fhe/react-sdk";

const { data } = useListPairs({ page: 1, pageSize: 20, metadata: true });
```

{% endtab %}
{% endtabs %}

### Currently registered tokens

The following wrapped confidential tokens are registered on Ethereum mainnet:

| Confidential token | Address                                                                                                                 |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| cUSDC              | [`0xe978F22157048E5DB8E5d07971376e86671672B2`](https://etherscan.io/address/0xe978F22157048E5DB8E5d07971376e86671672B2) |
| cUSDT              | [`0xAe0207C757Aa2B4019Ad96edD0092ddc63EF0c50`](https://etherscan.io/address/0xAe0207C757Aa2B4019Ad96edD0092ddc63EF0c50) |
| cWETH              | [`0xda9396b82634Ea99243cE51258B6A5Ae512D4893`](https://etherscan.io/address/0xda9396b82634Ea99243cE51258B6A5Ae512D4893) |
| cBRON              | [`0x85dE671c3bec1aDeD752c3Cea943521181C826bc`](https://etherscan.io/address/0x85dE671c3bec1aDeD752c3Cea943521181C826bc) |
| cZAMA              | [`0x80CB147Fd86dC6dEe3Eee7e4Cee33d1397d98071`](https://etherscan.io/address/0x80CB147Fd86dC6dEe3Eee7e4Cee33d1397d98071) |
| cTGBP              | [`0xa873750ccbafd5ec7dd13bfd5237d7129832edd9`](https://etherscan.io/address/0xa873750ccbafd5ec7dd13bfd5237d7129832edd9) |

Look up the underlying ERC-20 for each via `sdk.registry.getUnderlyingToken(address)`.

## End-to-end example

For a runnable React dApp using these APIs end-to-end, follow [Build your first confidential dApp](./first-confidential-dapp.md).

## UI and UX recommendations

- **Caching**: Decrypted values are cached client-side for the session lifetime. Offer a refresh action that repeats the decrypt flow.
- **Permissions**: Treat user decryption as a permission grant with scope and duration. Show which contracts are included and when access expires. The SDK's permit model is described in [Permit model](../concepts/permit-model.md).
- **Indicators**: Use distinct icons or badges for encrypted amounts. Avoid showing zero when a value is simply undisclosed.
- **Operator visibility**: Always show current operator approvals with expiry and a one-tap revoke. See [`useConfidentialIsOperator`](../reference/react/useConfidentialIsOperator.md) and [`useRevokePermits`](../reference/react/useRevokePermits.md).
- **Wrapping/unwrapping**: Clearly indicate which token a user is converting between. Show the underlying ERC-20's name and symbol alongside the confidential token.
- **Failure modes**: Differentiate between decryption denied, missing ACL grant, and expired session. Offer guided recovery actions. See [Handle errors](../guides/handle-errors.md).

## Testing and environments

- For local development against a Hardhat chain with no relayer, use [`RelayerCleartext`](../reference/sdk/RelayerCleartext.md). See [Local development](../guides/local-development.md).
- For testnet, use the SDK's built-in Sepolia config or any other supported network — see [Network presets](../reference/sdk/network-presets.md).
- Keep chain selection in a single source of truth in your app.

## Further reading

- [OpenZeppelin Confidential Contracts documentation](https://docs.openzeppelin.com/confidential-contracts) — ERC-7984 transfer variants, receiver callbacks, and operator semantics.
- [`Token` reference](../reference/sdk/Token.md) — full method surface for shield, unshield, transfer, approve, and balance operations.
- [`WrappersRegistry` reference](../reference/sdk/WrappersRegistry.md) — registry construction, caching, and pagination.
- [Architecture](../concepts/architecture.md) — how the SDK, relayer, and gateway fit together.
