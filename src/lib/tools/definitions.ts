/**
 * The eight agent tools. Authority: CONSTITUTION.md Article VIII (D-017, D-034 amended).
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
