import { parseSchema } from "../validation";
import { PreparedPermitSchema } from "./schemas";
import type { PreparedPermit } from "./types";

/** Validates a prepared permit's shape; signature and expiry checks run during registration. */
export function parsePreparedPermit(value: unknown): PreparedPermit {
  return parseSchema(PreparedPermitSchema, value);
}
