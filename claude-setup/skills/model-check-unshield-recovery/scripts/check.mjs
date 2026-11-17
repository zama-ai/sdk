#!/usr/bin/env node
// One command for the unshield recovery check. From the repo root:
//   node claude-setup/skills/model-check-unshield-recovery/scripts/check.mjs
// 1. Drift: compares each covered function with its text at the sync commit.
// 2. Model: runs TLC once per (config, rule) in RUNS and compares with `expect`.
// 3. Replay: runs replay/findings.test.ts against the real WrappedToken.
// Exit 0 when everything matches. Any other result exits 1 with a summary.
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODEL_DIR = path.join(SKILL_DIR, "model");
const SPEC = "UnshieldRecovery.tla";
const REPO = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  cwd: SKILL_DIR,
  encoding: "utf8",
}).trim();

const TLC_VERSION = "1.7.4";
const TLC_URL = `https://github.com/tlaplus/tlaplus/releases/download/v${TLC_VERSION}/tla2tools.jar`;
const TLC_SHA256 = "936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88";

// `steps` is TLC's shortest counterexample (one worker, breadth-first, so it is
// stable). A different path for a known finding is reported, not accepted.
const RUNS = [
  {
    cfg: "OneUnshield.cfg",
    stopBeforeSave: true,
    rule: "NoFalseAlreadyFinalized",
    expect: "holds",
  },
  { cfg: "OneUnshield.cfg", stopBeforeSave: true, rule: "PointerKeptAfterSave", expect: "holds" },
  {
    cfg: "OneUnshield.cfg",
    stopBeforeSave: false,
    rule: "PendingUnshieldIsDiscoverable",
    expect: "holds",
  },
  {
    cfg: "TwoUnshields.cfg",
    stopBeforeSave: true,
    rule: "NoFalseAlreadyFinalized",
    expect: "holds",
  },
  {
    cfg: "OneUnshield.cfg",
    stopBeforeSave: true,
    rule: "PendingUnshieldIsDiscoverable",
    expect: "breaks",
    finding: "unsaved window",
    steps: ["SubmitUnwrap(u1)", "Stop(u1)", "MineUnwrap(u1)"],
  },
  {
    cfg: "TwoUnshields.cfg",
    stopBeforeSave: true,
    rule: "PointerKeptAfterSave",
    expect: "breaks",
    finding: "one pointer per wrapper",
    steps: [
      "SubmitUnwrap(u1)",
      "SubmitUnwrap(u2)",
      "MineUnwrap(u1)",
      "UnwrapReceipt(u1)",
      "Save(u1)",
      "MineUnwrap(u2)",
      "UnwrapReceipt(u2)",
      "Save(u2)",
    ],
  },
  {
    cfg: "TwoUnshields.cfg",
    stopBeforeSave: false,
    rule: "PendingUnshieldIsDiscoverable",
    expect: "breaks",
    finding: "one pointer per wrapper",
    steps: [
      "SubmitUnwrap(u1)",
      "SubmitUnwrap(u2)",
      "MineUnwrap(u1)",
      "UnwrapReceipt(u1)",
      "Save(u1)",
      "Stop(u1)",
      "MineUnwrap(u2)",
      "UnwrapReceipt(u2)",
      "Save(u2)",
      "Decrypt(u2)",
      "SubmitFinalize(u2)",
      "FinalizeMined(u2)",
    ],
  },
];

const problems = [];
const log = (line = "") => process.stdout.write(`${line}\n`);

// ---------------------------------------------------------------- drift

function readCoverage() {
  const skill = readFileSync(path.join(SKILL_DIR, "SKILL.md"), "utf8");
  const block = /```coverage\n([\s\S]*?)```/.exec(skill)?.[1];
  if (!block) {
    throw new Error("SKILL.md has no ```coverage block");
  }
  const lines = block
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const sync = /^sync-commit\s+(\S+)$/.exec(lines[0] ?? "")?.[1];
  if (!sync) {
    throw new Error("the coverage block must start with: sync-commit <sha>");
  }
  const files = lines.slice(1).map((l) => {
    const [file, ...symbols] = l.split(/\s+/);
    return { file, symbols };
  });
  return { sync, files };
}

function symbolTexts(ts, source, fileName) {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const printer = ts.createPrinter({ removeComments: true });
  const print = (node) => printer.printNode(ts.EmitHint.Unspecified, node, sf);
  const out = new Map();
  for (const stmt of sf.statements) {
    if (ts.isFunctionDeclaration(stmt) && stmt.name) {
      out.set(stmt.name.text, print(stmt));
    }
    if (ts.isClassDeclaration(stmt) && stmt.name) {
      for (const member of stmt.members) {
        if (member.name) {
          out.set(`${stmt.name.text}.${member.name.getText(sf)}`, print(member));
        }
      }
    }
  }
  return out;
}

