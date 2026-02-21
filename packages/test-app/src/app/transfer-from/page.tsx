"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { TransferFromForm } from "@/components/transfer-from-form";
import type { Address } from "@zama-fhe/token-react-sdk";

const DEFAULT_TOKEN = "0xBA12646CC07ADBe43F8bD25D83FB628D29C8A762" as Address; // cUSDT

function TransferFromPageContent() {
  const params = useSearchParams();
  const token = (params.get("token") as Address) ?? DEFAULT_TOKEN;
  const from = params.get("from") as Address | undefined;
  const wrapper = params.get("wrapper") as Address | undefined;

  return (
    <TransferFromForm
      tokenAddress={token}
      defaultFrom={from ?? undefined}
      wrapperAddress={wrapper ?? undefined}
    />
  );
}

export default function TransferFromPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Transfer From (Operator)</h1>
      <Suspense>
        <TransferFromPageContent />
      </Suspense>
    </div>
  );
}
