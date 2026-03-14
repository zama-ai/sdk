import type { EIP712TypedData } from "./relayer-sdk.types";
import type { FhevmInstanceConfig } from "@zama-fhe/relayer-sdk/bundle";

const MAX_RETRIES = 2;
const RETRY_BASE_MS = 500;

/**
 * Retry an async operation with exponential backoff.
 * Only retries on transient errors (timeout, network). Does not retry user-facing errors.
 */
export async function withRetry<T>(fn: () => Promise<T>, retries = MAX_RETRIES): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < retries && isTransientError(error)) {
        await sleep(RETRY_BASE_MS * 2 ** attempt);
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

function isTransientError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes("timed out") ||
    msg.includes("timeout") ||
    msg.includes("econnreset") ||
    msg.includes("econnrefused") ||
    msg.includes("network") ||
    msg.includes("fetch failed") ||
    msg.includes("socket hang up") ||
    msg.includes("502") ||
    msg.includes("503") ||
    msg.includes("504")
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Mainnet network configuration (chainId 1).
 *
 * Contract addresses mirror `MainnetConfigV2` from `@zama-fhe/relayer-sdk`.
 * They are duplicated here because the `/bundle` export path only exposes
 * types at build time (runtime values require `/web` or `/node` which pull
 * in WASM). `satisfies FhevmInstanceConfig` ensures structural drift is
 * caught at compile time.
 */
export const MainnetConfig = {
  chainId: 1,
  gatewayChainId: 261131,
  relayerUrl: "https://relayer.mainnet.zama.org/v2",
  network: "https://ethereum-rpc.publicnode.com",
  aclContractAddress: "0xcA2E8f1F656CD25C01F05d0b243Ab1ecd4a8ffb6",
  kmsContractAddress: "0x77627828a55156b04Ac0DC0eb30467f1a552BB03",
  inputVerifierContractAddress: "0xCe0FC2e05CFff1B719EFF7169f7D80Af770c8EA2",
  verifyingContractAddressDecryption: "0x0f6024a97684f7d90ddb0fAAD79cB15F2C888D24",
  verifyingContractAddressInputVerification: "0xcB1bB072f38bdAF0F328CdEf1Fc6eDa1DF029287",
} as const satisfies FhevmInstanceConfig;

/**
 * Sepolia testnet network configuration (chainId 11155111).
 * See {@link MainnetConfig} for why addresses are hardcoded.
 */
export const SepoliaConfig = {
  chainId: 11155111,
  gatewayChainId: 10901,
  relayerUrl: "https://relayer.testnet.zama.org/v2",
  network: "https://ethereum-sepolia-rpc.publicnode.com",
  aclContractAddress: "0xf0Ffdc93b7E186bC2f8CB3dAA75D86d1930A433D",
  kmsContractAddress: "0xbE0E383937d564D7FF0BC3b46c51f0bF8d5C311A",
  inputVerifierContractAddress: "0xBBC1fFCdc7C316aAAd72E807D9b0272BE8F84DA0",
  verifyingContractAddressDecryption: "0x5D8BD78e2ea6bbE41f26dFe9fdaEAa349e077478",
  verifyingContractAddressInputVerification: "0x483b9dE06E4E4C7D35CCf5837A1668487406D955",
} as const satisfies FhevmInstanceConfig;

/**
 * Hardhat local network configuration (chainId 31337).
 *
 * The addresses in this configuration must match those of your deployment.
 * Ensure that the executor address and other contract addresses correspond to
 * the contracts deployed on your Hardhat network.
 */
export const HardhatConfig = {
  chainId: 31337,
  gatewayChainId: 10901,
  relayerUrl: "",
  network: "http://127.0.0.1:8545",
  aclContractAddress: "0x50157CFfD6bBFA2DECe204a89ec419c23ef5755D",
  inputVerifierContractAddress: "0x36772142b74871f255CbD7A3e89B401d3e45825f",
  kmsContractAddress: "0xbE0E383937d564D7FF0BC3b46c51f0bF8d5C311A",
  verifyingContractAddressDecryption: "0x5ffdaAB0373E62E2ea2944776209aEf29E631A64",
  verifyingContractAddressInputVerification: "0x812b06e1CDCE800494b79fFE4f925A504a9A9810",
} as const satisfies FhevmInstanceConfig;

export const DefaultConfigs: Record<number, FhevmInstanceConfig> = {
  1: MainnetConfig,
  11155111: SepoliaConfig,
  31337: HardhatConfig,
} as const;

/** EIP-712 domain field → Solidity type. Order follows the EIP-712 spec. */
const DOMAIN_FIELD_TYPES: Record<string, string> = {
  name: "string",
  version: "string",
  chainId: "uint256",
  verifyingContract: "address",
  salt: "bytes32",
};

/**
 * Build `EIP712Domain` type entries from the keys present in a domain object.
 * Order matches the EIP-712 spec (name → version → chainId → verifyingContract → salt).
 */
export function buildEIP712DomainType(
  domain: EIP712TypedData["domain"],
): { name: string; type: string }[] {
  return Object.keys(DOMAIN_FIELD_TYPES)
    .filter((k) => k in domain)
    .map((k) => ({ name: k, type: DOMAIN_FIELD_TYPES[k]! }));
}

/**
 * Merge user overrides on top of SDK defaults for a given chain.
 */
export function mergeFhevmConfig(
  chainId: number,
  overrides?: Partial<FhevmInstanceConfig>,
): FhevmInstanceConfig {
  const base = DefaultConfigs[chainId];
  if (!base && (!overrides || Object.keys(overrides).length === 0)) {
    throw new Error(`No config for chainId: ${chainId}`);
  }
  return { ...base, ...overrides } as FhevmInstanceConfig;
}
