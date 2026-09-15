import type { ZamaSDKOptions } from "@zama-fhe/sdk";
import type { DerivationSecret } from "./generated/zama/sdk/v1alpha1/sidecar.js";

export function sdkInstanceOptions(secret: DerivationSecret | undefined): ZamaSDKOptions {
  if (secret === undefined) {
    return {};
  }
  const value = secret.value;
  return { transportKeyPairDerivationSecret: value?.$case === "text" ? value.text : value?.bytes };
}
