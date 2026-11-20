import { describe, expect, it } from "vitest";
import { isPushOrPrCreate } from "../stamp.mjs";

describe("isPushOrPrCreate", () => {
  it.each([
    "git push",
    "git push -u origin HEAD",
    "git -C ../sdk push origin feat/x",
    "pnpm build && git push",
    "gh pr create --base beta --fill",
    "(cd sdk; git push)",
    "git -c core.hooksPath=x push",
    "git --no-pager push",
    "/usr/bin/git push",
    "gh pr --repo zama-ai/sdk create --fill",
    "gh pr -R zama-ai/sdk create",
  ])("matches %s", (command) => {
    expect(isPushOrPrCreate(command)).toBe(true);
  });

  it.each([
    "git status",
    "git log --grep push",
    "git pushx",
    "gh pr view 953",
    "echo 'pushed'",
    'git commit -m "chore: block git push and gh pr create"',
    "node -e 'run(\"git push\")'",
  ])("ignores %s", (command) => {
    expect(isPushOrPrCreate(command)).toBe(false);
  });
});
