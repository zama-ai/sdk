import { ConfigurationError } from "../errors";
import type { FhevmRelayerOptions } from "../relayer/types";
import type { FheChain } from "./types";

/**
 * Translates the SDK's public {@link FheChain.auth} shape (discriminated by
 * `__type`) into the `type`-discriminated `auth` that `@fhevm/sdk` expects, for
 * both per-request relayer options and the process-global runtime config.
 *
 * @throws if the auth discriminator is not one of the supported kinds.
 */
export function toFhevmAuth(
  auth: NonNullable<FheChain["auth"]>,
): NonNullable<FhevmRelayerOptions["auth"]> {
  const type = auth["__type"];
  switch (type) {
    case "ApiKeyHeader":
      return { type, value: auth.value, header: auth.header };
    case "ApiKeyCookie":
      return { type, value: auth.value, cookie: auth.cookie };
    case "BearerToken":
      return { type, token: auth.token };
    default:
      throw new ConfigurationError(`Unknown auth type: ${String(type)}`);
  }
}
