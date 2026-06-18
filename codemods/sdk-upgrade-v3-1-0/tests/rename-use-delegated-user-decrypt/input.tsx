import { useDelegatedUserDecrypt } from "@zama-fhe/react-sdk";
import type { DelegatedUserDecryptMutationParams } from "@zama-fhe/react-sdk";

export function Decrypt(params: DelegatedUserDecryptMutationParams) {
  const { mutate } = useDelegatedUserDecrypt(params.tokenAddress);
  return <button onClick={() => mutate(params)}>decrypt</button>;
}
