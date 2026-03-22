// Mock SDK for E2E testing - proxies to MockFhevmInstance via endpoints
// This script runs in the Web Worker context
console.log("[Mock SDK] Loading mock relayerSDK");

// BASE_URL is replaced at runtime by the fixture
const BASE_URL = "__BASE_URL__";

if (BASE_URL === "__BASE_URL__") {
  throw new Error('"__BASE_URL__" must be replaced by a base url');
}

self.relayerSDK = {
  initSDK: async function () {
    console.log("[Mock SDK] initSDK called");
    return true;
  },

  createInstance: async function (_config) {
    console.log("[Mock SDK] createInstance called");

    return {
      generateKeypair: function () {
        // Sync call - use XMLHttpRequest
        const xhr = new XMLHttpRequest();
        xhr.open("GET", `${BASE_URL}/generateKeypair`, false);
        xhr.send();
        return JSON.parse(xhr.responseText);
      },

      createEIP712: function (publicKey, contractAddresses, startTimestamp, durationDays) {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${BASE_URL}/createEIP712`, false);
        xhr.setRequestHeader("Content-Type", "application/json");
        xhr.send(
          JSON.stringify({
            publicKey,
            contractAddresses,
            startTimestamp,
            durationDays,
          }),
        );
        const result = JSON.parse(xhr.responseText);
        return {
          ...result,
          message: {
            ...result.message,
            startTimestamp: BigInt(result.message.startTimestamp),
            durationDays: BigInt(result.message.durationDays),
          },
        };
      },

      createEncryptedInput: function (contractAddress, userAddress) {
        const values = [];
        return {
          add64: function (value) {
            values.push({ value: value.toString(), type: "euint64" });
            return this;
          },
          encrypt: async function () {
            const response = await fetch(`${BASE_URL}/encrypt`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ values, contractAddress, userAddress }),
            });
            const result = await response.json();
            return {
              handles: result.handles.map((h) => new Uint8Array(h)),
              inputProof: new Uint8Array(result.inputProof),
            };
          },
        };
      },

      userDecrypt: async function (
        handleContractPairs,
        privateKey,
        publicKey,
        signature,
        signedContractAddresses,
        signerAddress,
        startTimestamp,
        durationDays,
      ) {
        console.log("[Mock SDK] userDecrypt called with", handleContractPairs.length, "handles");
        const handles = handleContractPairs.map((p) => p.handle);
        const contractAddress = handleContractPairs[0]?.contractAddress || "";

        const response = await fetch(`${BASE_URL}/userDecrypt`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            handles,
            contractAddress,
            signedContractAddresses,
            privateKey,
            publicKey,
            signature,
            signerAddress,
            startTimestamp,
            durationDays,
          }),
        });

        const result = await response.json();
        console.log("[Mock SDK] userDecrypt result:", result);

        // Convert string values back to BigInt
        const clearValues = {};
        for (const [key, value] of Object.entries(result)) {
          clearValues[key] = BigInt(value);
        }
        return clearValues;
      },

      createDelegatedUserDecryptEIP712: function (
        publicKey,
        contractAddresses,
        delegatorAddress,
        startTimestamp,
        durationDays,
      ) {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${BASE_URL}/createDelegatedEIP712`, false);
        xhr.setRequestHeader("Content-Type", "application/json");
        xhr.send(
          JSON.stringify({
            publicKey,
            contractAddresses,
            delegatorAddress,
            startTimestamp,
            durationDays,
          }),
        );
        const result = JSON.parse(xhr.responseText);
        return {
          ...result,
          message: {
            ...result.message,
            startTimestamp: BigInt(result.message.startTimestamp),
            durationDays: BigInt(result.message.durationDays),
          },
        };
      },

      delegatedUserDecrypt: async function (
        handleContractPairs,
        privateKey,
        publicKey,
        signature,
        signedContractAddresses,
        delegatorAddress,
        delegateAddress,
        startTimestamp,
        durationDays,
      ) {
        console.log(
          "[Mock SDK] delegatedUserDecrypt called with",
          handleContractPairs.length,
          "handles",
        );
        const handles = handleContractPairs.map((p) => p.handle);
        const contractAddress = handleContractPairs[0]?.contractAddress || "";

        const response = await fetch(`${BASE_URL}/delegatedUserDecrypt`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            handles,
            contractAddress,
            signedContractAddresses,
            privateKey,
            publicKey,
            signature,
            delegatorAddress,
            delegateAddress,
            startTimestamp,
            durationDays,
          }),
        });

        const result = await response.json();
        console.log("[Mock SDK] delegatedUserDecrypt result:", result);

        const clearValues = {};
        for (const [key, value] of Object.entries(result)) {
          clearValues[key] = BigInt(value);
        }
        return clearValues;
      },

      getPublicKey: function () {
        return {
          publicKeyId: "mock-public-key-id",
          publicKey: new Uint8Array([1, 2, 3, 4]),
        };
      },

      getPublicParams: function (_bits) {
        return {
          publicParamsId: "mock-public-params-id",
          publicParams: new Uint8Array([5, 6, 7, 8]),
        };
      },

      publicDecrypt: async function (handles) {
        const response = await fetch(`${BASE_URL}/publicDecrypt`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ handles }),
        });
        const result = await response.json();
        const clearValues = {};
        for (const [key, value] of Object.entries(result.clearValues)) {
          clearValues[key] = BigInt(value);
        }
        return {
          clearValues,
          abiEncodedClearValues: result.abiEncodedClearValues,
          decryptionProof: result.decryptionProof,
        };
      },
    };
  },

  SepoliaConfig: { chainId: 11155111 },
  MainnetConfig: { chainId: 1 },
};

console.log("[Mock SDK] self.relayerSDK set up successfully");
