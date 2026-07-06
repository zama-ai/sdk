import type { FheChain } from "@zama-fhe/sdk/chains";
import type { ConfidentialOperationRegistry } from "../registry/index.js";

const POC_VERSION = "0.1.0";

/**
 * Secondary, explicit `zama_*` namespace — introspection/debug only. The
 * primary write-side flow is the auto-rewrite in `zama/rewriter.ts`; these
 * methods exist so an operator (or a candidate poking at the server) can
 * ask "what would this server rewrite, and for what network" without
 * reading the source.
 */
export function buildZamaHandlers(params: {
  registry: ConfidentialOperationRegistry;
  chain: FheChain;
}): Record<string, (rpcParams: unknown[]) => unknown> {
  const { registry, chain } = params;

  return {
    zama_getCapabilities: () => ({
      name: "zama-json-rpc",
      version: POC_VERSION,
      chainId: chain.id,
      features: { passThrough: true, autoRewrite: true, signing: false, sendTransaction: false },
      confidentialOperations: registry.list().map((operation) => operation.name),
    }),
    zama_getNetworkConfig: () => ({
      chainId: chain.id,
      relayerUrl: chain.relayerUrl,
      aclContractAddress: chain.aclContractAddress,
      kmsContractAddress: chain.kmsContractAddress,
      inputVerifierContractAddress: chain.inputVerifierContractAddress,
      gatewayChainId: chain.gatewayChainId,
    }),
    zama_listConfidentialOperations: () =>
      registry
        .list()
        .map((operation) => ({
          name: operation.name,
          chainId: operation.chainId,
          publicFunction: operation.publicFunctionName,
          note: "applies to any token confirmed valid via the on-chain wrappers registry",
        })),
  };
}
