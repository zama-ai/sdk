// zod probes `new Function` to compile fast parsers, which the page CSP reports as an eval
// violation; jitless skips the probe. The setting lives on `globalThis`, so it also reaches the
// Dynamic SDK's zod. Must run before any zod parse.
import { z } from "zod";

z.config({ jitless: true });
