#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SOURCE = join(REPO_ROOT, "claude-setup");
const TARGET = join(REPO_ROOT, ".claude");

// --- JSON deep merge (objects recursive, arrays unioned, scalars: b wins) ---

function merge(a, b) {
  if (isObj(a) && isObj(b)) {
    const out = { ...a };
    for (const k of Object.keys(b)) {
      out[k] = k in a ? merge(a[k], b[k]) : b[k];
    }
    return out;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return [...new Set([...a, ...b])];
  }
  return b;
}

function isObj(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

// --- File tree sync (skip settings.json, preserve user files) ---

function syncTree(src, dst, root) {
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const srcPath = join(src, entry.name);
    const dstPath = join(dst, entry.name);
    const rel = relative(root, srcPath);

    if (entry.isDirectory()) {
      mkdirSync(dstPath, { recursive: true });
      syncTree(srcPath, dstPath, root);
    } else {
      if (existsSync(dstPath)) {
        const srcBuf = readFileSync(srcPath);
        const dstBuf = readFileSync(dstPath);
        if (srcBuf.equals(dstBuf)) {
          console.log(`  — ${rel} (unchanged, skipped)`);
        } else {
          writeFileSync(dstPath, srcBuf);
          console.log(`  ✅ ${rel} (updated)`);
        }
      } else {
        mkdirSync(dirname(dstPath), { recursive: true });
        cpSync(srcPath, dstPath);
        console.log(`  ✅ ${rel} (added)`);
      }
    }
  }
}

// --- Main ---

if (!existsSync(TARGET)) {
  cpSync(SOURCE, TARGET, { recursive: true });
  console.log("✅ .claude/ created from claude-setup/");
} else {
  console.log("📂 .claude/ already exists — merging...");

  // Merge settings.json
  const srcSettings = join(SOURCE, "settings.json");
  const dstSettings = join(TARGET, "settings.json");
  if (existsSync(srcSettings)) {
    if (existsSync(dstSettings)) {
      const a = JSON.parse(readFileSync(dstSettings, "utf8"));
      const b = JSON.parse(readFileSync(srcSettings, "utf8"));
      writeFileSync(dstSettings, JSON.stringify(merge(a, b), null, 2) + "\n");
      console.log("  ✅ settings.json merged (template wins on conflicts, arrays unioned)");
    } else {
      cpSync(srcSettings, dstSettings);
      console.log("  ✅ settings.json copied");
    }
  }

  // Sync remaining files, preserving anything already in .claude/
  for (const entry of readdirSync(SOURCE, { withFileTypes: true })) {
    if (entry.name === "settings.json") {
      continue;
    }
    const srcPath = join(SOURCE, entry.name);
    const dstPath = join(TARGET, entry.name);
    if (entry.isDirectory()) {
      mkdirSync(dstPath, { recursive: true });
      syncTree(srcPath, dstPath, SOURCE);
    } else {
      if (existsSync(dstPath)) {
        const srcBuf = readFileSync(srcPath);
        const dstBuf = readFileSync(dstPath);
        if (srcBuf.equals(dstBuf)) {
          console.log(`  — ${entry.name} (unchanged, skipped)`);
        } else {
          writeFileSync(dstPath, srcBuf);
          console.log(`  ✅ ${entry.name} (updated)`);
        }
      } else {
        cpSync(srcPath, dstPath);
        console.log(`  ✅ ${entry.name} (added)`);
      }
    }
  }

  console.log("✅ .claude/ merge complete");
}

// --- Plugin installation ---

try {
  execFileSync("claude", ["--version"], { stdio: "ignore" });
} catch {
  console.log();
  console.log("⚠️  Claude Code CLI not found. Install it first, then run:");
  console.log("  claude plugin marketplace add zama-ai/zama-marketplace");
  console.log("  claude plugin install zama-developer@zama-marketplace --scope project");
  process.exit(0);
}

console.log("📦 Adding zama-marketplace...");
execFileSync("claude", ["plugin", "marketplace", "add", "zama-ai/zama-marketplace"], {
  stdio: "inherit",
});

console.log("🔌 Installing zama-developer plugin...");
execFileSync(
  "claude",
  ["plugin", "install", "zama-developer@zama-marketplace", "--scope", "project"],
  { stdio: "inherit" },
);

console.log();
console.log("✅ Claude Code setup complete!");
