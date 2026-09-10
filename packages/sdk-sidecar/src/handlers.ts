import { bytesToHex } from "viem";
import { parsePreparedPermit } from "@zama-fhe/sdk";
import type { handleUnaryCall } from "@grpc/grpc-js";
import type * as rpc from "./generated/zama/sdk/v1alpha1/sidecar.js";
import type { ContextSdk, SidecarRuntime } from "./runtime.js";
import { signerChannel, storageChannel } from "./channels.js";
import { address, bytes, clearValue, entries, input, json } from "./encoding.js";
import { cancelled, errorDetails, invalidArgument, serviceError } from "./errors.js";

function unary<Request, Response>(
  operation: (request: Request, signal: AbortSignal) => Promise<Response> | Response,
): handleUnaryCall<Request, Response> {
  return (call, callback) => {
    const controller = new AbortController();
    const cancel = () => controller.abort();
    call.once("cancelled", cancel);
    if (call.cancelled || Date.now() >= Number(call.getDeadline())) {
      controller.abort();
    }
    void (async () => {
      try {
        if (controller.signal.aborted) {
          throw cancelled();
        }
        const response = await operation(call.request, controller.signal);
        if (!call.cancelled) {
          callback(null, response);
        }
      } catch (error) {
        if (!call.cancelled) {
          callback(serviceError(error));
        }
      } finally {
        call.removeListener("cancelled", cancel);
      }
    })();
  };
}
export function createHandlers(
  runtime: SidecarRuntime,
  sdkVersion: string,
): rpc.SidecarServiceServer {
  const execute = <Request extends { operation?: rpc.Operation }, Response>(
    action: (sdk: ContextSdk, request: Request, signal: AbortSignal) => Promise<Response>,
    publicOperation = false,
  ): handleUnaryCall<Request, Response> =>
    unary((request, signal) =>
      runtime.execute(
        request.operation,
        signal,
        (sdk, operationSignal) => action(sdk, request, operationSignal),
        { public: publicOperation },
      ),
    );
  return {
    getInfo: unary(() => ({ sdkVersion })),
    createContext: unary(async (request: rpc.CreateContextRequest, signal) => {
      const contextId = await runtime.createContext(request);
      if (signal.aborted) {
        await runtime.closeContext(contextId);
        throw cancelled();
      }
      return { contextId };
    }),
    closeContext: unary(async (request: rpc.ContextRequest) => {
      await runtime.closeContext(request.contextId);
      return {};
    }),
    updateAccount: unary(async (request: rpc.UpdateAccountRequest, signal) => {
      await runtime.updateAccount(request, signal);
      return {};
    }),
    signerChannel: signerChannel(runtime),
    storageChannel: storageChannel(runtime),
    decryptValues: execute(async (sdk, request: rpc.DecryptValuesRequest, signal) => ({
      values: entries(
        await sdk.decryption.decryptValues(request.inputs.map(input), {
          signal,
          ...(request.timeoutMs === undefined ? {} : { timeout: request.timeoutMs }),
        }),
      ),
    })),
    delegatedDecryptValues: execute(async (sdk, request: rpc.DelegatedDecryptValuesRequest) => ({
      values: entries(
        await sdk.decryption.delegatedDecryptValues(
          request.inputs.map(input),
          address(request.delegatorAddress),
          request.accountAddress === undefined ? undefined : address(request.accountAddress),
          request.waitForPropagation === undefined
            ? undefined
            : { waitForPropagation: request.waitForPropagation },
        ),
      ),
    })),
    decryptPublicValues: execute(async (sdk, request: rpc.DecryptPublicValuesRequest, signal) => {
      const result = await sdk.decryption.decryptPublicValues(
        request.encryptedValues.map((value) => bytesToHex(value)),
        { signal, ...(request.timeoutMs === undefined ? {} : { timeout: request.timeoutMs }) },
      );
      return {
        values: entries(result.clearValues),
        abiEncodedClearValues: bytes(result.abiEncodedClearValues),
        decryptionProof: bytes(result.decryptionProof),
      };
    }, true),
    delegatedBatchDecryptValues: execute(
      async (sdk, request: rpc.DelegatedBatchDecryptValuesRequest) => {
        const result = await sdk.decryption.delegatedBatchDecryptValues({
          encryptedInputs: request.inputs.map(input),
          delegatorAddress: address(request.delegatorAddress),
          ...(request.accountAddress === undefined
            ? {}
            : { accountAddress: address(request.accountAddress) }),
          ...(request.maxConcurrency === undefined
            ? {}
            : { maxConcurrency: request.maxConcurrency }),
          ...(request.waitForPropagation === undefined
            ? {}
            : { waitForPropagation: request.waitForPropagation }),
        });
        return {
          items: result.items.map((item) => ({
            encryptedValue: bytes(item.encryptedValue),
            contractAddress: bytes(item.contractAddress),
            value: item.error ? undefined : clearValue(item.value),
            error: item.error ? errorDetails(item.error) : undefined,
          })),
        };
      },
    ),
    preparePermit: unary((request: rpc.PreparePermitRequest, signal) => {
      const signer = address(request.signerAddress);
      return runtime.execute(
        request.operation,
        signal,
        async (sdk) => ({
          preparedPermitJson: json(
            await sdk.offline.preparePermit({
              signer,
              contracts: request.contractAddresses.map(address),
              ...(request.delegatorAddress === undefined
                ? {}
                : { delegator: address(request.delegatorAddress) }),
              ...(request.durationDays === undefined ? {} : { durationDays: request.durationDays }),
            }),
          ),
        }),
        { credentialSigner: signer },
      );
    }),
    registerPermit: unary((request: rpc.RegisterPermitRequest, signal) => {
      let payload: unknown;
      try {
        payload = JSON.parse(request.preparedPermitJson);
      } catch {
        throw invalidArgument("Prepared permit must contain valid JSON.");
      }
      const prepared = parsePreparedPermit(payload);
      return runtime.execute(
        request.operation,
        signal,
        async (sdk) => {
          await sdk.permits.registerPermit(prepared, bytesToHex(request.signature));
          return {};
        },
        { credentialSigner: prepared.signerAddress },
      );
    }),
    grantPermit: execute(async (sdk, request: rpc.ContractsRequest) => {
      await sdk.permits.grantPermit(request.contractAddresses.map(address));
      return {};
    }),
    grantDelegationPermit: execute(async (sdk, request: rpc.DelegationContractsRequest) => {
      await sdk.permits.grantDelegationPermit(
        address(request.delegatorAddress),
        request.contractAddresses.map(address),
      );
      return {};
    }),
    hasPermit: execute(async (sdk, request: rpc.ContractsRequest) => ({
      hasPermit: await sdk.permits.hasPermit(request.contractAddresses.map(address)),
    })),
    hasDelegationPermit: execute(async (sdk, request: rpc.DelegationContractsRequest) => ({
      hasPermit: await sdk.permits.hasDelegationPermit(
        address(request.delegatorAddress),
        request.contractAddresses.map(address),
      ),
    })),
    revokePermits: execute(async (sdk, request: rpc.RevokePermitsRequest) => {
      await sdk.permits.revokePermits(request.contracts?.addresses.map(address));
      return {};
    }),
    clearPermits: execute(async (sdk) => {
      await sdk.permits.clear();
      return {};
    }),
    warmTransportKeyPair: execute(async (sdk) => {
      await sdk.permits.warmTransportKeyPair();
      return {};
    }),
    warmTransportKeyPairScope: execute(async (sdk, request: rpc.ScopeRequest) => {
      await sdk.permits.warmTransportKeyPairScope(request.scopeId);
      return {};
    }),
    revokeTransportKeyPair: execute(async (sdk, request: rpc.ScopeRequest) => {
      await sdk.permits.revokeTransportKeyPair(request.scopeId);
      return {};
    }),
  };
}
