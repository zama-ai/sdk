import {
  cleartext,
  ConfigurationError,
  type FhevmRuntimeConfig,
  type RelayerOptions,
} from "@zama-fhe/sdk";
import { toFhevmAuth } from "@zama-fhe/sdk/internal";
import { node } from "@zama-fhe/sdk/node";
import type { HttpTransportConfig } from "viem";
import type * as Wire from "./generated/zama/sdk/v1beta1/daemon.js";
import { RelayerTransport } from "./generated/zama/sdk/v1beta1/daemon.js";
import { chainAuth, decodeOptional, defined, safeInteger, unsignedInteger } from "./encoding.js";

export type ProviderConfig = Pick<
  HttpTransportConfig,
  "timeout" | "retryCount" | "retryDelay" | "batch"
> & { headers?: Record<string, string>; pollingInterval?: number };

type PinnedModuleVersions = Exclude<NonNullable<FhevmRuntimeConfig["moduleVersions"]>, "auto">;
type WasmAssetLoadMode = NonNullable<FhevmRuntimeConfig["wasmAssetLoadMode"]>;

const WASM_ASSET_LOAD_MODES = {
  "embedded-base64": true,
  "verified-blob": true,
  "precheck-direct-url": true,
  "trusted-direct-url": true,
  auto: true,
} satisfies Record<WasmAssetLoadMode, true>;
const TFHE_VERSIONS = { "1.5.3": true, "1.6.2": true } satisfies Record<
  NonNullable<PinnedModuleVersions["tfhe"]>,
  true
>;
const KMS_VERSIONS = { "0.13.10": true, "0.13.20-0": true } satisfies Record<
  NonNullable<PinnedModuleVersions["kms"]>,
  true
>;
const COMPATIBILITY_CHECKS = { throw: true, warn: true, off: true } satisfies Record<
  NonNullable<PinnedModuleVersions["checkCompatibility"]>,
  true
>;

function isSupported<Value extends string>(
  value: string,
  supported: Readonly<Record<Value, true>>,
): value is Value {
  return Object.hasOwn(supported, value);
}

function supportedValue<Value extends string>(
  value: string,
  values: Readonly<Record<Value, true>>,
  name: string,
): Value {
  if (!isSupported(value, values)) {
    throw new ConfigurationError(
      `Unsupported ${name} "${value}". Supported values: ${Object.keys(values).join(", ")}.`,
    );
  }
  return value;
}

function pinnedModuleVersions(value: Wire.PinnedModuleVersions): PinnedModuleVersions {
  return defined({
    tfhe: decodeOptional(value.tfhe, (version) =>
      supportedValue(version, TFHE_VERSIONS, "TFHE module version"),
    ),
    kms: decodeOptional(value.kms, (version) =>
      supportedValue(version, KMS_VERSIONS, "KMS module version"),
    ),
    checkCompatibility: decodeOptional(value.checkCompatibility, (check) =>
      supportedValue(check, COMPATIBILITY_CHECKS, "module compatibility check"),
    ),
  });
}

function moduleVersions(value: Wire.ModuleVersions): FhevmRuntimeConfig["moduleVersions"] {
  const selection = value.selection;
  switch (selection?.$case) {
    case "auto":
      return "auto";
    case "pinned":
      return pinnedModuleVersions(selection.pinned);
    default:
      throw new ConfigurationError("Module versions require a selection.");
  }
}

export function processRuntimeConfig(value: Wire.ProcessRuntimeConfig): FhevmRuntimeConfig {
  return defined({
    wasmAssetLoadMode: decodeOptional(value.wasmAssetLoadMode, (mode) =>
      supportedValue(mode, WASM_ASSET_LOAD_MODES, "WASM asset load mode"),
    ),
    moduleVersions: decodeOptional(value.moduleVersions, moduleVersions),
    singleThread: value.singleThread,
    numberOfThreads: decodeOptional(value.numberOfThreads, (number) =>
      unsignedInteger(number, "Runtime thread count"),
    ),
    auth: decodeOptional(value.auth, (auth) => toFhevmAuth(chainAuth(auth))),
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
type CrsCapacity = EncryptionKey["crsBytes"]["capacity"];

function encryptionKey(value: Wire.FheEncryptionKey): EncryptionKey {
  const { publicKeyBytes, crsBytes, metadata } = value;
  if (!publicKeyBytes || !crsBytes || !metadata) {
    throw new ConfigurationError("Encryption key requires public key, CRS and metadata messages.");
  }
  return {
    publicKeyBytes: { id: publicKeyBytes.id, bytes: new Uint8Array(publicKeyBytes.bytes) },
    crsBytes: {
      id: crsBytes.id,
      capacity: unsignedInteger(crsBytes.capacity, "CRS capacity") as CrsCapacity,
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
  let factory;
  switch (config.transport) {
    case RelayerTransport.RELAYER_TRANSPORT_NODE:
      factory = node;
      break;
    case RelayerTransport.RELAYER_TRANSPORT_CLEARTEXT:
      factory = cleartext;
      break;
    case RelayerTransport.RELAYER_TRANSPORT_UNSPECIFIED:
      throw new ConfigurationError("Relayer transport is required.");
    default:
      config.transport satisfies RelayerTransport.UNRECOGNIZED;
      throw new ConfigurationError("Unsupported relayer transport.");
  }
  return config.options === undefined ? factory() : factory(relayerOptions(config.options));
}
