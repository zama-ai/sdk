import { z } from "zod/mini";
import { ConfigurationError } from "./errors";

export function parseConfiguration<T>(schema: z.core.$ZodType<T>, value: unknown): T {
  const parsed = z.safeParse(schema, value);
  if (parsed.success) {
    return parsed.data;
  }
  throw new ConfigurationError(z.prettifyError(parsed.error), { cause: parsed.error });
}
