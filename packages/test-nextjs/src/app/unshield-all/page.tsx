import { UnshieldAllForm } from "@zama-fhe/test-components";
import type { Address } from "@zama-fhe/react-sdk";
import { CONTRACTS } from "@/constants";

export default async function UnshieldAllPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const token = (params.token as Address) ?? CONTRACTS.confidentialToken;
  const wrapper = params.wrapper as Address | undefined;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Unshield All</h1>
      <UnshieldAllForm tokenAddress={token} wrapperAddress={wrapper} />
    </div>
  );
}
