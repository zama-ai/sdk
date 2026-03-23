export const SEPOLIA_CHAIN_ID = 11155111;
export const SEPOLIA_CHAIN_ID_HEX = `0x${SEPOLIA_CHAIN_ID.toString(16)}`; // "0xaa36a7"
export const SEPOLIA_EXPLORER_URL = "https://sepolia.etherscan.io";
const SEPOLIA_RPC_DEFAULT = "https://ethereum-sepolia-rpc.publicnode.com";
export const SEPOLIA_RPC_URL = process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL ?? SEPOLIA_RPC_DEFAULT;
