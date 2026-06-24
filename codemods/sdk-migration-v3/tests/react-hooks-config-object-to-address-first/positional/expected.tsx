import { useUnshield, useFinalizeUnwrap, useToken } from "@zama-fhe/react-sdk";
import type { Address } from "viem";

export function Panel({ token }: { token: Address }) {
  const t = useToken(token);
  const unshield = useUnshield(token);
  const finalize = useFinalizeUnwrap(token, { gcTime: 0 });
  return { t, unshield, finalize };
}
