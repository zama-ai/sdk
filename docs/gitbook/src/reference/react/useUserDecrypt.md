---
title: useUserDecrypt
description: Query hook that automatically decrypts FHE handles once credentials are available via useAllow.
---

# useUserDecrypt

Query hook for user decryption. Automatically fires when credentials are available (acquired via [`useAllow`](/reference/react/useAllow)) and handles are provided. Checks the persistent decrypt cache first and only hits the relayer for uncached handles.

{% hint style="info" %}
**This is the recommended way to decrypt.** For token balances, prefer [`useConfidentialBalance`](/reference/react/useConfidentialBalance) which decrypts automatically with two-phase polling. Use `useUserDecrypt` when your smart contract uses FHE types directly (e.g. a confidential voting contract, a sealed-bid auction, or any non-token contract).
{% endhint %}

## Import

```ts
import { useUserDecrypt } from "@zama-fhe/react-sdk";
```

## Usage

{% tabs %}
{% tab title="component.tsx" %}

```tsx
import { useAllow, useUserDecrypt } from "@zama-fhe/react-sdk";

function DecryptHandle() {
  const { mutate: allow, isPending: isAllowing } = useAllow();
  const { data, isPending } = useUserDecrypt({
    handles: [
      {
        handle: "0xhandle...",
        contractAddress: "0xYourContract",
      },
    ],
  });

  return (
    <section>
      {/* Step 1: Authorize decryption (one-time wallet signature) */}
      <button onClick={() => allow(["0xYourContract"])} disabled={isAllowing}>
        {isAllowing ? "Signing..." : "Authorize"}
      </button>

      {/* Step 2: Decrypted values appear automatically */}
      {isPending && <p>Decrypting...</p>}
      {data && <output>Value: {Object.values(data)[0]?.toString()}</output>}
    </section>
  );
}
```

{% endtab %}
{% endtabs %}

## Parameters

```ts
import { type UseUserDecryptConfig } from "@zama-fhe/react-sdk";
```

### handles

`DecryptHandle[]`

Array of handles to decrypt. Each entry pairs an encrypted handle with the address of the contract that owns it. Only handles not yet in the SDK's persistent decrypt cache are sent for decryption — cached handles are returned immediately, even after a page reload.

```ts
import { type DecryptHandle } from "@zama-fhe/react-sdk";
```

| Field             | Type      | Description                                            |
| ----------------- | --------- | ------------------------------------------------------ |
| `handle`          | `Handle`  | The encrypted handle (hex string) to decrypt.          |
| `contractAddress` | `Address` | Address of the contract that owns the encrypted value. |

Handles from different contracts can be mixed in a single call — `useUserDecrypt` automatically groups them by contract address and issues one decryption request per unique contract:

```tsx
const { data } = useUserDecrypt({
  handles: [
    { handle: "0xhandle1...", contractAddress: "0xContractA" },
    { handle: "0xhandle2...", contractAddress: "0xContractA" },
    { handle: "0xhandle3...", contractAddress: "0xContractB" },
  ],
});

// data: { "0xhandle1...": 500n, "0xhandle2...": 200n, "0xhandle3...": 1000n }
```

{% hint style="warning" %}
**All contract addresses must be authorized first.** Call `useAllow` with every contract address present in `handles` before the query will fire. If any contract is missing from the `allow()` call, the query stays disabled to avoid unexpected wallet prompts.
{% endhint %}

### query

`{ enabled?: boolean } | undefined`

Pass `{ enabled: false }` to disable the query.

## Return Type

Returns a standard `useQuery` result. `data` resolves to `Record<Handle, ClearValueType>` — a map from each handle to its decrypted plaintext value (`bigint`, `boolean`, or `string`).

When all requested handles are already cached, `data` contains the cached values immediately (no relayer call). Freshly decrypted results are written to the SDK's persistent decrypt cache (`sdk.cache`) — scoped by `(signer, contract, handle)` — so that subsequent renders return instantly, even after a page reload. The cache is cleared automatically on `revoke()`, `revokeSession()`, or wallet lifecycle events (disconnect, account change, chain change).

{% include ".gitbook/includes/query-result.md" %}

## How It Works

`useUserDecrypt` chains three internal queries:

1. **Signer address** — resolves the connected wallet address.
2. **isAllowed** — checks that cached credentials cover all contract addresses in `handles`. Returns `false` until `useAllow` has been called with those contracts.
3. **Decrypt** — calls `sdk.decrypt(handles)` which checks the persistent cache, then hits the relayer for any uncached handles.

The decrypt query only fires when steps 1 and 2 succeed. This ensures no wallet signature popup is triggered by the query itself — all signing happens explicitly via `useAllow`.

## Credential Caching

`useUserDecrypt` relies on credentials acquired via [`useAllow`](/reference/react/useAllow):

- **First `allow()` call** — generates a new FHE keypair, creates EIP-712 typed data, and requests a wallet signature. The credentials are then cached.
- **Subsequent queries** — reuse the cached credentials if they are still valid (not expired).
- **Expiry** — credentials expire after `keypairTTL` seconds (default: 2592000 = 30 days, configurable via SDK config). Once expired, call `allow()` again to generate fresh credentials.

This means users only see a wallet signature prompt once per session (or per TTL window), even if they decrypt multiple times.

## Related

- [`useAllow`](/reference/react/useAllow) — pre-authorize contracts with one wallet signature (required before `useUserDecrypt` fires)
- [`useIsAllowed`](/reference/react/useIsAllowed) — check whether credentials are cached and cover specific contracts
- [`useConfidentialBalance`](/reference/react/useConfidentialBalance) — high-level hook that decrypts token balances automatically with two-phase polling
- [`useEncrypt`](/reference/react/useEncrypt) — reverse operation, encrypt a plaintext value for on-chain submission
- [Encrypt & Decrypt guide](/guides/encrypt-decrypt) — full walkthrough with end-to-end examples
