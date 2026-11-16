#!/usr/bin/env node
// Generates and checks the SBOM of one published component with Trivy, in SPDX 2.3 JSON (ISO/IEC 5962).
//
//   node scripts/sbom/generate.mjs <component> --version <v> --out <dir> [--image <ref> --arch <arch>]
//   node scripts/sbom/generate.mjs index --version <v> --revision <sha> --out <dir>
//
// Each SBOM is named sbom-<component>-<version>[-<arch>].spdx.json, next to a .meta.json sidecar that `index`
// folds into sboms.json, the per-release index that tooling reads instead of parsing file names.
// Needs `trivy` on PATH (the workflows install the pinned release with aquasecurity/setup-trivy). The npm
// components also need the workspace installed, because they are built from a pruned production install.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
  copyFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

const ROOT = resolve(import.meta.dirname ?? new URL(".", import.meta.url).pathname, "../..");

// One entry per published artifact. `expect` is a package every correct SBOM of that component lists, so an
// empty or wrong scan fails here instead of being signed and published.
const COMPONENTS = {
  sdk: { kind: "npm", package: "@zama-fhe/sdk", dir: "packages/sdk", expect: "viem" },
  "react-sdk": {
    kind: "npm",
    package: "@zama-fhe/react-sdk",
    dir: "packages/react-sdk",
    expect: "@zama-fhe/sdk",
  },
  "client-go": { kind: "go", dir: "clients/go", expect: "google.golang.org/grpc" },
  "client-rust": { kind: "cargo", dir: "clients/rust", expect: "tonic" },
  "sdk-daemon": { kind: "image", expect: "@grpc/grpc-js" },
};

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    version: { type: "string" },
    revision: { type: "string" },
    out: { type: "string" },
    image: { type: "string" },
    arch: { type: "string" },
  },
});
const [command] = positionals;
const fail = (message) => {
  console.error(`::error::${message}`);
  process.exit(1);
};
if (!command) fail("usage: generate.mjs <component|index> --version <v> --out <dir>");
if (!values.version) fail("--version is required");
if (!values.out) fail("--out is required");
const out = resolve(values.out);
mkdirSync(out, { recursive: true });

const run = (file, args, options = {}) =>
  execFileSync(file, args, { stdio: ["ignore", "pipe", "inherit"], encoding: "utf8", ...options });
const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const trivyVersion = () => JSON.parse(run("trivy", ["version", "--format", "json"])).Version;

if (command === "index") {
  const metas = readdirSync(out)
    .filter((f) => f.endsWith(".meta.json"))
    .sort();
  if (!metas.length) fail(`no SBOM sidecars in ${out}`);
  const sboms = metas.map((f) => JSON.parse(readFileSync(join(out, f), "utf8")));
  for (const f of metas) rmSync(join(out, f));
  const index = {
    schema: 1,
    version: values.version,
    revision: values.revision ?? null,
    format: "SPDX-2.3 JSON",
    sboms,
  };
  writeFileSync(join(out, "sboms.json"), `${JSON.stringify(index, null, 2)}\n`);
  console.log(`sboms.json: ${sboms.map((s) => s.file).join(", ")}`);
  process.exit(0);
}

const component = COMPONENTS[command];
if (!component)
  fail(`unknown component "${command}" (one of: ${Object.keys(COMPONENTS).join(", ")})`);
if (component.kind === "image" && (!values.image || !values.arch))
  fail("the sdk-daemon component needs --image and --arch");
const file = `sbom-${command}-${values.version}${values.arch ? `-${values.arch}` : ""}.spdx.json`;
const target = join(out, file);
const common = ["--format", "spdx-json", "--output", target, "--scanners", "vuln", "--quiet"];
let subject;

if (component.kind === "npm") {
  // The tree a consumer installs: the package and its production dependencies only, resolved from the
  // repository lockfile (the same prune the daemon image uses).
  const work = mkdtempSync(join(tmpdir(), `sbom-${command}-`));
  try {
    run("pnpm", ["exec", "turbo", "prune", component.package, "--docker", `--out-dir=${work}`], {
      cwd: ROOT,
      stdio: ["ignore", "inherit", "inherit"],
    });
    copyFileSync(join(work, "pnpm-lock.yaml"), join(work, "full", "pnpm-lock.yaml"));
    run(
      "pnpm",
      ["install", "--dir", join(work, "full"), "--prod", "--frozen-lockfile", "--ignore-scripts"],
      { cwd: ROOT, stdio: ["ignore", "inherit", "inherit"] },
    );
    run("trivy", ["rootfs", ...common, join(work, "full")]);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  const pkg = JSON.parse(readFileSync(join(ROOT, component.dir, "package.json"), "utf8"));
  subject = { type: "npm", name: pkg.name, version: pkg.version };
} else if (component.kind === "go" || component.kind === "cargo") {
  run("trivy", ["fs", ...common, join(ROOT, component.dir)]);
  const name =
    component.kind === "go"
      ? readFileSync(join(ROOT, component.dir, "go.mod"), "utf8").match(/^module\s+(\S+)/m)?.[1]
      : readFileSync(join(ROOT, component.dir, "Cargo.toml"), "utf8").match(
          /^\[package\][^[]*?^name\s*=\s*"([^"]+)"/ms,
        )?.[1];
  subject = { type: component.kind, name, version: values.version };
} else {
  run("trivy", ["image", ...common, values.image]);
  const [name, digest] = values.image.split("@");
  subject = { type: "oci", name, digest: digest ?? null, arch: values.arch };
}

// Content checks: a valid SPDX 2.3 document that lists the component's key dependency.
const doc = JSON.parse(readFileSync(target, "utf8"));
if (doc.spdxVersion !== "SPDX-2.3")
  fail(`${file}: spdxVersion is ${doc.spdxVersion}, expected SPDX-2.3`);
const packages = Array.isArray(doc.packages) ? doc.packages : [];
if (packages.length < 2)
  fail(`${file}: only ${packages.length} package(s); the scan found nothing to describe`);
if (!packages.some((p) => p.name === component.expect))
  fail(
    `${file}: ${component.expect} is missing, so the scan did not cover ${command}'s dependencies`,
  );

const meta = {
  component: command,
  file,
  sha256: sha256(target),
  packages: packages.length,
  generator: `trivy ${trivyVersion()}`,
  subject,
};
writeFileSync(join(out, `${file}.meta.json`), `${JSON.stringify(meta, null, 2)}\n`);
console.log(`${file}: ${packages.length} packages, sha256 ${meta.sha256}`);
