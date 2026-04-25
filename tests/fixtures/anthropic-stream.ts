/**
 * Test fixtures that mimic the shape of `anthropic.messages.stream(...)` output.
 *
 * The real SDK returns an object that is both:
 *   - async-iterable, yielding raw event objects shaped like the SSE wire format
 *   - has a `.finalMessage()` method returning the assembled response
 *
 * The ClaudeAdapter only consumes the async iterator surface, so these fixtures
 * implement [Symbol.asyncIterator] only.
 */

interface StreamEvent {
  type: string
  [k: string]: unknown
}

function makeStream(events: StreamEvent[]): AsyncIterable<StreamEvent> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const e of events) yield e
    },
  }
}

export function textStream(
  deltas: string[],
  usage = { inputTokens: 10, outputTokens: 5 },
): AsyncIterable<StreamEvent> {
  const events: StreamEvent[] = [
    {
      type: "message_start",
      message: { id: "msg_1", usage: { input_tokens: usage.inputTokens, output_tokens: 0 } },
    },
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    ...deltas.map((d) => ({
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text: d },
    })),
    { type: "content_block_stop", index: 0 },
    {
      type: "message_delta",
      delta: { stop_reason: "end_turn" },
      usage: { output_tokens: usage.outputTokens },
    },
    { type: "message_stop" },
  ]
  return makeStream(events)
}

export function toolUseStream(args: {
  toolUseId: string
  name: string
  input: Record<string, unknown>
  usage?: { inputTokens: number; outputTokens: number }
}): AsyncIterable<StreamEvent> {
  const usage = args.usage ?? { inputTokens: 20, outputTokens: 30 }
  const partial = JSON.stringify(args.input)
  const events: StreamEvent[] = [
    {
      type: "message_start",
      message: { id: "msg_1", usage: { input_tokens: usage.inputTokens, output_tokens: 0 } },
    },
    {
      type: "content_block_start",
      index: 0,
      content_block: { type: "tool_use", id: args.toolUseId, name: args.name, input: {} },
    },
    {
      type: "content_block_delta",
      index: 0,
      delta: { type: "input_json_delta", partial_json: partial },
    },
    { type: "content_block_stop", index: 0 },
    {
      type: "message_delta",
      delta: { stop_reason: "tool_use" },
      usage: { output_tokens: usage.outputTokens },
    },
    { type: "message_stop" },
  ]
  return makeStream(events)
}

export function errorStream(message: string): AsyncIterable<StreamEvent> {
  return {
    async *[Symbol.asyncIterator]() {
      yield {
        type: "message_start",
        message: { id: "msg_1", usage: { input_tokens: 0, output_tokens: 0 } },
      }
      throw new Error(message)
    },
  }
}

type Block =
  | { kind: "text"; deltas: string[] }
  | { kind: "tool_use"; id: string; name: string; partials: string[] }

/**
 * Compose a stream from an ordered list of blocks. Each block gets its own
 * content_block_start / *_delta / content_block_stop sequence, with index
 * incrementing across blocks (matching real Anthropic streams).
 */
export function multiBlockStream(
  blocks: Block[],
  usage = { inputTokens: 30, outputTokens: 40 },
  stopReason: "end_turn" | "tool_use" | "max_tokens" | "stop_sequence" = "tool_use",
): AsyncIterable<StreamEvent> {
  const events: StreamEvent[] = [
    {
      type: "message_start",
      message: { id: "msg_1", usage: { input_tokens: usage.inputTokens, output_tokens: 0 } },
    },
  ]
  blocks.forEach((b, idx) => {
    if (b.kind === "text") {
      events.push({
        type: "content_block_start",
        index: idx,
        content_block: { type: "text", text: "" },
      })
      for (const d of b.deltas) {
        events.push({
          type: "content_block_delta",
          index: idx,
          delta: { type: "text_delta", text: d },
        })
      }
      events.push({ type: "content_block_stop", index: idx })
    } else {
      events.push({
        type: "content_block_start",
        index: idx,
        content_block: { type: "tool_use", id: b.id, name: b.name, input: {} },
      })
      for (const p of b.partials) {
        events.push({
          type: "content_block_delta",
          index: idx,
          delta: { type: "input_json_delta", partial_json: p },
        })
      }
      events.push({ type: "content_block_stop", index: idx })
    }
  })
  events.push({
    type: "message_delta",
    delta: { stop_reason: stopReason },
    usage: { output_tokens: usage.outputTokens },
  })
  events.push({ type: "message_stop" })
  return makeStream(events)
}
