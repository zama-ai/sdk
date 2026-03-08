import type { EncryptedData } from "./crypto";
import type { StoredCredentials } from "../token/token.types";

/** Internal storage shape — privateKey and signature are excluded; only encrypted privateKey is stored. */
export interface EncryptedCredentials extends Omit<StoredCredentials, "privateKey" | "signature"> {
  encryptedPrivateKey: EncryptedData;
}

/** Structured session entry stored in session storage. */
export interface SessionEntry {
  signature: string;
  /** Epoch seconds when the session was created. */
  createdAt: number;
  /** TTL at creation time (not current config). */
  ttl: number;
}
