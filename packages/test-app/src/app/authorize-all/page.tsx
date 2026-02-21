import { AuthorizeAllPanel } from "@/components/authorize-all-panel";
import type { Address } from "@zama-fhe/token-react-sdk";

const DEFAULTS = {
  tokens: [
    "0xBA12646CC07ADBe43F8bD25D83FB628D29C8A762", // cUSDT
    "0x3B02fF1e626Ed7a8fd6eC5299e2C54e1421B626B", // cUSDC
  ] as Address[],
};

export default async function AuthorizeAllPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const tokensParam = params.tokens;
  const tokens = tokensParam ? (tokensParam.split(",") as Address[]) : DEFAULTS.tokens;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Authorize All</h1>
      <AuthorizeAllPanel tokenAddresses={tokens} />
    </div>
  );
}
