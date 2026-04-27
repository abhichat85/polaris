/**
 * SSE parser tests — buffer boundaries, multi-line data, comments,
 * tail-flush.
 */

import { describe, it, expect } from "vitest"
import { iterateSse } from "@/lib/agents/sse"

function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c))
      controller.close()
    },
  })
}

const collect = async (
  s: ReadableStream<Uint8Array> | null,
): Promise<string[]> => {
  const out: string[] = []
  for await (const ev of iterateSse(s)) out.push(ev.data)
  return out
}

describe("iterateSse", () => {
  it("yields a single event delimited by \\n\\n", async () => {
    const events = await collect(
      streamFromChunks(["data: hello\n\n"]),
    )
    expect(events).toEqual(["hello"])
  })

  it("handles split-across-chunks boundaries", async () => {
    const events = await collect(
      streamFromChunks(["data: hel", "lo\n", "\ndata: world\n\n"]),
    )
    expect(events).toEqual(["hello", "world"])
  })

  it("joins multi-line data fields", async () => {
    const events = await collect(
      streamFromChunks(["data: line1\ndata: line2\n\n"]),
    )
    expect(events).toEqual(["line1\nline2"])
  })

  it("ignores comment lines and unknown fields", async () => {
    const events = await collect(
      streamFromChunks([": comment\nevent: x\nid: 1\ndata: payload\n\n"]),
    )
    expect(events).toEqual(["payload"])
  })

  it("flushes a trailing event with no \\n\\n", async () => {
    const events = await collect(
      streamFromChunks(["data: a\n\ndata: b"]),
    )
    expect(events).toEqual(["a", "b"])
  })

  it("returns nothing for null body", async () => {
    const events = await collect(null)
    expect(events).toEqual([])
  })

  it("strips a single leading space after colon", async () => {
    const events = await collect(
      streamFromChunks(["data:no-space\ndata: with-space\n\n"]),
    )
    expect(events).toEqual(["no-space\nwith-space"])
  })
})
