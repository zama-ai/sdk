"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { TransferForm } from "@/components/transfer-form";
import type { Address } from "@zama-fhe/token-react-sdk";

const DEFAULT_TOKEN = "0xBA12646CC07ADBe43F8bD25D83FB628D29C8A762" as Address;

function TransferPageContent() {
  const params = useSearchParams();
  const token = (params.get("token") as Address) ?? DEFAULT_TOKEN;
  const wrapper = params.get("wrapper") as Address | undefined;

  return <TransferForm tokenAddress={token} wrapperAddress={wrapper ?? undefined} />;
}

export default function TransferPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Confidential Transfer</h1>
      <Suspense>
        <TransferPageContent />
      </Suspense>
    </div>
  );
}
