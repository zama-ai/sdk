import { ConfigurationError, type FheChainAuth } from "@zama-fhe/sdk";
import type { ChainAuth } from "./generated/zama/sdk/v1alpha1/sidecar.js";

export function chainAuth(value: ChainAuth): FheChainAuth {
  switch (value.credential?.$case) {
    case "bearerToken":
      return { __type: "BearerToken", token: value.credential.bearerToken };
    case "apiKeyHeader":
      return {
        __type: "ApiKeyHeader",
        ...defined({ header: value.credential.apiKeyHeader.name }),
        value: value.credential.apiKeyHeader.value,
      };
    case "apiKeyCookie":
      return {
        __type: "ApiKeyCookie",
        ...defined({ cookie: value.credential.apiKeyCookie.name }),
        value: value.credential.apiKeyCookie.value,
      };
    default:
      throw new ConfigurationError("Chain authentication requires a credential.");
  }
}

export function decodeOptional<T, R>(value: T | undefined, decode: (value: T) => R): R | undefined {
  return value === undefined ? undefined : decode(value);
}

export function defined<T extends object>(value: T): Partial<T> {
  const result: Partial<T> = { ...value };
  for (const key in result) {
    if (result[key] === undefined) {
      delete result[key];
    }
  }
  return result;
}
