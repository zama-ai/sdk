/**
 * Mock RelayerSDK CDN Bundle for E2E testing.
 *
 * Loaded by the Web Worker via importScripts(). Sets self.relayerSDK with
 * a mock FhevmInstance that delegates crypto-heavy operations (encrypt,
 * decrypt) to the mock relayer HTTP server, while handling pure-data
 * operations (keypair generation, EIP-712 construction) locally.
 */
(function () {
  "use strict";

  // ── Utilities ─────────────────────────────────────────────

  function randomHex(byteCount) {
    const arr = new Uint8Array(byteCount);
    crypto.getRandomValues(arr);
    return Array.from(arr)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  function hexToBytes(hex) {
    const h = hex.startsWith("0x") ? hex.slice(2) : hex;
    const bytes = new Uint8Array(h.length / 2);
    for (let i = 0; i < h.length; i += 2) {
      bytes[i / 2] = parseInt(h.substr(i, 2), 16);
    }
    return bytes;
  }

  function bytesToHex(bytes) {
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  /**
   * Restore JSON-serialized clear values to their proper JS types.
   * BigInt values arrive as strings from JSON; booleans as true/false.
   * The handle encodes the FHE type at byte position (>> 8 & 0xff):
   *   0 = ebool, 7 = eaddress (hex string), rest = bigint.
   */
  function parseClearValues(clearValues) {
    const result = {};
    for (const [handle, value] of Object.entries(clearValues)) {
      const typeByte = Number((BigInt(handle) >> 8n) & 0xffn);
      if (typeByte === 0) {
        // ebool
        result[handle] = value === true || value === "true" || value === "1";
      } else if (typeByte === 7) {
        // eaddress — keep as hex string
        result[handle] = value;
      } else {
        // numeric — convert to bigint
        result[handle] = BigInt(value);
      }
    }
    return result;
  }

  // ── Encrypted input builder ───────────────────────────────

  function createEncryptedInputBuilder(config, contractAddress, userAddress) {
    const entries = [];

    function toBigIntStr(v) {
      if (typeof v === "boolean") {
        return v ? "1" : "0";
      }
      return String(v);
    }

    const builder = {
      addBool(v) {
        entries.push({
          type: "ebool",
          value: typeof v === "boolean" ? (v ? "1" : "0") : String(v),
        });
        return builder;
      },
      add8(v) {
        entries.push({ type: "euint8", value: toBigIntStr(v) });
        return builder;
      },
      add16(v) {
        entries.push({ type: "euint16", value: toBigIntStr(v) });
        return builder;
      },
      add32(v) {
        entries.push({ type: "euint32", value: toBigIntStr(v) });
        return builder;
      },
      add64(v) {
        entries.push({ type: "euint64", value: toBigIntStr(v) });
        return builder;
      },
      add128(v) {
        entries.push({ type: "euint128", value: toBigIntStr(v) });
        return builder;
      },
      add256(v) {
        entries.push({ type: "euint256", value: toBigIntStr(v) });
        return builder;
      },
      addAddress(v) {
        entries.push({ type: "eaddress", value: String(v) });
        return builder;
      },
      async encrypt() {
        const res = await fetch(config.relayerUrl + "/encrypt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            values: entries,
            contractAddress,
            userAddress,
            network: typeof config.network === "string" ? config.network : null,
            chainId: config.chainId,
            aclContractAddress: config.aclContractAddress,
            gatewayChainId: config.gatewayChainId,
            verifyingContractAddressInputVerification:
              config.verifyingContractAddressInputVerification,
          }),
        });
        if (!res.ok) {
          throw new Error("Mock encrypt failed: " + res.status + " " + (await res.text()));
        }
        const data = await res.json();
        return {
          handles: data.handles.map((h) => hexToBytes(h)),
          inputProof: hexToBytes(data.inputProof),
        };
      },
    };
    return builder;
  }

  // ── Mock FhevmInstance ────────────────────────────────────

  function createMockInstance(config) {
    return {
      config,

      createEncryptedInput(contractAddress, userAddress) {
        return createEncryptedInputBuilder(config, contractAddress, userAddress);
      },

      generateKeypair() {
        return {
          publicKey: randomHex(32),
          privateKey: randomHex(32),
        };
      },

      async getExtraData() {
        return "00";
      },

      createEIP712(publicKey, contractAddresses, startTimestamp, durationDays, _extraData) {
        return {
          domain: {
            name: "Decryption",
            version: "1",
            chainId: config.chainId,
            verifyingContract: config.verifyingContractAddressDecryption,
          },
          types: {
            UserDecryptRequestVerification: [
              { name: "publicKey", type: "bytes" },
              { name: "contractAddresses", type: "address[]" },
              { name: "startTimestamp", type: "uint256" },
              { name: "durationDays", type: "uint256" },
              { name: "extraData", type: "bytes" },
            ],
          },
          primaryType: "UserDecryptRequestVerification",
          message: {
            publicKey: publicKey,
            contractAddresses: contractAddresses,
            startTimestamp: startTimestamp,
            durationDays: durationDays,
            extraData: "00",
          },
        };
      },

      createDelegatedUserDecryptEIP712(
        publicKey,
        contractAddresses,
        delegatorAddress,
        startTimestamp,
        durationDays,
        _extraData,
      ) {
        return {
          domain: {
            name: "Decryption",
            version: "1",
            chainId: config.chainId,
            verifyingContract: config.verifyingContractAddressDecryption,
          },
          types: {
            DelegatedUserDecryptRequestVerification: [
              { name: "publicKey", type: "bytes" },
              { name: "contractAddresses", type: "address[]" },
              { name: "delegatorAddress", type: "address" },
              { name: "startTimestamp", type: "uint256" },
              { name: "durationDays", type: "uint256" },
              { name: "extraData", type: "bytes" },
            ],
          },
          primaryType: "DelegatedUserDecryptRequestVerification",
          message: {
            publicKey: publicKey,
            contractAddresses: contractAddresses,
            delegatorAddress: delegatorAddress,
            startTimestamp: String(startTimestamp),
            durationDays: String(durationDays),
            extraData: "00",
          },
        };
      },

      async userDecrypt(
        handleContractPairs,
        privateKey,
        publicKey,
        signature,
        contractAddresses,
        signerAddress,
        startTimestamp,
        durationDays,
        _extraData,
      ) {
        const res = await fetch(config.relayerUrl + "/user-decrypt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            handles: handleContractPairs.map((h) => ({
              handle: h.handle,
              contractAddress: h.contractAddress,
            })),
            privateKey,
            publicKey,
            signature,
            contractAddresses,
            signerAddress,
            startTimestamp,
            durationDays,
            network: typeof config.network === "string" ? config.network : null,
            aclContractAddress: config.aclContractAddress,
          }),
        });
        if (!res.ok) {
          const text = await res.text();
          const err = new Error("Mock userDecrypt failed: " + text);
          try {
            const parsed = JSON.parse(text);
            if (parsed.statusCode) {
              err.statusCode = parsed.statusCode;
            }
          } catch {}
          throw err;
        }
        const data = await res.json();
        return parseClearValues(data);
      },

      async publicDecrypt(handles) {
        const handleStrings = handles.map((h) =>
          h instanceof Uint8Array ? "0x" + bytesToHex(h) : h,
        );
        const res = await fetch(config.relayerUrl + "/public-decrypt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            handles: handleStrings,
            network: typeof config.network === "string" ? config.network : null,
            aclContractAddress: config.aclContractAddress,
            verifyingContractAddressDecryption: config.verifyingContractAddressDecryption,
            gatewayChainId: config.gatewayChainId,
          }),
        });
        if (!res.ok) {
          throw new Error("Mock publicDecrypt failed: " + (await res.text()));
        }
        const data = await res.json();
        return {
          clearValues: parseClearValues(data.clearValues),
          abiEncodedClearValues: data.abiEncodedClearValues,
          decryptionProof: data.decryptionProof,
        };
      },

      async delegatedUserDecrypt(
        handleContractPairs,
        privateKey,
        publicKey,
        signature,
        contractAddresses,
        delegatorAddress,
        delegateAddress,
        startTimestamp,
        durationDays,
        _extraData,
      ) {
        const res = await fetch(config.relayerUrl + "/delegated-user-decrypt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            handles: handleContractPairs.map((h) => ({
              handle: h.handle,
              contractAddress: h.contractAddress,
            })),
            privateKey,
            publicKey,
            signature,
            contractAddresses,
            delegatorAddress,
            delegateAddress,
            startTimestamp,
            durationDays,
            network: typeof config.network === "string" ? config.network : null,
            aclContractAddress: config.aclContractAddress,
          }),
        });
        if (!res.ok) {
          throw new Error("Mock delegatedUserDecrypt failed: " + (await res.text()));
        }
        const data = await res.json();
        return parseClearValues(data.clearValues);
      },

      async requestZKProofVerification() {
        throw new Error("Not implemented in mock relayer SDK");
      },

      getPublicKey() {
        return {
          publicKeyId: "mock-public-key-id",
          publicKey: new Uint8Array([1, 2, 3, 4]),
        };
      },

      getPublicParams(_bits) {
        return {
          publicParamsId: "mock-public-params-id",
          publicParams: new Uint8Array([5, 6, 7, 8]),
        };
      },
    };
  }

  // ── Public API (set on worker global) ─────────────────────

  self.relayerSDK = {
    async initSDK(_opts) {
      return true;
    },
    async createInstance(config) {
      return createMockInstance(config);
    },
    SepoliaConfig: {},
    MainnetConfig: {},
  };
})();
