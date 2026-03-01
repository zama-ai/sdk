import { UnshieldForm } from "@/components/unshield-form";
import type { Address } from "@zama-fhe/react-sdk";

const DEFAULT_TOKEN = "0xBA12646CC07ADBe43F8bD25D83FB628D29C8A762" as Address;

export default async function UnshieldPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const token = (params.token as Address) ?? DEFAULT_TOKEN;
  const wrapper = params.wrapper as Address | undefined;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Unshield Tokens</h1>
      <UnshieldForm tokenAddress={token} wrapperAddress={wrapper} />
    </div>
  );
}
