"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AuthorizeAllPanel } from "@/components/authorize-all-panel";
import type { Address } from "@zama-fhe/token-react-sdk";

const DEFAULTS = {
  tokens: [
    "0xBA12646CC07ADBe43F8bD25D83FB628D29C8A762", // cUSDT
    "0x3B02fF1e626Ed7a8fd6eC5299e2C54e1421B626B", // cUSDC
  ] as Address[],
};

function AuthorizeAllContent() {
  const params = useSearchParams();
  const tokensParam = params.get("tokens");
  const tokens = tokensParam ? (tokensParam.split(",") as Address[]) : DEFAULTS.tokens;

  return <AuthorizeAllPanel tokenAddresses={tokens} />;
}

export default function AuthorizeAllPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Authorize All</h1>
      <Suspense>
        <AuthorizeAllContent />
      </Suspense>
    </div>
  );
}
