import { beforeAll, describe, expect, it } from "vitest";
import { detectArchitecture, detectVerificationModel } from "../adapter/profile.js";
import { emptyCapabilities } from "../adapter/types.js";
import {
  adapter,
  adapterSource,
  getAdapterAddress,
  initializeAdapter,
} from "../harness/adapter.js";
import { classifyInfrastructureIssue, errorMessage } from "../harness/diagnostics.js";
import { record, readProfile, recordProfile } from "../report/reporter.js";

let initError: string | null = null;

beforeAll(async () => {
  try {
    await initializeAdapter();
  } catch (err) {
    initError = errorMessage(err);
  }
});

describe("Adapter Profile", () => {
  it("records adapter metadata, initialization, and address resolution", async () => {
    const existingProfile = readProfile();
    const capabilities = existingProfile?.capabilities ?? {
      ...emptyCapabilities(),
      ...adapter.capabilities,
    };
    const baseProfile = {
      name: adapter.metadata.name,
      source: adapterSource,
      declaredArchitecture: adapter.metadata.declaredArchitecture ?? "UNKNOWN",
      detectedArchitecture: detectArchitecture(adapter.metadata.declaredArchitecture, capabilities),
      verificationModel: detectVerificationModel(adapter.metadata.verificationModel, capabilities),
      address: "(unresolved)",
      capabilities,
      initializationStatus: initError
        ? classifyInfrastructureIssue(initError).status
        : ("PASS" as const),
    };

    recordProfile(baseProfile);

    if (initError) {
      const diagnostic = classifyInfrastructureIssue(initError);
      record({
        name: "Adapter Initialization",
        section: "adapter",
        status: diagnostic.status,
        summary: "Adapter could not initialize",
        reason: initError,
        rootCauseCategory: diagnostic.rootCauseCategory,
        recommendation: "Fix adapter configuration and retry the harness.",
      });
      return;
    }

    record({
      name: "Adapter Initialization",
      section: "adapter",
      status: "PASS",
      summary: "Adapter initialized successfully",
    });

    try {
      const address = await getAdapterAddress();
      recordProfile({
        ...baseProfile,
        address,
        capabilities: {
          ...capabilities,
          addressResolution: "SUPPORTED",
        },
      });
      record({
        name: "Address Resolution",
        section: "adapter",
        status: "PASS",
        summary: `Resolved adapter address ${address}`,
      });
      expect(address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    } catch (err) {
      const message = errorMessage(err);
      const diagnostic = classifyInfrastructureIssue(message);
      record({
        name: "Address Resolution",
        section: "adapter",
        status: diagnostic.status,
        summary: "Adapter address could not be resolved",
        reason: message,
        rootCauseCategory: diagnostic.rootCauseCategory,
        recommendation: "Ensure the adapter can resolve its wallet address during initialization.",
      });
      recordProfile({
        ...baseProfile,
        capabilities: {
          ...capabilities,
          addressResolution: "UNSUPPORTED",
        },
      });
      return;
    }
  });
});
