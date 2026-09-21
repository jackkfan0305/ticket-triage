/**
 * Yields one parsed JSON value per line of a byte stream.
 *
 * A chunk boundary lands wherever the network puts it, which is regularly in
 * the middle of a line, so the tail is held back until its newline arrives.
 */
export async function* ndjson(body: ReadableStream<Uint8Array>): AsyncGenerator<unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let rest = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const lines = (rest + decoder.decode(value, { stream: true })).split("\n");
      rest = lines.pop() ?? "";
      for (const line of lines) if (line.trim() !== "") yield JSON.parse(line);
    }
    // a final line without its newline still counts
    if (rest.trim() !== "") yield JSON.parse(rest);
  } finally {
    reader.releaseLock();
  }
}
