import type { Auth } from "@zama-fhe/relayer-sdk/bundle";
import type { EIP1193Provider } from "viem";
import { z } from "zod";
import {
  checksummedAddress,
  evmAddress,
  chainId,
  hex,
  positiveSeconds,
} from "../schemas/primitives";

export const FheChainSchema = z
  .object({
    id: chainId,
    gatewayChainId: chainId,
    relayerUrl: z.string(),
    network: z.union([z.string(), z.custom<EIP1193Provider>()]),
    aclContractAddress: evmAddress,
    kmsContractAddress: evmAddress,
    inputVerifierContractAddress: evmAddress,
    verifyingContractAddressDecryption: evmAddress,
    verifyingContractAddressInputVerification: evmAddress,
    registryAddress: evmAddress.or(z.undefined()),
    executorAddress: evmAddress.optional(),
    auth: z.custom<Auth>().optional(),
    kmsSignerPrivateKey: hex.optional(),
    inputSignerPrivateKey: hex.optional(),
  })
  .loose();

/** Per-chain wrappers-registry address overrides. */
export const RegistryAddressesSchema = z.record(
  z.string().regex(/^\d+$/, "expected numeric chain id key"),
  checksummedAddress,
);

/** TTL (seconds) for cached registry results. */
export const RegistryTTLSchema = positiveSeconds;
