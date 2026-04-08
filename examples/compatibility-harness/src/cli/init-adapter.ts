import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_OUTPUT_PATH = "./my-adapter.ts";

export function resolveOutputPath(
  argv: string[] = process.argv,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const argPath = argv[2]?.trim();
  if (argPath) return argPath;
  const envPath = env.ADAPTER_TEMPLATE_PATH?.trim();
  if (envPath) return envPath;
  return DEFAULT_OUTPUT_PATH;
}

export function importPathForTarget(outputPath: string): string {
  const from = dirname(outputPath);
  const relativePath = relative(from, "./src/adapter/types.js");
  const normalized = relativePath.startsWith(".") ? relativePath : `./${relativePath}`;
  return normalized.replaceAll("\\", "/");
}

export function templateFor(outputPath: string): string {
  const typesImportPath = importPathForTarget(outputPath);
  return `import type { Adapter } from "${typesImportPath}";

export const adapter: Adapter = {
  metadata: {
    name: "My Adapter",
    declaredArchitecture: "UNKNOWN",
    verificationModel: "UNKNOWN",
    supportedChainIds: [11155111],
    notes: ["Generated via npm run init:adapter"],
  },
  capabilities: {
    addressResolution: "SUPPORTED",
    eip712Signing: "SUPPORTED",
    recoverableEcdsa: "UNKNOWN",
    rawTransactionSigning: "UNSUPPORTED",
    contractExecution: "SUPPORTED",
    contractReads: "SUPPORTED",
    transactionReceiptTracking: "UNKNOWN",
    zamaAuthorizationFlow: "SUPPORTED",
    zamaWriteFlow: "UNKNOWN",
  },
  async init() {
    // Optional async bootstrap
  },
  async getAddress() {
    throw new Error("Implement getAddress()");
  },
  async signTypedData(_data) {
    throw new Error("Implement signTypedData()");
  },
  async writeContract(_config) {
    throw new Error("Implement writeContract() or mark contractExecution unsupported");
  },
  // Optional:
  // async signTransaction(tx) { ... }
  // async readContract(config) { ... }
  // async waitForTransactionReceipt(hash) { ... }
};
`;
}

export function runInitAdapter(
  argv: string[] = process.argv,
  env: NodeJS.ProcessEnv = process.env,
): number {
  const outputPath = resolveOutputPath(argv, env);
  if (existsSync(outputPath)) {
    console.error(`init:adapter: file already exists at ${outputPath}`);
    return 2;
  }

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, templateFor(outputPath));

  console.log("Adapter template created.");
  console.log(`Path: ${outputPath}`);
  console.log(`Run:  SIGNER_MODULE=${outputPath} npm test`);
  return 0;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  process.exitCode = runInitAdapter();
}
