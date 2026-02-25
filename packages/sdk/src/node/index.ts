/**
 * Node.js backend for `@zama-fhe/sdk` — provides {@link RelayerNode},
 * {@link NodeWorkerClient}, and {@link NodeWorkerPool} for server-side FHE operations.
 *
 * @packageDocumentation
 */

export { RelayerNode } from "../relayer/relayer-node";
export type { RelayerNodeConfig } from "../relayer/relayer-node";
export { NodeWorkerClient } from "../worker/worker.node-client";
export type { NodeWorkerClientConfig } from "../worker/worker.node-client";
export { NodeWorkerPool } from "../worker/worker.node-pool";
export type { NodeWorkerPoolConfig } from "../worker/worker.node-pool";
export type { GenericLogger } from "../worker/worker.types";

// Network preset configs
export { HardhatConfig, MainnetConfig, SepoliaConfig } from "../relayer/relayer-utils";
