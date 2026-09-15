import { bytesToHex } from "viem";
import type { PrepareOptions, PrepareTransactionRequest } from "@zama-fhe/sdk";
import type * as rpc from "./generated/zama/sdk/v1alpha1/sidecar.js";
import type { ContextSdk } from "./runtime.js";
import { address, bytes, safeInteger } from "./encoding.js";
import { invalidArgument } from "./errors.js";

function decimal(value: string): bigint {
  if (!/^(0|-?[1-9][0-9]*)$/.test(value)) {
    throw invalidArgument("Bigint must be a canonical decimal string.");
  }
  return BigInt(value);
}

function requireField<T>(value: T | undefined, name: string): T {
  if (value === undefined) {
    throw invalidArgument(`${name} is required.`);
  }
  return value;
}

function transactionRequest(request: rpc.PrepareTransactionRequest): PrepareTransactionRequest {
  const from = address(request.from);
  const transaction = request.transaction;
  switch (transaction?.$case) {
    case "confidentialTransfer": {
      const value = transaction.confidentialTransfer;
      return {
        kind: "ConfidentialTransfer",
        from,
        token: address(value.token),
        to: address(value.to),
        amount: decimal(value.amount),
      };
    }
    case "confidentialTransferFrom": {
      const value = transaction.confidentialTransferFrom;
      return {
        kind: "ConfidentialTransferFrom",
        from,
        token: address(value.token),
        owner: address(value.owner),
        to: address(value.to),
        amount: decimal(value.amount),
      };
    }
    case "setOperator": {
      const value = transaction.setOperator;
      return {
        kind: "SetOperator",
        from,
        token: address(value.token),
        operator: address(value.operator),
        until: safeInteger(requireField(value.until, "Operator expiry"), "Operator expiry"),
      };
    }
    case "unwrap": {
      const value = transaction.unwrap;
      return {
        kind: "Unwrap",
        from,
        token: address(value.token),
        to: address(value.to),
        amount: decimal(value.amount),
      };
    }
    case "unwrapAll": {
      const value = transaction.unwrapAll;
      return { kind: "UnwrapAll", from, token: address(value.token), to: address(value.to) };
    }
    case "finalizeUnwrap": {
      const value = transaction.finalizeUnwrap;
      return {
        kind: "FinalizeUnwrap",
        from,
        wrapper: address(value.wrapper),
        unwrapRequestIdOrAmount: bytesToHex(value.unwrapRequestIdOrAmount),
      };
    }
    case "approveUnderlying": {
      const value = transaction.approveUnderlying;
      return {
        kind: "ApproveUnderlying",
        from,
        underlying: address(value.underlying),
        spender: address(value.spender),
        amount: decimal(value.amount),
      };
    }
    case "wrap": {
      const value = transaction.wrap;
      return {
        kind: "Wrap",
        from,
        wrapper: address(value.wrapper),
        to: address(value.to),
        amount: decimal(value.amount),
      };
    }
    case "transferAndCall": {
      const value = transaction.transferAndCall;
      return {
        kind: "TransferAndCall",
        from,
        underlying: address(value.underlying),
        wrapper: address(value.wrapper),
        amount: decimal(value.amount),
        ...(value.recipientData === undefined
          ? {}
          : { recipientData: bytesToHex(value.recipientData) }),
      };
    }
    case "delegateDecryption": {
      const value = transaction.delegateDecryption;
      return {
        kind: "DelegateDecryption",
        from,
        contractAddress: address(value.contractAddress),
        delegateAddress: address(value.delegateAddress),
        ...(value.expirationDateMs === undefined
          ? {}
          : { expirationDate: new Date(safeInteger(value.expirationDateMs, "Expiration date")) }),
      };
    }
    case "revokeDelegation": {
      const value = transaction.revokeDelegation;
      return {
        kind: "RevokeDelegation",
        from,
        contractAddress: address(value.contractAddress),
        delegateAddress: address(value.delegateAddress),
      };
    }
    default:
      throw invalidArgument("An offline transaction kind is required.");
  }
}

function prepareOptions(value: rpc.PrepareOptions | undefined): PrepareOptions | undefined {
  if (value === undefined) {
    return undefined;
  }
  return {
    ...(value.nonce === undefined ? {} : { nonce: safeInteger(value.nonce, "Nonce") }),
    ...(value.gasLimit === undefined ? {} : { gasLimit: decimal(value.gasLimit) }),
    ...(value.fees === undefined
      ? {}
      : {
          fees: {
            maxFeePerGas: decimal(value.fees.maxFeePerGas),
            maxPriorityFeePerGas: decimal(value.fees.maxPriorityFeePerGas),
          },
        }),
  };
}

export async function prepareTransaction(
  sdk: ContextSdk,
  request: rpc.PrepareTransactionRequest,
): Promise<rpc.PrepareTransactionResponse> {
  const result = await sdk.offline.prepare(
    transactionRequest(request),
    prepareOptions(request.options),
  );
  return { kind: result.kind, from: bytes(result.from), unsignedTx: bytes(result.unsignedTx) };
}
