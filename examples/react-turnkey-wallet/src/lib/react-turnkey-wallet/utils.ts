import { parseUnits, type Address, type Hex } from "viem";
import { explorerUrl } from "@/lib/config";

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

export const MINT_ABI = [
  {
    type: "function",
    name: "mint",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

export function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function txLink(hash: string): string {
  return `${explorerUrl}/tx/${hash}`;
}

export function parseAmountSafe(value: string, decimals: number): bigint | null {
  try {
    if (!value || isNaN(Number(value)) || Number(value) <= 0) return null;
    return parseUnits(value, decimals);
  } catch {
    return null;
  }
}

export type MutationLike = {
  isSuccess: boolean;
  isError: boolean;
  error: Error | null;
  data?: unknown;
};

export type PendingUnshieldResolver = () => void | Promise<void>;

export type UnshieldHashLike = Hex | null;
