import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { getFunctionSelector, isAddress, parseTransaction } from "viem";
import { describe, expect, test } from "../../test-fixtures";

const ROOT = findRepoRoot(process.cwd());
const ERC7730_DIR = resolve(ROOT, "docs/clear-signing/erc7730");
const REGISTRY_DIR = resolve(ERC7730_DIR, "registry/zama");
const REGISTRY_TESTS_DIR = resolve(REGISTRY_DIR, "tests");
const EXPERIMENTAL_DIR = resolve(ERC7730_DIR, "experimental/zama");
const EXPERIMENTAL_TESTS_DIR = resolve(EXPERIMENTAL_DIR, "tests");
const LEDGER_DEMO_DIR = resolve(ERC7730_DIR, "ledger-demo/zama-shield");
const FIXTURE_PATH = resolve(ERC7730_DIR, "fixtures/sepolia-v1.json");
const REGISTRY_SCHEMA = "../../specs/erc7730-v2.schema.json";
const EXPERIMENTAL_SCHEMA = "https://eips.ethereum.org/assets/eip-7730/erc7730-v2.schema.json";
const REGISTRY_TEST_SCHEMA = "../../../specs/erc7730-tests.schema.json";

interface Descriptor {
  $schema: string;
  context: {
    $id: string;
    contract?: {
      deployments: readonly Deployment[];
    };
    eip712?: {
      domain?: Record<string, unknown>;
      deployments?: readonly Deployment[];
    };
  };
  metadata: {
    owner: string;
    contractName?: string;
  };
  display: {
    formats: Record<string, DisplayFormat>;
  };
}

interface Deployment {
  chainId: number;
  address: string;
}

interface DisplayFormat {
  intent?: string;
  fields?: readonly FieldFormat[];
}

interface FieldFormat {
  label?: string;
  format?: string;
  path?: string;
  value?: unknown;
  fields?: readonly FieldFormat[];
}

interface Fixtures {
  chainId: number;
  calldata: readonly CalldataFixture[];
  eip712: readonly Eip712Fixture[];
}

interface CalldataFixture {
  operation: string;
  descriptor: string;
  to: string;
  function: string;
  data: `0x${string}`;
  expectedTexts: readonly string[];
}

interface Eip712Fixture {
  operation: string;
  descriptor: string;
  data: {
    domain: Record<string, unknown>;
    types: Record<string, readonly { name: string; type: string }[]>;
    primaryType: string;
    message: Record<string, unknown>;
  };
  expectedTexts: readonly string[];
}

interface RegistryTestFile {
  $schema: string;
  tests: readonly RegistryTest[];
}

interface RegistryTest {
  description?: string;
  rawTx?: `0x${string}`;
  data?: Eip712Fixture["data"];
  expectedTexts?: readonly string[];
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function findRepoRoot(start: string): string {
  let current = start;
  while (current !== "/") {
    if (
      existsSync(resolve(current, "docs/clear-signing")) &&
      existsSync(resolve(current, "pnpm-workspace.yaml"))
    ) {
      return current;
    }
    current = resolve(current, "..");
  }
  throw new Error(`Unable to find repository root from ${start}`);
}

function descriptorFiles(dir: string): readonly string[] {
  return readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => resolve(dir, file));
}

function registryTestFiles(dir: string): readonly string[] {
  return readdirSync(dir)
    .filter((file) => file.endsWith(".tests.json"))
    .map((file) => resolve(dir, file));
}

function descriptorForRegistryTest(path: string, descriptorDir: string): Descriptor {
  const file = path.split("/").at(-1)!;
  const descriptorFile = file.replace(/\.tests\.json$/, ".json");
  const descriptorPath = resolve(descriptorDir, descriptorFile);

  expect(existsSync(descriptorPath), `missing descriptor for ${file}`).toBe(true);
  return readJson<Descriptor>(descriptorPath);
}

function descriptorFromFixture(relativePath: string): Descriptor {
  const path = resolve(ERC7730_DIR, "fixtures", relativePath);
  expect(existsSync(path), `missing descriptor ${relativePath}`).toBe(true);
  return readJson<Descriptor>(path);
}

function deploymentMatches(
  deployments: readonly Deployment[] | undefined,
  chainId: number,
  address: string,
): boolean {
  return Boolean(
    deployments?.some(
      (deployment) =>
        deployment.chainId === chainId &&
        deployment.address.toLowerCase() === address.toLowerCase(),
    ),
  );
}

