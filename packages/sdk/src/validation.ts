import { z } from "zod";
import { ConfigurationError } from "./errors";

export function parseConfiguration<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (parsed.success) {
    return parsed.data;
  }
  throw new ConfigurationError(z.prettifyError(parsed.error), { cause: parsed.error });
}
