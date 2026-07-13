import { CONTRACTS } from "@/constants";
import { EncryptPanel } from "@zama-fhe/test-components";
import { getAddress } from "viem";

export default async function EncryptPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const token = getAddress(params.token ?? CONTRACTS.cUSDT);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Encrypt</h1>
      <EncryptPanel tokenAddress={token} />
    </div>
  );
}
