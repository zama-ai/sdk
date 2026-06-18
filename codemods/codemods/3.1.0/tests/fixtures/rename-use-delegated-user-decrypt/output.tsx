import { useDelegatedDecrypt } from "@zama-fhe/react-sdk";
import type { DelegatedDecryptMutationParams } from "@zama-fhe/react-sdk";

export function Decrypt(params: DelegatedDecryptMutationParams) {
  const { mutate } = useDelegatedDecrypt(params.tokenAddress);
  return <button onClick={() => mutate(params)}>decrypt</button>;
}
