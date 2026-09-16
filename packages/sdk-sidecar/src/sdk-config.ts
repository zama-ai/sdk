import {
  chains as presets,
  ConfigurationError,
  type FheChain,
  type FheChainAuth,
  type ZamaConfigBase,
} from "@zama-fhe/sdk";
import type {
  ChainAuth,
  ChainConfig,
  ContextConfig as WireConfig,
} from "./generated/zama/sdk/v1alpha1/sidecar.js";
import { address, safeInteger, unsignedInteger } from "./encoding.js";

type HttpChain = Omit<FheChain, "network"> & { network: string };
export interface ContextConfig extends Pick<
  ZamaConfigBase,
  "permitTTL" | "transportKeyPairTTL" | "transportKeyPairScope" | "registryTTL"
> {
  chains: [HttpChain, ...HttpChain[]];
  chainId: number;
}
function auth(value: ChainAuth): FheChainAuth {
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
      auth: decodeOptional(value.auth, auth),
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
  const chains = config.chains.map(chain);
  const initialChain =
    config.chainId === undefined ? chains[0]?.id : safeInteger(config.chainId, "Initial chain ID");
  const selected = chains.find((item) => item.id === initialChain);
  if (!selected) {
    throw new ConfigurationError("Initial chain must be configured.");
  }
  return {
    chains: [selected, ...chains.filter((item) => item !== selected)],
    chainId: selected.id,
    ...defined({
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

function decodeOptional<T, R>(value: T | undefined, decode: (value: T) => R): R | undefined {
  return value === undefined ? undefined : decode(value);
}

function defined<T extends object>(value: T): Partial<T> {
  const result: Partial<T> = { ...value };
  for (const key in result) {
    if (result[key] === undefined) {
      delete result[key];
    }
  }
  return result;
}
