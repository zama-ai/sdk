import { spawnSync } from "node:child_process";

const steps = [
  { name: "build", command: "pnpm", args: ["llm:build"] },
  {
    name: "test",
    command: "pnpm",
    args: ["exec", "vitest", "run", "--config", "vitest.llm.config.ts"],
  },
  {
    name: "verify-clean",
    command: "git",
    args: ["diff", "--exit-code", "llms.txt", "llms-full.txt", "docs/llm/corpus-manifest.json"],
  },
];

for (const step of steps) {
  console.log(`\n▶ llm:check [${step.name}] ${step.command} ${step.args.join(" ")}`);
  const result = spawnSync(step.command, step.args, { stdio: "inherit" });
  if (result.status !== 0) {
    console.error(`\n✖ llm:check failed at [${step.name}]`);
    process.exit(result.status ?? 1);
  }
}

console.log("\n✓ llm:check passed");
