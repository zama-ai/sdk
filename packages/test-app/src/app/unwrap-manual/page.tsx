"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { UnwrapManualForm } from "@/components/unwrap-manual-form";
import type { Address } from "@zama-fhe/token-react-sdk";

const DEFAULT_TOKEN = "0xBA12646CC07ADBe43F8bD25D83FB628D29C8A762" as Address; // cUSDT

function UnwrapManualPageContent() {
  const params = useSearchParams();
  const token = (params.get("token") as Address) ?? DEFAULT_TOKEN;
  const wrapper = params.get("wrapper") as Address | undefined;

  return <UnwrapManualForm tokenAddress={token} wrapperAddress={wrapper ?? undefined} />;
}

export default function UnwrapManualPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Manual Unwrap (Two-Step)</h1>
      <Suspense>
        <UnwrapManualPageContent />
      </Suspense>
    </div>
  );
}
