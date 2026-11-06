// zod probes `new Function` to compile fast parsers, which the page CSP reports as an eval
// violation; jitless skips the probe. The setting lives on `globalThis`, so it also reaches the
// Dynamic SDK's zod. zod reads it when a schema is built, so this must run before any schema is.
import { z } from "zod";

z.config({ jitless: true });
