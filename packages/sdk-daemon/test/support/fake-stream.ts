import { EventEmitter } from "node:events";

export class FakeStream<Message> extends EventEmitter {
  writableLength = 0;
  messages: Message[] = [];
  write(message: Message): boolean {
    this.messages.push(message);
    return true;
  }
  end(): void {
    this.emit("close");
  }
  destroy(): void {
    this.emit("close");
  }
}
