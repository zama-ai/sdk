import { encodeFunctionData, getAddress, parseGwei, type Hex } from "viem";
import { networkConfig } from "../config/network.js";
import { publicClient } from "../utils/rpc.js";
import type {
  Adapter,
  AdapterArchitecture,
  AdapterCapabilities,
  AdapterModuleShape,
  CapabilityState,
  ContractCallConfig,
  LegacySigner,
  VerificationModel,
} from "./types.js";
import { emptyCapabilities } from "./types.js";
import { resolveFinalCapabilities } from "./capability-evidence.js";

export interface LoadedAdapter {
  adapter: Adapter;
  init: () => Promise<void>;
  source: "adapter" | "legacy-signer";
  declaredCapabilities: AdapterCapabilities;
  observedStructuralCapabilities: AdapterCapabilities;
  observedRuntimeCapabilities: AdapterCapabilities;
  observedCapabilities: AdapterCapabilities;
}

function capabilityFromBoolean(value: boolean): CapabilityState {
  return value ? "SUPPORTED" : "UNSUPPORTED";
}

function normalizeDeclaredCapabilities(adapter: Adapter): AdapterCapabilities {
  return {
    ...emptyCapabilities(),
    ...adapter.capabilities,
  };
}

function inferObservedCapabilitiesFromAdapter(adapter: Adapter): AdapterCapabilities {
  const capabilities = emptyCapabilities();
  capabilities.addressResolution = "SUPPORTED";
  capabilities.eip712Signing = capabilityFromBoolean(typeof adapter.signTypedData === "function");
  capabilities.rawTransactionSigning = capabilityFromBoolean(
    typeof adapter.signTransaction === "function",
  );
  capabilities.contractExecution = capabilityFromBoolean(
    typeof adapter.writeContract === "function",
  );
  capabilities.contractReads = capabilityFromBoolean(typeof adapter.readContract === "function");
  capabilities.transactionReceiptTracking = capabilityFromBoolean(
    typeof adapter.waitForTransactionReceipt === "function",
  );
  capabilities.zamaAuthorizationFlow =
    capabilities.eip712Signing === "SUPPORTED" ? "SUPPORTED" : "UNSUPPORTED";
  capabilities.zamaWriteFlow =
    capabilities.contractExecution === "SUPPORTED" ? "SUPPORTED" : "UNSUPPORTED";
  return capabilities;
}

async function sendWriteViaLegacySigner(
  signer: LegacySigner,
  config: ContractCallConfig,
): Promise<Hex> {
  if (signer.writeContract) {
    return signer.writeContract(config) as Promise<Hex>;
  }
  if (!signer.signTransaction) {
    throw new Error("Legacy signer does not support contract execution");
  }

  const from = getAddress(signer.address) as `0x${string}`;
  const calldata = encodeFunctionData({
    abi: config.abi,
    functionName: config.functionName,
    args: config.args ?? [],
  });
  const nonce = await publicClient.getTransactionCount({ address: from });
  const feeData = await publicClient.estimateFeesPerGas();
  const gas =
    config.gas ??
    (await publicClient.estimateGas({
      account: from,
      to: getAddress(config.address) as `0x${string}`,
      data: calldata,
      value: config.value ?? 0n,
    }));

  const signedTx = await signer.signTransaction({
    to: getAddress(config.address) as `0x${string}`,
    value: config.value ?? 0n,
    data: calldata,
    gas,
    maxFeePerGas: feeData.maxFeePerGas ?? parseGwei("20"),
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? parseGwei("1"),
    nonce,
    chainId: networkConfig.chainId,
    type: "eip1559" as const,
  });

  return publicClient.sendRawTransaction({
    serializedTransaction: signedTx as `0x${string}`,
  });
}

function wrapLegacySigner(signer: LegacySigner): Adapter {
  const declaredArchitecture: AdapterArchitecture =
    signer.signTransaction && !signer.writeContract ? "EOA" : "UNKNOWN";
  const verificationModel: VerificationModel = signer.signTransaction
    ? "RECOVERABLE_ECDSA"
    : "UNKNOWN";

  return {
    metadata: {
      name: "Legacy Signer Adapter",
      declaredArchitecture,
      verificationModel,
      supportedChainIds: [networkConfig.chainId],
      notes: ["Wrapped from a legacy signer export for backwards compatibility."],
    },
    capabilities: {
      addressResolution: "SUPPORTED",
      eip712Signing: capabilityFromBoolean(typeof signer.signTypedData === "function"),
      rawTransactionSigning: capabilityFromBoolean(typeof signer.signTransaction === "function"),
      contractExecution: capabilityFromBoolean(
        typeof signer.writeContract === "function" || typeof signer.signTransaction === "function",
      ),
      contractReads: "SUPPORTED",
      transactionReceiptTracking: "SUPPORTED",
      zamaAuthorizationFlow: capabilityFromBoolean(typeof signer.signTypedData === "function"),
      zamaWriteFlow: capabilityFromBoolean(
        typeof signer.writeContract === "function" || typeof signer.signTransaction === "function",
      ),
    },
    async getAddress() {
      return signer.address;
    },
    signTypedData: signer.signTypedData,
    signTransaction: signer.signTransaction,
    async writeContract(config) {
      return sendWriteViaLegacySigner(signer, config);
    },
    async readContract(config) {
      return publicClient.readContract(config);
    },
    waitForTransactionReceipt(hash) {
      return publicClient.waitForTransactionReceipt({ hash });
    },
  };
}

function assertAdapterModule(module: AdapterModuleShape): LoadedAdapter {
  if (module.adapter) {
    const adapter = module.adapter;
    const declaredCapabilities = normalizeDeclaredCapabilities(adapter);
    const observedStructuralCapabilities = inferObservedCapabilitiesFromAdapter(adapter);
    const observedRuntimeCapabilities = emptyCapabilities();
    const observedCapabilities = resolveFinalCapabilities({
      structural: observedStructuralCapabilities,
      runtime: observedRuntimeCapabilities,
    });
    adapter.capabilities = observedCapabilities;
    return {
      adapter,
      source: "adapter",
      declaredCapabilities,
      observedStructuralCapabilities,
      observedRuntimeCapabilities,
      observedCapabilities,
      init: async () => {
        if (module.ready) await module.ready;
        if (adapter.init) await adapter.init();
      },
    };
  }

  if (module.signer) {
    const adapter = wrapLegacySigner(module.signer);
    const declaredCapabilities = normalizeDeclaredCapabilities(adapter);
    const observedStructuralCapabilities = inferObservedCapabilitiesFromAdapter(adapter);
    const observedRuntimeCapabilities = emptyCapabilities();
    const observedCapabilities = resolveFinalCapabilities({
      structural: observedStructuralCapabilities,
      runtime: observedRuntimeCapabilities,
    });
    adapter.capabilities = observedCapabilities;
    return {
      adapter,
      source: "legacy-signer",
      declaredCapabilities,
      observedStructuralCapabilities,
      observedRuntimeCapabilities,
      observedCapabilities,
      init: async () => {
        if (module.ready) await module.ready;
      },
    };
  }

  throw new Error(
    "Adapter module must export either `adapter` (preferred) or `signer` (legacy compatibility).",
  );
}

export function loadAdapterModule(module: AdapterModuleShape): LoadedAdapter {
  return assertAdapterModule(module);
}
