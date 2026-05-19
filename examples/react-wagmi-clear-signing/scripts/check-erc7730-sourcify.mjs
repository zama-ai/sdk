import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { format } from "@ethereum-sourcify/clear-signing";
import { encodeFunctionData, getAddress, parseAbi, parseTransaction } from "viem";

const ROOT = resolve(process.cwd(), "../..");
const REGISTRY_DIR = resolve(ROOT, "docs/clear-signing/erc7730/registry/zama");
const SOURCIFY_DESCRIPTOR_DIR = resolve(process.cwd(), "src/lib/erc7730-descriptors");
const ZAMAMOCK_ADDRESS = "0x75355a85c6FB9df5f0C80FF54e8747EEe9a0BF57";
const CZAMAMOCK_ADDRESS = "0xf2D628d2598aF4eAF94CB76a437Ff86CA78FfbFB";

const index = {
  calldataIndex: {
    [`eip155:11155111:${ZAMAMOCK_ADDRESS.toLowerCase()}`]: "calldata-zamamock-sepolia.mjs",
    [`eip155:11155111:${CZAMAMOCK_ADDRESS.toLowerCase()}`]: "calldata-czamamock-sepolia.mjs",
  },
  typedDataIndex: {},
};

const externalDataProvider = {
  resolveToken: async (_chainId, address) =>
    address.toLowerCase() === ZAMAMOCK_ADDRESS.toLowerCase()
      ? { name: "ZAMAMock", symbol: "ZAMAMock", decimals: 18 }
      : null,
  resolveLocalName: async (address) => ({ name: getAddress(address), typeMatch: true }),
  resolveEnsName: async () => null,
};

const abi = parseAbi(["function approve(address spender,uint256 amount)"]);

const cases = [
  {
    name: "ZAMAMock approve",
    testsFile: "tests/calldata-zamamock-sepolia.tests.json",
  },
  {
    name: "cZAMAMock wrap",
    testsFile: "tests/calldata-czamamock-sepolia.tests.json",
  },
];

for (const testCase of cases) {
  const test = readJson(resolve(REGISTRY_DIR, testCase.testsFile)).tests[0];
  const tx = parseTransaction(test.rawTx);
  const model = await formatWithEmbeddedDescriptors({
    chainId: Number(tx.chainId),
    to: tx.to,
    data: tx.data ?? "0x",
    value: tx.value,
  });

  assertNoWarnings(testCase.name, model);
  assertExpectedTexts(testCase.name, model, test.expectedTexts);
  console.log(`ok ${testCase.name}: ${model.interpolatedIntent ?? model.intent ?? "<no intent>"}`);
}

const arbitrarySpender = "0x000000000000000000000000000000000000dEaD";
const genericApprove = await formatWithEmbeddedDescriptors({
  chainId: 11155111,
  to: ZAMAMOCK_ADDRESS,
  data: encodeFunctionData({
    abi,
    functionName: "approve",
    args: [arbitrarySpender, 1_000_000_000_000_000_000n],
  }),
});

assertNoWarnings("generic approve arbitrary spender", genericApprove);
assertExpectedTexts("generic approve arbitrary spender", genericApprove, [
  "Approve token spending",
  "Spender",
  getAddress(arbitrarySpender),
  "Approval amount",
  "1 ZAMAMock",
]);
console.log(
  `ok generic approve arbitrary spender: ${
    genericApprove.interpolatedIntent ?? genericApprove.intent ?? "<no intent>"
  }`,
);

async function formatWithEmbeddedDescriptors(tx) {
  return format(tx, {
    descriptorResolverOptions: {
      type: "embedded",
      index,
      descriptorDirectory: SOURCIFY_DESCRIPTOR_DIR,
    },
    externalDataProvider,
  });
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function assertNoWarnings(name, model) {
  if (model.warnings?.length) {
    throw new Error(
      `${name} produced Sourcify warnings: ${JSON.stringify(model.warnings, null, 2)}`,
    );
  }
}

function assertExpectedTexts(name, model, expectedTexts) {
  const actualTexts = flattenTexts(model);
  const missing = expectedTexts.filter(
    (expected) => !actualTexts.some((actual) => actual.includes(expected)),
  );

  if (missing.length) {
    throw new Error(
      `${name} is missing expected Sourcify text(s): ${missing.join(", ")}\n` +
        `Actual texts:\n${actualTexts.map((text) => `- ${text}`).join("\n")}`,
    );
  }
}

function flattenTexts(model) {
  const texts = [
    model.metadata?.contractName,
    typeof model.intent === "string" ? model.intent : undefined,
    model.interpolatedIntent,
  ].filter(Boolean);

  for (const field of model.fields ?? []) {
    if ("fields" in field) {
      if (field.label) {
        texts.push(field.label);
      }
      for (const nested of field.fields) {
        texts.push(nested.label, nested.value);
      }
    } else {
      texts.push(field.label, field.value);
    }
  }

  return texts;
}
