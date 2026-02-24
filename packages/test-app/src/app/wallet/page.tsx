import { TokenTable } from "@/components/token-table";
import type { Address } from "@zama-fhe/react-sdk";

const CONFIDENTIAL_TOKEN_ADDRESSES: Address[] = [
  "0xBA12646CC07ADBe43F8bD25D83FB628D29C8A762", // cUSDT
  "0x3B02fF1e626Ed7a8fd6eC5299e2C54e1421B626B", // cUSDC
];

const ERC20_TOKENS: { address: Address; wrapper: Address }[] = [
  {
    address: "0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6", // USDT
    wrapper: "0xBA12646CC07ADBe43F8bD25D83FB628D29C8A762", // cUSDT
  },
  {
    address: "0xa513E6E4b8f2a923D98304ec87F64353C4D5C853", // ERC20 (USDC)
    wrapper: "0x3B02fF1e626Ed7a8fd6eC5299e2C54e1421B626B", // cUSDC
  },
];

export default function WalletPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Wallet</h1>
      <TokenTable tokenAddresses={CONFIDENTIAL_TOKEN_ADDRESSES} erc20Tokens={ERC20_TOKENS} />
    </div>
  );
}
