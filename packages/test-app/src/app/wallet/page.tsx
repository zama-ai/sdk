"use client";

import { TokenTable } from "@/components/token-table";
import type { Address } from "@zama-fhe/token-react-sdk";

// These addresses match the Hardhat deployment from zaiffer-smart-contracts
const TOKEN_ADDRESSES: Address[] = [
  "0xBA12646CC07ADBe43F8bD25D83FB628D29C8A762", // cUSDT
  "0x3B02fF1e626Ed7a8fd6eC5299e2C54e1421B626B", // cUSDC
];

export default function WalletPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Wallet</h1>
      <TokenTable tokenAddresses={TOKEN_ADDRESSES} />
    </div>
  );
}