function checkDrift() {
  const ts = createRequire(path.join(REPO, "package.json"))("typescript");
  const { sync, files } = readCoverage();
  const changed = [];
  for (const { file, symbols } of files) {
    const nowPath = path.join(REPO, file);
    const now = existsSync(nowPath)
      ? symbolTexts(ts, readFileSync(nowPath, "utf8"), file)
      : new Map();
    let then;
    try {
      then = symbolTexts(
        ts,
        execFileSync("git", ["show", `${sync}:${file}`], { cwd: REPO, encoding: "utf8" }),
        file,
      );
    } catch {
      throw new Error(`cannot read ${file} at sync commit ${sync}`);
    }
    for (const symbol of symbols) {
      if (!then.has(symbol)) {
        throw new Error(`coverage names ${file} ${symbol}, which does not exist at ${sync}`);
      }
      if (!now.has(symbol)) {
        changed.push(`${file} ${symbol} (missing now: renamed or moved?)`);
      } else if (now.get(symbol) !== then.get(symbol)) {
        changed.push(`${file} ${symbol}`);
      }
    }
  }
  log(`\n== Drift since sync commit ${sync.slice(0, 12)}`);
  if (changed.length === 0) {
    log("in sync: no covered function changed");
    return;
  }
  for (const c of changed) {
    log(`changed: ${c}`);
  }
  log(
    `read: git diff ${sync.slice(0, 12)} -- <file>, mirror each change in model/${SPEC}, then move the sync commit`,
  );
  problems.push(`covered code changed since the sync commit (${changed.length} functions)`);
}

// ---------------------------------------------------------------- TLC

function findJava() {
  const candidates = [
    process.env.JAVA,
    process.env.JAVA_HOME && path.join(process.env.JAVA_HOME, "bin", "java"),
    "java",
    "/opt/homebrew/opt/openjdk/bin/java",
    "/usr/local/opt/openjdk/bin/java",
  ].filter(Boolean);
  for (const java of candidates) {
    if (spawnSync(java, ["-version"], { stdio: "ignore" }).status === 0) {
      return java;
    }
  }
  throw new Error(
    "no working Java 11+ found. Install one (macOS: brew install openjdk), or set JAVA=/path/to/java",
  );
}

