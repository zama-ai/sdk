/**
 * Mock Node.js worker — the Node.js equivalent of relayer-sdk.js (browser mock).
 *
 * Replaces the real WASM worker so RelayerNode works without @zama-fhe/relayer-sdk.
 * Delegates FHE operations to RelayerCleartext against the local anvil.
 */
import { parentPort } from "node:worker_threads";
import { RelayerCleartext } from "@zama-fhe/sdk/cleartext";
import { hardhatCleartextConfig } from "@zama-fhe/sdk/cleartext";

if (!parentPort) {
  throw new Error("This script must be run as a worker thread");
}

const port = parentPort;

/** @type {RelayerCleartext | null} */
let relayer = null;

function send(id, type, data) {
  port.postMessage({ id, type, success: true, data });
}

function sendError(id, type, error) {
  port.postMessage({ id, type, success: false, error });
}

async function handleMessage(request) {
  const { id, type } = request;
  try {
    switch (type) {
      case "NODE_INIT": {
        const { fhevmConfig } = request.payload;
        relayer = new RelayerCleartext({
          ...hardhatCleartextConfig,
          network: fhevmConfig.network,
        });
        send(id, type, { initialized: true });
        break;
      }

      case "GENERATE_KEYPAIR": {
        if (!relayer) throw new Error("Not initialized");
        const kp = await relayer.generateKeypair();
        send(id, type, { publicKey: kp.publicKey, privateKey: kp.privateKey });
        break;
      }

      case "CREATE_EIP712": {
        if (!relayer) throw new Error("Not initialized");
        const { publicKey, contractAddresses, startTimestamp, durationDays } = request.payload;
        const eip712 = await relayer.createEIP712(
          publicKey,
          contractAddresses,
          startTimestamp,
          durationDays,
        );
        send(id, type, {
          domain: eip712.domain,
          types: { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification },
          message: eip712.message,
        });
        break;
      }

      case "ENCRYPT": {
        if (!relayer) throw new Error("Not initialized");
        const result = await relayer.encrypt(request.payload);
        send(id, type, {
          handles: result.handles,
          inputProof: result.inputProof,
        });
        break;
      }

      case "USER_DECRYPT": {
        if (!relayer) throw new Error("Not initialized");
        const udResult = await relayer.userDecrypt(request.payload);
        send(id, type, { clearValues: udResult });
        break;
      }

      case "PUBLIC_DECRYPT": {
        if (!relayer) throw new Error("Not initialized");
        const pdResult = await relayer.publicDecrypt(request.payload.handles);
        send(id, type, pdResult);
        break;
      }

      case "DELEGATED_USER_DECRYPT": {
        if (!relayer) throw new Error("Not initialized");
        const dudResult = await relayer.delegatedUserDecrypt(request.payload);
        send(id, type, { clearValues: dudResult });
        break;
      }

      case "CREATE_DELEGATED_EIP712": {
        if (!relayer) throw new Error("Not initialized");
        const {
          publicKey: pk,
          contractAddresses: ca,
          delegatorAddress,
          startTimestamp: st,
          durationDays: dd,
        } = request.payload;
        const delResult = await relayer.createDelegatedUserDecryptEIP712(
          pk,
          ca,
          delegatorAddress,
          st,
          dd,
        );
        send(id, type, delResult);
        break;
      }

      case "GET_PUBLIC_KEY": {
        if (!relayer) throw new Error("Not initialized");
        const pkResult = await relayer.getPublicKey();
        send(id, type, { result: pkResult });
        break;
      }

      case "GET_PUBLIC_PARAMS": {
        if (!relayer) throw new Error("Not initialized");
        const ppResult = await relayer.getPublicParams(request.payload.bits);
        send(id, type, { result: ppResult });
        break;
      }

      case "REQUEST_ZK_PROOF_VERIFICATION": {
        throw new Error("Not implemented in mock worker");
      }

      default:
        sendError(id, type, `Unknown request type: ${type}`);
    }
  } catch (error) {
    sendError(id, type, error instanceof Error ? error.message : String(error));
  }
}

port.on("message", (request) => {
  handleMessage(request).catch((err) => sendError(request.id, request.type, err.message));
});
