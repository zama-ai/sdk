import type { Address, Hex } from "viem";
import type { ClearValue } from "@zama-fhe/sdk";

export interface DecryptedTransfer {
  contractAddress: Address;
  from: Address;
  to: Address;
  amountHandle: Hex;
  clearAmount: ClearValue;
  blockNumber: bigint;
  transactionHash: Hex;
}

function key(contractAddress: Address, transactionHash: Hex, amountHandle: Hex): string {
  return `${contractAddress.toLowerCase()}:${transactionHash}:${amountHandle}`;
}

/** Cache of decrypted confidential transfers, queryable per (token, account). */
export class TransferStore {
  readonly #entries = new Map<string, DecryptedTransfer>();

  upsert(transfer: DecryptedTransfer): void {
    this.#entries.set(
      key(transfer.contractAddress, transfer.transactionHash, transfer.amountHandle),
      transfer,
    );
  }

  listFor(contractAddress: Address, account: Address): DecryptedTransfer[] {
    const normalized = account.toLowerCase();
    return [...this.#entries.values()]
      .filter(
        (t) =>
          t.contractAddress.toLowerCase() === contractAddress.toLowerCase() &&
          (t.from.toLowerCase() === normalized || t.to.toLowerCase() === normalized),
      )
      .sort((a, b) => Number(a.blockNumber - b.blockNumber));
  }
}
