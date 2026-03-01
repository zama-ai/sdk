import type { Address } from "@zama-fhe/react-sdk";
import { useSearchParams } from "react-router";
import { TransferFromForm } from "../components/transfer-from-form";
import { DEFAULTS } from "../constants";

export function TransferFromPage() {
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
