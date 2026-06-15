import { describe, expect, test } from "vitest";
import { changedPublicExports } from "../lib/public-symbols.mjs";

describe("changedPublicExports", () => {
  test("captures identifiers from removed and added export declarations", () => {
    const diff = [
      "--- a/sdk.api.md",
      "+++ b/sdk.api.md",
      "-export declare function balanceOfContract(): void;",
      "+export declare function balanceOfContract(): Promise<void>;",
      "-export declare class ReadonlyToken {",
      "+export declare class WrappedToken {",
      "-export type Handle = string;",
      "+export type EncryptedValue = string;",
    ].join("\n");
    // Sorted case-insensitively (localeCompare): balanceOfContract precedes EncryptedValue.
    expect(changedPublicExports(diff)).toEqual([
      "balanceOfContract",
      "EncryptedValue",
      "Handle",
      "ReadonlyToken",
      "WrappedToken",
    ]);
  });

  test("ignores indented class members and diff file headers", () => {
    const diff = [
      "--- a/sdk.api.md",
      "+++ b/sdk.api.md",
      "   export declare class ZamaSDK {",
      "-    requireSigner(op: string): Signer;",
      "+    get signer(): Signer | undefined;",
    ].join("\n");
    // Members are not top-level exports; the class line is unchanged (no +/-).
    expect(changedPublicExports(diff)).toEqual([]);
  });

  test("handles interface, enum, const and abstract class", () => {
    const diff = [
      "+export interface UseShieldConfig {}",
      "-export declare const FOO: number;",
      "+export declare abstract class Base {}",
      "+export enum Color {}",
    ].join("\n");
    expect(changedPublicExports(diff)).toEqual(["Base", "Color", "FOO", "UseShieldConfig"]);
  });

  test("empty diff yields empty array", () => {
    expect(changedPublicExports("")).toEqual([]);
    expect(changedPublicExports(null)).toEqual([]);
  });
});
