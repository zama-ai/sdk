import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  GATEWAY_CHAIN_ID as SHARED_GATEWAY_CHAIN_ID,
  VERIFYING_CONTRACTS as SHARED_VERIFYING_CONTRACTS,
} from "../hardhat-constants";
import { GATEWAY_CHAIN_ID, VERIFYING_CONTRACTS } from "../presets";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEPLOY_SCRIPT_PATH = path.resolve(__dirname, "../../../../../../hardhat/deploy/deploy.ts");

describe("cleartext presets", () => {
  it("uses the shared hardhat constants module", () => {
    expect(GATEWAY_CHAIN_ID).toBe(SHARED_GATEWAY_CHAIN_ID);
    expect(VERIFYING_CONTRACTS.inputVerification).toBe(SHARED_VERIFYING_CONTRACTS.inputVerification);
    expect(VERIFYING_CONTRACTS.decryption).toBe(SHARED_VERIFYING_CONTRACTS.decryption);
  });

  it("stays in sync with hardhat deploy gateway constants", () => {
    expect(fs.existsSync(DEPLOY_SCRIPT_PATH)).toBe(true);
    const deployScriptSource = fs.readFileSync(DEPLOY_SCRIPT_PATH, "utf-8");

    const chainIdMatch = deployScriptSource.match(/const GATEWAY_CHAIN_ID = ([0-9_]+);/);
    expect(chainIdMatch).not.toBeNull();
    if (!chainIdMatch?.[1]) {
      throw new Error("Failed to find GATEWAY_CHAIN_ID in hardhat deploy script");
    }
    const hardhatGatewayChainId = Number(chainIdMatch[1].replaceAll("_", ""));
    expect(hardhatGatewayChainId).toBe(SHARED_GATEWAY_CHAIN_ID);

    const verifyingContractsMatch = deployScriptSource.match(
      /const GATEWAY_VERIFYING_CONTRACTS = \{\s*inputVerification: "([^"]+)",\s*decryption: "([^"]+)",\s*\} as const;/s,
    );
    expect(verifyingContractsMatch).not.toBeNull();
    if (!verifyingContractsMatch?.[1] || !verifyingContractsMatch?.[2]) {
      throw new Error("Failed to find gateway verifying contracts in hardhat deploy script");
    }
    const inputVerification = verifyingContractsMatch[1];
    const decryption = verifyingContractsMatch[2];

    expect(inputVerification).toBe(SHARED_VERIFYING_CONTRACTS.inputVerification);
    expect(decryption).toBe(SHARED_VERIFYING_CONTRACTS.decryption);
  });
});
