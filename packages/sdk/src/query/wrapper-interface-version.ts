import {
  ERC7984_WRAPPER_INTERFACE_ID,
  ERC7984_WRAPPER_INTERFACE_ID_LEGACY,
  supportsInterfaceContract,
} from "../contracts";
import { ConfigurationError } from "../errors";
import type { GenericProvider } from "../types";
import { isContractCallError } from "../utils";
import type { Address } from "viem";

export type WrapperInterfaceVersion = "legacy" | "upgraded";

async function safeSupportsInterface(
  provider: GenericProvider,
  wrapperAddress: Address,
  interfaceId: Address,
): Promise<boolean> {
  try {
    return await provider.readContract(supportsInterfaceContract(wrapperAddress, interfaceId));
  } catch (error) {
    if (isContractCallError(error)) {
      return false;
    }
    throw error;
  }
}

export async function detectWrapperInterfaceVersion(
  provider: GenericProvider,
  wrapperAddress: Address,
): Promise<WrapperInterfaceVersion> {
  // Probe the upgraded interface first: it is the target steady state and lets
  // post-upgrade wrappers avoid the legacy ERC-165 read on every refetch.
  const supportsUpgraded = await safeSupportsInterface(
    provider,
    wrapperAddress,
    ERC7984_WRAPPER_INTERFACE_ID,
  );
  if (supportsUpgraded) {
    return "upgraded";
  }

  const supportsLegacy = await safeSupportsInterface(
    provider,
    wrapperAddress,
    ERC7984_WRAPPER_INTERFACE_ID_LEGACY,
  );
  if (supportsLegacy) {
    return "legacy";
  }

  throw new ConfigurationError(
    `Contract ${wrapperAddress} does not support a known ERC7984 wrapper interface`,
  );
}
