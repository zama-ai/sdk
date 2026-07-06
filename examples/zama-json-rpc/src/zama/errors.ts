/** Thrown when a request matches a registered confidential operation but is malformed. */
export class InvalidRewriteRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidRewriteRequestError";
  }
}
