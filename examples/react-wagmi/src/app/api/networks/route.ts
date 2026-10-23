import { enabledNetworks } from "@/lib/relayers";

// Read env at request time, not build time, so a deployment can enable a network by
// setting its relayer URL without rebuilding.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ enabled: enabledNetworks() });
}
