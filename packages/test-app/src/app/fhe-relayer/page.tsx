"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { FheRelayerPanel } from "@/components/fhe-relayer-panel";
import type { Address } from "@zama-fhe/token-react-sdk";

const DEFAULT_TOKEN = "0xBA12646CC07ADBe43F8bD25D83FB628D29C8A762" as Address; // cUSDT

function FheRelayerContent() {
  const params = useSearchParams();
  const tokensParam = params.get("tokens");
  const tokens = tokensParam ? (tokensParam.split(",") as Address[]) : [DEFAULT_TOKEN];

  return <FheRelayerPanel tokenAddresses={tokens} />;
}

export default function FheRelayerPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">FHE Relayer</h1>
      <Suspense>
        <FheRelayerContent />
      </Suspense>
    </div>
  );
}
