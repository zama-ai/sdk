import {
  chains as presets,
  ConfigurationError,
  type FheChain,
  type ZamaConfigBase,
} from "@zama-fhe/sdk";
import type {
  ChainConfig,
  ContextConfig as WireConfig,
} from "./generated/zama/sdk/v1beta1/daemon.js";
import {
  processRuntimeConfig,
  providerConfig,
  relayerConfig,
  type ProviderConfig,
} from "./config-options.js";
import {
  chainAuth,
  defined,
  decodeOptional,
  address,
  safeInteger,
  unsignedInteger,
} from "./encoding.js";

type HttpChain = Omit<FheChain, "network"> & { network: string };
export interface ContextConfig extends Pick<
  ZamaConfigBase,
  | "permitTTL"
  | "transportKeyPairTTL"
  | "transportKeyPairScope"
  | "registryTTL"
  | "runtime"
  | "relayers"
> {
  chains: [HttpChain, ...HttpChain[]];
  chainId: number;
  providerConfigs: Map<number, ProviderConfig>;
}
function chain(value: ChainConfig): HttpChain {
  const id = safeInteger(value.id, "Chain ID");
  const merged = {
    ...presets[id],
    id,
    ...defined({
      network: value.network,
      gatewayChainId: decodeOptional(value.gatewayChainId, (gatewayId) =>
        safeInteger(gatewayId, "Gateway chain ID"),
      ),
      relayerUrl: value.relayerUrl,
      aclContractAddress: decodeOptional(value.aclContractAddress, address),
      kmsContractAddress: decodeOptional(value.kmsContractAddress, address),
      inputVerifierContractAddress: decodeOptional(value.inputVerifierContractAddress, address),
      verifyingContractAddressDecryption: decodeOptional(
        value.verifyingContractAddressDecryption,
        address,
      ),
      verifyingContractAddressInputVerification: decodeOptional(
        value.verifyingContractAddressInputVerification,
        address,
      ),
      auth: decodeOptional(value.auth, chainAuth),
    }),
  };
  // Empty address bytes clear a preset; omission retains it.
  if (value.registryAddress !== undefined) {
    merged.registryAddress = value.registryAddress.length
      ? address(value.registryAddress)
      : undefined;
  }
  if (value.executorAddress !== undefined) {
    merged.executorAddress = value.executorAddress.length
      ? address(value.executorAddress)
      : undefined;
  }
  if (typeof merged.network !== "string") {
    throw new ConfigurationError("A chain network must be an RPC URL string.");
  }
  return {
    ...merged,
    network: merged.network,
    gatewayChainId: required(merged.gatewayChainId, "gateway chain ID"),
    relayerUrl: required(merged.relayerUrl, "relayer URL"),
    aclContractAddress: required(merged.aclContractAddress, "ACL address"),
    kmsContractAddress: required(merged.kmsContractAddress, "KMS address"),
    inputVerifierContractAddress: required(
      merged.inputVerifierContractAddress,
      "input verifier address",
    ),
    verifyingContractAddressDecryption: required(
      merged.verifyingContractAddressDecryption,
      "decryption verifier address",
    ),
    verifyingContractAddressInputVerification: required(
      merged.verifyingContractAddressInputVerification,
      "input verification address",
    ),
    registryAddress: merged.registryAddress,
  };
}
export function parseContextConfig(config: WireConfig | undefined): ContextConfig {
  if (!config) {
    throw new ConfigurationError("Context configuration is required.");
  }
  const providerConfigs = new Map<number, ProviderConfig>();
  const chains = config.chains.map((value) => {
    const resolved = chain(value);
    if (value.provider !== undefined) {
      providerConfigs.set(resolved.id, providerConfig(value.provider));
    }
    return resolved;
  });
  const initialChain =
    config.chainId === undefined ? chains[0]?.id : safeInteger(config.chainId, "Initial chain ID");
  const selected = chains.find((item) => item.id === initialChain);
  if (!selected) {
    throw new ConfigurationError("Initial chain must be configured.");
  }
  return {
    chains: [selected, ...chains.filter((item) => item !== selected)],
    chainId: selected.id,
    providerConfigs,
    relayers: Object.fromEntries(
      config.relayers === undefined
        ? chains.map((value) => [value.id, relayerConfig()])
        : [...config.relayers.entries].map(([id, value]) => [
            safeInteger(id, "Relayer chain ID"),
            relayerConfig(value),
          ]),
    ),
    ...defined({
      runtime: decodeOptional(config.processRuntime, processRuntimeConfig),
      permitTTL: decodeOptional(config.permitTtl, (ttl) => unsignedInteger(ttl, "Permit TTL")),
      transportKeyPairTTL: decodeOptional(config.transportKeyPairTtl, (ttl) =>
        unsignedInteger(ttl, "Transport key pair TTL"),
      ),
      transportKeyPairScope: config.transportKeyPairScope,
      registryTTL: decodeOptional(config.registryTtl, (ttl) =>
        unsignedInteger(ttl, "Registry TTL"),
      ),
    }),
  };
}

function required<T>(value: T | undefined, name: string): T {
  if (value === undefined) {
    throw new ConfigurationError(`Custom chain requires ${name}.`);
  }
  return value;
}
