"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ShieldForm } from "@/components/shield-form";
import type { Address } from "@zama-fhe/token-react-sdk";

const DEFAULTS = {
  token: "0x610178dA211FEF7D417bC0e6FeD39F05609AD788" as Address, // USDT
  wrapper: "0xBA12646CC07ADBe43F8bD25D83FB628D29C8A762" as Address, // cUSDT
};

function ShieldPageContent() {
  const params = useSearchParams();
  const token = (params.get("token") as Address) ?? DEFAULTS.token;
  const wrapper = (params.get("wrapper") as Address) ?? DEFAULTS.wrapper;

  return <ShieldForm tokenAddress={token} wrapperAddress={wrapper} />;
}

export default function ShieldPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Shield Tokens</h1>
      <Suspense>
        <ShieldPageContent />
      </Suspense>
    </div>
  );
}