function flattenFields(fields: readonly FieldFormat[] | undefined): readonly FieldFormat[] {
  if (!fields) {
    return [];
  }
  return fields.flatMap((field) => [field, ...flattenFields(field.fields)]);
}

function displayedParamNames(format: DisplayFormat): Set<string> {
  const names = new Set<string>();
  for (const field of flattenFields(format.fields)) {
    if (!field.path) {
      continue;
    }
    const normalizedPath = field.path.startsWith("#.") ? field.path.slice(2) : field.path;
    names.add(normalizedPath.split(".")[0]!.replace(/\[\]$/, ""));
  }
  return names;
}

function signatureParamNames(signature: string): readonly string[] {
  const params = signature.slice(signature.indexOf("(") + 1, signature.lastIndexOf(")"));
  if (params.length === 0) {
    return [];
  }
  return params.split(",").map((param) => param.trim().split(" ").at(-1)!);
}

function encodeEip712Type(
  primaryType: string,
  fields: readonly { name: string; type: string }[],
): string {
  return `${primaryType}(${fields.map((field) => `${field.type} ${field.name}`).join(",")})`;
}

describe("ERC-7730 descriptor drafts", () => {
  test("registry-ready descriptor files have the expected public registry shape", () => {
    for (const file of descriptorFiles(REGISTRY_DIR)) {
      const descriptor = readJson<Descriptor>(file);

      expect(descriptor.$schema).toBe(REGISTRY_SCHEMA);
      expect(file).toMatch(/\/registry\/zama\/calldata-[a-z0-9-]+\.json$/);
      expect(descriptor.context.$id).toBeTruthy();
      expect(descriptor.metadata.owner).toBe("Zama");
      expect(Object.keys(descriptor.display.formats).length).toBeGreaterThan(0);

      for (const deployment of [
        ...(descriptor.context.contract?.deployments ?? []),
        ...(descriptor.context.eip712?.deployments ?? []),
      ]) {
        expect(Number.isInteger(deployment.chainId)).toBe(true);
        expect(isAddress(deployment.address)).toBe(true);
      }
    }
  });

  test("experimental descriptor files keep the SDK-local schema and shape", () => {
    for (const file of descriptorFiles(EXPERIMENTAL_DIR)) {
      const descriptor = readJson<Descriptor>(file);

      expect(descriptor.$schema).toBe(EXPERIMENTAL_SCHEMA);
      expect(descriptor.context.$id).toBeTruthy();
      expect(descriptor.metadata.owner).toBe("Zama");
      expect(Object.keys(descriptor.display.formats).length).toBeGreaterThan(0);

      for (const deployment of [
        ...(descriptor.context.contract?.deployments ?? []),
        ...(descriptor.context.eip712?.deployments ?? []),
      ]) {
        expect(Number.isInteger(deployment.chainId)).toBe(true);
        expect(isAddress(deployment.address)).toBe(true);
      }
    }
  });

  test("calldata fixtures match descriptor deployments, selectors, and parameter coverage", () => {
    const fixtures = readJson<Fixtures>(FIXTURE_PATH);

    for (const fixture of fixtures.calldata) {
      const descriptor = descriptorFromFixture(fixture.descriptor);
      const format = descriptor.display.formats[fixture.function];

      expect(format, `${fixture.operation} missing display format`).toBeDefined();
      expect(fixture.data.slice(0, 10), `${fixture.operation} selector mismatch`).toBe(
        getFunctionSelector(fixture.function),
      );
      expect(
        deploymentMatches(descriptor.context.contract?.deployments, fixtures.chainId, fixture.to),
        `${fixture.operation} target is not in descriptor deployments`,
      ).toBe(true);

      const displayed = displayedParamNames(format!);
      for (const paramName of signatureParamNames(fixture.function)) {
        expect(
          displayed.has(paramName),
          `${fixture.operation} does not account for ${paramName}`,
        ).toBe(true);
      }
      expect(fixture.expectedTexts.length).toBeGreaterThan(0);
    }
  });

  test("EIP-712 fixtures match descriptor domains, deployments, and field coverage", () => {
    const fixtures = readJson<Fixtures>(FIXTURE_PATH);

    for (const fixture of fixtures.eip712) {
      const descriptor = descriptorFromFixture(fixture.descriptor);
      const fields = fixture.data.types[fixture.data.primaryType] ?? [];
      const formatKey = encodeEip712Type(fixture.data.primaryType, fields);
      const format = descriptor.display.formats[formatKey];
      const deploymentAddress = String(fixture.data.domain.verifyingContract);
      const chainId = Number(fixture.data.domain.chainId);

      expect(format, `${fixture.operation} missing display format`).toBeDefined();
      expect(descriptor.context.eip712?.domain?.name).toBe(fixture.data.domain.name);
      expect(descriptor.context.eip712?.domain?.version).toBe(fixture.data.domain.version);
      expect(
        deploymentMatches(descriptor.context.eip712?.deployments, chainId, deploymentAddress),
        `${fixture.operation} verifying contract is not in descriptor deployments`,
      ).toBe(true);

      const displayed = displayedParamNames(format!);
      for (const field of fields) {
        expect(
          displayed.has(field.name),
          `${fixture.operation} does not account for ${field.name}`,
        ).toBe(true);
      }
      expect(fixture.expectedTexts.length).toBeGreaterThan(0);
    }
  });

  test("registry reference tests match their descriptors", () => {
    for (const file of registryTestFiles(REGISTRY_TESTS_DIR)) {
      const testFile = readJson<RegistryTestFile>(file);
      const descriptor = descriptorForRegistryTest(file, REGISTRY_DIR);

      assertRegistryTestFileMatchesDescriptor(file, testFile, descriptor);
    }
  });

  test("experimental reference tests match their descriptors", () => {
    for (const file of registryTestFiles(EXPERIMENTAL_TESTS_DIR)) {
      const testFile = readJson<RegistryTestFile>(file);
      const descriptor = descriptorForRegistryTest(file, EXPERIMENTAL_DIR);

      assertRegistryTestFileMatchesDescriptor(file, testFile, descriptor);
    }
  });

  function assertRegistryTestFileMatchesDescriptor(
    file: string,
    testFile: RegistryTestFile,
    descriptor: Descriptor,
  ): void {
    expect(testFile.$schema).toBe(REGISTRY_TEST_SCHEMA);
    expect(testFile.tests.length).toBeGreaterThan(0);

    for (const testCase of testFile.tests) {
      expect(testCase.expectedTexts?.length ?? 0).toBeGreaterThan(0);

      if (testCase.rawTx) {
        const tx = parseTransaction(testCase.rawTx);
        const selector = tx.data?.slice(0, 10);
        const matchingSignature = Object.keys(descriptor.display.formats).find(
          (signature) => getFunctionSelector(signature) === selector,
        );

        expect(
          matchingSignature,
          `${testCase.description ?? file} selector mismatch`,
        ).toBeDefined();
        expect(
          deploymentMatches(
            descriptor.context.contract?.deployments,
            Number(tx.chainId),
            tx.to ?? "",
          ),
          `${testCase.description ?? file} target is not in descriptor deployments`,
        ).toBe(true);
      } else if (testCase.data) {
        const fields = testCase.data.types[testCase.data.primaryType] ?? [];
        const formatKey = encodeEip712Type(testCase.data.primaryType, fields);
        const deploymentAddress = String(testCase.data.domain.verifyingContract);
        const chainId = Number(testCase.data.domain.chainId);

        expect(descriptor.display.formats[formatKey]).toBeDefined();
        expect(
          deploymentMatches(descriptor.context.eip712?.deployments, chainId, deploymentAddress),
          `${testCase.description ?? file} verifying contract is not in descriptor deployments`,
        ).toBe(true);
      } else {
        throw new Error(`${testCase.description ?? file} has neither rawTx nor EIP-712 data`);
      }
    }
  }

  test("Ledger ZAMA shield demo keeps wrap descriptor calldata-converter friendly", () => {
    const descriptor = readJson<Descriptor>(
      resolve(LEDGER_DEMO_DIR, "calldata-czamamock-wrapper.json"),
    );
    const format = descriptor.display.formats["wrap(address to,uint256 amount)"];

    expect(format?.intent).toBe("Shield");
    expect(
      deploymentMatches(
        descriptor.context.contract?.deployments,
        11155111,
        "0xf2D628d2598aF4eAF94CB76a437Ff86CA78FfbFB",
      ),
    ).toBe(true);

    const fields = flattenFields(format?.fields);
    expect(fields.map((field) => field.label)).toEqual(["Send", "Receive", "Recipient", "Wrapper"]);

    const calldataConvertibleFormats = new Set(["raw", "addressName", "tokenAmount"]);
    for (const field of fields) {
      expect(
        calldataConvertibleFormats.has(field.format ?? ""),
        `unsupported Ledger calldata conversion format: ${field.label ?? "<unlabelled>"}`,
      ).toBe(true);
    }
  });
});
