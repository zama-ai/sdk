import { Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCleartextRelayer } from "@zama-fhe/sdk/cleartext";
import deployments from "../../../hardhat/deployments.json" with { type: "json" };
import { GATEWAY_CHAIN_ID, VERIFYING_CONTRACTS } from "@zama-fhe/sdk/cleartext";
import type { CleartextChainConfig } from "@zama-fhe/sdk/cleartext";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const hardhat = {
  chainId: 31_337n,
  gatewayChainId: GATEWAY_CHAIN_ID,
  rpcUrl: "http://127.0.0.1:8545",
  contracts: {
    acl: deployments.fhevm.acl as `0x${string}`,
    executor: deployments.fhevm.executor as `0x${string}`,
    inputVerifier: deployments.fhevm.inputVerifier as `0x${string}`,
    kmsVerifier: deployments.fhevm.kmsVerifier as `0x${string}`,
    verifyingInputVerifier: VERIFYING_CONTRACTS.inputVerification,
    verifyingDecryption: VERIFYING_CONTRACTS.decryption,
  },
} satisfies CleartextChainConfig;

export async function mockRelayerSdk(page: Page, baseURL: string) {
  const fhevm = createCleartextRelayer(hardhat);

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
      values: body.values.map((item: { value: string; type: string }) => ({
        value: BigInt(item.value),
        type: item.type,
      })),
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

  await page.route(`${baseURL}/createDelegatedEIP712`, async (route) => {
    const body = route.request().postDataJSON();
    const result = await fhevm.createDelegatedUserDecryptEIP712(
      body.publicKey,
      body.contractAddresses,
      body.delegatorAddress,
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

  await page.route(`${baseURL}/delegatedUserDecrypt`, async (route) => {
    const body = route.request().postDataJSON();
    try {
      const result = await fhevm.delegatedUserDecrypt({
        handles: body.handles,
        contractAddress: body.contractAddress,
        privateKey: body.privateKey,
        publicKey: body.publicKey,
        signature: body.signature,
        signedContractAddresses: body.signedContractAddresses,
        delegatorAddress: body.delegatorAddress,
        delegateAddress: body.delegateAddress,
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
