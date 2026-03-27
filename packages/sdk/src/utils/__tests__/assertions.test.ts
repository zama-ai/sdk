import { describe, it, expect } from "../../test-fixtures";
import {
  assertObject,
  assertString,
  assertArray,
  assertFunction,
  assertFunctionProp,
  assertStringProp,
  assertCondition,
} from "../assertions";

describe("assertObject", () => {
  it("accepts a plain object", () => {
    expect(() => assertObject({ key: "value" }, "test")).not.toThrow();
  });

  it("accepts an empty object", () => {
    expect(() => assertObject({}, "test")).not.toThrow();
  });

  it("throws for null", () => {
    expect(() => assertObject(null, "ctx")).toThrow(TypeError);
    expect(() => assertObject(null, "ctx")).toThrow("ctx must be an object, got object");
  });

  it("throws for an array", () => {
    expect(() => assertObject([], "ctx")).toThrow(TypeError);
    expect(() => assertObject([], "ctx")).toThrow("ctx must be an object, got object");
  });

  it("throws for a string", () => {
    expect(() => assertObject("hello", "ctx")).toThrow("ctx must be an object, got string");
  });

  it("throws for a number", () => {
    expect(() => assertObject(42, "ctx")).toThrow("ctx must be an object, got number");
  });

  it("throws for undefined", () => {
    expect(() => assertObject(undefined, "ctx")).toThrow("ctx must be an object, got undefined");
  });
});

describe("assertString", () => {
  it("accepts a string", () => {
    expect(() => assertString("hello", "test")).not.toThrow();
  });

  it("accepts an empty string", () => {
    expect(() => assertString("", "test")).not.toThrow();
  });

  it("throws for a number", () => {
    expect(() => assertString(42, "ctx")).toThrow(TypeError);
    expect(() => assertString(42, "ctx")).toThrow("ctx must be a string, got number");
  });

  it("throws for null", () => {
    expect(() => assertString(null, "ctx")).toThrow("ctx must be a string, got object");
  });

  it("throws for undefined", () => {
    expect(() => assertString(undefined, "ctx")).toThrow("ctx must be a string, got undefined");
  });
});

describe("assertArray", () => {
  it("accepts an array", () => {
    expect(() => assertArray([1, 2, 3], "test")).not.toThrow();
  });

  it("accepts an empty array", () => {
    expect(() => assertArray([], "test")).not.toThrow();
  });

  it("throws for an object", () => {
    expect(() => assertArray({}, "ctx")).toThrow(TypeError);
    expect(() => assertArray({}, "ctx")).toThrow("ctx must be an array, got object");
  });

  it("throws for a string", () => {
    expect(() => assertArray("hello", "ctx")).toThrow("ctx must be an array, got string");
  });

  it("throws for null", () => {
    expect(() => assertArray(null, "ctx")).toThrow("ctx must be an array, got object");
  });

  it("throws for undefined", () => {
    expect(() => assertArray(undefined, "ctx")).toThrow("ctx must be an array, got undefined");
  });
});

describe("assertFunction", () => {
  it("accepts a function", () => {
    expect(() => assertFunction(() => {}, "test")).not.toThrow();
  });

  it("accepts a named function", () => {
    function myFunc() {}
    expect(() => assertFunction(myFunc, "test")).not.toThrow();
  });

  it("throws for a string", () => {
    expect(() => assertFunction("hello", "ctx")).toThrow(TypeError);
    expect(() => assertFunction("hello", "ctx")).toThrow("ctx must be a function, got string");
  });

  it("throws for an object", () => {
    expect(() => assertFunction({}, "ctx")).toThrow("ctx must be a function, got object");
  });

  it("throws for null", () => {
    expect(() => assertFunction(null, "ctx")).toThrow("ctx must be a function, got object");
  });

  it("throws for undefined", () => {
    expect(() => assertFunction(undefined, "ctx")).toThrow("ctx must be a function, got undefined");
  });
});

describe("assertStringProp", () => {
  it("accepts an object with a string property", () => {
    const obj: Record<string, unknown> = { name: "alice" };
    expect(() => assertStringProp(obj, "name", "ctx")).not.toThrow();
  });

  it("throws when property is not a string", () => {
    const obj: Record<string, unknown> = { name: 42 };
    expect(() => assertStringProp(obj, "name", "ctx")).toThrow(TypeError);
  });

  it("throws when property is missing", () => {
    const obj: Record<string, unknown> = {};
    expect(() => assertStringProp(obj, "name", "ctx")).toThrow(
      "ctx must be a string, got undefined",
    );
  });
});

describe("assertFunctionProp", () => {
  it("accepts an object with a function property", () => {
    const obj: Record<string, unknown> = { handler: () => {} };
    expect(() => assertFunctionProp(obj, "handler", "ctx")).not.toThrow();
  });

  it("throws when property is not a function", () => {
    const obj: Record<string, unknown> = { handler: "not a function" };
    expect(() => assertFunctionProp(obj, "handler", "ctx")).toThrow(TypeError);
    expect(() => assertFunctionProp(obj, "handler", "ctx")).toThrow(
      "ctx must be a function, got string",
    );
  });

  it("throws when property is missing", () => {
    const obj: Record<string, unknown> = {};
    expect(() => assertFunctionProp(obj, "handler", "ctx")).toThrow(
      "ctx must be a function, got undefined",
    );
  });
});

describe("assertCondition", () => {
  it("does not throw when condition is true", () => {
    expect(() => assertCondition(true, "should not throw")).not.toThrow();
  });

  it("throws when condition is false", () => {
    expect(() => assertCondition(false, "oops")).toThrow(TypeError);
    expect(() => assertCondition(false, "oops")).toThrow("oops");
  });
});
