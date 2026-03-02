import { MockFhevmInstance } from "@fhevm/mock-utils";
import { Page } from "@playwright/test";
import { JsonRpcProvider } from "ethers";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hardhat } from "viem/chains";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function createMockFhevmInstance(chainId: number, rpcUrl: string) {
  const provider = new JsonRpcProvider(rpcUrl);
  const fhevm = await MockFhevmInstance.create(
    provider,
    provider,
    {
      chainId,
      gatewayChainId: 10901,
      aclContractAddress: "0x50157CFfD6bBFA2DECe204a89ec419c23ef5755D",
      inputVerifierContractAddress: "0x36772142b74871f255CbD7A3e89B401d3e45825f",
      kmsContractAddress: "0xbE0E383937d564D7FF0BC3b46c51f0bF8d5C311A",
      verifyingContractAddressDecryption: "0x5ffdaAB0373E62E2ea2944776209aEf29E631A64",
      verifyingContractAddressInputVerification: "0x812b06e1CDCE800494b79fFE4f925A504a9A9810",
    },
    {
      inputVerifierProperties: {},
      kmsVerifierProperties: {},
    },
  );

  return fhevm;
}

export async function mockRelayerSdk(page: Page, baseURL: string) {
  const rpcUrl = hardhat.rpcUrls.default.http[0];
  const provider = new JsonRpcProvider(rpcUrl);

  const fhevm = await createMockFhevmInstance(hardhat.id, rpcUrl);

  // Mutex to serialize userDecrypt retry loops — concurrent calls both mine
  // blocks and retry simultaneously, interfering with each other's coprocessor sync.
  let decryptLock: Promise<void> = Promise.resolve();

  await page.route(`${baseURL}/generateKeypair`, async (route) => {
    const result = fhevm.generateKeypair();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(result),
    });
  });

  await page.route(`${baseURL}/createEIP712`, async (route) => {
    const body = route.request().postDataJSON();
    const result = fhevm.createEIP712(
      body.publicKey,
      body.contractAddresses,
      body.startTimestamp,
      body.durationDays,
    );
    const serialized = JSON.stringify(result, (_, value) =>
      typeof value === "bigint" ? value.toString() : value,
    );
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: serialized,
    });
  });

  await page.route(`${baseURL}/encrypt`, async (route) => {
    const body = route.request().postDataJSON();
    const input = fhevm.createEncryptedInput(body.contractAddress, body.userAddress);
    for (const value of body.values) {
      input.add64(BigInt(value));
    }
    const encrypted = await input.encrypt();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        handles: encrypted.handles.map((h: Uint8Array) => Array.from(h)),
        inputProof: Array.from(encrypted.inputProof),
      }),
    });
  });

  await page.route(`${baseURL}/userDecrypt`, async (route) => {
    const body = route.request().postDataJSON();

    // Serialize retry loops: concurrent userDecrypt calls would each mine
    // blocks independently, causing the coprocessor to get out of sync.
    let resolve: () => void;
    const prev = decryptLock;
    decryptLock = new Promise<void>((r) => {
      resolve = r;
    });
    await prev;

    try {
      const handleContractPairs = body.handles.map((handle: string) => ({
        handle,
        contractAddress: body.contractAddress,
      }));

      const callDecrypt = () =>
        fhevm.userDecrypt(
          handleContractPairs,
          body.privateKey,
          body.publicKey,
          body.signature,
          body.signedContractAddresses,
          body.signerAddress,
          body.startTimestamp,
          body.durationDays,
        );

      // After evm_revert or a state-changing tx the Hardhat mock
      // coprocessor may be out of sync:
      //  1. BlockLogCursor points past chain head → "Invalid block filter"
      //  2. ACL logs not yet processed → "is not authorized to user decrypt"
      // In both cases, mining blocks advances the coprocessor cursor so it
      // can catch up with on-chain state, then we retry.
      const MAX_ACL_RETRIES = 2;
      let result: Awaited<ReturnType<typeof callDecrypt>>;

      for (let attempt = 0; attempt <= MAX_ACL_RETRIES; attempt++) {
        try {
          result = await callDecrypt();
          break;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);

          const blockFilterMatch = message.match(
            /Invalid block filter fromBlock=(\d+) toBlock=(\d+)/,
          );
          const aclMatch = message.match(/is not authorized to user decrypt/);

          if (!blockFilterMatch && !aclMatch) {
            await route.fulfill({
              status: 500,
              contentType: "application/json",
              body: JSON.stringify({ error: message }),
            });
            return;
          }

          if (blockFilterMatch) {
            const delta = Number(blockFilterMatch[1]) - Number(blockFilterMatch[2]) + 1;
            await provider.send("hardhat_mine", [`0x${delta.toString(16)}`]);
          } else {
            if (attempt === MAX_ACL_RETRIES) {
              await route.fulfill({
                status: 500,
                contentType: "application/json",
                body: JSON.stringify({ error: message }),
              });
              return;
            }
            await provider.send("hardhat_mine", ["0x1"]);
          }
        }
      }
      result = result!;

      const serialized: Record<string, string> = {};
      for (const [key, value] of Object.entries(result)) {
        serialized[key] = String(value);
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(serialized),
      });
    } finally {
      resolve!();
    }
  });

  await page.route(`${baseURL}/publicDecrypt`, async (route) => {
    const body = route.request().postDataJSON();

    // Serialize with userDecrypt to avoid concurrent block-mining interference.
    let resolve: () => void;
    const prev = decryptLock;
    decryptLock = new Promise<void>((r) => {
      resolve = r;
    });
    await prev;

    try {
      const callDecrypt = () => fhevm.publicDecrypt(body.handles);

      const MAX_RETRIES = 10;
      let result: Awaited<ReturnType<typeof callDecrypt>>;

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          result = await callDecrypt();
          break;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const blockFilterMatch = message.match(
            /Invalid block filter fromBlock=(\d+) toBlock=(\d+)/,
          );
          const coprocessorMatch =
            message.includes("Cannot convert 0x to a BigInt") ||
            message.includes("is not authorized");

          if (!blockFilterMatch && !coprocessorMatch) {
            await route.fulfill({
              status: 500,
              contentType: "application/json",
              body: JSON.stringify({ error: message }),
            });
            return;
          }

          if (attempt === MAX_RETRIES) {
            await route.fulfill({
              status: 500,
              contentType: "application/json",
              body: JSON.stringify({ error: message }),
            });
            return;
          }

          if (blockFilterMatch) {
            const delta = Number(blockFilterMatch[1]) - Number(blockFilterMatch[2]) + 1;
            await provider.send("hardhat_mine", [`0x${delta.toString(16)}`]);
          } else {
            // Mine several blocks to give the coprocessor time to process
            await provider.send("hardhat_mine", ["0x5"]);
          }
        }
      }
      result = result!;

      const clearValues: Record<string, string> = {};
      for (const [key, value] of Object.entries(result.clearValues)) {
        clearValues[key] = String(value);
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          clearValues,
          abiEncodedClearValues: result.abiEncodedClearValues,
          decryptionProof: result.decryptionProof,
        }),
      });
    } finally {
      resolve!();
    }
  });

  // Intercept the CDN SDK request and return a mock script
  await page.route("**/cdn.zama.org/relayer-sdk-js/**/*.cjs", async (route) => {
    const fixturesDir = path.resolve(__dirname);
    const mockRelayerSdkPath = path.resolve(fixturesDir, "relayer-sdk.js");
    if (!mockRelayerSdkPath.startsWith(fixturesDir + path.sep)) {
      throw new Error("Path traversal detected in mock SDK path");
    }
    const mockRelayerSdkScript = fs.readFileSync(mockRelayerSdkPath, "utf-8");

    await route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: mockRelayerSdkScript.replace("__BASE_URL__", baseURL),
    });
  });
}
