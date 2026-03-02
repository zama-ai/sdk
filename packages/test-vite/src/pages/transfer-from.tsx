import type { Address } from "@zama-fhe/react-sdk";
import { useSearchParams } from "react-router";
import { TransferFromForm } from "@zama-fhe/test-components";
import { DEFAULTS } from "../constants";

export default function TransferFromPage() {
  const [searchParams] = useSearchParams();
  const token = (searchParams.get("token") as Address) ?? DEFAULTS.confidentialToken;
  const from = (searchParams.get("from") as Address | undefined) ?? undefined;
  const wrapper = (searchParams.get("wrapper") as Address | undefined) ?? undefined;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Transfer From (Operator)</h1>
      <TransferFromForm tokenAddress={token} defaultFrom={from} wrapperAddress={wrapper} />
    </div>
  );
}
