import type { Scenario } from "./explore";

const UNSHIELD: Scenario["actors"][number] = {
  name: "unshield#1",
  slot: 1,
  entry: { kind: "unshield" },
};
const UNSHIELD_ALL: Scenario["actors"][number] = {
  name: "unshieldAll#2",
  slot: 2,
  entry: { kind: "unshieldAll" },
};
const PAGE_LOAD: Scenario["actors"][number] = { name: "page load", slot: 3, entry: "page load" };

export const SCENARIOS: Scenario[] = [
  { name: "one unshield", actors: [UNSHIELD, PAGE_LOAD] },
  { name: "two unshields at once", actors: [UNSHIELD, UNSHIELD_ALL] },
  {
    name: "a new unshield next to an interrupted one",
    actors: [UNSHIELD, PAGE_LOAD],
    earlier: "interrupted",
  },
  {
    name: "a new unshield behind a stale entry",
    actors: [UNSHIELD, PAGE_LOAD],
    earlier: "stale entry",
  },
];
