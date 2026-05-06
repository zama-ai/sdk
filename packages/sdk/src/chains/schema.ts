import type { Auth } from "@zama-fhe/relayer-sdk/bundle";
import type { EIP1193Provider } from "viem";
import { z } from "zod";
import { address, chainId, hex, positiveSeconds } from "../schemas/primitives";

const eip1193Provider = z.custom<EIP1193Provider>(
  (v) =>
    typeof v === "object" &&
    v !== null &&
    typeof (v as { request?: unknown }).request === "function",
  "expected an EIP-1193 provider with a `request` function",
);

// Untyped passthrough — the relayer-sdk owns the Auth shape.
const auth = z.custom<Auth>((v) => v !== null && typeof v === "object", "expected an Auth object");

export const FheChainSchema = z
  .object({
    id: chainId,
    gatewayChainId: chainId,
    // Empty string is allowed: cleartext-mode chains (hardhat, hoodi) leave it blank.
    relayerUrl: z.string(),
    network: z.union([z.string(), eip1193Provider]),
    aclContractAddress: address,
    kmsContractAddress: address,
    inputVerifierContractAddress: address,
    verifyingContractAddressDecryption: address,
    verifyingContractAddressInputVerification: address,
    // Required key, value may be undefined (e.g. hardhat).
    registryAddress: address.or(z.undefined()),
    // Optional key — chains using real FHE infra omit it entirely.
    executorAddress: address.optional(),
    auth: auth.optional(),
    kmsSignerPrivateKey: hex.optional(),
    inputSignerPrivateKey: hex.optional(),
  })
  .loose();

/** Per-chain wrappers-registry address overrides. */
export const RegistryAddressesSchema = z.record(
  z.string().regex(/^\d+$/, "expected numeric chain id key"),
  address,
);

/** TTL (seconds) for cached registry results. */
export const RegistryTTLSchema = positiveSeconds;
