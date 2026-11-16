/** A comma-separated env var as a list; unset or empty gives `[]`. */
export function envList(name: string): string[] {
  return (
    process.env[name]
      ?.split(",")
      .map((item) => item.trim())
      .filter(Boolean) ?? []
  );
}
