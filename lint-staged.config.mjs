// The agent post-edit hook runs these same commands, in this order, on each edited file.
// The pre-commit hook runs them serially, so the em dash check sees the lines oxfmt rewrote.
export default {
  "*.{ts,tsx,mts,cts,js,mjs,cjs}": [
    "oxlint --fix --no-error-on-unmatched-pattern",
    "ast-grep scan --config sgconfig.yml",
  ],
  "*.{ts,tsx,mts,cts,js,mjs,cjs,json,yaml,yml,md}": "oxfmt --no-error-on-unmatched-pattern",
  "*": "node scripts/lint/no-em-dash.mjs",
};
