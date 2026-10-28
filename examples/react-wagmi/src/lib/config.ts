// ─── Sepolia network configuration ────────────────────────────────────────────
// Edit these values to target a different network.
import { defineChain } from "viem";
import { sepolia as viemSepolia } from "viem/chains";
import { sepolia as fheSepolia, type FheChain } from "@zama-fhe/sdk/chains";

export const SEPOLIA_CHAIN_ID = 11155111;
const SEPOLIA_RPC_DEFAULT = "https://ethereum-sepolia-rpc.publicnode.com";
// Use || not ?? — Next.js replaces unset NEXT_PUBLIC_* variables with an empty string
// at build time, not undefined. The nullish coalescing operator (??) treats "" as a
// valid value and would use it as the RPC URL, causing a runtime error.
export const SEPOLIA_RPC_URL = process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL || SEPOLIA_RPC_DEFAULT;

// Extends viem's stock Sepolia definition instead of redefining it. The RPC override
// also feeds the wallet's "add network" prompt.
export const sepolia = defineChain({
  ...viemSepolia,
  rpcUrls: { default: { http: [SEPOLIA_RPC_URL] } },
  blockExplorers: {
    default: {
      name: "Blockscout",
      url: "https://eth-sepolia.blockscout.com",
      apiUrl: "https://eth-sepolia.blockscout.com/api",
    },
  },
});

export const SEPOLIA_EXPLORER_URL = sepolia.blockExplorers.default.url;

// ─── Zama protocol environment ─────────────────────────────────────────────────
// Every environment here runs on the same host chain (Sepolia, chain ID 11155111). What
// differs is the set of Zama protocol contracts, the gateway chain and the relayer. So the
// environment is a build-time choice (NEXT_PUBLIC_ZAMA_ENV), not a second wallet network.
//
// - testnet (default): the public Zama testnet — the `sepolia` preset shipped with the SDK.
// - custom: a Zama environment you configure yourself (for example a pre-release one),
//   entirely through the NEXT_PUBLIC_ZAMA_* variables in .env.local — see .env.example.
export type ZamaEnv = "testnet" | "custom";
export const ZAMA_ENV: ZamaEnv =
  process.env.NEXT_PUBLIC_ZAMA_ENV === "custom" ? "custom" : "testnet";

type Address = `0x${string}`;

function customEnvValue(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`NEXT_PUBLIC_ZAMA_ENV=custom requires ${name} to be set in .env.local`);
  }
  return value;
}

// Next.js inlines NEXT_PUBLIC_* variables only where they are referenced literally, so each
// one is spelled out here rather than looked up by name.
const customSepolia: FheChain | undefined =
  ZAMA_ENV === "custom"
    ? {
        id: SEPOLIA_CHAIN_ID,
        gatewayChainId: Number(
          customEnvValue(
            "NEXT_PUBLIC_ZAMA_GATEWAY_CHAIN_ID",
            process.env.NEXT_PUBLIC_ZAMA_GATEWAY_CHAIN_ID,
          ),
        ),
        relayerUrl: customEnvValue(
          "NEXT_PUBLIC_ZAMA_RELAYER_URL",
          process.env.NEXT_PUBLIC_ZAMA_RELAYER_URL,
        ),
        network: SEPOLIA_RPC_URL,
        aclContractAddress: customEnvValue(
          "NEXT_PUBLIC_ZAMA_ACL_ADDRESS",
          process.env.NEXT_PUBLIC_ZAMA_ACL_ADDRESS,
        ) as Address,
        kmsContractAddress: customEnvValue(
          "NEXT_PUBLIC_ZAMA_KMS_VERIFIER_ADDRESS",
          process.env.NEXT_PUBLIC_ZAMA_KMS_VERIFIER_ADDRESS,
        ) as Address,
        inputVerifierContractAddress: customEnvValue(
          "NEXT_PUBLIC_ZAMA_INPUT_VERIFIER_ADDRESS",
          process.env.NEXT_PUBLIC_ZAMA_INPUT_VERIFIER_ADDRESS,
        ) as Address,
        verifyingContractAddressDecryption: customEnvValue(
          "NEXT_PUBLIC_ZAMA_DECRYPTION_ADDRESS",
          process.env.NEXT_PUBLIC_ZAMA_DECRYPTION_ADDRESS,
        ) as Address,
        verifyingContractAddressInputVerification: customEnvValue(
          "NEXT_PUBLIC_ZAMA_INPUT_VERIFICATION_ADDRESS",
          process.env.NEXT_PUBLIC_ZAMA_INPUT_VERIFICATION_ADDRESS,
        ) as Address,
        // Optional: needed for unified (V2) decryption permits on protocol v0.14+.
        protocolConfigContractAddress:
          (process.env.NEXT_PUBLIC_ZAMA_PROTOCOL_CONFIG_ADDRESS as Address | undefined) ||
          undefined,
        registryAddress: undefined,
      }
    : undefined;

/** Public relayer for the selected environment. The server-side proxy defaults to this too. */
export const RELAYER_URL_DEFAULT = (customSepolia ?? fheSepolia).relayerUrl;

// A custom environment usually has no ConfidentialTokenWrappersRegistry deployment, so wrapper
// pairs and a registry must be deployed by hand and the registry address passed in.
// The same override works on testnet to point the app at a custom registry.
const REGISTRY_ADDRESS_OVERRIDE = process.env.NEXT_PUBLIC_REGISTRY_ADDRESS as Address | undefined;

/** Zama protocol chain for the selected environment (relayer URL is rewritten in providers.tsx). */
export const fheChain: FheChain = {
  ...(customSepolia ?? fheSepolia),
  ...(REGISTRY_ADDRESS_OVERRIDE ? { registryAddress: REGISTRY_ADDRESS_OVERRIDE } : {}),
};

// ─── ConfidentialVault example (confidentialTransferAndCall demo) ───────────────
// A minimal confidential escrow deployed on Sepolia. A deposit moves confidential
// tokens into the vault in a single `confidentialTransferAndCall`; the `data`
// payload names the beneficiary to credit. Bound to one confidential token
// (cUSDC) at deployment — the vault cards only render when that token is selected.
// See contracts/src/ConfidentialVault.sol and contracts/script/DeployVault.s.sol.
export const VAULT_ADDRESS = (process.env.NEXT_PUBLIC_VAULT_ADDRESS ||
  "0xb13720bec167A576D715F5aA7C7d68b3dB0A4Ad7") as `0x${string}`;
export const VAULT_CONFIDENTIAL_TOKEN = (process.env.NEXT_PUBLIC_VAULT_CONFIDENTIAL_TOKEN ||
  "0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639") as `0x${string}`;
