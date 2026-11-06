# Confidential Vault Reference UI — react-vaults

Next.js 16 example app showing the full deposit and withdrawal lifecycle of a confidential vault with `@zama-fhe/react-sdk/vaults`, on Sepolia testnet.

It is the code version of the [Building a vault UI](../../docs/gitbook/src/guides/vaults/building-a-ui.md) guide: every state the guide lists has a view here. The UI is plain HTML with a few lines of CSS, so you can copy the logic into any design system.

Covers: decrypt the balance on click, deposit and withdraw with a disabled reason (no amount, above balance, paused), "queued" after sending, find the account's open batches, and one row per batch with an exhaustive `switch` on its state: cancel while pending, settle a late batch, claim, and take a canceled amount back.

## Stack

- **Next.js 16** (App Router) + **React 19** + **viem v2**
- **TanStack Query v5** for async state
- **@zama-fhe/react-sdk** — `ZamaProvider`, `useConfidentialBalance`, `useGrantPermit`, `useHasPermit`, `useMetadata`
- **@zama-fhe/react-sdk/vaults** — `useDeposit`, `useRedeem`, `usePaused`, `useBatcherTokens`, `useBatchStatus`, `useQuit`, `useClaim`, `useFinalize`
- **@zama-fhe/sdk/vaults** — `BatchState`, `openBatchIds`, `VaultTopics`
- **Next.js relayer proxy** — routes browser relayer requests through `/api/relayer` so API credentials stay server-side

## Setup

```bash
cp .env.example .env.local
# Set the vault's two batcher addresses, and the block the batchers were deployed at.

npm install
npm run dev
```

Open [http://localhost:3006](http://localhost:3006) and connect MetaMask (or any EIP-1193 wallet) on **Sepolia**.

## Environment variables

| Variable                      | Required | Description                                                                         |
| ----------------------------- | -------- | ----------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_DEPOSIT_BATCHER` | Yes      | The vault's deposit batcher.                                                        |
| `NEXT_PUBLIC_REDEEM_BATCHER`  | Yes      | The vault's redeem batcher.                                                         |
| `NEXT_PUBLIC_FROM_BLOCK`      | No       | Block the batchers were deployed at. The batch list reads events from here.         |
| `NEXT_PUBLIC_SEPOLIA_RPC_URL` | No       | Sepolia RPC override. Defaults to the public PublicNode endpoint.                   |
| `RELAYER_URL`                 | No       | Relayer base URL, no `/v2` suffix. Defaults to `https://relayer.testnet.zama.org`.  |
| `RELAYER_API_KEY`             | No       | API key added as `x-api-key` header by the proxy. Not required for Sepolia testnet. |

## Where to look

| File                                                           | What it shows                                                                                                                                                                |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`src/components/VaultForm.tsx`](src/components/VaultForm.tsx) | The form: the vault's tokens from `useBatcherTokens`, decrypt on click, the disabled reason, the wallet and transaction steps while sending, and "queued" after it is mined. |
| [`src/lib/open-batches.ts`](src/lib/open-batches.ts)           | The account's open batches: the batcher's `Joined`, `Claimed` and `Quit` events passed to `openBatchIds`, plus the ids deposits just returned.                               |
| [`src/components/BatchList.tsx`](src/components/BatchList.tsx) | One row per batch: `useBatchStatus` and an exhaustive `switch` on `status.state`, with a countdown that ticks locally.                                                       |
| [`src/lib/config.ts`](src/lib/config.ts)                       | The vault addresses and `FINALIZE_AFTER_SECONDS`, the delay after which a dispatched batch offers to settle it.                                                              |

The batch list reads events from the chain so the example needs no backend. Public RPCs often cap the block range of `eth_getLogs`; a production app should keep the batch ids in its backend or an indexer instead.
