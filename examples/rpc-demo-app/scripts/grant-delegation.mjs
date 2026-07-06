// One-time setup utility, not part of the running app: grants this demo's
// wallet's decrypt-delegation to confidential-indexer's operational address, so
// HistoryCard/DelegationStatusBadge have something to show. Uses @zama-fhe/sdk
// directly (a devDependency here, never imported by the app itself — see
// src/lib/config.ts).
//
// Usage:
//   HOLDER_PK=0x... DELEGATE_ADDRESS=0x... node scripts/grant-delegation.mjs
//
// DELEGATE_ADDRESS is confidential-indexer's operational (delegate) address,
// printed in its own startup log ("Operational (delegate) address: 0x...").
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia as viemSepolia } from "viem/chains";
import { MemoryStorage, ZamaSDK } from "@zama-fhe/sdk";
import { sepolia } from "@zama-fhe/sdk/chains";
import { createConfig } from "@zama-fhe/sdk/viem";
import { node } from "@zama-fhe/sdk/node";

const RPC_URL = process.env.RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
const CUSDC = "0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639";
const HOLDER_PK = process.env.HOLDER_PK;
const DELEGATE_ADDRESS = process.env.DELEGATE_ADDRESS;

if (!HOLDER_PK || !DELEGATE_ADDRESS) {
  console.error("Usage: HOLDER_PK=0x... DELEGATE_ADDRESS=0x... node scripts/grant-delegation.mjs");
  process.exit(1);
}

const zamaChain = { ...sepolia, network: RPC_URL };
const account = privateKeyToAccount(HOLDER_PK);
const transport = http(RPC_URL);
const publicClient = createPublicClient({ chain: viemSepolia, transport });
const walletClient = createWalletClient({ account, chain: viemSepolia, transport });

const sdk = new ZamaSDK(
  createConfig({
    chains: [zamaChain],
    publicClient,
    walletClient,
    storage: new MemoryStorage(),
    relayers: { [zamaChain.id]: node() },
  }),
);

// No expirationDate: defaults to permanent (uint64.max) — this is a durable demo
// asset, not a disposable test delegation.
console.log(
  `Granting a permanent delegation from ${account.address} to ${DELEGATE_ADDRESS} on ${CUSDC}...`,
);
const result = await sdk.delegations.delegateDecryption({
  contractAddress: CUSDC,
  delegateAddress: DELEGATE_ADDRESS,
});
console.log("Done:", result);
