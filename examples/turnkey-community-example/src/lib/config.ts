import { zamaConfig } from "./chain-config";

export { zamaConfig, viemChain, explorerUrl, isTestnet } from "./chain-config";

// Falls back to the public node bundled in the Zama SDK config for the selected chain.
export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? zamaConfig.network;
