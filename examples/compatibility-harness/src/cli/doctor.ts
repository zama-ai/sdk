import "dotenv/config";
import { networkConfig } from "../config/network.js";
import type { DiagnosticCode, RootCauseCategory } from "../adapter/types.js";
import {
  adapter,
  getAdapterAddress,
  initializeAdapter,
  adapterSource,
  adapterDeclaredCapabilities,
} from "../harness/adapter.js";
import { classifyInfrastructureIssue, errorMessage } from "../harness/diagnostics.js";
import { publicClient } from "../utils/rpc.js";

type DoctorStatus = "PASS" | "BLOCKED" | "INCONCLUSIVE";

type DoctorCheck = {
  name: string;
  status: DoctorStatus;
  note: string;
  rootCauseCategory?: RootCauseCategory;
  errorCode?: DiagnosticCode;
};

async function runCheck(name: string, fn: () => Promise<string>): Promise<DoctorCheck> {
  try {
    const note = await fn();
    return { name, status: "PASS", note };
  } catch (error) {
    const message = errorMessage(error);
    const diagnostic = classifyInfrastructureIssue(message);
    return {
      name,
      status: diagnostic.status === "BLOCKED" ? "BLOCKED" : "INCONCLUSIVE",
      note: message,
      rootCauseCategory: diagnostic.rootCauseCategory,
      errorCode: diagnostic.errorCode,
    };
  }
}

async function runDoctor(): Promise<number> {
  const checks: DoctorCheck[] = [];

  checks.push({
    name: "Adapter Module",
    status: "PASS",
    note: `${adapter.metadata.name} (${adapterSource})`,
  });
  checks.push({
    name: "Declared Capabilities",
    status: "PASS",
    note: Object.entries(adapterDeclaredCapabilities)
      .map(([key, value]) => `${key}=${value}`)
      .join(", "),
  });

  checks.push(
    await runCheck("Adapter Initialization", async () => {
      await initializeAdapter();
      return "Initialization succeeded";
    }),
  );

  checks.push(
    await runCheck("Address Resolution", async () => {
      const address = await getAdapterAddress();
      return `Resolved ${address}`;
    }),
  );

  checks.push(
    await runCheck("RPC Connectivity", async () => {
      const chainId = await publicClient.getChainId();
      if (chainId !== networkConfig.chainId) {
        throw new Error(
          `RPC chain mismatch: expected ${networkConfig.chainId}, got ${chainId} (${networkConfig.rpcUrl})`,
        );
      }
      return `RPC reachable on chain ${chainId}`;
    }),
  );

  checks.push(
    await runCheck("Relayer Reachability", async () => {
      const response = await fetch(networkConfig.relayerUrl, {
        method: "GET",
      });
      if (!response.ok) {
        throw new Error(`Relayer returned HTTP ${response.status} for ${networkConfig.relayerUrl}`);
      }
      return `Relayer responded with HTTP ${response.status}`;
    }),
  );

  const blocked = checks.filter((check) => check.status === "BLOCKED").length;
  const inconclusive = checks.filter((check) => check.status === "INCONCLUSIVE").length;

  console.log("\nDoctor Report");
  console.log("=============\n");
  for (const check of checks) {
    const icon = check.status === "PASS" ? "✓" : check.status === "BLOCKED" ? "!" : "?";
    console.log(`${icon} ${check.name}: ${check.status}`);
    console.log(`  ${check.note}`);
    if (check.rootCauseCategory) console.log(`  rootCause=${check.rootCauseCategory}`);
    if (check.errorCode) console.log(`  errorCode=${check.errorCode}`);
  }
  console.log("");
  console.log(
    `Summary: ${checks.length - blocked - inconclusive} PASS, ${blocked} BLOCKED, ${inconclusive} INCONCLUSIVE`,
  );

  if (blocked > 0) return 2;
  if (inconclusive > 0) return 3;
  return 0;
}

runDoctor()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error("Doctor failed unexpectedly:", errorMessage(error));
    process.exitCode = 99;
  });
