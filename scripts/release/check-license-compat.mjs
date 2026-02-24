import { readFileSync, writeFileSync } from "node:fs";

const [licensesPath, policyPath, reportPath] = process.argv.slice(2);

if (!licensesPath || !policyPath || !reportPath) {
  console.error(
    "Usage: node scripts/release/check-license-compat.mjs <licenses.json> <policy.json> <report.md>",
  );
  process.exit(1);
}

const licensesData = JSON.parse(readFileSync(licensesPath, "utf8"));
const policy = JSON.parse(readFileSync(policyPath, "utf8"));

const packageLicenses = new Map();

const normalizeLicense = (value) => {
  if (!value) {
    return "";
  }
  return String(value).replace(/\s+/g, " ").trim();
};

const addCandidate = (node) => {
  if (!node || typeof node !== "object") {
    return;
  }

  const license = normalizeLicense(node.license || node.licenses);
  if (!license) {
    return;
  }

  const name = node.name || node.package || node.id || "unknown-package";
  const version = node.version || "";
  const key = version ? `${name}@${version}` : name;

  if (!packageLicenses.has(key)) {
    packageLicenses.set(key, license);
  }
};

const visit = (node) => {
  if (Array.isArray(node)) {
    for (const item of node) {
      visit(item);
    }
    return;
  }

  if (!node || typeof node !== "object") {
    return;
  }

  addCandidate(node);

  for (const value of Object.values(node)) {
    if (typeof value === "object" && value !== null) {
      visit(value);
    }
  }
};

visit(licensesData);

const allowSet = new Set(policy.allow.map((item) => item.toUpperCase()));
const denyPatterns = policy.denyPatterns.map((item) => new RegExp(item, "i"));
const reviewPatterns = policy.reviewPatterns.map((item) => new RegExp(item, "i"));

const denied = [];
const review = [];
const unknown = [];
const allowed = [];

for (const [pkg, licenseExpr] of packageLicenses.entries()) {
  const upper = licenseExpr.toUpperCase();

  if (!upper) {
    unknown.push({ pkg, license: licenseExpr });
    continue;
  }

  if (denyPatterns.some((re) => re.test(licenseExpr))) {
    denied.push({ pkg, license: licenseExpr });
    continue;
  }

  if (reviewPatterns.some((re) => re.test(licenseExpr))) {
    review.push({ pkg, license: licenseExpr });
    continue;
  }

  const tokens = upper
    .replace(/[()]/g, " ")
    .split(/\s+(?:OR|AND|WITH)\s+|\/|,/)
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.length > 0 && tokens.every((token) => allowSet.has(token))) {
    allowed.push({ pkg, license: licenseExpr });
  } else {
    unknown.push({ pkg, license: licenseExpr });
  }
}

const toLines = (title, entries) => {
  if (entries.length === 0) {
    return [`### ${title}`, "", "_None_", ""];
  }
  return [
    `### ${title}`,
    "",
    ...entries
      .sort((a, b) => a.pkg.localeCompare(b.pkg))
      .map((entry) => `- \`${entry.pkg}\` -> \`${entry.license}\``),
    "",
  ];
};

const summary = [
  "# License Compatibility Report",
  "",
  `- Total packages scanned: ${packageLicenses.size}`,
  `- Allowed: ${allowed.length}`,
  `- Needs review: ${review.length}`,
  `- Unknown/custom: ${unknown.length}`,
  `- Denied: ${denied.length}`,
  "",
  ...toLines("Denied (fails check)", denied),
  ...toLines("Needs review", review),
  ...toLines("Unknown/custom", unknown),
];

writeFileSync(reportPath, `${summary.join("\n")}\n`, "utf8");
console.log(summary.join("\n"));

if (denied.length > 0) {
  process.exit(1);
}
