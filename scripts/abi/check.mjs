import { spawnSync } from "node:child_process";
import { targets } from "./build.mjs";

const generatedFiles = targets.map((target) => target.path);

const steps = [
  { name: "build", command: "pnpm", args: ["abi:build"] },
  {
    name: "test",
    command: "pnpm",
    args: ["exec", "vitest", "run", "--config", "vitest.abi.config.ts"],
  },
  { name: "verify-clean", command: "git", args: ["diff", "--exit-code", "--", ...generatedFiles] },
];

for (const step of steps) {
  console.log(`\n▶ abi:check [${step.name}] ${step.command} ${step.args.join(" ")}`);
  const result = spawnSync(step.command, step.args, { stdio: "inherit" });
  if (result.status === 0) {
    continue;
  }
  if (result.error) {
    console.error(
      `\n✖ abi:check failed at [${step.name}]: could not spawn \`${step.command}\`: ${result.error.message}`,
    );
    process.exit(1);
  }
  if (step.name === "verify-clean") {
    console.error(
      "\n✖ abi:check failed at [verify-clean]: committed ABI files are stale vs the compiled artifact. Run `pnpm abi:build` and commit the result.",
    );
  }
  process.exit(1);
}

console.log("\n✓ abi:check passed");
