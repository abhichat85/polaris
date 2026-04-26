import Firecrawl from "@mendable/firecrawl-js";

let _client: Firecrawl | null = null;

/** Lazily instantiated so missing FIRECRAWL_API_KEY doesn't crash the build. */
export function getFirecrawl(): Firecrawl {
  if (!_client) {
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) throw new Error("FIRECRAWL_API_KEY is not configured");
    _client = new Firecrawl({ apiKey });
  }
  return _client;
}

/** @deprecated Use getFirecrawl() */
export const firecrawl = new Proxy({} as Firecrawl, {
  get(_target, prop) {
    return (getFirecrawl() as unknown as Record<string | symbol, unknown>)[prop];
  },
});
