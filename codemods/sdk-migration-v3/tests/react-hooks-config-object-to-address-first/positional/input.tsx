import { useUnshield, useFinalizeUnwrap, useToken } from "@zama-fhe/react-sdk";
import type { Address } from "viem";

export function Panel({ token }: { token: Address }) {
  const t = useToken({ tokenAddress: token });
  const unshield = useUnshield({ tokenAddress: token, wrapperAddress: token });
  const finalize = useFinalizeUnwrap({ tokenAddress: token }, { gcTime: 0 });
  return { t, unshield, finalize };
}
