import packageJson from "../package.json" with { type: "json" };

export const SDK_VERSION: string = packageJson.version;
