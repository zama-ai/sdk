import type { ServerDuplexStream } from "@grpc/grpc-js";
import { ChannelWriter } from "./channel-writer.js";

export class CallbackConnection<Request, Response> {
  #stream?: ServerDuplexStream<Request, Response>;
  #writer?: ChannelWriter<Response>;
  constructor(private readonly onDisconnect: (error?: unknown) => void) {}

  get connected(): boolean {
    return this.#stream !== undefined;
  }

  attach(stream: ServerDuplexStream<Request, Response>): void {
    this.#stream = stream;
    this.#writer = new ChannelWriter(stream);
    const disconnect = (error?: unknown) => this.#disconnect(stream, error);
    stream.once("cancelled", disconnect);
    stream.once("error", disconnect);
    stream.once("close", disconnect);
    stream.once("end", () => {
      disconnect();
      stream.end();
    });
  }

  #disconnect(stream: ServerDuplexStream<Request, Response>, error?: unknown): void {
    if (this.#stream !== stream) {
      return;
    }
    this.#stream = undefined;
    this.#writer = undefined;
    this.onDisconnect(error);
  }

  send(message: Response): void {
    const stream = this.#stream;
    if (!stream) {
      return;
    }
    void this.#writer?.write(message).catch((error: unknown) => {
      this.#disconnect(stream, error);
      stream.end();
    });
  }

  close(): void {
    const stream = this.#stream;
    this.#stream = undefined;
    this.#writer = undefined;
    stream?.end();
  }
}
