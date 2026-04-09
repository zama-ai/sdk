import {
  ALL_CAPABILITIES,
  emptyCapabilities,
  type AdapterCapabilities,
  type CapabilityName,
  type CapabilityState,
} from "./types.js";

function selectFinalState(input: {
  structural: CapabilityState;
  runtime: CapabilityState;
}): CapabilityState {
  // Runtime observation has precedence over static method-shape inference.
  return input.runtime !== "UNKNOWN" ? input.runtime : input.structural;
}

export function resolveFinalCapabilities(input: {
  structural: AdapterCapabilities;
  runtime: AdapterCapabilities;
}): AdapterCapabilities {
  const final = emptyCapabilities();
  for (const capability of ALL_CAPABILITIES) {
    final[capability] = selectFinalState({
      structural: input.structural[capability],
      runtime: input.runtime[capability],
    });
  }
  return final;
}

export function mergeCapabilityPatch(input: {
  base: AdapterCapabilities;
  patch?: Partial<AdapterCapabilities>;
}): AdapterCapabilities {
  if (!input.patch) return input.base;
  const merged = { ...input.base };
  for (const capability of ALL_CAPABILITIES) {
    const next = input.patch[capability as CapabilityName];
    if (!next) continue;
    merged[capability] = next;
  }
  return merged;
}
