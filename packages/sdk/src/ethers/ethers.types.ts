import { Eip1193Provider } from "ethers";
import { Address } from "../relayer/relayer-sdk.types";

interface ProviderConnectInfo {
  chainId: string;
}

interface ProviderMessage {
  type: string;
  data: unknown;
}

class ProviderRpcError extends Error {
  code: number;
  details: string;

  constructor(code: number, message: string) {
    super(message);
    this.code = code;
    this.details = message;
  }
}

interface EIP1193EventMap {
  accountsChanged(accounts: Address[]): void;
  chainChanged(chainId: string): void;
  connect(connectInfo: ProviderConnectInfo): void;
  disconnect(error: ProviderRpcError): void;
  message(message: ProviderMessage): void;
}

interface EIP1193Events {
  on<event extends keyof EIP1193EventMap>(event: event, listener: EIP1193EventMap[event]): void;
  removeListener<event extends keyof EIP1193EventMap>(
    event: event,
    listener: EIP1193EventMap[event],
  ): void;
}

export interface EIP1193Provider extends Eip1193Provider, EIP1193Events {}
