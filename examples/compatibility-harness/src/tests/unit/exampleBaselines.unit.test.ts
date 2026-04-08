import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import type { AdapterCapabilities } from "../../adapter/types.js";
import { resolveValidationGate } from "../../cli/validate-policy.js";

type ExampleBaseline = {
  id: string;
  adapterModule: string;
  importEnv: Record<string, string>;
  expectedProfile: {
    name: string;
    declaredArchitecture: string;
    verificationModel: string;
    capabilities: AdapterCapabilities;
  };
  claimEnvelope: {
    PASS: string[];
    PARTIAL: string[];
    INCONCLUSIVE: string[];
  };
};

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(THIS_DIR, "..", "fixtures", "example-baselines");

function readBaselines(): ExampleBaseline[] {
  return readdirSync(FIXTURES_DIR)
    .filter((name) => name.endsWith(".lock.json"))
    .map((name) => {
      const raw = readFileSync(join(FIXTURES_DIR, name), "utf-8");
      return JSON.parse(raw) as ExampleBaseline;
    });
}

async function importAdapterWithEnv(
  modulePath: string,
  envPatch: Record<string, string>,
): Promise<{
  metadata: {
    name: string;
    declaredArchitecture?: string;
    verificationModel?: string;
  };
  capabilities?: Partial<AdapterCapabilities>;
}> {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(envPatch)) {
    previous.set(key, process.env[key]);
    process.env[key] = value;
  }
  try {
    const moduleUrl = pathToFileURL(resolve(process.cwd(), modulePath)).href;
    const loaded = (await import(moduleUrl)) as {
      adapter: {
        metadata: {
          name: string;
          declaredArchitecture?: string;
          verificationModel?: string;
        };
        capabilities?: Partial<AdapterCapabilities>;
      };
    };
    return loaded.adapter;
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

describe("example baseline lockfiles", () => {
  const baselines = readBaselines();

  it("keep claim envelopes aligned with gate status categories", () => {
    for (const baseline of baselines) {
      for (const claimId of baseline.claimEnvelope.PASS) {
        expect(resolveValidationGate(claimId, "AUTHORIZATION_AND_WRITE").status).toBe("PASS");
      }
      for (const claimId of baseline.claimEnvelope.PARTIAL) {
        expect(resolveValidationGate(claimId, "AUTHORIZATION_AND_WRITE").status).toBe("PARTIAL");
      }
      for (const claimId of baseline.claimEnvelope.INCONCLUSIVE) {
        expect(resolveValidationGate(claimId, "AUTHORIZATION_AND_WRITE").status).toBe(
          "INCONCLUSIVE",
        );
      }
    }
  });

  it("keep example adapter metadata and declared capabilities locked", async () => {
    for (const baseline of baselines) {
      const adapter = await importAdapterWithEnv(baseline.adapterModule, baseline.importEnv);
      expect(adapter.metadata.name).toBe(baseline.expectedProfile.name);
      expect(adapter.metadata.declaredArchitecture).toBe(
        baseline.expectedProfile.declaredArchitecture,
      );
      expect(adapter.metadata.verificationModel).toBe(baseline.expectedProfile.verificationModel);
      expect(adapter.capabilities).toEqual(baseline.expectedProfile.capabilities);
    }
  });
});
