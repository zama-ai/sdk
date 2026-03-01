import { Link } from "react-router";
import { TokenTable } from "@zama-fhe/test-components";
import { CONFIDENTIAL_TOKEN_ADDRESSES, ERC20_TOKENS } from "../constants";

export function WalletPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Wallet</h1>
      <TokenTable
        tokenAddresses={CONFIDENTIAL_TOKEN_ADDRESSES}
        erc20Tokens={ERC20_TOKENS}
        LinkComponent={Link}
      />
    </div>
  );
}
