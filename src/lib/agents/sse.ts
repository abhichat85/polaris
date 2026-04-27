/**
 * Minimal Server-Sent Events parser for streaming model responses.
 *
 * Authority: D-032 — provider-agnostic adapter layer. We talk REST to
 * OpenAI + Gemini directly (no vendor SDKs) so the abstraction stays
 * honest and the bundle stays small.
 *
 * Both OpenAI and Gemini stream JSON chunks separated by `data: ` lines,
 * terminated by `\n\n`, with `data: [DONE]` (OpenAI) or end-of-stream
 * (Gemini). This helper turns a `ReadableStream<Uint8Array>` into an
 * `AsyncIterable<string>` of the JSON payloads.
 */

export interface SseEvent {
  /** The text after `data: ` for this event. Trimmed. */
  data: string
}

/**
 * Parse a streaming Response body into SSE events. Skips comments
 * (lines starting with `:`) and `event:` / `id:` / `retry:` fields —
 * for our use we only care about `data:`.
 *
 * Yields the raw payload string per event. Caller decides how to parse
 * (JSON.parse for OpenAI/Gemini; "[DONE]" sentinel for OpenAI).
 */
export async function* iterateSse(
  body: ReadableStream<Uint8Array> | null,
): AsyncIterable<SseEvent> {
  if (!body) return
  const reader = body.getReader()
  const decoder = new TextDecoder("utf-8")
  let buf = ""
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      // Events are separated by a blank line. Process every complete
      // event currently in the buffer.
      let sep: number
      while ((sep = buf.indexOf("\n\n")) !== -1) {
        const raw = buf.slice(0, sep)
        buf = buf.slice(sep + 2)
        const data = parseEventData(raw)
        if (data !== null) yield { data }
      }
    }
    // Tail-flush: a provider may close the stream without a final \n\n
    // after the last event. Try to parse whatever remains.
    if (buf.length > 0) {
      const data = parseEventData(buf)
      if (data !== null) yield { data }
    }
  } finally {
    reader.releaseLock()
  }
}

function parseEventData(rawEvent: string): string | null {
  // An event is one or more lines; gather every `data: ` line.
  const lines = rawEvent.split("\n")
  const dataLines: string[] = []
  for (const line of lines) {
    if (line.startsWith("data:")) {
      // Per spec: a single optional space after the colon is stripped.
      dataLines.push(line.slice(5).replace(/^ /, ""))
    }
    // Ignore comments (`:`), and other fields we don't use.
  }
  if (dataLines.length === 0) return null
  return dataLines.join("\n")
}
