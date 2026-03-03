import React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createSmithers, ClaudeCodeAgent, CodexAgent } from "smithers-orchestrator";
import { scheduledOutputSchemas } from "/private/tmp/bunx-501-ralphinho@github@17165385997729292787/node_modules/ralphinho/src/scheduled/schemas";
import { ScheduledWorkflow } from "/private/tmp/bunx-501-ralphinho@github@17165385997729292787/node_modules/ralphinho/src/components";

// ── Load config ────────────────────────────────────────────────────────

const _ralphDir = join(import.meta.dir, "..");
const _config = JSON.parse(readFileSync(join(_ralphDir, "config.json"), "utf8"));

// ── Constants ─────────────────────────────────────────────────────────

const REPO_ROOT = _config.repoRoot as string;
const DB_PATH = join(_ralphDir, "workflow.db");
const PLAN_PATH = join(_ralphDir, "work-plan.json");
const HAS_CLAUDE = _config.agents.claude as boolean;
const HAS_CODEX = _config.agents.codex as boolean;
const MAX_CONCURRENCY = _config.maxConcurrency as number;
const MAX_PASSES = 9;
const BASE_BRANCH = _config.baseBranch as string;

// ── Load work plan ────────────────────────────────────────────────────

const workPlan = JSON.parse(readFileSync(PLAN_PATH, "utf8"));

// ── Agent setup ───────────────────────────────────────────────────────

const WORKSPACE_POLICY = `
## WORKSPACE POLICY
Uncommitted changes in the worktree are expected and normal.
Do NOT refuse to work because of dirty git state. Proceed with implementation regardless.
`;

const JSON_OUTPUT = `
## CRITICAL: Output Rules
1. ALWAYS wait for ALL tasks and sub-agents to fully complete before producing final output.
2. Your FINAL message MUST end with a JSON object wrapped in a code fence.
3. Background tasks: if you used run_in_background: true, you MUST call TaskOutput to retrieve
   every background task's result before writing your final JSON.
`;

function buildSystemPrompt(role: string): string {
  return ["# Role: " + role, WORKSPACE_POLICY, JSON_OUTPUT].join("\n\n");
}

function createClaude(role: string, model: string = "claude-sonnet-4-6") {
  return new ClaudeCodeAgent({
    model,
    systemPrompt: buildSystemPrompt(role),
    cwd: REPO_ROOT,
    dangerouslySkipPermissions: true,
    timeoutMs: 60 * 60 * 1000,
  });
}

function createCodex(role: string) {
  return new CodexAgent({
    model: "gpt-5.3-codex",
    systemPrompt: buildSystemPrompt(role),
    cwd: REPO_ROOT,
    yolo: true,
    timeoutMs: 60 * 60 * 1000,
  });
}

function chooseAgent(primary: "claude" | "codex" | "opus", role: string) {
  if (primary === "opus" && HAS_CLAUDE) return createClaude(role, "claude-opus-4-6");
  if (primary === "claude" && HAS_CLAUDE) return createClaude(role);
  if (primary === "codex" && HAS_CODEX) return createCodex(role);
  if (HAS_CLAUDE) return createClaude(role);
  return createCodex(role);
}

const agents = {
  researcher:    chooseAgent("claude", "Researcher — Gather context from codebase for implementation"),
  planner:       chooseAgent("opus",   "Planner — Create implementation plan from RFC section and context"),
  implementer:   chooseAgent("codex",  "Implementer — Write code following the plan"),
  tester:        chooseAgent("claude", "Tester — Run tests and validate implementation"),
  prdReviewer:   chooseAgent("claude", "PRD Reviewer — Verify implementation matches RFC specification"),
  codeReviewer:  chooseAgent("opus",   "Code Reviewer — Check code quality, conventions, security"),
  reviewFixer:   chooseAgent("codex",  "ReviewFixer — Fix issues found in code review"),
  finalReviewer: chooseAgent("opus",   "Final Reviewer — Decide if unit is complete"),
  mergeQueue:    chooseAgent("opus",   "MergeQueue Coordinator — Rebase and land unit branches onto main"),
};

// ── Smithers setup ────────────────────────────────────────────────────

const { smithers, outputs, Workflow, db } = createSmithers(
  scheduledOutputSchemas,
  { dbPath: DB_PATH }
);

// Workaround for macOS SQLITE_IOERR_VNODE (6922): Apple's SQLite monitors
// WAL files via GCD vnode sources. Disabling mmap prevents the invalidation
// that rapid concurrent writes trigger.
(db as any).$client.exec("PRAGMA mmap_size = 0");
(db as any).$client.exec("PRAGMA synchronous = NORMAL");

// ── Workflow ──────────────────────────────────────────────────────────

export default smithers((ctx) => (
  <Workflow name="scheduled-work" cache>
    <ScheduledWorkflow
      ctx={ctx}
      outputs={outputs}
      workPlan={workPlan}
      repoRoot={REPO_ROOT}
      maxConcurrency={MAX_CONCURRENCY}
      maxPasses={MAX_PASSES}
      mainBranch={BASE_BRANCH}
      agents={agents}
    />
  </Workflow>
));
