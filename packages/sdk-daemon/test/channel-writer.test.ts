import { EventEmitter } from "node:events";
import type { Writable } from "node:stream";
import { expect, test } from "vitest";
import { ChannelWriter } from "../src/channel-writer.js";

class Stream extends EventEmitter {
  messages: number[] = [];
  blocked = true;
  write(message: number) {
    this.messages.push(message);
    return !this.blocked;
  }
}
test("backpressure accepts the current frame and resumes queued frames after drain", async () => {
  const stream = new Stream();
  const writer = new ChannelWriter<number>(stream as unknown as Writable);
  await writer.write(1);
  const queued = writer.write(2);
  expect(stream.messages).toEqual([1]);
  stream.blocked = false;
  stream.emit("drain");
  await queued;
  expect(stream.messages).toEqual([1, 2]);
});
test("disconnect rejects queued frames and never replays them after a late drain", async () => {
  const stream = new Stream();
  const writer = new ChannelWriter<number>(stream as unknown as Writable);
  await writer.write(1);
  const queued = writer.write(2);
  stream.emit("close");
  await expect(queued).rejects.toMatchObject({ code: "CANCELLED" });
  stream.emit("drain");
  await expect(writer.write(3)).rejects.toMatchObject({ code: "CANCELLED" });
  expect(stream.messages).toEqual([1]);
});

test("all writers bound blocked output and preserve the overflow error", async () => {
  const stream = new Stream();
  const writer = new ChannelWriter<number>(stream as unknown as Writable);
  await writer.write(0);
  const queued = Array.from({ length: 256 }, (_, index) => writer.write(index + 1));
  const outcomes = Promise.allSettled(queued);
  await expect(writer.write(257)).rejects.toMatchObject({ code: "CALLBACK_BACKPRESSURE" });
  expect(
    (await outcomes).every(
      (result) => result.status === "rejected" && result.reason.code === "CALLBACK_BACKPRESSURE",
    ),
  ).toBe(true);
  stream.emit("drain");
  await expect(writer.write(258)).rejects.toMatchObject({ code: "CALLBACK_BACKPRESSURE" });
  expect(stream.messages).toEqual([0]);
});