async function findJar() {
  if (process.env.TLA2TOOLS) {
    return process.env.TLA2TOOLS;
  }
  const cacheDir = path.join(
    process.env.XDG_CACHE_HOME ?? path.join(homedir(), ".cache"),
    "zama-sdk-model-check",
  );
  const jar = path.join(cacheDir, `tla2tools-${TLC_VERSION}.jar`);
  const sha = (buf) => createHash("sha256").update(buf).digest("hex");
  if (existsSync(jar) && sha(readFileSync(jar)) === TLC_SHA256) {
    return jar;
  }
  log(`downloading TLC ${TLC_VERSION} to ${jar}`);
  const res = await fetch(TLC_URL);
  if (!res.ok) {
    throw new Error(`TLC download failed: HTTP ${res.status}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (sha(buf) !== TLC_SHA256) {
    throw new Error("TLC download has the wrong sha256");
  }
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(jar, buf);
  return jar;
}

// TLC prints a function as (k1 :> v1 @@ k2 :> v2) and a set as {a, b}.
function parseValue(text) {
  const fn = /^\((.*)\)$/.exec(text);
  if (!fn) {
    return text;
  }
  return Object.fromEntries(fn[1].split(" @@ ").map((pair) => pair.split(" :> ")));
}

function parseTrace(output) {
  const states = [];
  for (const block of output.split(/\n(?=State \d+: )/).filter((b) => b.startsWith("State "))) {
    const action = /^State \d+: <(\w+)/.exec(block)?.[1] ?? "Initial";
    const vars = {};
    for (const m of block.matchAll(/^\/\\ (\w+) = (.*)$/gm)) {
      vars[m[1]] = parseValue(m[2]);
    }
    states.push({ action, vars });
  }
  return states.slice(1).map((state, i) => {
    const before = states[i].vars;
    const changes = [];
    let actor = "";
    for (const name of ["pc", "ftx", "unwrap", "req", "slot", "saved"]) {
      const a = before[name];
      const b = state.vars[name];
      if (typeof b === "object") {
        for (const key of Object.keys(b)) {
          if (a[key] !== b[key]) {
            changes.push(`${name}[${key}] ${a[key]} -> ${b[key]}`);
            actor ||= key;
          }
        }
      } else if (a !== b) {
        changes.push(`${name} ${a} -> ${b}`);
      }
    }
    return { step: actor ? `${state.action}(${actor})` : state.action, changes };
  });
}

function runTlc(java, jar, run) {
  const dir = mkdtempSync(path.join(tmpdir(), "unshield-recovery-"));
  try {
    copyFileSync(path.join(MODEL_DIR, SPEC), path.join(dir, SPEC));
    const base = readFileSync(path.join(MODEL_DIR, run.cfg), "utf8");
    if (!/StopBeforeSave = TRUE/.test(base)) {
      throw new Error(`${run.cfg} must set StopBeforeSave = TRUE`);
    }
    const cfg =
      base
        .replace(
          "StopBeforeSave = TRUE",
          `StopBeforeSave = ${run.stopBeforeSave ? "TRUE" : "FALSE"}`,
        )
        .replace(/^INVARIANT.*$/gm, "") + `\nINVARIANT TypeOK\nINVARIANT ${run.rule}\n`;
    writeFileSync(path.join(dir, "run.cfg"), cfg);
    const r = spawnSync(
      java,
      [
        "-XX:+UseParallelGC",
        "-cp",
        jar,
        "tlc2.TLC",
        "-workers",
        "1",
        "-metadir",
        path.join(dir, "states"),
        "-config",
        "run.cfg",
        SPEC,
      ],
      { cwd: dir, encoding: "utf8" },
    );
    const output = `${r.stdout}${r.stderr}`;
    const states = /(\d+) distinct states found/.exec(output)?.[1] ?? "?";
    const violated = /Invariant (\w+) is violated/.exec(output)?.[1];
    if (r.status === 0) {
      return { result: "holds", states };
    }
    if (r.status === 12 && violated) {
      return { result: "breaks", violated, states, trace: parseTrace(output) };
    }
    return { result: "error", states, output };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function checkModel() {
  const java = findJava();
  const jar = await findJar();
  log(`\n== Model (TLC ${TLC_VERSION}, model/${SPEC})`);
  for (const run of RUNS) {
    const label = `${run.cfg.replace(".cfg", "")}${run.stopBeforeSave ? "" : " [phase 1 always saves]"} / ${run.rule}`;
    const got = runTlc(java, jar, run);
    if (got.result === "error") {
      log(`ERROR    ${label}\n${got.output.trim().split("\n").slice(-25).join("\n")}`);
      problems.push(`TLC error or deadlock on ${label}: a modeling error, not a code finding`);
      continue;
    }
    if (got.result === "breaks" && got.violated === "TypeOK") {
      problems.push(`TypeOK broke on ${label}: a modeling error`);
    }
    const steps = got.trace?.map((s) => s.step) ?? [];
    const sameSteps =
      run.steps === undefined || JSON.stringify(steps) === JSON.stringify(run.steps);
    const ok = got.result === run.expect && sameSteps;
    const tag = !ok ? "UNEXPECTED" : run.finding ? "FINDING" : "ok";
    log(
      `${tag.padEnd(10)} ${label}: ${got.result} (${got.states} distinct states)${run.finding ? ` [known: ${run.finding}]` : ""}`,
    );
    if (got.result === "breaks" && (!ok || process.argv.includes("--traces"))) {
      got.trace.forEach((s, i) => {
        log(`  ${String(i + 1).padStart(2)}. ${s.step.padEnd(28)} ${s.changes.join(", ")}`);
      });
    }
    if (!ok) {
      if (got.result !== run.expect) {
        problems.push(`${label}: expected ${run.expect}, got ${got.result}`);
      } else {
        problems.push(`${label}: the counterexample changed; read it before accepting it`);
      }
    }
  }
}

// ---------------------------------------------------------------- replay

function checkReplay() {
  log("\n== Replay of the known findings against the real code");
  const vitest = path.join(REPO, "node_modules", ".bin", "vitest");
  if (!existsSync(vitest)) {
    problems.push("replay skipped: run pnpm install first");
    return;
  }
  const r = spawnSync(
    vitest,
    ["run", "--config", path.join(SKILL_DIR, "replay", "vitest.config.mts")],
    { cwd: REPO, encoding: "utf8" },
  );
  const summary = /Tests\s+.*$/m.exec(r.stdout)?.[0] ?? "";
  log(
    r.status === 0
      ? `ok         ${summary.trim()}`
      : `${r.stdout}${r.stderr}`.trim().split("\n").slice(-40).join("\n"),
  );
  if (r.status !== 0) {
    problems.push("a replayed finding no longer reproduces in the real code, or the replay broke");
  }
}

// ---------------------------------------------------------------- main

try {
  checkDrift();
  await checkModel();
  if (!process.argv.includes("--no-replay")) {
    checkReplay();
  }
} catch (error) {
  problems.push(error.message);
}
log(
  problems.length === 0
    ? "\nRESULT: as expected (known findings still present, nothing else breaks)"
    : `\nRESULT: needs a look\n- ${problems.join("\n- ")}`,
);
process.exit(problems.length === 0 ? 0 : 1);
