import { describe, expect, test } from "bun:test";
import { ndjson } from "../lib/ndjson";

const streamOf = (...chunks: string[]): ReadableStream<Uint8Array> => {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
};

const collect = async (stream: ReadableStream<Uint8Array>) => {
  const out: unknown[] = [];
  for await (const value of ndjson(stream)) out.push(value);
  return out;
};

describe("ndjson", () => {
  test("reassembles a line split across chunks", async () => {
    expect(await collect(streamOf('{"id":', '"a"}\n{"id":"b"}\n'))).toEqual([{ id: "a" }, { id: "b" }]);
  });

  test("yields a final line that never got its newline", async () => {
    expect(await collect(streamOf('{"id":"a"}\n{"id":"b"}'))).toEqual([{ id: "a" }, { id: "b" }]);
  });

  test("skips blank lines and reads an empty stream as nothing", async () => {
    expect(await collect(streamOf('\n{"id":"a"}\n\n'))).toEqual([{ id: "a" }]);
    expect(await collect(streamOf(""))).toEqual([]);
  });

  test("a multi-byte character split across chunks survives", async () => {
    const encoder = new TextEncoder();
    const bytes = encoder.encode('{"s":"é"}\n');
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 7));
        controller.enqueue(bytes.slice(7));
        controller.close();
      },
    });
    expect(await collect(stream)).toEqual([{ s: "é" }]);
  });
});
