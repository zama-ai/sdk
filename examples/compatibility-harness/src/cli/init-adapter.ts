import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_OUTPUT_PATH = "./my-adapter.ts";
const DEFAULT_TEMPLATE = "generic";

export type AdapterTemplateKind =
  | "generic"
  | "eoa"
  | "mpc"
  | "api-routed"
  | "turnkey"
  | "crossmint"
  | "openfort";

export interface InitAdapterConfig {
  outputPath: string;
  template: AdapterTemplateKind;
  showHelp: boolean;
}

const TEMPLATE_ALIASES: Record<string, AdapterTemplateKind> = {
  generic: "generic",
  eoa: "eoa",
  mpc: "mpc",
  api: "api-routed",
  "api-routed": "api-routed",
  turnkey: "turnkey",
  crossmint: "crossmint",
  openfort: "openfort",
};

export function normalizeTemplate(input: string | undefined): AdapterTemplateKind {
  const normalized = input?.trim().toLowerCase();
  if (!normalized) return DEFAULT_TEMPLATE;
  const resolved = TEMPLATE_ALIASES[normalized];
  if (!resolved) {
    const valid = Object.keys(TEMPLATE_ALIASES).sort().join(", ");
    throw new Error(`Unsupported template "${input}". Supported templates: ${valid}.`);
  }
  return resolved;
}

export function resolveInitAdapterConfig(
  argv: string[] = process.argv,
  env: NodeJS.ProcessEnv = process.env,
): InitAdapterConfig {
  const args = argv.slice(2);
  let outputPath: string | undefined;
  let templateInput = env.ADAPTER_TEMPLATE?.trim();
  let showHelp = false;

  for (let i = 0; i < args.length; i += 1) {
    const current = args[i]?.trim();
    if (!current) continue;

    if (current === "-h" || current === "--help") {
      showHelp = true;
      continue;
    }

    if (current === "-o" || current === "--output") {
      outputPath = args[i + 1]?.trim();
      i += 1;
      continue;
    }

    if (current === "-t" || current === "--template") {
      templateInput = args[i + 1]?.trim();
      i += 1;
      continue;
    }

    if (!current.startsWith("-")) {
      outputPath = current;
      continue;
    }

    throw new Error(`Unsupported option "${current}". Use --help for usage.`);
  }

  const envPath = env.ADAPTER_TEMPLATE_PATH?.trim();
  const resolvedOutputPath = outputPath ?? envPath ?? DEFAULT_OUTPUT_PATH;
  const template = normalizeTemplate(templateInput);
  return { outputPath: resolvedOutputPath, template, showHelp };
}

export function resolveOutputPath(
  argv: string[] = process.argv,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return resolveInitAdapterConfig(argv, env).outputPath;
}

export function importPathForTarget(outputPath: string): string {
  const from = dirname(outputPath);
  const relativePath = relative(from, "./src/adapter/types.js");
  const normalized = relativePath.startsWith(".") ? relativePath : `./${relativePath}`;
  return normalized.replaceAll("\\", "/");
}

