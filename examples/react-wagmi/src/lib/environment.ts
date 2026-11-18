// ─── Zama environments ─────────────────────────────────────────────────────────
// The network table is the "default" environment: the protocol deployments the SDK ships
// presets for. NEXT_PUBLIC_ZAMA_ENV=custom adds a "custom" one: another Zama deployment on
// the same chains, for example a pre-release one the SDK ships no preset for. It differs only
// on Sepolia, whose protocol contracts and gateway come from the NEXT_PUBLIC_ZAMA_* variables
// (see .env.example). An environment is a version of the networks, not a network of its own,
// so the table keeps one row per chain and the SDK gets one config per environment.
import type { Address } from "@zama-fhe/sdk";
import type { FheChain } from "@zama-fhe/sdk/chains";
import { isAddress } from "viem";
import { networks, type NetworkKey } from "@/lib/networks";

export const ENVIRONMENTS = ["default", "custom"] as const;
export type Environment = (typeof ENVIRONMENTS)[number];

function customEnvValue(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`NEXT_PUBLIC_ZAMA_ENV=custom requires ${name} to be set in .env.local`);
  }
  return value;
}

// A wrong address would only show up later as a failed read or a rejected signature, so the
// values are checked when the module loads. Mixed-case addresses must carry a valid checksum.
function customEnvAddress(name: string, value: string | undefined): Address {
  const address = customEnvValue(name, value);
  if (!isAddress(address)) {
    throw new Error(`NEXT_PUBLIC_ZAMA_ENV=custom: ${name} is not a valid address: ${address}`);
  }
  return address;
}

function customEnvChainId(name: string, value: string | undefined): number {
  const raw = customEnvValue(name, value);
  const chainId = Number(raw);
  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    throw new Error(`NEXT_PUBLIC_ZAMA_ENV=custom: ${name} must be a positive integer: ${raw}`);
  }
  return chainId;
}

// Next.js inlines NEXT_PUBLIC_* variables only where they are referenced literally, so each
// one is spelled out here rather than looked up by name.
function customSepolia(): FheChain {
  return {
    ...networks.sepolia.fhe,
    gatewayChainId: customEnvChainId(
      "NEXT_PUBLIC_ZAMA_GATEWAY_CHAIN_ID",
      process.env.NEXT_PUBLIC_ZAMA_GATEWAY_CHAIN_ID,
    ),
    aclContractAddress: customEnvAddress(
      "NEXT_PUBLIC_ZAMA_ACL_ADDRESS",
      process.env.NEXT_PUBLIC_ZAMA_ACL_ADDRESS,
    ),
    kmsContractAddress: customEnvAddress(
      "NEXT_PUBLIC_ZAMA_KMS_VERIFIER_ADDRESS",
      process.env.NEXT_PUBLIC_ZAMA_KMS_VERIFIER_ADDRESS,
    ),
    inputVerifierContractAddress: customEnvAddress(
      "NEXT_PUBLIC_ZAMA_INPUT_VERIFIER_ADDRESS",
      process.env.NEXT_PUBLIC_ZAMA_INPUT_VERIFIER_ADDRESS,
    ),
    verifyingContractAddressDecryption: customEnvAddress(
      "NEXT_PUBLIC_ZAMA_DECRYPTION_ADDRESS",
      process.env.NEXT_PUBLIC_ZAMA_DECRYPTION_ADDRESS,
    ),
    verifyingContractAddressInputVerification: customEnvAddress(
      "NEXT_PUBLIC_ZAMA_INPUT_VERIFICATION_ADDRESS",
      process.env.NEXT_PUBLIC_ZAMA_INPUT_VERIFICATION_ADDRESS,
    ),
    // Required: left unset, Sepolia's preset registry would list its tokens against this
    // environment's contracts.
    registryAddress: customEnvAddress(
      "NEXT_PUBLIC_REGISTRY_ADDRESS",
      process.env.NEXT_PUBLIC_REGISTRY_ADDRESS,
    ),
  };
}

/** The networks the custom environment changes. Empty unless NEXT_PUBLIC_ZAMA_ENV=custom. */
export const customNetworks: Partial<Record<NetworkKey, FheChain>> =
  process.env.NEXT_PUBLIC_ZAMA_ENV === "custom" ? { sepolia: customSepolia() } : {};

/** Whether the custom environment changes this network. */
export function isCustomized(key: NetworkKey): boolean {
  return key in customNetworks;
}

/**
 * A network in an environment: its table key, suffixed where the custom environment changes
 * it. Names its relayer proxy route and its network picker option.
 */
export function networkId(key: NetworkKey, env: Environment): string {
  return env === "custom" && isCustomized(key) ? `${key}-custom` : key;
}

/** The network's protocol config in an environment. */
export function fheFor(key: NetworkKey, env: Environment): FheChain {
  return (env === "custom" && customNetworks[key]) || networks[key].fhe;
}

export function labelFor(key: NetworkKey, env: Environment): string {
  const { label } = networks[key];
  return networkId(key, env) === key ? label : `${label} · Custom environment`;
}
