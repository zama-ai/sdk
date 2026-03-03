import { Page } from "@playwright/test";
import { JsonRpcProvider } from "ethers";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hardhat } from "viem/chains";
import {
  CleartextFhevmInstance,
  GATEWAY_CHAIN_ID,
  VERIFYING_CONTRACTS,
} from "@zama-fhe/sdk/cleartext";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const FHEVM_ADDRESSES = {
  acl: "0x50157CFfD6bBFA2DECe204a89ec419c23ef5755D",
  executor: "0xe3a9105a3a932253A70F126eb1E3b589C643dD24",
  inputVerifier: "0x36772142b74871f255CbD7A3e89B401d3e45825f",
  kmsVerifier: "0x901F8942346f7AB3a01F6D7613119Bca447Bb030",
} as const;

function createMockFhevmInstance(rpcUrl: string) {
  const provider = new JsonRpcProvider(rpcUrl);
  return new CleartextFhevmInstance(provider, {
    chainId: BigInt(hardhat.id),
    gatewayChainId: GATEWAY_CHAIN_ID,
    aclAddress: FHEVM_ADDRESSES.acl,
    executorProxyAddress: FHEVM_ADDRESSES.executor,
    inputVerifierContractAddress: FHEVM_ADDRESSES.inputVerifier,
    kmsContractAddress: FHEVM_ADDRESSES.kmsVerifier,
    verifyingContractAddressInputVerification: VERIFYING_CONTRACTS.inputVerification,
    verifyingContractAddressDecryption: VERIFYING_CONTRACTS.decryption,
  });
}

export async function mockRelayerSdk(page: Page, baseURL: string) {
  const rpcUrl = hardhat.rpcUrls.default.http[0];

  const fhevm = createMockFhevmInstance(rpcUrl);

  await page.route(`${baseURL}/generateKeypair`, async (route) => {
    const result = await fhevm.generateKeypair();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(result),
    });
  });

  await page.route(`${baseURL}/createEIP712`, async (route) => {
    const body = route.request().postDataJSON();
    const result = await fhevm.createEIP712(
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
    const encrypted = await fhevm.encrypt({
      values: body.values.map((value: string | number | bigint) => BigInt(value)),
      contractAddress: body.contractAddress,
      userAddress: body.userAddress,
    });
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
    try {
      const result = await fhevm.userDecrypt({
        handles: body.handles,
        contractAddress: body.contractAddress,
        signedContractAddresses: body.signedContractAddresses,
        privateKey: body.privateKey,
        publicKey: body.publicKey,
        signature: body.signature,
        signerAddress: body.signerAddress,
        startTimestamp: body.startTimestamp,
        durationDays: body.durationDays,
      });

      const serialized: Record<string, string> = {};
      for (const [key, value] of Object.entries(result)) {
        serialized[key] = String(value);
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(serialized),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: message }),
      });
    }
  });

  await page.route(`${baseURL}/publicDecrypt`, async (route) => {
    const body = route.request().postDataJSON();
    try {
      const result = await fhevm.publicDecrypt(body.handles);

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
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: message }),
      });
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
