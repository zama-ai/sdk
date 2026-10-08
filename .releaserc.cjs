// Override conventional-changelog templates to use `-` bullets instead of `*`.
// oxfmt normalizes markdown bullets to `-`, so `*` from the default templates
// causes formatting drift on every release.
const { readFileSync } = require("node:fs");
const { resolve, dirname } = require("node:path");

const pkgEntry = require.resolve("conventional-changelog-conventionalcommits");
const templatesPath = resolve(dirname(pkgEntry), "templates.js");
const src = readFileSync(templatesPath, "utf8");

// Extract the backtick-delimited body of `export const <name> = `...``. `name`
// is a fixed literal from the two call sites below, so a string scan (opening
// marker → next backtick) is enough — no need to build a RegExp from a variable.
const extract = (name) => {
  const marker = `export const ${name} = \``;
  const start = src.indexOf(marker);
  if (start === -1) {
    return "";
  }
  const contentStart = start + marker.length;
  const end = src.indexOf("`", contentStart);
  return end === -1 ? "" : src.slice(contentStart, end);
};

const mainTemplate = extract("mainTemplate").replace(/^\* /gm, "- ");
const commitPartial = extract("commitPartial").replace(/^\*/, "-");

// Shell command appending `key=value` lines to the GitHub Actions step output; a no-op outside Actions.
const githubOutput = (...pairs) =>
  `[ -z "$GITHUB_OUTPUT" ] || printf '%s\\n' ${pairs.map((pair) => `'${pair}'`).join(" ")} >> "$GITHUB_OUTPUT"`;
const releaseOutputs = [
  "version=${nextRelease.version}",
  'channel=${nextRelease.channel || "latest"}',
];

module.exports = {
  branches: [
    "main",
    { name: "beta", channel: "beta", prerelease: "beta" },
    { name: "alpha", channel: "alpha", prerelease: "alpha" },
  ],
  tagFormat: "v${version}",
  plugins: [
    [
      "@semantic-release/commit-analyzer",
      {
        preset: "conventionalcommits",
        // Sentinel (not []): an empty array makes the parser emit empty-
        // title notes for every `* ` bullet in a squash body, which the
        // analyzer treats as breaking. Header `!` still escalates via
        // breakingHeaderPattern, which ignores noteKeywords.
        parserOpts: { noteKeywords: ["__NO_BREAKING_NOTES__"] },
        releaseRules: [
          { breaking: true, release: "major" },
          { scope: "security", release: "patch" },
          { scope: "release", release: "patch" },
          { scope: "no-release", release: false },
          { type: "feat", release: "minor" },
          { type: "fix", release: "patch" },
          { type: "perf", release: "patch" },
          { type: "build", release: "patch" },
          { type: "refactor", release: "patch" },
          { type: "revert", release: "patch" },
          { type: "chore", release: false },
          { type: "ci", release: false },
          { type: "docs", release: false },
          { type: "style", release: false },
          { type: "test", release: false },
        ],
      },
    ],
    [
      "@semantic-release/release-notes-generator",
      {
        preset: "conventionalcommits",
        // Make release-notes sections mirror `releaseRules` above: every type
        // that triggers a release is shown, the rest hidden. The conventional-
        // commits preset hides refactor and build by default, so a version cut
        // from only those commits produced an empty GitHub release body.
        presetConfig: {
          types: [
            { type: "feat", section: "Features" },
            { type: "fix", section: "Bug Fixes" },
            { type: "perf", section: "Performance Improvements" },
            { type: "revert", section: "Reverts" },
            { type: "refactor", section: "Code Refactoring" },
            { type: "build", section: "Build System" },
            { type: "chore", hidden: true },
            { type: "ci", hidden: true },
            { type: "docs", hidden: true },
            { type: "style", hidden: true },
            { type: "test", hidden: true },
          ],
        },
        writerOpts: { mainTemplate, commitPartial },
      },
    ],
    [
      "@semantic-release/changelog",
      { changelogFile: "CHANGELOG.md", changelogTitle: "# Changelog" },
    ],
    [
      "@semantic-release/exec",
      {
        // The bundles inline package.json's version, so rebuild after the bump; the bump
        // trips `verifyDepsBeforeRun`, hence the frozen install from the unchanged lockfile.
        prepareCmd: [
          "node scripts/release/prepare-lockstep.mjs ${nextRelease.version}",
          "pnpm install --frozen-lockfile --ignore-scripts --offline",
          "pnpm build",
          "pnpm llm:build",
        ].join(" && "),
        // verifyRelease runs in dry-run, for the preview. success also runs when adding a channel, which skips
        // verifyRelease, so it writes every output itself; gitHead is then the release commit.
        verifyReleaseCmd: githubOutput(...releaseOutputs),
        successCmd: githubOutput(
          "released=true",
          "revision=${nextRelease.gitHead}",
          ...releaseOutputs,
        ),
      },
    ],
    [
      "@semantic-release/git",
      {
        assets: [
          "CHANGELOG.md",
          "packages/sdk/package.json",
          "packages/react-sdk/package.json",
          "packages/sdk-daemon/package.json",
          "clients/rust/Cargo.toml",
          "clients/rust/Cargo.lock",
          "docs/gitbook/src/native/tutorials/go-quick-start.md",
          "docs/gitbook/src/native/tutorials/rust-quick-start.md",
          "docs/gitbook/src/native/operations/run-in-production.md",
          "clients/go/README.md",
          "clients/rust/README.md",
          "packages/sdk-daemon/README.md",
          "llms.txt",
          "llms-full.txt",
          "docs/llm/corpus-manifest.json",
        ],
        message: "chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}",
      },
    ],
    "@semantic-release/github",
  ],
};
