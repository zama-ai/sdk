/**
 * EIP-1193 provider types used by the SDK.
 */

import type { Address } from "../utils/address";

// ---------------------------------------------------------------------------
// EIP-1193 provider types
// ---------------------------------------------------------------------------

/** Minimal EIP-1193 JSON-RPC request shape. */
export interface EIP1193RequestFn {
  (args: { method: string; params?: readonly unknown[] }): Promise<unknown>;
}

/** Info returned by the `connect` EIP-1193 event. */
export interface ProviderConnectInfo {
  readonly chainId: string;
}

/** Provider message delivered by the `message` event. */
export interface ProviderMessage {
  readonly type: string;
  readonly data: unknown;
}

/** Callback signatures for each EIP-1193 event. */
export interface EIP1193EventMap {
  accountsChanged: (accounts: Address[]) => void;
  chainChanged: (chainId: string) => void;
  connect: (connectInfo: ProviderConnectInfo) => void;
  disconnect: (error: ProviderRpcError) => void;
  message: (message: ProviderMessage) => void;
}

/** EIP-1193 event subscription / unsubscription shape. */
export interface EIP1193Events {
  on<TEvent extends keyof EIP1193EventMap>(event: TEvent, listener: EIP1193EventMap[TEvent]): void;
  removeListener<TEvent extends keyof EIP1193EventMap>(
    event: TEvent,
    listener: EIP1193EventMap[TEvent],
  ): void;
}

/** Minimal EIP-1193 provider interface used by the SDK. */
export interface EIP1193Provider extends EIP1193Events {
  request: EIP1193RequestFn;
}

/** EIP-1193 JSON-RPC error. */
export class ProviderRpcError extends Error {
  readonly code: number;
  readonly data?: unknown;

  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.name = "ProviderRpcError";
    this.code = code;
    this.data = data;
  }
}
