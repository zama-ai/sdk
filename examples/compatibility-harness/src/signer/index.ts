/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  INTEGRATOR ENTRY POINT — replace this with your own signer implementation.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * This file exports a single `signer` object that satisfies the `Signer`
 * interface (see ./types.ts). All validation tests use this object — nothing
 * else needs to change.
 *
 * The default implementation below uses a plain EOA derived from PRIVATE_KEY.
 * Replace it entirely with your custody / MPC / hardware wallet adapter.
 *
 * ── Pre-built adapters ───────────────────────────────────────────────────────
 *
 *   Crossmint MPC wallet:
 *     cp examples/crossmint/signer.ts src/signer/index.ts
 *     # then set CROSSMINT_API_KEY and CROSSMINT_WALLET_LOCATOR in .env
 *
 * ── Example: EOA via viem wallet client ──────────────────────────────────────
 *
 *   import { walletClient } from "./your-client.js";
 *
 *   export const signer: Signer = {
 *     address: walletClient.account.address,
 *     signTypedData: (data) => walletClient.signTypedData(data),
 *     signTransaction: (tx)  => walletClient.signTransaction(tx),
 *   };
 *
 * ── Example: MPC / custody adapter (pseudo-code) ─────────────────────────────
 *
 *   // signTransaction is optional — MPC wallets use writeContract instead.
 *   export const signer: Signer = {
 *     address: await provider.getAddress(),
 *     signTypedData: (data)   => provider.signTypedData(data),
 *     writeContract: (config) => provider.executeContract(config),
 *   };
 *
 *   // If address resolution is async, also export a `ready` promise.
 *   // The harness awaits it automatically before the first test runs.
 *   export const ready: Promise<void> = provider.init();
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * NOTE: PRIVATE_KEY below is only required for THIS default EOA implementation.
 * It is NOT needed when you replace this file with an MPC/custody adapter.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Signer } from "./types.js";
import { networkConfig } from "../config/network.js";

// TODO: Replace this with your own signer implementation.

const rawKey = process.env.PRIVATE_KEY ?? "";
const isValidKey = /^0x[0-9a-fA-F]{64}$/.test(rawKey);

if (!rawKey || !isValidKey) {
  throw new Error(
    rawKey
      ? `PRIVATE_KEY is invalid (got "${rawKey.slice(0, 6)}…"). ` +
          "Expected a 0x-prefixed 64-character hex string (32 bytes)."
      : "PRIVATE_KEY is not set. Copy .env.example to .env and fill in your private key.",
  );
}

const account = privateKeyToAccount(rawKey as `0x${string}`);

const walletClient = createWalletClient({
  account,
  chain: networkConfig.chain,
  transport: http(networkConfig.rpcUrl),
});

export const signer: Signer = {
  address: account.address,

  signTypedData: (data) =>
    walletClient.signTypedData({
      account,
      domain: data.domain,
      types: data.types,
      primaryType: data.primaryType,
      message: data.message,
    }),

  signTransaction: (tx) =>
    walletClient.signTransaction({
      account,
      ...tx,
    }),
};