export function templateFor(
  outputPath: string,
  template: AdapterTemplateKind = DEFAULT_TEMPLATE,
): string {
  const typesImportPath = importPathForTarget(outputPath);
  const sharedHeader = `import type { Adapter } from "${typesImportPath}";

`;

  if (template === "eoa") {
    return `${sharedHeader}export const adapter: Adapter = {
  metadata: {
    name: "My EOA Adapter",
    declaredArchitecture: "EOA",
    verificationModel: "RECOVERABLE_ECDSA",
    supportedChainIds: [11155111],
    notes: ["Generated via npm run init:adapter -- --template eoa"],
  },
  capabilities: {
    addressResolution: "SUPPORTED",
    eip712Signing: "SUPPORTED",
    recoverableEcdsa: "SUPPORTED",
    rawTransactionSigning: "SUPPORTED",
    contractExecution: "SUPPORTED",
    contractReads: "SUPPORTED",
    transactionReceiptTracking: "SUPPORTED",
    zamaAuthorizationFlow: "SUPPORTED",
    zamaWriteFlow: "SUPPORTED",
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
  async signTransaction(_tx) {
    throw new Error("Implement signTransaction()");
  },
  async writeContract(_config) {
    throw new Error("Implement writeContract()");
  },
  // Optional:
  // async readContract(config) { ... }
  // async waitForTransactionReceipt(hash) { ... }
};
`;
  }

  if (template === "mpc") {
    return `${sharedHeader}export const adapter: Adapter = {
  metadata: {
    name: "My MPC Adapter",
    declaredArchitecture: "MPC",
    verificationModel: "RECOVERABLE_ECDSA",
    supportedChainIds: [11155111],
    notes: ["Generated via npm run init:adapter -- --template mpc"],
  },
  capabilities: {
    addressResolution: "SUPPORTED",
    eip712Signing: "SUPPORTED",
    recoverableEcdsa: "SUPPORTED",
    rawTransactionSigning: "UNSUPPORTED",
    contractExecution: "SUPPORTED",
    contractReads: "SUPPORTED",
    transactionReceiptTracking: "SUPPORTED",
    zamaAuthorizationFlow: "SUPPORTED",
    zamaWriteFlow: "SUPPORTED",
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
    throw new Error("Implement writeContract() via your provider API");
  },
  // Optional:
  // async readContract(config) { ... }
  // async waitForTransactionReceipt(hash) { ... }
};
`;
  }

  if (template === "api-routed") {
    return `${sharedHeader}export const adapter: Adapter = {
  metadata: {
    name: "My API-Routed Adapter",
    declaredArchitecture: "API_ROUTED_EXECUTION",
    verificationModel: "PROVIDER_MANAGED",
    supportedChainIds: [11155111],
    notes: ["Generated via npm run init:adapter -- --template api-routed"],
  },
  capabilities: {
    addressResolution: "SUPPORTED",
    eip712Signing: "UNKNOWN",
    recoverableEcdsa: "UNKNOWN",
    rawTransactionSigning: "UNSUPPORTED",
    contractExecution: "SUPPORTED",
    contractReads: "SUPPORTED",
    transactionReceiptTracking: "SUPPORTED",
    zamaAuthorizationFlow: "UNKNOWN",
    zamaWriteFlow: "UNKNOWN",
  },
  async init() {
    // Optional async bootstrap
  },
  async getAddress() {
    throw new Error("Implement getAddress()");
  },
  async writeContract(_config) {
    throw new Error("Implement writeContract() via your provider API");
  },
  // Optional:
  // async signTypedData(data) { ... }
  // async readContract(config) { ... }
  // async waitForTransactionReceipt(hash) { ... }
};
`;
  }

  if (template === "turnkey") {
    return `${sharedHeader}export const adapter: Adapter = {
  metadata: {
    name: "Turnkey API Key Adapter",
    declaredArchitecture: "API_ROUTED_EXECUTION",
    verificationModel: "UNKNOWN",
    supportedChainIds: [11155111],
    notes: ["Generated via npm run init:adapter -- --template turnkey"],
  },
  capabilities: {
    addressResolution: "SUPPORTED",
    eip712Signing: "SUPPORTED",
    recoverableEcdsa: "UNKNOWN",
    rawTransactionSigning: "UNSUPPORTED",
    contractExecution: "SUPPORTED",
    contractReads: "SUPPORTED",
    transactionReceiptTracking: "SUPPORTED",
    zamaAuthorizationFlow: "SUPPORTED",
    zamaWriteFlow: "SUPPORTED",
  },
  async init() {
    // Optional async bootstrap for API client and account resolution.
  },
  async getAddress() {
    throw new Error("Implement getAddress() from Turnkey account metadata");
  },
  async signTypedData(_data) {
    throw new Error("Implement signTypedData() via @turnkey/viem account");
  },
  async writeContract(_config) {
    throw new Error("Implement writeContract() via Turnkey wallet client");
  },
  async readContract(_config) {
    throw new Error("Implement readContract() via viem public client");
  },
  async waitForTransactionReceipt(_hash) {
    throw new Error("Implement waitForTransactionReceipt() via public client");
  },
};
`;
  }

  if (template === "crossmint") {
    return `${sharedHeader}export const adapter: Adapter = {
  metadata: {
    name: "Crossmint API-Routed Adapter",
    declaredArchitecture: "API_ROUTED_EXECUTION",
    verificationModel: "UNKNOWN",
    supportedChainIds: [11155111],
    notes: ["Generated via npm run init:adapter -- --template crossmint"],
  },
  capabilities: {
    addressResolution: "SUPPORTED",
    eip712Signing: "SUPPORTED",
    recoverableEcdsa: "UNKNOWN",
    rawTransactionSigning: "UNSUPPORTED",
    contractExecution: "SUPPORTED",
    contractReads: "UNSUPPORTED",
    transactionReceiptTracking: "UNSUPPORTED",
    zamaAuthorizationFlow: "SUPPORTED",
    zamaWriteFlow: "SUPPORTED",
  },
  async init() {
    // Optional async bootstrap for API auth and wallet discovery.
  },
  async getAddress() {
    throw new Error("Implement getAddress() from Crossmint wallet endpoint");
  },
  async signTypedData(_data) {
    throw new Error("Implement signTypedData() through Crossmint signatures API");
  },
  async writeContract(_config) {
    throw new Error("Implement writeContract() through Crossmint transactions API");
  },
};
`;
  }

  if (template === "openfort") {
    return `${sharedHeader}export const adapter: Adapter = {
  metadata: {
    name: "Openfort EOA Baseline Adapter",
    declaredArchitecture: "EOA",
    verificationModel: "RECOVERABLE_ECDSA",
    supportedChainIds: [11155111],
    notes: ["Generated via npm run init:adapter -- --template openfort"],
  },
  capabilities: {
    addressResolution: "SUPPORTED",
    eip712Signing: "SUPPORTED",
    recoverableEcdsa: "SUPPORTED",
    rawTransactionSigning: "SUPPORTED",
    contractExecution: "SUPPORTED",
    contractReads: "SUPPORTED",
    transactionReceiptTracking: "SUPPORTED",
    zamaAuthorizationFlow: "SUPPORTED",
    zamaWriteFlow: "SUPPORTED",
  },
  async init() {
    // Optional async bootstrap.
  },
  async getAddress() {
    throw new Error("Implement getAddress() from Openfort-controlled EOA key");
  },
  async signTypedData(_data) {
    throw new Error("Implement signTypedData() with EOA semantics");
  },
  async signTransaction(_tx) {
    throw new Error("Implement signTransaction() if raw signing is exposed");
  },
  async writeContract(_config) {
    throw new Error("Implement writeContract() with your wallet client");
  },
  async readContract(_config) {
    throw new Error("Implement readContract() with public client");
  },
  async waitForTransactionReceipt(_hash) {
    throw new Error("Implement waitForTransactionReceipt() with public client");
  },
};
`;
  }

  return `${sharedHeader}export const adapter: Adapter = {
  metadata: {
    name: "My Adapter",
    declaredArchitecture: "UNKNOWN",
    verificationModel: "UNKNOWN",
    supportedChainIds: [11155111],
    notes: ["Generated via npm run init:adapter -- --template generic"],
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

export function usage(): string {
  return `Usage: npm run init:adapter -- [output-path] [--template <kind>] [--output <path>]

Templates:
  generic      Conservative default template
  eoa          EOA-style adapter (raw transaction signing expected)
  mpc          MPC-style adapter (API-routed execution, no raw signing)
  api-routed   Provider-managed execution model
  turnkey      Turnkey API-key execution baseline
  crossmint    Crossmint API-routed execution baseline
  openfort     Openfort EOA baseline
`;
}

function printUsage(): void {
  console.log(usage());
}

export function runInitAdapter(
  argv: string[] = process.argv,
  env: NodeJS.ProcessEnv = process.env,
): number {
  let config: InitAdapterConfig;
  try {
    config = resolveInitAdapterConfig(argv, env);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`init:adapter: ${message}`);
    console.error("Run with --help for usage.");
    return 2;
  }

  if (config.showHelp) {
    printUsage();
    return 0;
  }

  const { outputPath, template } = config;
  if (existsSync(outputPath)) {
    console.error(`init:adapter: file already exists at ${outputPath}`);
    return 2;
  }

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, templateFor(outputPath, template));

  console.log("Adapter template created.");
  console.log(`Template: ${template}`);
  console.log(`Path: ${outputPath}`);
  console.log(`Run:  SIGNER_MODULE=${outputPath} npm test`);
  return 0;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  process.exitCode = runInitAdapter();
}
