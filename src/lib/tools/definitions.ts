/**
 * The ten agent tools. Authority: CONSTITUTION.md Article VIII
 * (D-017, D-034, D-035, D-045 amended).
 *
 * Adding a new tool requires a Constitutional amendment (Article XXI) — do not
 * extend this list casually. Removing a tool also requires an amendment.
 */

export interface ToolJsonSchema {
  type: "object"
  properties: Record<string, { type: string; description?: string }>
  required: string[]
}

export interface ToolDefinition {
  name: string
  description: string
  inputSchema: ToolJsonSchema
}

export const AGENT_TOOLS: ToolDefinition[] = [
  {
    name: "read_file",
    description:
      "Read the contents of a file by its POSIX path relative to the project root.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "POSIX path, e.g. 'src/app/page.tsx'" },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description:
      "Overwrite an existing file with new content. Fails if the file does not exist; use create_file for new files. Prefer edit_file for targeted changes; reserve write_file for short files (<100 lines) or full rewrites.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        content: { type: "string" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "edit_file",
    description:
      "Apply a targeted edit to an existing file by replacing an exact substring. The search string must appear exactly once in the file — include enough surrounding context to disambiguate. Use this for surgical changes; use write_file only for full rewrites.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        search: {
          type: "string",
          description:
            "Exact substring to find. Must be unique within the file — include enough surrounding context to disambiguate.",
        },
        replace: {
          type: "string",
          description: "Replacement string. May be empty to delete the matched range.",
        },
      },
      required: ["path", "search", "replace"],
    },
  },
  {
    name: "multi_edit",
    description:
      "Apply multiple find-and-replace edits to a single file atomically. All edits must succeed or none are applied. Edits are applied sequentially; each edit's search must match exactly once in the file *as it is after preceding edits* (or set replaceAll=true). Use this when you need 2+ surgical changes to the same file — cheaper than multiple edit_file calls and avoids partial-state-between-edits hazards.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        edits: {
          type: "array",
          description:
            "Sequence of edits applied in order. Each edit's search must be unique in the file *after* preceding edits (or set replaceAll=true).",
        },
      },
      required: ["path", "edits"],
    },
  },
  {
    name: "create_file",
    description: "Create a new file with content. Fails if the file already exists.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        content: { type: "string" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "delete_file",
    description: "Delete a file. Fails if the file does not exist or is locked.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
      },
      required: ["path"],
    },
  },
  {
    name: "list_files",
    description:
      "List files and folders inside a directory. Use '/' for project root.",
    inputSchema: {
      type: "object",
      properties: {
        directory: { type: "string", description: "POSIX directory path" },
      },
      required: ["directory"],
    },
  },
  {
    name: "search_code",
    description:
      "Search file contents in the project using ripgrep. Returns matching lines with file path, line number, and a short snippet. Prefer this over list_files+read_file when looking for symbol usages, imports, or text patterns.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Pattern to search for. Plain text by default; set regex=true for regex.",
        },
        pathGlob: {
          type: "string",
          description: "Optional glob to scope: e.g. 'src/**/*.tsx'. Default: whole project.",
        },
        regex: {
          type: "boolean",
          description: "Treat query as regex. Default false.",
        },
        caseSensitive: {
          type: "boolean",
          description: "Case sensitivity. Default false.",
        },
        maxResults: {
          type: "integer",
          description: "Cap on returned matches. Default 80, hard max 500.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "run_command",
    description:
      "Execute a shell command in the sandbox. Use for npm install, npm test, npm run lint, etc. NOT for npm run dev (already running). Output is captured and returned. Hard timeout: 60 seconds.",
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string" },
        cwd: {
          type: "string",
          description: "Working directory; defaults to project root",
        },
      },
      required: ["command"],
    },
  },
  {
    name: "web_fetch",
    description:
      "Fetch a URL and return its content as Markdown-ish text. Use this to read documentation, library READMEs, API specs, or blog posts before writing code that depends on them — it grounds your output in current API surfaces instead of training data. Set `prompt` to ask a focused question and receive a summary instead of the raw page (saves tokens). Hard caps: 30s timeout, 1 MB body, results cached 15min. Refuses private IPs and non-http(s) schemes. NOT for fetching files inside the sandbox — use read_file for that.",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "Absolute http(s) URL to fetch.",
        },
        prompt: {
          type: "string",
          description:
            "Optional: a question to focus a summary. When set, returns a Haiku-generated summary keyed to your question instead of the raw page.",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "read_runtime_errors",
    description:
      "Read recent uncaught errors from the running preview app. Returns errors captured by window.onerror, unhandled promise rejections, console.error calls, failed fetches, and React error boundaries. Empty array means no runtime errors right now (which is what you want). Use this to diagnose 'this button doesn't work' style reports — the preview reports the actual error you can fix.",
    inputSchema: {
      type: "object",
      properties: {
        since: {
          type: "integer",
          description:
            "Optional unix-ms; only return errors at or after this time. Default: last 60s.",
        },
        markConsumed: {
          type: "boolean",
          description:
            "Mark these errors as seen so subsequent calls don't re-return them. Default true.",
        },
      },
      required: [],
    },
  },
]

/**
 * Patterns the executor refuses to run. Authority: §8.4 run_command,
 * §13 security policy.
 *
 * `npm run dev` (and pnpm/yarn/bun equivalents) is forbidden because the
 * sandbox already runs the dev server on the preview port — a second
 * invocation would deadlock the model on output that never ends.
 *
 * Caught by the eval suite (curl|bash regression):
 *   - `curl ... | sh`     → was caught
 *   - `curl ... | bash`   → was NOT caught — fixed below
 *   - `curl ... | zsh`    → covered by widened pattern
 *   - `wget -O- ... | sh` → also covered
 */
export const FORBIDDEN_COMMAND_PATTERNS: RegExp[] = [
  /\bsudo\b/i,
  /\brm\s+-rf\s+\//i,
  /\b(npm|pnpm|yarn|bun)\s+(run\s+)?dev\b/i,
  // curl/wget piped to any common shell. Matches: `curl <args> | bash`,
  // `curl ... | zsh -c ...`, `wget -O- ... | sh`, etc.
  /\b(curl|wget)\s[^|]*\|\s*(sh|bash|zsh|dash|ksh|fish)\b/i,
  // Pushing to remote git, publishing packages — these escape the sandbox.
  /\bgit\s+push\b/i,
  /\bnpm\s+publish\b/i,
  /\bpnpm\s+publish\b/i,
  /\byarn\s+publish\b/i,
  // Disk writes outside the sandbox root.
  /\bdd\b[^\n]*\bof\s*=\s*\/dev/i,
  // Fork bombs.
  /:\(\)\{\s*:\|:\s*&\s*\};\s*:/,
]

export function getToolDefinition(name: string): ToolDefinition | undefined {
  return AGENT_TOOLS.find((t) => t.name === name)
}
