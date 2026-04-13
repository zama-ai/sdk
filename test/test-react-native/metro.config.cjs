const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Watch the monorepo root for changes (packages/*, test/*)
config.watchFolders = [monorepoRoot];

// Resolve modules from both the project and monorepo node_modules
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];

// Force a single copy of React, React Native, and React Query for every
// importer. In a pnpm workspace, packages like @zama-fhe/react-sdk symlink
// their own `react` (a different patch version), which causes runtime
// "Invalid hook call" because hooks dispatch through a different React than
// the renderer. `extraNodeModules` only acts as a fallback, so we intercept
// the resolution itself and pin every matching request to the test app's
// copy.
const SINGLETONS = new Map([
  ["react", path.resolve(projectRoot, "node_modules/react")],
  ["react-native", path.resolve(projectRoot, "node_modules/react-native")],
  ["@tanstack/react-query", path.resolve(projectRoot, "node_modules/@tanstack/react-query")],
]);

const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  for (const [name, root] of SINGLETONS) {
    if (moduleName === name || moduleName.startsWith(`${name}/`)) {
      const subpath = moduleName.slice(name.length); // "" | "/foo/bar"
      return context.resolveRequest(context, `${root}${subpath}`, platform);
    }
  }
  if (typeof defaultResolveRequest === "function") {
    return defaultResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
