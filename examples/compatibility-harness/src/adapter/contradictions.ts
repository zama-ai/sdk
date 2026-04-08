import { ALL_CAPABILITIES, type AdapterCapabilities } from "./types.js";

function titleize(name: string): string {
  return name.replace(/([A-Z])/g, " $1").replace(/^./, (v) => v.toUpperCase());
}

export function detectCapabilityContradictions(
  declared: AdapterCapabilities,
  observed: AdapterCapabilities,
): string[] {
  const contradictions: string[] = [];
  for (const capability of ALL_CAPABILITIES) {
    const declaredState = declared[capability];
    const observedState = observed[capability];
    if (declaredState === "UNKNOWN" || observedState === "UNKNOWN") continue;
    if (declaredState === observedState) continue;
    contradictions.push(
      `${titleize(capability)} declared ${declaredState.toLowerCase()} but observed ${observedState.toLowerCase()}.`,
    );
  }
  return contradictions;
}
