// Override conventional-changelog templates to use `-` bullets instead of `*`.
// oxfmt normalizes markdown bullets to `-`, so `*` from the default templates
// causes formatting drift on every release.
const { readFileSync } = require("node:fs");
const { resolve, dirname } = require("node:path");

const pkgEntry = require.resolve("conventional-changelog-conventionalcommits");
const templatesPath = resolve(dirname(pkgEntry), "templates.js");
const src = readFileSync(templatesPath, "utf8");

const extract = (name) => {
  const re = new RegExp(`export const ${name} = \`([\\s\\S]*?)\``, "m");
  return re.exec(src)?.[1] ?? "";
};

const mainTemplate = extract("mainTemplate").replace(/^\* /gm, "- ");
const commitPartial = extract("commitPartial").replace(/^\*/, "-");

module.exports = {
  branches: ["main", { name: "prerelease", channel: "alpha", prerelease: "alpha" }],
  tagFormat: "v${version}",
  plugins: [
    [
      "@semantic-release/commit-analyzer",
      {
        preset: "conventionalcommits",
        // Breaking detection from header `!` only; ignore `BREAKING CHANGE`
        // in bodies. Notes generator below keeps defaults so the changelog
        // still surfaces body prose.
        //
        // Must be a sentinel string, not []: an empty array makes
        // conventional-commits-parser emit a zero-title note for every `* `
        // bullet in a GitHub squash body, and the analyzer's `breaking: true`
        // rule matches any commit with notes.length > 0 regardless of title.
        // That escalated every squash-merge to major (see 3.0.0-alpha.12..14).
        parserOpts: {
          noteKeywords: ["__NO_BREAKING_NOTES__"],
        },
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
        writerOpts: {
          mainTemplate,
          commitPartial,
        },
      },
    ],
    [
      "@semantic-release/changelog",
      {
        changelogFile: "CHANGELOG.md",
        changelogTitle: "# Changelog",
      },
    ],
    [
      "@semantic-release/exec",
      {
        prepareCmd: "node scripts/release/prepare-lockstep.mjs ${nextRelease.version}",
      },
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
