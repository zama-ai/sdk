import { beforeAll, describe, expect, it } from "vitest";
import { detectArchitecture, detectVerificationModel } from "../adapter/profile.js";
import { emptyCapabilities } from "../adapter/types.js";
import { resolveFinalCapabilities } from "../adapter/capability-evidence.js";
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
import {
  mergeProfile,
  readProfile,
  recordProfile,
  recordWithRuntimeObservation,
} from "../report/reporter.js";

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
    const declaredCapabilities = {
      ...emptyCapabilities(),
      ...adapterDeclaredCapabilities,
      ...(existingProfile?.declaredCapabilities ?? {}),
    };
    const observedStructuralCapabilities = {
      ...emptyCapabilities(),
      ...adapterObservedStructuralCapabilities,
      ...(existingProfile?.observedStructuralCapabilities ?? {}),
    };
    const observedRuntimeCapabilities = {
      ...emptyCapabilities(),
      ...adapterObservedRuntimeCapabilities,
      ...(existingProfile?.observedRuntimeCapabilities ?? {}),
    };
    const observedCapabilities = resolveFinalCapabilities({
      structural: {
        ...emptyCapabilities(),
        ...adapterObservedCapabilities,
        ...observedStructuralCapabilities,
      },
      runtime: observedRuntimeCapabilities,
    });
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
      recordWithRuntimeObservation({
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

    recordWithRuntimeObservation({
      checkId: "ADAPTER_INITIALIZATION",
      name: "Adapter Initialization",
      section: "adapter",
      status: "PASS",
      summary: "Adapter initialized successfully",
    });

    try {
      const address = await getAdapterAddress();
      mergeProfile({
        address,
        observedRuntimeCapabilities: {
          addressResolution: "SUPPORTED",
        },
      });
      recordWithRuntimeObservation({
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
      recordWithRuntimeObservation({
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
      return;
    }
  });
});
