import { vi } from "vitest";

/**
 * Comlink stand-in for the worker client suites: the client only needs `wrap`
 * to hand back an object, so the fixtures point it at their mock worker API.
 */
export const wrap = vi.fn();

export const proxy = <T>(value: T): T => value;

/** Nothing is moved in-process, so the value crosses as itself and its buffers stay attached. */
export const transfer = <T>(value: T, _transfers: unknown[]): T => value;

export const transferHandlers = new Map<unknown, unknown>();
