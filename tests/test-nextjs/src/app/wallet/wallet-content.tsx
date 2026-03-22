"use client";

import Link from "next/link";
import { TokenTable } from "@zama-fhe/test-components";
import { CONFIDENTIAL_TOKEN_ADDRESSES, ERC20_TOKENS } from "@/constants";

function NextLink({ to, ...props }: { to: string; className?: string; children: React.ReactNode }) {
  return <Link href={to} {...props} />;
}

export function WalletContent() {
  return (
    <TokenTable
      tokenAddresses={CONFIDENTIAL_TOKEN_ADDRESSES}
      erc20Tokens={ERC20_TOKENS}
      LinkComponent={NextLink}
    />
  );
}
