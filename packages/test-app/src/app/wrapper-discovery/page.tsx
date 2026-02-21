"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { WrapperDiscoveryPanel } from "@/components/wrapper-discovery-panel";
import type { Address } from "@zama-fhe/token-react-sdk";

function WrapperDiscoveryContent() {
  const params = useSearchParams();
  const token = params.get("token") as Address | undefined;
  const coordinator = params.get("coordinator") as Address | undefined;

  if (!token) return <p>Missing ?token= query param</p>;

  return <WrapperDiscoveryPanel tokenAddress={token} coordinatorAddress={coordinator} />;
}

export default function WrapperDiscoveryPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Wrapper Discovery</h1>
      <Suspense>
        <WrapperDiscoveryContent />
      </Suspense>
    </div>
  );
}
