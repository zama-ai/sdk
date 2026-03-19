import type { Page } from "@playwright/test";
import { RelayerCleartext, hardhatCleartextConfig } from "@zama-fhe/sdk/cleartext";
import type { Address, Hex } from "viem";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function mockRelayerSdk({
  page,
  baseURL,
  rpcURL,
}: {
  page: Page;
  baseURL: string;
  rpcURL: string;
}) {
  const fhevm = new RelayerCleartext({
    ...hardhatCleartextConfig,
    network: rpcURL,
  });

  // Mutex to serialize decrypt calls — prevents concurrent calls from
  // interfering with each other's coprocessor sync.
  let decryptLock: Promise<void> = Promise.resolve();

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
      contractAddress: body.contractAddress as Address,
      userAddress: body.userAddress as Address,
      values: (body.values as { value: string; type: string }[]).map(
        (v: { value: string; type: string }) => {
          if (v.type === "eaddress") {
            return { value: v.value as Address, type: "eaddress" as const };
          }
          return {
            value: BigInt(v.value),
            type: v.type as "euint64",
          };
        },
      ),
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        handles: encrypted.handles.map((h) => Array.from(h)),
        inputProof: Array.from(encrypted.inputProof),
      }),
    });
  });

  await page.route(`${baseURL}/userDecrypt`, async (route) => {
    const body = route.request().postDataJSON();
    const validHandles = (body.handles as (string | null)[]).filter(
      (h): h is string => typeof h === "string",
    );

    try {
      const result = await fhevm.userDecrypt({
        handles: validHandles as Hex[],
        contractAddress: body.contractAddress as Address,
        privateKey: body.privateKey as Hex,
        publicKey: body.publicKey as Hex,
        signature: body.signature as Hex,
        signedContractAddresses: body.signedContractAddresses as Address[],
        signerAddress: body.signerAddress as Address,
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
    let resolve: () => void;
    const prev = decryptLock;
    decryptLock = new Promise<void>((r) => {
      resolve = r;
    });
    await prev;

    try {
      const validHandles = (body.handles as (string | null)[]).filter(
        (h): h is string => typeof h === "string",
      );

      if (validHandles.length === 0) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({}),
        });
        return;
      }

      const result = await fhevm.delegatedUserDecrypt({
        handles: validHandles as Hex[],
        contractAddress: body.contractAddress as Address,
        privateKey: body.privateKey as Hex,
        publicKey: body.publicKey as Hex,
        signature: body.signature as Hex,
        signedContractAddresses: body.signedContractAddresses as Address[],
        delegatorAddress: body.delegatorAddress as Address,
        delegateAddress: body.delegateAddress as Address,
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
    } finally {
      resolve!();
    }
  });

  await page.route(`${baseURL}/publicDecrypt`, async (route) => {
    const body = route.request().postDataJSON();
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
  });

  // Intercept the relayer-sdk UMD bundle (loaded as a local asset by the worker)
  await page.route("**/relayer-sdk-js.umd.cjs*", async (route) => {
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
