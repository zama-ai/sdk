"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ApproveForm } from "@/components/approve-form";
import type { Address } from "@zama-fhe/token-react-sdk";

const DEFAULT_TOKEN = "0xBA12646CC07ADBe43F8bD25D83FB628D29C8A762" as Address; // cUSDT

function ApprovePageContent() {
  const params = useSearchParams();
  const token = (params.get("token") as Address) ?? DEFAULT_TOKEN;
  const spender = params.get("spender") as Address | undefined;

  return <ApproveForm tokenAddress={token} defaultSpender={spender ?? undefined} />;
}

export default function ApprovePage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Approve Operator</h1>
      <Suspense>
        <ApprovePageContent />
      </Suspense>
    </div>
  );
}
