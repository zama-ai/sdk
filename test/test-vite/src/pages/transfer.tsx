import type { Address } from "@zama-fhe/sdk";
import { useSearchParams } from "react-router";
import { TransferForm } from "@zama-fhe/test-components";
import { DEFAULTS } from "../constants";

export default function TransferPage() {
  const [searchParams] = useSearchParams();
  const token = (searchParams.get("token") as Address) ?? DEFAULTS.confidentialToken;
  const wrapper = (searchParams.get("wrapper") as Address | undefined) ?? undefined;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Confidential Transfer</h1>
      <TransferForm tokenAddress={token} wrapperAddress={wrapper} />
    </div>
  );
}
