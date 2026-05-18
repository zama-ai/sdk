# Sepolia Confidential Token Quickstart — react-wagmi clear signing

Next.js 16 example app for testing app-level clear-signing intents with
`@zama-fhe/react-sdk`, wagmi v3, and an injected wallet such as Rabby or
MetaMask on Sepolia.

This app is copied from `examples/react-wagmi` and adds:

1. `Preview intent` buttons for decrypt authorization, shield, confidential
   transfer, unshield, and delegate decryption.
2. A clear-signing console showing human-readable intent text and raw JSON.
3. Runtime intent capture through `onClearSigningIntent` while the operation is
   being executed.

This app is still an app-level preview, not wallet-native ERC-7730 rendering.
The repository now includes experimental ERC-7730 descriptor drafts under
`docs/clear-signing/erc7730/`, but Rabby/MetaMask/Ledger rendering depends on
whether the connected wallet resolves those descriptors from a trusted source.

## Stack

- **Next.js 16** (App Router, Webpack — Turbopack not yet supported with WASM)
- **React 19** + **wagmi v3** + **viem v2**
- **TanStack Query v5** for async state
- **@zama-fhe/react-sdk** and **@zama-fhe/sdk** from the local workspace
- **@zama-fhe/sdk/web** browser FHE worker transport through `/api/relayer`

## Setup

Build the local SDK packages first:

```bash
pnpm build
```

Then run the example:

```bash
cp examples/react-wagmi-clear-signing/.env.example examples/react-wagmi-clear-signing/.env.local
pnpm --filter react-wagmi-clear-signing-example dev
```

Open [http://localhost:3000](http://localhost:3000), connect Rabby/MetaMask on
Sepolia, select a token, then use `Preview intent` before executing an action.

## Environment variables

| Variable                      | Required | Description                                                                                 |
| ----------------------------- | -------- | ------------------------------------------------------------------------------------------- |
| `RELAYER_URL`                 | No       | Relayer base URL incl. API version path. Defaults to `https://relayer.testnet.zama.org/v2`. |
| `RELAYER_API_KEY`             | No       | API key added as `x-api-key` header by the proxy. Not required for Sepolia testnet.         |
| `NEXT_PUBLIC_SEPOLIA_RPC_URL` | No       | Sepolia RPC override. Defaults to the public PublicNode endpoint.                           |

## Testing notes

- `Preview intent` generates a pre-execution intent from SDK/React hooks.
- `Execute` runs the normal SDK flow and captures runtime intents just before
  signature or transaction submission.
- For unshield, runtime capture can produce two intents: `unwrap` and
  `finalizeUnwrap`.
- ERC-7730 descriptor drafts live in `docs/clear-signing/erc7730/`. They are
  useful for review and eventual registry submission, but they are not loaded by
  this app at runtime.
