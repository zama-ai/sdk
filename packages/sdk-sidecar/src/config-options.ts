import {
  cleartext,
  ConfigurationError,
  type FhevmRuntimeConfig,
  type RelayerOptions,
} from "@zama-fhe/sdk";
import { node } from "@zama-fhe/sdk/node";
import type { HttpTransportConfig } from "viem";
import type * as Wire from "./generated/zama/sdk/v1alpha1/sidecar.js";
import { safeInteger, unsignedInteger } from "./encoding.js";
import { chainAuth, defined, decodeOptional } from "./config-values.js";

export type ProviderConfig = Pick<
  HttpTransportConfig,
  "timeout" | "retryCount" | "retryDelay" | "batch"
> & { headers?: Record<string, string>; pollingInterval?: number };

function moduleVersions(value: Wire.ModuleVersions): FhevmRuntimeConfig["moduleVersions"] {
  const selection = value.selection;
  switch (selection?.$case) {
    case "auto":
      return "auto";
    case "pinned":
      return defined(selection.pinned) as FhevmRuntimeConfig["moduleVersions"];
    default:
      throw new ConfigurationError("Module versions require a selection.");
  }
}

function runtimeAuth(value: Wire.ChainAuth): FhevmRuntimeConfig["auth"] {
  const auth = chainAuth(value);
  const type = auth["__type"];
  if (type === "BearerToken") {
    return { type, token: auth.token };
  }
  if (type === "ApiKeyHeader") {
    return { type, value: auth.value, ...defined({ header: auth.header }) };
  }
  return { type, value: auth.value, ...defined({ cookie: auth.cookie }) };
}

export function processRuntimeConfig(value: Wire.ProcessRuntimeConfig): FhevmRuntimeConfig {
  return defined({
    wasmAssetLoadMode: value.wasmAssetLoadMode as FhevmRuntimeConfig["wasmAssetLoadMode"],
    moduleVersions: decodeOptional(value.moduleVersions, moduleVersions),
    singleThread: value.singleThread,
    numberOfThreads: decodeOptional(value.numberOfThreads, (number) =>
      unsignedInteger(number, "Runtime thread count"),
    ),
    auth: decodeOptional(value.auth, runtimeAuth),
  });
}

function providerBatch(value: Wire.ProviderBatch): HttpTransportConfig["batch"] {
  const selection = value.selection;
  switch (selection?.$case) {
    case "enabled":
      return selection.enabled;
    case "options":
      return defined({
        batchSize: decodeOptional(selection.options.batchSize, (number) =>
          unsignedInteger(number, "Provider batch size"),
        ),
        wait: decodeOptional(selection.options.wait, (number) =>
          unsignedInteger(number, "Provider batch wait"),
        ),
      });
    default:
      throw new ConfigurationError("Provider batch requires a selection.");
  }
}

export function providerConfig(value: Wire.HttpProviderConfig): ProviderConfig {
  return defined({
    headers: value.headers?.entries,
    timeout: decodeOptional(value.timeout, (number) => unsignedInteger(number, "Provider timeout")),
    retryCount: decodeOptional(value.retryCount, (number) =>
      unsignedInteger(number, "Provider retry count"),
    ),
    retryDelay: decodeOptional(value.retryDelay, (number) =>
      unsignedInteger(number, "Provider retry delay"),
    ),
    batch: decodeOptional(value.batch, providerBatch),
    pollingInterval: decodeOptional(value.pollingInterval, (number) =>
      unsignedInteger(number, "Provider polling interval"),
    ),
  });
}

type EncryptionKey = NonNullable<RelayerOptions["fheEncryptionKey"]>;
function encryptionKey(value: Wire.FheEncryptionKey): EncryptionKey {
  const { publicKeyBytes, crsBytes, metadata } = value;
  if (!publicKeyBytes || !crsBytes || !metadata) {
    throw new ConfigurationError("Encryption key requires public key, CRS and metadata messages.");
  }
  return {
    publicKeyBytes: { id: publicKeyBytes.id, bytes: new Uint8Array(publicKeyBytes.bytes) },
    crsBytes: {
      id: crsBytes.id,
      capacity: unsignedInteger(
        crsBytes.capacity,
        "CRS capacity",
      ) as EncryptionKey["crsBytes"]["capacity"],
      bytes: new Uint8Array(crsBytes.bytes),
    },
    metadata: {
      relayerUrl: metadata.relayerUrl,
      chainId: safeInteger(metadata.chainId, "Encryption key chain ID"),
    },
  };
}
function relayerOptions(value: Wire.RelayerOptions): RelayerOptions {
  return defined({
    timeout: decodeOptional(value.timeout, (number) => unsignedInteger(number, "Relayer timeout")),
    debug: value.debug,
    batchRpcCalls: value.batchRpcCalls,
    moduleVersions: decodeOptional(value.moduleVersions, moduleVersions),
    fheEncryptionKey: decodeOptional(value.fheEncryptionKey, encryptionKey),
  });
}

export function relayerConfig(config?: Wire.RelayerConfig) {
  if (config === undefined) {
    return node();
  }
  const factory =
    config.type === "node" ? node : config.type === "cleartext" ? cleartext : undefined;
  if (!factory) {
    throw new ConfigurationError("Unsupported relayer transport.");
  }
  return config.options === undefined ? factory() : factory(relayerOptions(config.options));
}
