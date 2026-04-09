import { beforeAll, describe, expect, it } from "vitest";
import { detectArchitecture, detectVerificationModel } from "../adapter/profile.js";
import { emptyCapabilities } from "../adapter/types.js";
import {
  adapter,
  adapterDeclaredCapabilities,
  adapterObservedStructuralCapabilities,
  adapterObservedRuntimeCapabilities,
  adapterObservedCapabilities,
  adapterSource,
  getAdapterAddress,
  initializeAdapter,
} from "../harness/adapter.js";
import { detectCapabilityContradictions } from "../adapter/contradictions.js";
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
    const declaredCapabilities = existingProfile?.declaredCapabilities ?? {
      ...emptyCapabilities(),
      ...adapterDeclaredCapabilities,
    };
    const observedStructuralCapabilities = existingProfile?.observedStructuralCapabilities ?? {
      ...emptyCapabilities(),
      ...adapterObservedStructuralCapabilities,
    };
    const observedRuntimeCapabilities = existingProfile?.observedRuntimeCapabilities ?? {
      ...emptyCapabilities(),
      ...adapterObservedRuntimeCapabilities,
    };
    const observedCapabilities = existingProfile?.observedCapabilities ?? {
      ...emptyCapabilities(),
      ...adapterObservedCapabilities,
    };
    const baseProfile = {
      name: adapter.metadata.name,
      source: adapterSource,
      declaredArchitecture: adapter.metadata.declaredArchitecture ?? "UNKNOWN",
      detectedArchitecture: detectArchitecture(
        adapter.metadata.declaredArchitecture,
        observedCapabilities,
      ),
      verificationModel: detectVerificationModel(
        adapter.metadata.verificationModel,
        observedCapabilities,
      ),
      address: "(unresolved)",
      declaredCapabilities,
      observedStructuralCapabilities,
      observedRuntimeCapabilities,
      observedCapabilities,
      contradictions: detectCapabilityContradictions(declaredCapabilities, observedCapabilities),
      initializationStatus: initError
        ? classifyInfrastructureIssue(initError).status
        : ("PASS" as const),
    };

    recordProfile(baseProfile);

    if (initError) {
      const diagnostic = classifyInfrastructureIssue(initError);
      record({
        checkId: "ADAPTER_INITIALIZATION",
        name: "Adapter Initialization",
        section: "adapter",
        status: diagnostic.status,
        summary: "Adapter could not initialize",
        reason: initError,
        rootCauseCategory: diagnostic.rootCauseCategory,
        errorCode: diagnostic.errorCode,
        recommendation: "Fix adapter configuration and retry the harness.",
      });
      return;
    }

    record({
      checkId: "ADAPTER_INITIALIZATION",
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
        observedCapabilities: {
          ...observedCapabilities,
          addressResolution: "SUPPORTED",
        },
      });
      record({
        checkId: "ADDRESS_RESOLUTION",
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
        checkId: "ADDRESS_RESOLUTION",
        name: "Address Resolution",
        section: "adapter",
        status: diagnostic.status,
        summary: "Adapter address could not be resolved",
        reason: message,
        rootCauseCategory: diagnostic.rootCauseCategory,
        errorCode: diagnostic.errorCode,
        recommendation: "Ensure the adapter can resolve its wallet address during initialization.",
      });
      recordProfile({
        ...baseProfile,
        observedCapabilities: {
          ...observedCapabilities,
          addressResolution: "UNKNOWN",
        },
      });
      return;
    }
  });
});
