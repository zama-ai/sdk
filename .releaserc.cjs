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
      { prepareCmd: "node scripts/release/prepare-lockstep.mjs ${nextRelease.version}" },
    ],
    [
      "@semantic-release/git",
      {
        assets: ["CHANGELOG.md", "packages/sdk/package.json", "packages/react-sdk/package.json"],
        message: "chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}",
      },
    ],
    "@semantic-release/github",
  ],
};
