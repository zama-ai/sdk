"use client";

import dynamic from "next/dynamic";
import NextLink from "next/link";
import { CONFIDENTIAL_TOKEN_ADDRESSES, ERC20_TOKENS } from "@/constants";

const TokenTable = dynamic(() => import("@zama-fhe/test-components").then((m) => m.TokenTable), {
  ssr: false,
});

function Link({ to, ...props }: { to: string; className?: string; children: React.ReactNode }) {
  return <NextLink href={to} {...props} />;
}

export function WalletContent() {
  return (
    <TokenTable
      tokenAddresses={CONFIDENTIAL_TOKEN_ADDRESSES}
      erc20Tokens={ERC20_TOKENS}
      LinkComponent={Link}
    />
  );
}
