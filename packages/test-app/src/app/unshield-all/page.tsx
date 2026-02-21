"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { UnshieldAllForm } from "@/components/unshield-all-form";
import type { Address } from "@zama-fhe/token-react-sdk";

const DEFAULT_TOKEN = "0xBA12646CC07ADBe43F8bD25D83FB628D29C8A762" as Address; // cUSDT

function UnshieldAllPageContent() {
  const params = useSearchParams();
  const token = (params.get("token") as Address) ?? DEFAULT_TOKEN;
  const wrapper = params.get("wrapper") as Address | undefined;

  return <UnshieldAllForm tokenAddress={token} wrapperAddress={wrapper ?? undefined} />;
}

export default function UnshieldAllPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Unshield All</h1>
      <Suspense>
        <UnshieldAllPageContent />
      </Suspense>
    </div>
  );
}
