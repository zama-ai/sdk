import { createPublicClient, http, zeroAddress, type Address } from "viem";
import { sepolia } from "viem/chains";

// Use || not ?? — Next.js replaces an unset NEXT_PUBLIC_* with "" at build time, not undefined.
export const SEPOLIA_RPC_URL =
  process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";

export const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(SEPOLIA_RPC_URL),
});

// The vault this app shows. Each NEXT_PUBLIC_* name is spelled out so Next.js inlines it.
export const VAULT = {
  depositBatcher: (process.env.NEXT_PUBLIC_DEPOSIT_BATCHER || zeroAddress) as Address,
  redeemBatcher: (process.env.NEXT_PUBLIC_REDEEM_BATCHER || zeroAddress) as Address,
};
/** The confidential token users deposit (the vault's asset). */
export const ASSET_TOKEN = (process.env.NEXT_PUBLIC_ASSET_TOKEN || zeroAddress) as Address;
/** The confidential token users hold after claiming a deposit (the vault's shares). */
export const SHARE_TOKEN = (process.env.NEXT_PUBLIC_SHARE_TOKEN || zeroAddress) as Address;
/** The block the batchers were deployed at: the batch list reads their events from here. */
export const FROM_BLOCK = BigInt(process.env.NEXT_PUBLIC_FROM_BLOCK || "0");

export const IS_CONFIGURED = ![
  VAULT.depositBatcher,
  VAULT.redeemBatcher,
  ASSET_TOKEN,
  SHARE_TOKEN,
].includes(zeroAddress);

// A keeper normally settles a dispatched batch. After this long, offer the user to settle it.
export const FINALIZE_AFTER_SECONDS = 15 * 60;
