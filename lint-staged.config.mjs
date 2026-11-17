// The agent post-edit hook runs these same commands, in this order, on each edited file.
export default {
  "*.{ts,tsx,mts,cts,js,mjs,cjs}": [
    "oxlint --fix --no-error-on-unmatched-pattern",
    "ast-grep scan --config sgconfig.yml",
  ],
  "*.{ts,tsx,mts,cts,js,mjs,cjs,json,yaml,yml,md}": "oxfmt --no-error-on-unmatched-pattern",
};
