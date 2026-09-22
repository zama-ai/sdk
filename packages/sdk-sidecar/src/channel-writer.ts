import type { Writable } from "node:stream";
import { status } from "@grpc/grpc-js";
import { cancelled, SidecarError } from "./errors.js";

export const CALLBACK_OUTPUT_LIMIT = 256;

export class ChannelBackpressureError extends SidecarError {
  constructor() {
    super(
      "CALLBACK_BACKPRESSURE",
      status.RESOURCE_EXHAUSTED,
      "Callback channel output queue exceeded its limit.",
    );
  }
}

type Entry<Message> = { message: Message; resolve: () => void; reject: (error: Error) => void };
export class ChannelWriter<Message> {
  #queue: Entry<Message>[] = [];
  #blocked = false;
  #error?: Error;
  constructor(private readonly stream: Writable) {
    stream.on("drain", () => {
      this.#blocked = false;
      this.#pump();
    });
    stream.once("close", () => this.#fail(cancelled()));
    stream.once("error", (error: Error) => this.#fail(error));
  }
  write(message: Message): Promise<void> {
    if (this.#error) {
      return Promise.reject(this.#error);
    }
    if (this.#queue.length >= CALLBACK_OUTPUT_LIMIT) {
      const error = new ChannelBackpressureError();
      this.#fail(error);
      return Promise.reject(error);
    }
    return new Promise((resolve, reject) => {
      this.#queue.push({ message, resolve, reject });
      this.#pump();
    });
  }
  #pump(): void {
    if (this.#error || this.stream.destroyed || this.stream.writableEnded) {
      this.#fail(this.#error ?? cancelled());
      return;
    }
    while (!this.#blocked && this.#queue.length) {
      const next = this.#queue.shift();
      if (!next) {
        return;
      }
      try {
        this.#blocked = !this.stream.write(next.message);
        next.resolve();
      } catch (error) {
        next.reject(error instanceof Error ? error : cancelled());
        this.#fail(error instanceof Error ? error : cancelled());
      }
    }
  }
  #fail(error: Error): void {
    this.#error = error;
    for (const entry of this.#queue.splice(0)) {
      entry.reject(error);
    }
  }
}
