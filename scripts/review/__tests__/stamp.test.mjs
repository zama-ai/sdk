import { describe, expect, it } from "vitest";
import { isPushCommand } from "../stamp.mjs";

describe("isPushCommand", () => {
  it.each([
    "git push",
    "git push -u origin HEAD",
    "git -C ../sdk push origin feat/x",
    "pnpm build && git push",
    "gh pr create --base beta --fill",
    "(cd sdk; git push)",
  ])("matches %s", (command) => {
    expect(isPushCommand(command)).toBe(true);
  });

  it.each(["git status", "git log --grep push", "git pushx", "gh pr view 953", "echo 'pushed'"])(
    "ignores %s",
    (command) => {
      expect(isPushCommand(command)).toBe(false);
    },
  );
});
